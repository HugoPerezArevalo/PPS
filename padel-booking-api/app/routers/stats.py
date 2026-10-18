"""Reporting routes for staff."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_staff
from app.models import User
from app.schemas import DashboardStats
from app.services.stats import compute_dashboard

router = APIRouter(prefix="/stats", tags=["Statistics"])


@router.get(
    "/dashboard",
    response_model=DashboardStats,
    summary="Key metrics and monthly occupancy (staff)",
)
def dashboard(
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> DashboardStats:
    return compute_dashboard(db, year=year, month=month)
