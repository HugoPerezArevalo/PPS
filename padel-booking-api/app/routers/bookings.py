"""Booking routes."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Booking, BookingStatus, User, UserRole
from app.schemas import (
    BookingCreate,
    BookingOut,
    BookingStatusUpdate,
    BookingUpdate,
    CancelRequest,
    Message,
)
from app.services import bookings as booking_service

router = APIRouter(prefix="/bookings", tags=["Bookings"])


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _load_booking(db: Session, booking_id: int) -> Booking:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


def _ensure_owner_or_staff(booking: Booking, user: User) -> None:
    if booking.user_id != user.id and user.role == UserRole.PLAYER:
        raise HTTPException(
            status_code=403, detail="You can only manage your own bookings"
        )


# --------------------------------------------------------------------------- #
# Create / list / get
# --------------------------------------------------------------------------- #
@router.post(
    "",
    response_model=BookingOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a reservation",
)
def create_booking(
    payload: BookingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Booking:
    return booking_service.create_booking(db, payload, current_user)


@router.get("", response_model=list[BookingOut], summary="List bookings")
def list_bookings(
    scope: str = Query(default="mine", pattern="^(mine|all)$"),
    status_filter: BookingStatus | None = Query(default=None, alias="status"),
    court_id: int | None = Query(default=None),
    user_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Booking]:
    stmt = select(Booking).order_by(
        Booking.booking_date.desc(), Booking.start_time.desc()
    )

    if scope == "all":
        if current_user.role == UserRole.PLAYER:
            raise HTTPException(
                status_code=403, detail="Only staff can list every booking"
            )
        if user_id is not None:
            stmt = stmt.where(Booking.user_id == user_id)
    else:
        stmt = stmt.where(Booking.user_id == current_user.id)

    if status_filter is not None:
        stmt = stmt.where(Booking.status == status_filter)
    if court_id is not None:
        stmt = stmt.where(Booking.court_id == court_id)
    if date_from is not None:
        stmt = stmt.where(Booking.booking_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Booking.booking_date <= date_to)

    return list(db.scalars(stmt.limit(limit).offset(offset)).all())


@router.get("/{booking_id}", response_model=BookingOut, summary="Get a booking")
def get_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Booking:
    booking = _load_booking(db, booking_id)
    _ensure_owner_or_staff(booking, current_user)
    return booking


# --------------------------------------------------------------------------- #
# Modify
# --------------------------------------------------------------------------- #
@router.patch(
    "/{booking_id}",
    response_model=BookingOut,
    summary="Reschedule a booking (owner or admin)",
)
def reschedule_booking(
    booking_id: int,
    payload: BookingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Booking:
    booking = _load_booking(db, booking_id)
    _ensure_owner_or_staff(booking, current_user)
    if (
        current_user.role not in (UserRole.ADMIN, UserRole.COACH)
        and booking.user_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Not allowed")
    return booking_service.reschedule_booking(db, booking, payload, current_user)


@router.post(
    "/{booking_id}/cancel",
    response_model=BookingOut,
    summary="Cancel a booking",
)
def cancel_booking(
    booking_id: int,
    payload: CancelRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Booking:
    booking = _load_booking(db, booking_id)
    _ensure_owner_or_staff(booking, current_user)
    is_admin = current_user.role == UserRole.ADMIN
    reason = payload.reason if payload else None
    return booking_service.cancel_booking(
        db, booking, current_user, reason=reason, is_admin=is_admin
    )


# --------------------------------------------------------------------------- #
# Staff operations
# --------------------------------------------------------------------------- #
@router.patch(
    "/{booking_id}/status",
    response_model=BookingOut,
    summary="Change booking status (staff)",
)
def update_status(
    booking_id: int,
    payload: BookingStatusUpdate,
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> Booking:
    booking = _load_booking(db, booking_id)
    return booking_service.set_booking_status(db, booking, payload.status)


@router.post(
    "/maintenance/complete-past",
    response_model=Message,
    summary="Mark past bookings as completed (admin)",
    dependencies=[Depends(require_staff)],
)
def complete_past(db: Session = Depends(get_db)) -> Message:
    updated = booking_service.complete_past_bookings(db)
    return Message(detail=f"{updated} booking(s) marked as completed")
