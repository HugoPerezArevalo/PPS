"""Security helpers: password hashing (bcrypt) and JWT tokens (PyJWT)."""

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

import bcrypt
import jwt
from fastapi import HTTPException, status

from app.config import settings


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    """Return a bcrypt hash for ``password`` (max 72 bytes, bcrypt limit)."""
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password too long (bcrypt supports max 72 bytes).")
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt(rounds=settings.bcrypt_rounds)
    ).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except ValueError:
        return False


# --------------------------------------------------------------------------- #
# JWT
# --------------------------------------------------------------------------- #
def _create_token(
    subject: str,
    expires_delta: timedelta,
    token_type: str,
    extra_claims: Optional[dict[str, Any]] = None,
) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    expire = now + expires_delta
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "jti": str(uuid4()),  # unique id, used for revocation / rotation
        "iat": now,
        "exp": expire,
    }
    if extra_claims:
        payload.update(extra_claims)
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return token, int(expire.timestamp())


def create_access_token(user_id: int, role: str) -> tuple[str, int]:
    """Short-lived access token. Returns ``(token, expires_in_seconds)``."""
    return _create_token(
        subject=str(user_id),
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        token_type="access",
        extra_claims={"role": role},
    )


def create_refresh_token(user_id: int) -> tuple[str, int]:
    """Long-lived refresh token. Returns ``(token, expires_in_seconds)``."""
    return _create_token(
        subject=str(user_id),
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
        token_type="refresh",
    )


def decode_token(
    token: str,
    expected_type: str = "access",
    *,
    verify_expiration: bool = True,
) -> dict[str, Any]:
    """Decode and validate a JWT. Raises ``HTTPException(401)`` on failure.

    ``verify_expiration=False`` is used at logout time so that an already
    expired token can still be registered as revoked (best effort).
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            options={"verify_exp": verify_expiration},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.PyJWTError as exc:
        raise credentials_error from exc

    if payload.get("type") != expected_type:
        raise credentials_error
    if payload.get("sub") is None:
        raise credentials_error
    if payload.get("jti") is None:
        # Tokens issued before revocation support are rejected outright.
        raise credentials_error
    return payload
