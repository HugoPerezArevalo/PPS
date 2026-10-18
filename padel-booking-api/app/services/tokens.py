"""Token revocation (blacklist) and refresh-token rotation helpers.

The API is stateless: a JWT is valid until it expires. To support a real
logout and single-use refresh tokens we keep a small blacklist of revoked
token ids (``jti``) in the database.

* **Logout** stores the ``jti`` of the access and refresh tokens.
* **Rotation** revokes the refresh token as soon as it is exchanged for a new
  pair, so every refresh token can be used exactly once. Reusing an old one is
  rejected (a common signal of token theft).

Rows are only meaningful until the original token would have expired, so
:func:`purge_expired_tokens` cleans them up.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import RevokedToken


def _expiry_from_payload(payload: dict[str, Any]) -> datetime:
    """Naive-UTC datetime for the token's ``exp`` (falls back to now)."""
    exp = payload.get("exp")
    if exp is None:
        return datetime.now(timezone.utc).replace(tzinfo=None)
    return datetime.fromtimestamp(int(exp), tz=timezone.utc).replace(tzinfo=None)


def is_token_revoked(db: Session, jti: str | None) -> bool:
    """Return ``True`` when the token id is in the blacklist."""
    if not jti:
        return False
    return db.scalar(select(RevokedToken.id).where(RevokedToken.jti == jti)) is not None


def revoke_token(
    db: Session,
    payload: dict[str, Any],
    *,
    reason: str | None = None,
) -> bool:
    """Add a decoded token payload to the blacklist.

    Returns ``True`` if the token was newly revoked, ``False`` when it had no
    ``jti`` or was already revoked.
    """
    jti = payload.get("jti")
    if not jti:
        return False
    if is_token_revoked(db, jti):
        return False

    db.add(
        RevokedToken(
            jti=jti,
            token_type=str(payload.get("type", "access")),
            expires_at=_expiry_from_payload(payload),
            reason=reason,
        )
    )
    db.commit()
    return True


def purge_expired_tokens(db: Session) -> int:
    """Delete blacklist rows whose token would already have expired."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    result = db.execute(delete(RevokedToken).where(RevokedToken.expires_at < now))
    db.commit()
    return result.rowcount or 0
