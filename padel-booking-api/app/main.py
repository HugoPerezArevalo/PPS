"""FastAPI application entry point."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.config import settings
from app.database import SessionLocal, init_db
from app.routers import (
    auth,
    availability,
    bookings,
    courts,
    matches,
    payments,
    reviews,
    stats,
    users,
)
from app.seed import seed_db
from app.services.tokens import purge_expired_tokens

TAGS_METADATA = [
    {"name": "Authentication", "description": "Registration, login and JWT tokens."},
    {"name": "Users", "description": "Player profiles and user administration."},
    {"name": "Courts", "description": "Padel courts, opening hours and closures."},
    {"name": "Availability", "description": "Slot grids and free-court search."},
    {"name": "Bookings", "description": "Create, reschedule and cancel reservations."},
    {"name": "Payments", "description": "Payment tracking for bookings."},
    {"name": "Reviews", "description": "Rate and comment on courts."},
    {"name": "Matchmaking", "description": "Find partners and opponents."},
    {"name": "Statistics", "description": "Club metrics and occupancy reports."},
]

DESCRIPTION = """
API para la gestión de reservas de pistas de pádel.

* **Autenticación JWT** con roles `admin`, `coach` y `player`.
* **Catálogo de pistas** con horarios semanales y cierres puntuales.
* **Reservas** con detección de solapamientos, precio automático y política de cancelación.
* **Disponibilidad** por franjas y búsqueda de pistas libres.
* **Pagos**, **valoraciones** y **búsqueda de pareja** (matchmaking).

Arranca el servidor con `uvicorn app.main:app --reload` y abre `/docs`.
""".strip()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        if settings.seed_on_startup:
            seed_db(db)
        # Drop blacklist entries whose token would already have expired.
        purge_expired_tokens(db)
    finally:
        db.close()
    yield
    # Nothing to release on shutdown (SQLite connections are pooled).


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description=DESCRIPTION,
    openapi_tags=TAGS_METADATA,
    contact={"name": "Padel Club", "email": "info@padelclub.example"},
    license_info={"name": "MIT"},
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- API v1 routers ---------------------------------------------------------- #
prefix = settings.api_v1_prefix
app.include_router(auth.router, prefix=prefix)
app.include_router(users.router, prefix=prefix)
app.include_router(courts.router, prefix=prefix)
app.include_router(availability.router, prefix=prefix)
app.include_router(bookings.router, prefix=prefix)
app.include_router(payments.router, prefix=prefix)
app.include_router(reviews.router, prefix=prefix)
app.include_router(matches.router, prefix=prefix)
app.include_router(stats.router, prefix=prefix)


# --- Frontend (optional static SPA) ------------------------------------------ #
# The Playtomic-style UI lives in ./frontend and is served at /app when present.
FRONTEND_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend"
)
if os.path.isdir(FRONTEND_DIR):
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


# --- Health & root ----------------------------------------------------------- #
@app.get("/", tags=["Health"], summary="API information")
def root() -> dict:
    return {
        "name": settings.app_name,
        "version": __version__,
        "environment": settings.environment,
        "docs": "/docs",
        "api_v1": prefix,
        "frontend": "/app" if os.path.isdir(FRONTEND_DIR) else None,
    }


@app.get("/health", tags=["Health"], summary="Health check")
def health() -> dict:
    return {"status": "ok", "version": __version__}
