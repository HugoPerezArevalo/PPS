"""Court helpers shared by several routers."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Court, Review
from app.schemas import CourtOut


def rating_map(db: Session, court_ids: list[int]) -> dict[int, tuple[float, int]]:
    """Return ``{court_id: (average_rating, review_count)}``."""
    if not court_ids:
        return {}
    rows = db.execute(
        select(Review.court_id, func.avg(Review.rating), func.count(Review.id))
        .where(Review.court_id.in_(court_ids))
        .group_by(Review.court_id)
    ).all()
    return {row[0]: (round(float(row[1]), 2), int(row[2])) for row in rows}


def court_out(court: Court, rating: tuple[float, int] | None = None) -> CourtOut:
    avg, count = rating or (None, 0)
    return CourtOut(
        id=court.id,
        name=court.name,
        court_number=court.court_number,
        surface=court.surface,
        environment=court.environment,
        has_lighting=court.has_lighting,
        is_covered=court.is_covered,
        price_per_hour=court.price_per_hour,
        status=court.status,
        description=court.description,
        created_at=court.created_at,
        average_rating=avg,
        review_count=count,
    )
