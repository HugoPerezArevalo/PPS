"""ORM models for the padel court booking system."""

from __future__ import annotations

import enum
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def utcnow() -> datetime:
    """Naive UTC timestamp (stored consistently, compared consistently)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def enum_column(enum_cls: type[enum.Enum], **kwargs) -> SAEnum:
    """String-backed enum column that stores the *value* (e.g. ``"admin"``)."""
    kwargs.setdefault("native_enum", False)
    kwargs.setdefault("length", 32)
    kwargs.setdefault("validate_strings", True)
    return SAEnum(
        enum_cls,
        values_callable=lambda cls: [member.value for member in cls],
        **kwargs,
    )


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #
class UserRole(str, enum.Enum):
    ADMIN = "admin"
    COACH = "coach"
    PLAYER = "player"


class CourtSurface(str, enum.Enum):
    """Type of padel court construction."""

    PANORAMIC = "panoramic"  # fully glass walls
    PREFABRICATED = "prefabricated"  # mixed panel/glass
    CONCRETE = "concrete"  # traditional masonry backwalls


class CourtEnvironment(str, enum.Enum):
    INDOOR = "indoor"
    OUTDOOR = "outdoor"


class CourtStatus(str, enum.Enum):
    AVAILABLE = "available"
    MAINTENANCE = "maintenance"
    CLOSED = "closed"


class BookingStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    NO_SHOW = "no_show"


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    CARD = "card"
    BIZUM = "bizum"
    TRANSFER = "transfer"
    CREDIT = "credit"  # prepaid balance / membership


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    REFUNDED = "refunded"
    FAILED = "failed"


class MatchStatus(str, enum.Enum):
    OPEN = "open"
    FULL = "full"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class ApplicationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


# Booking statuses that block a time slot for other users.
BLOCKING_BOOKING_STATUSES = (BookingStatus.PENDING, BookingStatus.CONFIRMED)


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        enum_column(UserRole), default=UserRole.PLAYER, index=True
    )
    # Playing level, padel scale 1.0 (beginner) -> 7.0 (pro)
    level: Mapped[float] = mapped_column(Float, default=3.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )

    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="user", foreign_keys="Booking.user_id"
    )
    reviews: Mapped[list["Review"]] = relationship(back_populates="user")
    match_requests: Mapped[list["MatchRequest"]] = relationship(
        back_populates="user"
    )
    match_applications: Mapped[list["MatchApplication"]] = relationship(
        back_populates="user"
    )


# --------------------------------------------------------------------------- #
# Courts
# --------------------------------------------------------------------------- #
class Court(Base):
    __tablename__ = "courts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    court_number: Mapped[int] = mapped_column(Integer, unique=True)
    surface: Mapped[CourtSurface] = mapped_column(
        enum_column(CourtSurface), default=CourtSurface.PANORAMIC
    )
    environment: Mapped[CourtEnvironment] = mapped_column(
        enum_column(CourtEnvironment), default=CourtEnvironment.OUTDOOR
    )
    has_lighting: Mapped[bool] = mapped_column(Boolean, default=True)
    is_covered: Mapped[bool] = mapped_column(Boolean, default=False)
    price_per_hour: Mapped[Decimal] = mapped_column(
        Numeric(8, 2), default=Decimal("24.00")
    )
    status: Mapped[CourtStatus] = mapped_column(
        enum_column(CourtStatus), default=CourtStatus.AVAILABLE, index=True
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )

    schedule: Mapped[list["CourtSchedule"]] = relationship(
        back_populates="court",
        cascade="all, delete-orphan",
        order_by="CourtSchedule.day_of_week",
    )
    closures: Mapped[list["CourtClosure"]] = relationship(
        back_populates="court", cascade="all, delete-orphan"
    )
    bookings: Mapped[list["Booking"]] = relationship(back_populates="court")
    reviews: Mapped[list["Review"]] = relationship(back_populates="court")


class CourtSchedule(Base):
    """Weekly opening hours, one row per weekday (and per court)."""

    __tablename__ = "court_schedule"
    __table_args__ = (
        UniqueConstraint("court_id", "day_of_week", name="uq_schedule_court_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    court_id: Mapped[int] = mapped_column(
        ForeignKey("courts.id", ondelete="CASCADE"), index=True
    )
    # Monday = 0 ... Sunday = 6
    day_of_week: Mapped[int] = mapped_column(Integer)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    open_time: Mapped[time] = mapped_column(Time, default=time(8, 0))
    close_time: Mapped[time] = mapped_column(Time, default=time(23, 0))

    court: Mapped[Court] = relationship(back_populates="schedule")


class CourtClosure(Base):
    """Exceptional closures: maintenance, tournaments, holidays..."""

    __tablename__ = "court_closures"

    id: Mapped[int] = mapped_column(primary_key=True)
    court_id: Mapped[int] = mapped_column(
        ForeignKey("courts.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    # Null end_time => closed the whole day.
    start_time: Mapped[time] = mapped_column(Time, default=time(0, 0))
    end_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    court: Mapped[Court] = relationship(back_populates="closures")


# --------------------------------------------------------------------------- #
# Bookings
# --------------------------------------------------------------------------- #
class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        Index("ix_bookings_court_date", "court_id", "booking_date"),
        Index("ix_bookings_user_date", "user_id", "booking_date"),
        CheckConstraint("start_time < end_time", name="ck_booking_time_order"),
        CheckConstraint("players_count >= 1", name="ck_booking_players"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    court_id: Mapped[int] = mapped_column(
        ForeignKey("courts.id", ondelete="RESTRICT"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    booking_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    status: Mapped[BookingStatus] = mapped_column(
        enum_column(BookingStatus), default=BookingStatus.CONFIRMED, index=True
    )
    total_price: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    players_count: Mapped[int] = mapped_column(Integer, default=4)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancellation_reason: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )

    court: Mapped[Court] = relationship(back_populates="bookings")
    user: Mapped[User] = relationship(back_populates="bookings", foreign_keys=[user_id])
    participants: Mapped[list["BookingParticipant"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )


class BookingParticipant(Base):
    """Extra players joining the booking (padel is played in pairs/teams)."""

    __tablename__ = "booking_participants"
    __table_args__ = (
        UniqueConstraint("booking_id", "user_id", name="uq_participant_booking_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # For guests that are not registered users.
    guest_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    booking: Mapped[Booking] = relationship(back_populates="participants")
    user: Mapped[Optional[User]] = relationship()


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    method: Mapped[PaymentMethod] = mapped_column(
        enum_column(PaymentMethod), default=PaymentMethod.CARD
    )
    status: Mapped[PaymentStatus] = mapped_column(
        enum_column(PaymentStatus), default=PaymentStatus.PENDING, index=True
    )
    transaction_ref: Mapped[Optional[str]] = mapped_column(
        String(64), unique=True, nullable=True
    )
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    booking: Mapped[Booking] = relationship(back_populates="payments")


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("court_id", "user_id", name="uq_review_court_user"),
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_review_rating"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    court_id: Mapped[int] = mapped_column(
        ForeignKey("courts.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )

    court: Mapped[Court] = relationship(back_populates="reviews")
    user: Mapped[User] = relationship(back_populates="reviews")


# --------------------------------------------------------------------------- #
# Matchmaking: find partners / opponents
# --------------------------------------------------------------------------- #
class MatchRequest(Base):
    """A player looking for partners to play on a given date/time."""

    __tablename__ = "match_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    match_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[time] = mapped_column(Time)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=90)
    # Number of players still needed (2 or 3 for a standard doubles match).
    players_needed: Mapped[int] = mapped_column(Integer, default=2)
    min_level: Mapped[float] = mapped_column(Float, default=1.0)
    max_level: Mapped[float] = mapped_column(Float, default=7.0)
    court_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("courts.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[MatchStatus] = mapped_column(
        enum_column(MatchStatus), default=MatchStatus.OPEN, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship(back_populates="match_requests")
    court: Mapped[Optional[Court]] = relationship()
    applications: Mapped[list["MatchApplication"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )


class MatchApplication(Base):
    __tablename__ = "match_applications"
    __table_args__ = (
        UniqueConstraint("match_id", "user_id", name="uq_application_match_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("match_requests.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    message: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[ApplicationStatus] = mapped_column(
        enum_column(ApplicationStatus), default=ApplicationStatus.PENDING
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    match: Mapped[MatchRequest] = relationship(back_populates="applications")
    user: Mapped[User] = relationship(back_populates="match_applications")


# --------------------------------------------------------------------------- #
# Tokens (JWT revocation / blacklist)
# --------------------------------------------------------------------------- #
class RevokedToken(Base):
    """A revoked JWT identified by its ``jti`` claim.

    Used to implement a real logout and refresh-token rotation: once a token's
    ``jti`` is stored here it can no longer be used, even though the JWT itself
    is still cryptographically valid. Rows can be purged once ``expires_at``
    has passed (a revoked token is only relevant until it would have expired).
    """

    __tablename__ = "revoked_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    token_type: Mapped[str] = mapped_column(String(16), default="access")
    # When the original token would have expired (used for cleanup).
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    revoked_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    reason: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
