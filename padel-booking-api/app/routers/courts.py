"""Court routes: catalogue, admin CRUD, weekly schedules and closures."""

from __future__ import annotations

from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import require_admin
from app.models import (
    Booking,
    Court,
    CourtClosure,
    CourtEnvironment,
    CourtSchedule,
    CourtSurface,
    User,
)
from app.schemas import (
    CourtClosureCreate,
    CourtClosureOut,
    CourtCreate,
    CourtDetailOut,
    CourtOut,
    CourtScheduleIn,
    CourtScheduleOut,
    CourtUpdate,
    Message,
)
from app.services.courts import court_out, rating_map

router = APIRouter(prefix="/courts", tags=["Courts"])


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _parse_hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


def _default_schedule(court_id: int) -> list[CourtSchedule]:
    open_time = _parse_hhmm(settings.default_open_time)
    close_time = _parse_hhmm(settings.default_close_time)
    return [
        CourtSchedule(
            court_id=court_id,
            day_of_week=day,
            is_open=True,
            open_time=open_time,
            close_time=close_time,
        )
        for day in range(7)
    ]


def _get_court_or_404(db: Session, court_id: int) -> Court:
    court = db.get(Court, court_id)
    if court is None:
        raise HTTPException(status_code=404, detail="Court not found")
    return court


