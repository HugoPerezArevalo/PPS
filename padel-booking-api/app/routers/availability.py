"""Availability routes: day grid for a court and free-court finder."""

from __future__ import annotations

from datetime import date, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_optional_current_user
from app.models import Court, CourtEnvironment, User
from app.schemas import AvailabilityResponse, AvailableCourtOut, CourtOut
from app.services.availability import build_slots, find_available_courts

router = APIRouter(prefix="/availability", tags=["Availability"])


@router.get(
    "/slots",
    response_model=AvailabilityResponse,
    summary="Time-slot grid for one court on one day",
)
def court_slots(
    court_id: int = Query(..., ge=1),
    day: date = Query(..., alias="date"),
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> AvailabilityResponse:
    court = db.get(Court, court_id)
    if court is None:
        raise HTTPException(status_code=404, detail="Court not found")
    return build_slots(db, court, day, user_id=current_user.id if current_user else None)


@router.get(
    "/courts",
    response_model=list[AvailableCourtOut],
    summary="Find courts free for a given date and time window",
)
def available_courts(
    day: date = Query(..., alias="date"),
    start_time: time = Query(...),
    end_time: time = Query(...),
    environment: str | None = Query(default=None, pattern="^(indoor|outdoor)$"),
    db: Session = Depends(get_db),
) -> list[AvailableCourtOut]:
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time must be before end_time")

    duration = (
        end_time.hour * 60 + end_time.minute
    ) - (start_time.hour * 60 + start_time.minute)
    if duration > settings.max_booking_hours * 60:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum booking length is {settings.max_booking_hours} hours",
        )

    stmt = select(Court).order_by(Court.court_number)
    if environment:
        stmt = stmt.where(Court.environment == CourtEnvironment(environment))
    courts = list(db.scalars(stmt).all())

    matches = find_available_courts(db, day, start_time, end_time, courts)
    results: list[AvailableCourtOut] = []
    for match in matches:
        court: Court = match["court"]
        results.append(
            AvailableCourtOut(
                court=CourtOut.model_validate(court),
                open_time=match["open_time"],
                close_time=match["close_time"],
                total_price=match["total_price"],
            )
        )
    return results


@router.get(
    "/week",
    response_model=dict,
    summary="Occupancy summary for the next N days",
)
def week_overview(
    court_id: int = Query(..., ge=1),
    start: date | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=31),
    db: Session = Depends(get_db),
) -> dict:
    court = db.get(Court, court_id)
    if court is None:
        raise HTTPException(status_code=404, detail="Court not found")

    start = start or date.today()
    overview = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        grid = build_slots(db, court, day)
        overview.append(
            {
                "date": day,
                "is_open": grid.is_open,
                "available_slots": grid.available_slots,
                "total_slots": len(grid.slots),
            }
        )
    return {"court_id": court_id, "start": start, "days": days, "overview": overview}
