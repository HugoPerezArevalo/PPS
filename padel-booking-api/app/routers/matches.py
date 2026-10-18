"""Matchmaking routes: post a match and find partners/opponents."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    ApplicationStatus,
    Court,
    MatchApplication,
    MatchRequest,
    MatchStatus,
    User,
    UserRole,
)
from app.schemas import (
    ApplicationCreate,
    ApplicationOut,
    MatchCreate,
    MatchListOut,
    MatchOut,
    UserBrief,
)

router = APIRouter(prefix="/matches", tags=["Matchmaking"])


def _to_out(match: MatchRequest, include_applications: bool = False) -> MatchOut:
    accepted = sum(
        1
        for application in match.applications
        if application.status == ApplicationStatus.ACCEPTED
    )
    return MatchOut(
        id=match.id,
        match_date=match.match_date,
        start_time=match.start_time,
        duration_minutes=match.duration_minutes,
        players_needed=match.players_needed,
        min_level=match.min_level,
        max_level=match.max_level,
        notes=match.notes,
        status=match.status,
        created_at=match.created_at,
        user=UserBrief.model_validate(match.user),
        court_id=match.court_id,
        accepted_count=accepted,
        applications=[ApplicationOut.model_validate(a) for a in match.applications]
        if include_applications
        else [],
    )


@router.post(
    "",
    response_model=MatchOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a match request looking for players",
)
def create_match(
    payload: MatchCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MatchOut:
    if payload.match_date < date.today():
        raise HTTPException(status_code=400, detail="Cannot create a match in the past")
    if payload.court_id is not None and db.get(Court, payload.court_id) is None:
        raise HTTPException(status_code=404, detail="Court not found")

    match = MatchRequest(user_id=current_user.id, **payload.model_dump())
    db.add(match)
    db.commit()
    db.refresh(match)
    return _to_out(match, include_applications=True)


@router.get("", response_model=MatchListOut, summary="Browse open match requests")
def list_matches(
    match_date: date | None = Query(default=None),
    date_from: date | None = Query(default=None),
    min_level: float | None = Query(default=None, ge=1.0, le=7.0),
    max_level: float | None = Query(default=None, ge=1.0, le=7.0),
    court_id: int | None = Query(default=None),
    status_filter: MatchStatus = Query(default=MatchStatus.OPEN, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> MatchListOut:
    filters = [MatchRequest.status == status_filter]
    if match_date is not None:
        filters.append(MatchRequest.match_date == match_date)
    if date_from is not None:
        filters.append(MatchRequest.match_date >= date_from)
    if min_level is not None:
        filters.append(MatchRequest.max_level >= min_level)
    if max_level is not None:
        filters.append(MatchRequest.min_level <= max_level)
    if court_id is not None:
        filters.append(MatchRequest.court_id == court_id)

    total = db.scalar(select(func.count(MatchRequest.id)).where(*filters)) or 0
    matches = db.scalars(
        select(MatchRequest)
        .where(*filters)
        .order_by(MatchRequest.match_date, MatchRequest.start_time)
        .limit(limit)
        .offset(offset)
    ).all()
    return MatchListOut(
        total=total,
        limit=limit,
        offset=offset,
        items=[_to_out(m) for m in matches],
    )


@router.get("/me", response_model=list[MatchOut], summary="My match requests")
def my_matches(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MatchOut]:
    matches = db.scalars(
        select(MatchRequest)
        .where(MatchRequest.user_id == current_user.id)
        .order_by(MatchRequest.match_date.desc())
    ).all()
    return [_to_out(m, include_applications=True) for m in matches]


@router.get("/{match_id}", response_model=MatchOut, summary="Get a match request")
def get_match(
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MatchOut:
    match = db.get(MatchRequest, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match request not found")
    is_owner = match.user_id == current_user.id
    return _to_out(
        match, include_applications=is_owner or current_user.role != UserRole.PLAYER
    )


@router.post(
    "/{match_id}/apply",
    response_model=ApplicationOut,
    status_code=status.HTTP_201_CREATED,
    summary="Apply to join a match",
)
def apply_to_match(
    match_id: int,
    payload: ApplicationCreate | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MatchApplication:
    match = db.get(MatchRequest, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match request not found")
    if match.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot apply to your own match")
    if match.status != MatchStatus.OPEN:
        raise HTTPException(status_code=409, detail="This match is not open")
    if not (match.min_level <= current_user.level <= match.max_level):
        raise HTTPException(
            status_code=403,
            detail=f"Your level ({current_user.level}) is outside the "
            f"requested range ({match.min_level}-{match.max_level})",
        )

    existing = db.scalar(
        select(MatchApplication).where(
            MatchApplication.match_id == match_id,
            MatchApplication.user_id == current_user.id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="You already applied")

    application = MatchApplication(
        match_id=match_id,
        user_id=current_user.id,
        message=payload.message if payload else None,
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


@router.get(
    "/{match_id}/applications",
    response_model=list[ApplicationOut],
    summary="List applications (owner)",
)
def list_applications(
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MatchApplication]:
    match = db.get(MatchRequest, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match request not found")
    if match.user_id != current_user.id and current_user.role == UserRole.PLAYER:
        raise HTTPException(status_code=403, detail="Only the owner can see applications")
    return list(match.applications)


def _decide(
    db: Session,
    match_id: int,
    application_id: int,
    current_user: User,
    decision: ApplicationStatus,
) -> MatchApplication:
    match = db.get(MatchRequest, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match request not found")
    if match.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can decide")
    application = db.get(MatchApplication, application_id)
    if application is None or application.match_id != match_id:
        raise HTTPException(status_code=404, detail="Application not found")

    application.status = decision
    db.flush()

    if decision == ApplicationStatus.ACCEPTED:
        accepted = (
            db.scalar(
                select(func.count(MatchApplication.id)).where(
                    MatchApplication.match_id == match_id,
                    MatchApplication.status == ApplicationStatus.ACCEPTED,
                )
            )
            or 0
        )
        if accepted >= match.players_needed:
            match.status = MatchStatus.FULL

    db.commit()
    db.refresh(application)
    return application


@router.post(
    "/{match_id}/applications/{application_id}/accept",
    response_model=ApplicationOut,
    summary="Accept an application (owner)",
)
def accept_application(
    match_id: int,
    application_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MatchApplication:
    return _decide(db, match_id, application_id, current_user, ApplicationStatus.ACCEPTED)


@router.post(
    "/{match_id}/applications/{application_id}/reject",
    response_model=ApplicationOut,
    summary="Reject an application (owner)",
)
def reject_application(
    match_id: int,
    application_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MatchApplication:
    return _decide(db, match_id, application_id, current_user, ApplicationStatus.REJECTED)


@router.post("/{match_id}/cancel", response_model=MatchOut, summary="Cancel a match")
def cancel_match(
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MatchOut:
    match = db.get(MatchRequest, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match request not found")
    if match.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not allowed")
    match.status = MatchStatus.CANCELLED
    db.commit()
    db.refresh(match)
    return _to_out(match, include_applications=True)


@router.post(
    "/{match_id}/close", response_model=MatchOut, summary="Close a match as completed"
)
def close_match(
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MatchOut:
    match = db.get(MatchRequest, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match request not found")
    if match.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not allowed")
    match.status = MatchStatus.COMPLETED
    db.commit()
    db.refresh(match)
    return _to_out(match, include_applications=True)
