"""Availability logic: weekly schedules, closures, conflicts and slot grids."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    BLOCKING_BOOKING_STATUSES,
    Booking,
    Court,
    CourtClosure,
    CourtSchedule,
    CourtStatus,
    User,
)
from app.schemas import AvailabilityResponse, Slot


# --------------------------------------------------------------------------- #
# Time helpers
# --------------------------------------------------------------------------- #
def time_to_minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def minutes_to_time(minutes: int) -> time:
    minutes = min(max(minutes, 0), 24 * 60 - 1)
    return time(hour=minutes // 60, minute=minutes % 60)


def interval_overlaps(a_start: time, a_end: time, b_start: time, b_end: time) -> bool:
    """Half-open interval overlap: [start, end)."""
    return a_start < b_end and a_end > b_start


# --------------------------------------------------------------------------- #
# Price
# --------------------------------------------------------------------------- #
def compute_price(court: Court, start: time, end: time) -> Decimal:
    """Price of a booking = (duration in hours) x price per hour."""
    hours = Decimal(time_to_minutes(end) - time_to_minutes(start)) / Decimal(60)
    price = Decimal(court.price_per_hour) * hours
    return price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# --------------------------------------------------------------------------- #
# Schedules & closures
# --------------------------------------------------------------------------- #
def get_day_window(db: Session, court: Court, day: date) -> Optional[tuple[time, time]]:
    """Return ``(open_time, close_time)`` for a court on a given day.

    Returns ``None`` when the court does not operate on that day (weekly day
    off). Court availability status is *not* considered here.
    """
    row = db.scalar(
        select(CourtSchedule).where(
            CourtSchedule.court_id == court.id,
            CourtSchedule.day_of_week == day.weekday(),
        )
    )
    if row is None or not row.is_open:
        return None
    return row.open_time, row.close_time


def get_closures(db: Session, court_id: int, day: date) -> list[CourtClosure]:
    stmt = select(CourtClosure).where(
        CourtClosure.court_id == court_id,
        CourtClosure.date == day,
    )
    return list(db.scalars(stmt).all())


def closure_intervals(closures: Iterable[CourtClosure]) -> list[tuple[time, time]]:
    """Normalize closures to intervals; ``end_time=None`` means all day."""
    intervals: list[tuple[time, time]] = []
    for closure in closures:
        end = closure.end_time or time(23, 59)
        intervals.append((closure.start_time or time(0, 0), end))
    return intervals


# --------------------------------------------------------------------------- #
# Bookings that block a court
# --------------------------------------------------------------------------- #
def get_blocking_bookings(
    db: Session, court_id: int, day: date, exclude_booking_id: Optional[int] = None
) -> list[Booking]:
    stmt = (
        select(Booking)
        .where(
            Booking.court_id == court_id,
            Booking.booking_date == day,
            Booking.status.in_(BLOCKING_BOOKING_STATUSES),
        )
        .order_by(Booking.start_time)
    )
    if exclude_booking_id:
        stmt = stmt.where(Booking.id != exclude_booking_id)
    return list(db.scalars(stmt).all())


def court_has_conflict(
    db: Session,
    court_id: int,
    day: date,
    start: time,
    end: time,
    exclude_booking_id: Optional[int] = None,
) -> Optional[Booking]:
    """Return the conflicting booking, if any."""
    for booking in get_blocking_bookings(db, court_id, day, exclude_booking_id):
        if interval_overlaps(start, end, booking.start_time, booking.end_time):
            return booking
    return None


def user_has_conflict(
    db: Session,
    user_id: int,
    day: date,
    start: time,
    end: time,
    exclude_booking_id: Optional[int] = None,
) -> Optional[Booking]:
    """The same player must not hold two overlapping bookings (any court)."""
    stmt = (
        select(Booking)
        .where(
            Booking.user_id == user_id,
            Booking.booking_date == day,
            Booking.status.in_(BLOCKING_BOOKING_STATUSES),
        )
        .order_by(Booking.start_time)
    )
    if exclude_booking_id:
        stmt = stmt.where(Booking.id != exclude_booking_id)
    for booking in db.scalars(stmt).all():
        if interval_overlaps(start, end, booking.start_time, booking.end_time):
            return booking
    return None


# --------------------------------------------------------------------------- #
# Slot grid
# --------------------------------------------------------------------------- #
def build_slots(
    db: Session,
    court: Court,
    day: date,
    user_id: Optional[int] = None,
) -> AvailabilityResponse:
    """Build the full day grid for one court with a status per slot."""
    window = get_day_window(db, court, day)
    slot_minutes = settings.slot_minutes
    now = datetime.now()

    if window is None:
        return AvailabilityResponse(
            court_id=court.id,
            court_name=court.name,
            date=day,
            is_open=False,
            open_time=None,
            close_time=None,
            slot_minutes=slot_minutes,
            available_slots=0,
            slots=[],
        )

    open_time, close_time = window
    closures = closure_intervals(get_closures(db, court.id, day))
    bookings = get_blocking_bookings(db, court.id, day)

    slot_hours = Decimal(slot_minutes) / Decimal(60)
    slot_price = (Decimal(court.price_per_hour) * slot_hours).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    slots: list[Slot] = []
    cursor = time_to_minutes(open_time)
    end_boundary = time_to_minutes(close_time)

    while cursor + slot_minutes <= end_boundary:
        slot_start = minutes_to_time(cursor)
        slot_end = minutes_to_time(cursor + slot_minutes)

        # Whose booking occupies this slot? (only surfaced to its owner)
        owner_booking_id: Optional[int] = None
        occupied = False
        for booking in bookings:
            if interval_overlaps(slot_start, slot_end, booking.start_time, booking.end_time):
                occupied = True
                if booking.user_id == user_id:
                    owner_booking_id = booking.id
                break

        in_closure = any(
            interval_overlaps(slot_start, slot_end, c_start, c_end)
            for c_start, c_end in closures
        )

        slot_dt = datetime.combine(day, slot_start)
        is_past = slot_dt < now

        if is_past:
            status = "past"
        elif in_closure or court.status == CourtStatus.CLOSED:
            status = "closed"
        elif court.status == CourtStatus.MAINTENANCE:
            status = "maintenance"
        elif occupied:
            status = "booked"
        else:
            status = "free"

        slots.append(
            Slot(
                start=slot_start,
                end=slot_end,
                status=status,
                price=slot_price,
                booking_id=owner_booking_id,
            )
        )
        cursor += slot_minutes

    return AvailabilityResponse(
        court_id=court.id,
        court_name=court.name,
        date=day,
        is_open=True,
        open_time=open_time,
        close_time=close_time,
        slot_minutes=slot_minutes,
        available_slots=sum(1 for s in slots if s.status == "free"),
        slots=slots,
    )


def find_available_courts(
    db: Session,
    day: date,
    start: time,
    end: time,
    courts: Optional[list[Court]] = None,
) -> list[dict]:
    """Return the courts free for ``[start, end)`` on ``day``."""
    if courts is None:
        courts = list(db.scalars(select(Court)).order_by(Court.court_number).all())

    results: list[dict] = []
    for court in courts:
        window = get_day_window(db, court, day)
        if window is None:
            continue
        open_time, close_time = window
        if start < open_time or end > close_time:
            continue
        if court.status != CourtStatus.AVAILABLE:
            continue

        closures = closure_intervals(get_closures(db, court.id, day))
        if any(
            interval_overlaps(start, end, c_start, c_end) for c_start, c_end in closures
        ):
            continue

        if court_has_conflict(db, court.id, day, start, end):
            continue

        results.append(
            {
                "court": court,
                "open_time": open_time,
                "close_time": close_time,
                "total_price": compute_price(court, start, end),
            }
        )
    return results
