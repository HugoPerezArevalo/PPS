"""Review routes (court ratings and comments)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Booking, BookingStatus, Court, Review, User, UserRole
from app.schemas import Message, ReviewIn, ReviewOut

router = APIRouter(tags=["Reviews"])


def _court_or_404(db: Session, court_id: int) -> Court:
    court = db.get(Court, court_id)
    if court is None:
        raise HTTPException(status_code=404, detail="Court not found")
    return court


@router.get(
    "/courts/{court_id}/reviews",
    response_model=list[ReviewOut],
    summary="List reviews of a court",
)
def list_reviews(
    court_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[Review]:
    _court_or_404(db, court_id)
    stmt = (
        select(Review)
        .where(Review.court_id == court_id)
        .order_by(Review.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt).all())


@router.post(
    "/courts/{court_id}/reviews",
    response_model=ReviewOut,
    status_code=status.HTTP_201_CREATED,
    summary="Review a court (only after playing there)",
)
def create_review(
    court_id: int,
    payload: ReviewIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Review:
    _court_or_404(db, court_id)

    already = db.scalar(
        select(Review).where(
            Review.court_id == court_id, Review.user_id == current_user.id
        )
    )
    if already:
        raise HTTPException(status_code=409, detail="You already reviewed this court")

    played = db.scalar(
        select(Booking.id).where(
            Booking.court_id == court_id,
            Booking.user_id == current_user.id,
            Booking.status != BookingStatus.CANCELLED,
        )
    )
    if played is None:
        raise HTTPException(
            status_code=403, detail="You can only review courts you have booked"
        )

    review = Review(
        court_id=court_id,
        user_id=current_user.id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


@router.patch(
    "/reviews/{review_id}", response_model=ReviewOut, summary="Update my review"
)
def update_review(
    review_id: int,
    payload: ReviewIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Review:
    review = db.get(Review, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your review")
    review.rating = payload.rating
    review.comment = payload.comment
    db.commit()
    db.refresh(review)
    return review


@router.delete(
    "/reviews/{review_id}", response_model=Message, summary="Delete a review"
)
def delete_review(
    review_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Message:
    review = db.get(Review, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not allowed")
    db.delete(review)
    db.commit()
    return Message(detail="Review deleted")
