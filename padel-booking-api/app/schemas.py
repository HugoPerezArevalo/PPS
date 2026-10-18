"""Pydantic schemas: request/response models for the whole API."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    model_validator,
)

from app.models import (
    ApplicationStatus,
    BookingStatus,
    CourtEnvironment,
    CourtStatus,
    CourtSurface,
    MatchStatus,
    PaymentMethod,
    PaymentStatus,
    UserRole,
)

# --------------------------------------------------------------------------- #
# Common
# --------------------------------------------------------------------------- #
class Message(BaseModel):
    detail: str


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


RoleLiteral = Literal["admin", "coach", "player"]


# --------------------------------------------------------------------------- #
# Auth / Users
# --------------------------------------------------------------------------- #
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=2, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)
    level: float = Field(default=3.0, ge=1.0, le=7.0)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)
    level: Optional[float] = Field(default=None, ge=1.0, le=7.0)


class UserAdminUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)
    level: Optional[float] = Field(default=None, ge=1.0, le=7.0)
    role: Optional[RoleLiteral] = None
    is_active: Optional[bool] = None


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=8, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)


class UserOut(ORMModel):
    id: int
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    role: UserRole
    level: float
    is_active: bool
    created_at: datetime


class UserBrief(ORMModel):
    """Lightweight user reference embedded in other resources."""

    id: int
    full_name: str
    role: UserRole
    level: float


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    # The client sends its refresh token so both tokens can be revoked.
    refresh_token: Optional[str] = None


# --------------------------------------------------------------------------- #
# Courts
# --------------------------------------------------------------------------- #
class CourtScheduleIn(BaseModel):
    day_of_week: int = Field(ge=0, le=6, description="Monday=0 ... Sunday=6")
    is_open: bool = True
    open_time: time = time(8, 0)
    close_time: time = time(23, 0)

    @model_validator(mode="after")
    def _check_times(self) -> "CourtScheduleIn":
        if self.is_open and self.open_time >= self.close_time:
            raise ValueError("open_time must be earlier than close_time")
        return self


class CourtScheduleOut(ORMModel):
    id: int
    day_of_week: int
    is_open: bool
    open_time: time
    close_time: time


class CourtCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    court_number: int = Field(ge=1, le=99)
    surface: CourtSurface = CourtSurface.PANORAMIC
    environment: CourtEnvironment = CourtEnvironment.OUTDOOR
    has_lighting: bool = True
    is_covered: bool = False
    price_per_hour: Decimal = Field(default=Decimal("24.00"), gt=0, le=999)
    status: CourtStatus = CourtStatus.AVAILABLE
    description: Optional[str] = Field(default=None, max_length=1000)
    # Optional custom weekly schedule; defaults are applied when omitted.
    schedule: Optional[list[CourtScheduleIn]] = None


class CourtUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    court_number: Optional[int] = Field(default=None, ge=1, le=99)
    surface: Optional[CourtSurface] = None
    environment: Optional[CourtEnvironment] = None
    has_lighting: Optional[bool] = None
    is_covered: Optional[bool] = None
    price_per_hour: Optional[Decimal] = Field(default=None, gt=0, le=999)
    status: Optional[CourtStatus] = None
    description: Optional[str] = Field(default=None, max_length=1000)


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=1000)


class ReviewOut(ORMModel):
    id: int
    court_id: int
    rating: int
    comment: Optional[str] = None
    created_at: datetime
    user: UserBrief


class CourtOut(ORMModel):
    id: int
    name: str
    court_number: int
    surface: CourtSurface
    environment: CourtEnvironment
    has_lighting: bool
    is_covered: bool
    price_per_hour: Decimal
    status: CourtStatus
    description: Optional[str] = None
    created_at: datetime
    average_rating: Optional[float] = None
    review_count: int = 0


class CourtDetailOut(CourtOut):
    schedule: list[CourtScheduleOut] = []
    closures: list["CourtClosureOut"] = []


class CourtClosureCreate(BaseModel):
    date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    reason: Optional[str] = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _check_times(self) -> "CourtClosureCreate":
        if (
            self.start_time is not None
            and self.end_time is not None
            and self.start_time >= self.end_time
        ):
            raise ValueError("start_time must be earlier than end_time")
        if self.start_time is None and self.end_time is not None:
            raise ValueError("end_time requires start_time")
        return self


class CourtClosureOut(ORMModel):
    id: int
    court_id: int
    date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    reason: Optional[str] = None


# --------------------------------------------------------------------------- #
# Availability
# --------------------------------------------------------------------------- #
SlotStatus = Literal["free", "booked", "past", "closed", "maintenance"]


class Slot(BaseModel):
    start: time
    end: time
    status: SlotStatus
    price: Decimal
    # Only filled when the occupied slot belongs to the requesting user.
    booking_id: Optional[int] = None


class AvailabilityResponse(BaseModel):
    court_id: int
    court_name: str
    date: date
    is_open: bool
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    slot_minutes: int
    available_slots: int
    slots: list[Slot]


class AvailabilityQuery(BaseModel):
    court_id: int
    date: date


class AvailableCourtOut(BaseModel):
    """A court that is free for a requested date/time window."""

    court: "CourtOut"
    open_time: time
    close_time: time
    total_price: Decimal


class FindCourtsQuery(BaseModel):
    date: date
    start_time: time
    end_time: time


# --------------------------------------------------------------------------- #
# Bookings
# --------------------------------------------------------------------------- #
class ParticipantIn(BaseModel):
    user_id: Optional[int] = None
    guest_name: Optional[str] = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def _one_of(self) -> "ParticipantIn":
        if self.user_id is None and not self.guest_name:
            raise ValueError("Either user_id or guest_name is required")
        return self


class ParticipantOut(ORMModel):
    id: int
    user_id: Optional[int] = None
    guest_name: Optional[str] = None


class BookingCreate(BaseModel):
    court_id: int
    booking_date: date
    start_time: time
    end_time: time
    players_count: int = Field(default=4, ge=1, le=4)
    notes: Optional[str] = Field(default=None, max_length=500)
    participants: list[ParticipantIn] = Field(default_factory=list)
    payment_method: PaymentMethod = PaymentMethod.CARD

    @model_validator(mode="after")
    def _check_times(self) -> "BookingCreate":
        if self.start_time >= self.end_time:
            raise ValueError("start_time must be earlier than end_time")
        return self


class BookingUpdate(BaseModel):
    """Reschedule an existing booking (owner or admin only)."""

    court_id: Optional[int] = None
    booking_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    notes: Optional[str] = Field(default=None, max_length=500)


class CancelRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=255)


class BookingOut(ORMModel):
    id: int
    court_id: int
    user_id: int
    booking_date: date
    start_time: time
    end_time: time
    duration_minutes: int
    status: BookingStatus
    total_price: Decimal
    players_count: int
    notes: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    created_at: datetime
    court: "CourtBrief"
    user: UserBrief
    participants: list[ParticipantOut] = []
    payments: list["PaymentOut"] = []


class CourtBrief(ORMModel):
    id: int
    name: str
    court_number: int
    price_per_hour: Decimal


class BookingStatusUpdate(BaseModel):
    status: BookingStatus


# --------------------------------------------------------------------------- #
# Payments
# --------------------------------------------------------------------------- #
class PaymentOut(ORMModel):
    id: int
    booking_id: int
    amount: Decimal
    method: PaymentMethod
    status: PaymentStatus
    transaction_ref: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: datetime


class PaymentCreate(BaseModel):
    method: PaymentMethod


class PaymentPayRequest(BaseModel):
    transaction_ref: Optional[str] = Field(default=None, max_length=64)


# --------------------------------------------------------------------------- #
# Matchmaking
# --------------------------------------------------------------------------- #
class MatchCreate(BaseModel):
    match_date: date
    start_time: time
    duration_minutes: int = Field(default=90, ge=30, le=180)
    players_needed: int = Field(default=2, ge=1, le=3)
    min_level: float = Field(default=1.0, ge=1.0, le=7.0)
    max_level: float = Field(default=7.0, ge=1.0, le=7.0)
    court_id: Optional[int] = None
    notes: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _check_levels(self) -> "MatchCreate":
        if self.min_level > self.max_level:
            raise ValueError("min_level must be <= max_level")
        return self


class ApplicationCreate(BaseModel):
    message: Optional[str] = Field(default=None, max_length=255)


class ApplicationOut(ORMModel):
    id: int
    match_id: int
    message: Optional[str] = None
    status: ApplicationStatus
    created_at: datetime
    user: UserBrief


class MatchOut(ORMModel):
    id: int
    match_date: date
    start_time: time
    duration_minutes: int
    players_needed: int
    min_level: float
    max_level: float
    notes: Optional[str] = None
    status: MatchStatus
    created_at: datetime
    user: UserBrief
    court_id: Optional[int] = None
    accepted_count: int = 0
    applications: list[ApplicationOut] = []


class MatchListOut(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[MatchOut]


# --------------------------------------------------------------------------- #
# Stats
# --------------------------------------------------------------------------- #
class CourtOccupancy(BaseModel):
    court_id: int
    court_name: str
    available_minutes: int
    booked_minutes: int
    occupancy_rate: float


class DashboardStats(BaseModel):
    period: str
    total_users: int
    total_courts: int
    bookings_today: int
    upcoming_bookings: int
    active_bookings: int
    cancelled_bookings: int
    bookings_by_status: dict[str, int]
    revenue_paid: Decimal
    revenue_pending: Decimal
    occupancy: list[CourtOccupancy]
    average_rating: Optional[float] = None
    top_players: list[UserBrief] = []
