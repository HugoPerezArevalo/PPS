"""Populate the database with demo data (idempotent)."""

from __future__ import annotations

from datetime import time
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Court,
    CourtEnvironment,
    CourtSchedule,
    CourtStatus,
    CourtSurface,
    User,
    UserRole,
)
from app.security import hash_password

COURTS = [
    {
        "name": "Pista Central",
        "court_number": 1,
        "surface": CourtSurface.PANORAMIC,
        "environment": CourtEnvironment.INDOOR,
        "has_lighting": True,
        "is_covered": True,
        "price_per_hour": Decimal("32.00"),
        "description": "Pista central con gradas, muros panorámicos y vestuarios.",
    },
    {
        "name": "Pista Panorámica 2",
        "court_number": 2,
        "surface": CourtSurface.PANORAMIC,
        "environment": CourtEnvironment.OUTDOOR,
        "has_lighting": True,
        "is_covered": False,
        "price_per_hour": Decimal("26.00"),
        "description": "Pista panorámica exterior con iluminación LED.",
    },
    {
        "name": "Pista Cristal 3",
        "court_number": 3,
        "surface": CourtSurface.PREFABRICATED,
        "environment": CourtEnvironment.INDOOR,
        "has_lighting": True,
        "is_covered": True,
        "price_per_hour": Decimal("28.00"),
        "description": "Pista cubierta, ideal para jugar todo el año.",
    },
    {
        "name": "Pista Muro 4",
        "court_number": 4,
        "surface": CourtSurface.CONCRETE,
        "environment": CourtEnvironment.OUTDOOR,
        "has_lighting": False,
        "is_covered": False,
        "price_per_hour": Decimal("20.00"),
        "description": "Pista clásica de muros, sin iluminación.",
    },
    {
        "name": "Pista Panorámica 5",
        "court_number": 5,
        "surface": CourtSurface.PANORAMIC,
        "environment": CourtEnvironment.OUTDOOR,
        "has_lighting": True,
        "is_covered": False,
        "price_per_hour": Decimal("24.00"),
        "description": "Pista panorámica junto a la piscina.",
    },
    {
        "name": "Pista Indoor 6",
        "court_number": 6,
        "surface": CourtSurface.PREFABRICATED,
        "environment": CourtEnvironment.INDOOR,
        "has_lighting": True,
        "is_covered": True,
        "price_per_hour": Decimal("30.00"),
        "description": "Pista indoor premium con césped de última generación.",
    },
]


def _create_user(
    db: Session, email: str, password: str, full_name: str, role: UserRole, level: float
) -> User:
    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        full_name=full_name,
        role=role,
        level=level,
    )
    db.add(user)
    return user


def _default_schedule(court: Court) -> list[CourtSchedule]:
    rows = []
    for day in range(7):
        # Courts open every day; Sunday afternoon cut shorter.
        close = time(20, 0) if day == 6 else time(23, 0)
        rows.append(
            CourtSchedule(
                court_id=court.id,
                day_of_week=day,
                is_open=True,
                open_time=time(8, 0),
                close_time=close,
            )
        )
    return rows


def seed_db(db: Session) -> None:
    """Insert demo users and courts only when they do not exist yet."""
    created_any = False

    if db.scalar(select(User).where(User.email == settings.admin_email.lower())) is None:
        _create_user(
            db,
            settings.admin_email,
            settings.admin_password,
            "Club Administrator",
            UserRole.ADMIN,
            5.0,
        )
        created_any = True

    if db.scalar(select(User).where(User.email == settings.player_email.lower())) is None:
        _create_user(
            db,
            settings.player_email,
            settings.player_password,
            "Demo Player",
            UserRole.PLAYER,
            3.0,
        )
        created_any = True

    if db.scalar(select(Court.id).limit(1)) is None:
        for data in COURTS:
            court = Court(status=CourtStatus.AVAILABLE, **data)
            db.add(court)
            db.flush()
            for row in _default_schedule(court):
                db.add(row)
        created_any = True

    if created_any:
        db.commit()
