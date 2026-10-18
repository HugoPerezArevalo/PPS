"""Application settings.

All settings can be overridden with environment variables (or a .env file).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App ---
    app_name: str = "Padel Court Booking API"
    app_version: str = "1.0.0"
    api_v1_prefix: str = "/api/v1"
    environment: str = "development"

    # --- Security ---
    secret_key: str = "dev-secret-change-me-please-0123456789abcdef"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12  # 12 hours
    refresh_token_expire_days: int = 7
    bcrypt_rounds: int = 12

    # --- Database ---
    database_url: str = "sqlite:///./padel.db"

    # --- CORS ---
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ]

    # --- Booking rules ---
    default_open_time: str = "08:00"
    default_close_time: str = "23:00"
    slot_minutes: int = 30  # time-grid granularity
    min_booking_minutes: int = 30
    max_booking_hours: int = 3
    cancel_cutoff_hours: int = 6  # free cancellation until N hours before start
    max_players_per_booking: int = 4

    # --- Payments ---
    currency: str = "EUR"

    # --- Seed data ---
    seed_on_startup: bool = True
    admin_email: str = "admin@padel.com"
    admin_password: str = "Admin123!"
    player_email: str = "player@padel.com"
    player_password: str = "Player123!"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
