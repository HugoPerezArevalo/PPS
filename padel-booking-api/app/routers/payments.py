"""Payment routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import Booking, Payment, PaymentMethod, PaymentStatus, User, UserRole
from app.schemas import Message, PaymentOut, PaymentPayRequest
from app.services import bookings as booking_service

router = APIRouter(prefix="/payments", tags=["Payments"])


def _load_payment(db: Session, payment_id: int) -> Payment:
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment


@router.get("", response_model=list[PaymentOut], summary="List payments (staff)")
def list_payments(
    status_filter: PaymentStatus | None = Query(default=None, alias="status"),
    method: PaymentMethod | None = Query(default=None),
    booking_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Payment]:
    if current_user.role == UserRole.PLAYER:
        raise HTTPException(status_code=403, detail="Staff only")
    stmt = select(Payment).order_by(Payment.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(Payment.status == status_filter)
    if method is not None:
        stmt = stmt.where(Payment.method == method)
    if booking_id is not None:
        stmt = stmt.where(Payment.booking_id == booking_id)
    return list(db.scalars(stmt.limit(limit).offset(offset)).all())


@router.get("/me", response_model=list[PaymentOut], summary="My payments")
def my_payments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Payment]:
    stmt = (
        select(Payment)
        .join(Booking, Booking.id == Payment.booking_id)
        .where(Booking.user_id == current_user.id)
        .order_by(Payment.created_at.desc())
    )
    return list(db.scalars(stmt).all())


@router.post(
    "/{payment_id}/pay",
    response_model=PaymentOut,
    summary="Mark a payment as paid",
)
def pay(
    payment_id: int,
    payload: PaymentPayRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Payment:
    payment = _load_payment(db, payment_id)
    booking = db.get(Booking, payment.booking_id)
    is_owner = booking is not None and booking.user_id == current_user.id
    if not is_owner and current_user.role == UserRole.PLAYER:
        raise HTTPException(status_code=403, detail="Not allowed")
    ref = payload.transaction_ref if payload else None
    return booking_service.mark_payment_paid(db, payment, transaction_ref=ref)


@router.post(
    "/{payment_id}/refund",
    response_model=PaymentOut,
    summary="Refund a payment (admin)",
)
def refund(
    payment_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Payment:
    payment = _load_payment(db, payment_id)
    return booking_service.refund_payment(db, payment)


@router.delete("/{payment_id}", response_model=Message, summary="Delete a payment (admin)")
def delete_payment(
    payment_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Message:
    payment = _load_payment(db, payment_id)
    db.delete(payment)
    db.commit()
    return Message(detail="Payment deleted")