# --------------------------------------------------------------------------- #
# Public catalogue
# --------------------------------------------------------------------------- #
@router.get("", response_model=list[CourtOut], summary="List courts")
def list_courts(
    environment: str | None = Query(default=None, pattern="^(indoor|outdoor)$"),
    surface: str | None = Query(default=None),
    has_lighting: bool | None = Query(default=None),
    max_price: float | None = Query(default=None, gt=0),
    include_unavailable: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[CourtOut]:
    stmt = select(Court).order_by(Court.court_number)
    if environment:
        stmt = stmt.where(Court.environment == CourtEnvironment(environment))
    if surface:
        try:
            stmt = stmt.where(Court.surface == CourtSurface(surface))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid surface") from exc
    if has_lighting is not None:
        stmt = stmt.where(Court.has_lighting == has_lighting)
    if max_price is not None:
        stmt = stmt.where(Court.price_per_hour <= max_price)
    if not include_unavailable:
        stmt = stmt.where(Court.status == "available")

    courts = list(db.scalars(stmt).all())
    ratings = rating_map(db, [c.id for c in courts])
    return [court_out(c, ratings.get(c.id)) for c in courts]


@router.get("/{court_id}", response_model=CourtDetailOut, summary="Get court details")
def get_court(court_id: int, db: Session = Depends(get_db)) -> CourtDetailOut:
    court = _get_court_or_404(db, court_id)
    ratings = rating_map(db, [court.id])
    base = court_out(court, ratings.get(court.id))
    return CourtDetailOut(
        **base.model_dump(),
        schedule=[CourtScheduleOut.model_validate(s) for s in court.schedule],
        closures=[CourtClosureOut.model_validate(c) for c in court.closures],
    )


# --------------------------------------------------------------------------- #
# Admin CRUD
# --------------------------------------------------------------------------- #
@router.post(
    "",
    response_model=CourtDetailOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a court (admin)",
)
def create_court(
    payload: CourtCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CourtDetailOut:
    if db.scalar(select(Court).where(Court.name == payload.name)):
        raise HTTPException(status_code=409, detail="Court name already exists")
    if db.scalar(select(Court).where(Court.court_number == payload.court_number)):
        raise HTTPException(status_code=409, detail="Court number already exists")

    court = Court(**payload.model_dump(exclude={"schedule"}))
    db.add(court)
    db.flush()

    if payload.schedule:
        days = {row.day_of_week for row in payload.schedule}
        if len(days) != len(payload.schedule):
            raise HTTPException(status_code=400, detail="Duplicated day_of_week")
        for row in payload.schedule:
            db.add(CourtSchedule(court_id=court.id, **row.model_dump()))
    else:
        for row in _default_schedule(court.id):
            db.add(row)

    db.commit()
    db.refresh(court)
    return CourtDetailOut(
        **court_out(court).model_dump(),
        schedule=[CourtScheduleOut.model_validate(s) for s in court.schedule],
        closures=[],
    )


@router.patch("/{court_id}", response_model=CourtOut, summary="Update a court (admin)")
def update_court(
    court_id: int,
    payload: CourtUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CourtOut:
    court = _get_court_or_404(db, court_id)
    changes = payload.model_dump(exclude_unset=True)

    if "name" in changes and changes["name"] != court.name:
        if db.scalar(select(Court).where(Court.name == changes["name"])):
            raise HTTPException(status_code=409, detail="Court name already exists")
    if "court_number" in changes and changes["court_number"] != court.court_number:
        if db.scalar(select(Court).where(Court.court_number == changes["court_number"])):
            raise HTTPException(status_code=409, detail="Court number already exists")

    for field, value in changes.items():
        setattr(court, field, value)
    db.commit()
    db.refresh(court)
    return court_out(court, rating_map(db, [court.id]).get(court.id))


@router.delete("/{court_id}", response_model=Message, summary="Delete a court (admin)")
def delete_court(
    court_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Message:
    court = _get_court_or_404(db, court_id)
    has_bookings = db.scalar(
        select(Booking.id).where(Booking.court_id == court.id).limit(1)
    )
    if has_bookings:
        raise HTTPException(
            status_code=409,
            detail="Court has bookings; set its status to 'maintenance' or "
            "'closed' instead of deleting it",
        )
    db.delete(court)
    db.commit()
    return Message(detail="Court deleted")


# --------------------------------------------------------------------------- #
# Weekly schedule
# --------------------------------------------------------------------------- #
@router.get(
    "/{court_id}/schedule",
    response_model=list[CourtScheduleOut],
    summary="Get weekly opening hours",
)
def get_schedule(court_id: int, db: Session = Depends(get_db)) -> list[CourtSchedule]:
    court = _get_court_or_404(db, court_id)
    return court.schedule


@router.put(
    "/{court_id}/schedule",
    response_model=list[CourtScheduleOut],
    summary="Replace weekly opening hours (admin)",
)
def replace_schedule(
    court_id: int,
    payload: list[CourtScheduleIn],
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[CourtSchedule]:
    court = _get_court_or_404(db, court_id)
    if len(payload) > 7:
        raise HTTPException(status_code=400, detail="A week only has 7 days")
    days = [row.day_of_week for row in payload]
    if len(set(days)) != len(days):
        raise HTTPException(status_code=400, detail="Duplicated day_of_week")

    for existing in list(court.schedule):
        db.delete(existing)
    db.flush()

    for row in payload:
        db.add(CourtSchedule(court_id=court.id, **row.model_dump()))
    db.commit()
    db.refresh(court)
    return court.schedule


# --------------------------------------------------------------------------- #
# Closures
# --------------------------------------------------------------------------- #
@router.get(
    "/{court_id}/closures",
    response_model=list[CourtClosureOut],
    summary="List closures",
)
def list_closures(
    court_id: int,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[CourtClosure]:
    _get_court_or_404(db, court_id)
    stmt = select(CourtClosure).where(CourtClosure.court_id == court_id)
    if date_from:
        stmt = stmt.where(CourtClosure.date >= date_from)
    if date_to:
        stmt = stmt.where(CourtClosure.date <= date_to)
    return list(db.scalars(stmt.order_by(CourtClosure.date)).all())


@router.post(
    "/{court_id}/closures",
    response_model=CourtClosureOut,
    status_code=status.HTTP_201_CREATED,
    summary="Close a court for a period (admin)",
)
def create_closure(
    court_id: int,
    payload: CourtClosureCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CourtClosure:
    _get_court_or_404(db, court_id)
    closure = CourtClosure(court_id=court_id, **payload.model_dump())
    db.add(closure)
    db.commit()
    db.refresh(closure)
    return closure


@router.delete(
    "/{court_id}/closures/{closure_id}",
    response_model=Message,
    summary="Delete a closure (admin)",
)
def delete_closure(
    court_id: int,
    closure_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Message:
    closure = db.get(CourtClosure, closure_id)
    if closure is None or closure.court_id != court_id:
        raise HTTPException(status_code=404, detail="Closure not found")
    db.delete(closure)
    db.commit()
    return Message(detail="Closure deleted")
