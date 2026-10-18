"""Dashboard / reporting queries."""

from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    BLOCKING_BOOKING_STATUSES,
    Booking,
    BookingStatus,
    Court,
    Payment,
    PaymentStatus,
    Review,
    User,
)
from app.schemas import CourtOccupancy, DashboardStats
from app.services.availability import get_day_window


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _minutes(a, b) -> int:
    return (b.hour * 60 + b.minute) - (a.hour * 60 + a.minute)


def compute_dashboard(
    db: Session,
    year: int | None = None,
    month: int | None = None,
) -> DashboardStats:
    today = date.today()
    year = year or today.year
    month = month or today.month
    start_date, end_date = _month_bounds(year, month)

    total_users = db.scalar(select(func.count(User.id))) or 0
    total_courts = db.scalar(select(func.count(Court.id))) or 0

    bookings_today = (
        db.scalar(
            select(func.count(Booking.id)).where(Booking.booking_date == today)
        )
        or 0
    )
    upcoming_bookings = (
        db.scalar(
            select(func.count(Booking.id)).where(
                Booking.booking_date >= today,
                Booking.status.in_(BLOCKING_BOOKING_STATUSES),
            )
        )
        or 0
    )
    active_bookings = (
        db.scalar(
            select(func.count(Booking.id)).where(
                Booking.status.in_(BLOCKING_BOOKING_STATUSES)
            )
        )
        or 0
    )
    cancelled_bookings = (
        db.scalar(
            select(func.count(Booking.id)).where(
                Booking.status == BookingStatus.CANCELLED
            )
        )
        or 0
    )

    status_rows = db.execute(
        select(Booking.status, func.count(Booking.id)).group_by(Booking.status)
    ).all()
    bookings_by_status = {row[0].value: row[1] for row in status_rows}

    revenue_paid = (
        db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.status == PaymentStatus.PAID
            )
        )
        or Decimal("0")
    )
    revenue_pending = (
        db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.status == PaymentStatus.PENDING
            )
        )
        or Decimal("0")
    )

    # --- Occupancy for the requested month --------------------------------
    occupancy: list[CourtOccupancy] = []
    courts = list(db.scalars(select(Court).order_by(Court.court_number)).all())
    month_bookings = db.scalars(
        select(Booking).where(
            Booking.booking_date.between(start_date, end_date),
            Booking.status.in_(BLOCKING_BOOKING_STATUSES),
        )
    ).all()

    for court in courts:
        available = 0
        for offset in range((end_date - start_date).days + 1):
            current = start_date + timedelta(days=offset)
            window = get_day_window(db, court, current)
            if window:
                available += _minutes(*window)
        booked = sum(
            _minutes(b.start_time, b.end_time)
            for b in month_bookings
            if b.court_id == court.id
        )
        occupancy.append(
            CourtOccupancy(
                court_id=court.id,
                court_name=court.name,
                available_minutes=available,
                booked_minutes=booked,
                occupancy_rate=round(booked / available, 4) if available else 0.0,
            )
        )

    avg_rating = db.scalar(select(func.avg(Review.rating)))

    # --- Top players this month -------------------------------------------
    top_rows = db.execute(
        select(User, func.count(Booking.id).label("bookings"))
        .join(Booking, Booking.user_id == User.id)
        .where(
            Booking.booking_date.between(start_date, end_date),
            Booking.status.in_(BLOCKING_BOOKING_STATUSES),
        )
        .group_by(User.id)
        .order_by(func.count(Booking.id).desc())
        .limit(5)
    ).all()
    top_players = [row[0] for row in top_rows]

    return DashboardStats(
        period=f"{year:04d}-{month:02d}",
        total_users=total_users,
        total_courts=total_courts,
        bookings_today=bookings_today,
        upcoming_bookings=upcoming_bookings,
        active_bookings=active_bookings,
        cancelled_bookings=cancelled_bookings,
        bookings_by_status=bookings_by_status,
        revenue_paid=Decimal(str(revenue_paid)).quantize(Decimal("0.01")),
        revenue_pending=Decimal(str(revenue_pending)).quantize(Decimal("0.01")),
        occupancy=occupancy,
        average_rating=round(float(avg_rating), 2) if avg_rating else None,
        top_players=top_players,
    )
