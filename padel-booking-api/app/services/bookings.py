"""Booking domain logic: validation, creation, cancellation and rescheduling."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional

from fastapi import HTTPException, status as http_status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Booking,
    BookingParticipant,
    BookingStatus,
    Court,
    CourtStatus,
    Payment,
    PaymentStatus,
    User,
    utcnow,
)
from app.schemas import BookingCreate, BookingUpdate, ParticipantIn
from app.services.availability import (
    compute_price,
    court_has_conflict,
    get_closures,
    get_day_window,
    interval_overlaps,
    time_to_minutes,
    user_has_conflict,
)


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #
def _fail(detail: str, code: int = http_status.HTTP_400_BAD_REQUEST) -> None:
    raise HTTPException(status_code=code, detail=detail)


def validate_booking_times(
    db: Session,
    court: Court,
    day: date,
    start: time,
    end: time,
    user: User,
    exclude_booking_id: Optional[int] = None,
) -> None:
    """Raise ``HTTPException`` when the requested slot cannot be booked."""
    slot = settings.slot_minutes

    # --- Calendar sanity ---------------------------------------------------
    today = date.today()
    if day < today:
        _fail("Cannot book a slot in the past")
    if day == today and start < datetime.now().time():
        _fail("Cannot book a slot that has already started")

    # --- Grid alignment ----------------------------------------------------
    for label, value in (("start_time", start), ("end_time", end)):
        if value.second or value.microsecond:
            _fail(f"{label} must not include seconds")
        if time_to_minutes(value) % slot != 0:
            _fail(f"{label} must align to the {slot}-minute grid")

    # --- Duration ----------------------------------------------------------
    duration = time_to_minutes(end) - time_to_minutes(start)
    if duration < settings.min_booking_minutes:
        _fail(f"Minimum booking length is {settings.min_booking_minutes} minutes")
    if duration > settings.max_booking_hours * 60:
        _fail(f"Maximum booking length is {settings.max_booking_hours} hours")

    # --- Opening hours -----------------------------------------------------
    window = get_day_window(db, court, day)
    if window is None:
        _fail("The court is closed on that day", http_status.HTTP_409_CONFLICT)
    open_time, close_time = window
    if start < open_time or end > close_time:
        _fail(
            f"Outside opening hours ({open_time.strftime('%H:%M')} - "
            f"{close_time.strftime('%H:%M')})",
            http_status.HTTP_409_CONFLICT,
        )

    # --- Court status ------------------------------------------------------
    if court.status == CourtStatus.MAINTENANCE:
        _fail("Court is under maintenance", http_status.HTTP_409_CONFLICT)
    if court.status == CourtStatus.CLOSED:
        _fail("Court is closed", http_status.HTTP_409_CONFLICT)

    # --- Exceptional closures --------------------------------------------
    for closure in get_closures(db, court.id, day):
        c_end = closure.end_time or time(23, 59)
        c_start = closure.start_time or time(0, 0)
        if interval_overlaps(start, end, c_start, c_end):
            reason = closure.reason or "maintenance"
            _fail(
                f"Court unavailable at that time ({reason})",
                http_status.HTTP_409_CONFLICT,
            )

    # --- Conflicts ---------------------------------------------------------
    clash = court_has_conflict(db, court.id, day, start, end, exclude_booking_id)
    if clash:
        _fail(
            f"Court already booked from {clash.start_time.strftime('%H:%M')} "
            f"to {clash.end_time.strftime('%H:%M')}",
            http_status.HTTP_409_CONFLICT,
        )

    own_clash = user_has_conflict(
        db, user.id, day, start, end, exclude_booking_id
    )
    if own_clash:
        _fail(
            "You already have a reservation that overlaps this time slot",
            http_status.HTTP_409_CONFLICT,
        )


# --------------------------------------------------------------------------- #
# Creation
# --------------------------------------------------------------------------- #
def _validate_participants(db: Session, booking_owner: User, items: list[ParticipantIn]) -> list[ParticipantIn]:
    cleaned: list[ParticipantIn] = []
    seen: set[int] = {booking_owner.id}
    for item in items:
        if item.user_id is not None:
            if item.user_id in seen:
                _fail("Duplicated player in the booking")
            seen.add(item.user_id)
        cleaned.append(item)
    return cleaned


def create_booking(
    db: Session,
    payload: BookingCreate,
    user: User,
) -> Booking:
    court = db.get(Court, payload.court_id)
    if court is None:
        _fail("Court not found", http_status.HTTP_404_NOT_FOUND)

    participants = _validate_participants(db, user, payload.participants)
    total_players = 1 + len(participants)
    if total_players > settings.max_players_per_booking:
        _fail(
            f"A court fits at most {settings.max_players_per_booking} players",
            http_status.HTTP_400_BAD_REQUEST,
        )
    if payload.players_count > settings.max_players_per_booking:
        _fail(
            f"A court fits at most {settings.max_players_per_booking} players",
            http_status.HTTP_400_BAD_REQUEST,
        )

    validate_booking_times(
        db,
        court,
        payload.booking_date,
        payload.start_time,
        payload.end_time,
        user,
    )

    booking = Booking(
        court_id=court.id,
        user_id=user.id,
        booking_date=payload.booking_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        duration_minutes=time_to_minutes(payload.end_time)
        - time_to_minutes(payload.start_time),
        status=BookingStatus.CONFIRMED,
        total_price=compute_price(court, payload.start_time, payload.end_time),
        players_count=max(payload.players_count, total_players),
        notes=payload.notes,
    )
    db.add(booking)
    db.flush()

    for item in participants:
        db.add(
            BookingParticipant(
                booking_id=booking.id, user_id=item.user_id, guest_name=item.guest_name
            )
        )

    # Every booking gets a pending payment record.
    db.add(
        Payment(
            booking_id=booking.id,
            amount=booking.total_price,
            method=payload.payment_method,
            status=PaymentStatus.PENDING,
        )
    )
    db.commit()
    db.refresh(booking)
    return booking


# --------------------------------------------------------------------------- #
# Rescheduling
# --------------------------------------------------------------------------- #
def reschedule_booking(
    db: Session, booking: Booking, payload: BookingUpdate, actor: User
) -> Booking:
    if booking.status not in (BookingStatus.PENDING, BookingStatus.CONFIRMED):
        _fail("Only pending or confirmed bookings can be rescheduled")
    if booking.booking_date < date.today() or (
        booking.booking_date == date.today()
        and booking.start_time < datetime.now().time()
    ):
        _fail("This booking has already started")

    new_court_id = payload.court_id or booking.court_id
    new_date = payload.booking_date or booking.booking_date
    new_start = payload.start_time or booking.start_time
    new_end = payload.end_time or booking.end_time

    court = db.get(Court, new_court_id)
    if court is None:
        _fail("Court not found", http_status.HTTP_404_NOT_FOUND)

    validate_booking_times(
        db,
        court,
        new_date,
        new_start,
        new_end,
        actor,
        exclude_booking_id=booking.id,
    )

    booking.court_id = court.id
    booking.booking_date = new_date
    booking.start_time = new_start
    booking.end_time = new_end
    booking.duration_minutes = time_to_minutes(new_end) - time_to_minutes(new_start)
    booking.total_price = compute_price(court, new_start, new_end)
    if payload.notes is not None:
        booking.notes = payload.notes

    # Keep the payment amount in sync with the new price.
    for payment in booking.payments:
        if payment.status == PaymentStatus.PENDING:
            payment.amount = booking.total_price

    db.commit()
    db.refresh(booking)
    return booking


# --------------------------------------------------------------------------- #
# Cancellation
# --------------------------------------------------------------------------- #
def can_cancel(booking: Booking, actor: User, is_admin: bool) -> None:
    """Raise unless the actor may cancel this booking right now."""
    if booking.status not in (BookingStatus.PENDING, BookingStatus.CONFIRMED):
        _fail("Only pending or confirmed bookings can be cancelled")
    if is_admin:
        return

    starts_at = datetime.combine(booking.booking_date, booking.start_time)
    cutoff = starts_at.timestamp() - settings.cancel_cutoff_hours * 3600
    if datetime.now().timestamp() > cutoff:
        _fail(
            f"Free cancellation is only allowed until "
            f"{settings.cancel_cutoff_hours} hours before the start time",
            http_status.HTTP_409_CONFLICT,
        )


def cancel_booking(
    db: Session,
    booking: Booking,
    actor: User,
    reason: Optional[str] = None,
    is_admin: bool = False,
) -> Booking:
    can_cancel(booking, actor, is_admin)

    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = utcnow()
    booking.cancellation_reason = reason
    for payment in booking.payments:
        if payment.status == PaymentStatus.PAID:
            payment.status = PaymentStatus.REFUNDED
    db.commit()
    db.refresh(booking)
    return booking


# --------------------------------------------------------------------------- #
# Status transitions (staff)
# --------------------------------------------------------------------------- #
def set_booking_status(
    db: Session, booking: Booking, new_status: BookingStatus
) -> Booking:
    allowed: dict[BookingStatus, set[BookingStatus]] = {
        BookingStatus.PENDING: {BookingStatus.CONFIRMED, BookingStatus.CANCELLED},
        BookingStatus.CONFIRMED: {
            BookingStatus.COMPLETED,
            BookingStatus.NO_SHOW,
            BookingStatus.CANCELLED,
        },
        # Admin corrections / reinstatements of past or cancelled bookings.
        BookingStatus.COMPLETED: {BookingStatus.NO_SHOW},
        BookingStatus.NO_SHOW: {BookingStatus.CONFIRMED},
        BookingStatus.CANCELLED: {BookingStatus.CONFIRMED},
    }
    if new_status not in allowed.get(booking.status, set()):
        _fail(
            f"Cannot move a booking from '{booking.status.value}' to "
            f"'{new_status.value}'",
            http_status.HTTP_409_CONFLICT,
        )
    booking.status = new_status
    db.commit()
    db.refresh(booking)
    return booking


def complete_past_bookings(db: Session) -> int:
    """Sweep: mark started bookings as completed. Returns number updated."""
    now = datetime.now()
    updated = 0
    candidates = db.scalars(
        select(Booking).where(
            Booking.status.in_(
                [BookingStatus.PENDING, BookingStatus.CONFIRMED]
            )
        )
    ).all()
    pending = [
        booking
        for booking in candidates
        if booking.booking_date < now.date()
        or (booking.booking_date == now.date() and booking.end_time <= now.time())
    ]
    for booking in pending:
        booking.status = BookingStatus.COMPLETED
        updated += 1
    if updated:
        db.commit()
    return updated


# --------------------------------------------------------------------------- #
# Payments
# --------------------------------------------------------------------------- #
def mark_payment_paid(
    db: Session, payment: Payment, transaction_ref: Optional[str] = None
) -> Payment:
    if payment.status not in (PaymentStatus.PENDING, PaymentStatus.FAILED):
        _fail("Only pending or failed payments can be marked as paid")
    payment.status = PaymentStatus.PAID
    payment.paid_at = utcnow()
    payment.transaction_ref = transaction_ref or payment.transaction_ref
    db.commit()
    db.refresh(payment)
    return payment


def refund_payment(db: Session, payment: Payment) -> Payment:
    if payment.status != PaymentStatus.PAID:
        _fail("Only paid payments can be refunded")
    payment.status = PaymentStatus.REFUNDED
    db.commit()
    db.refresh(payment)
    return payment
