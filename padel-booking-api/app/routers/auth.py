"""Authentication routes: register, login, refresh, logout and current user."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import bearer_scheme_optional, get_current_user, get_user_by_email
from app.models import User, UserRole
from app.schemas import (
    LoginRequest,
    LogoutRequest,
    Message,
    RefreshRequest,
    TokenResponse,
    UserCreate,
    UserOut,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.services import tokens as token_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _token_response(user: User) -> TokenResponse:
    access_token, expires_in = create_access_token(user.id, user.role.value)
    refresh_token, _ = create_refresh_token(user.id)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=expires_in,
        user=UserOut.model_validate(user),
    )


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new player",
)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    if get_user_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists",
        )

    # The very first account of the system becomes the administrator.
    is_first_user = db.scalar(select(User.id).limit(1)) is None
    user = User(
        email=payload.email.lower().strip(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        level=payload.level,
        role=UserRole.ADMIN if is_first_user else UserRole.PLAYER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse, summary="Obtain JWT tokens")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = get_user_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled"
        )
    return _token_response(user)


@router.post("/refresh", response_model=TokenResponse, summary="Rotate tokens")
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Exchange a refresh token for a brand-new token pair.

    The presented refresh token is revoked immediately (single-use rotation);
    reusing it afterwards returns 401.
    """
    data = decode_token(payload.refresh_token, expected_type="refresh")
    if token_service.is_token_revoked(db, data.get("jti")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )
    user = db.get(User, int(data["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    # Rotate: the old refresh token can no longer be used.
    token_service.revoke_token(db, data, reason="rotated")
    return _token_response(user)


@router.get("/me", response_model=UserOut, summary="Get the authenticated user")
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/logout", response_model=Message, summary="Revoke the current tokens")
def logout(
    payload: LogoutRequest | None = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme_optional),
    db: Session = Depends(get_db),
) -> Message:
    """Blacklist the caller's access token and (optionally) refresh token.

    Expired tokens are tolerated: they are already unusable, so a decode
    failure simply skips that token.
    """
    revoked = 0

    if credentials is not None:
        try:
            data = decode_token(
                credentials.credentials,
                expected_type="access",
                verify_expiration=False,
            )
            revoked += token_service.revoke_token(db, data, reason="logout")
        except HTTPException:
            pass

    if payload and payload.refresh_token:
        try:
            data = decode_token(
                payload.refresh_token,
                expected_type="refresh",
                verify_expiration=False,
            )
            revoked += token_service.revoke_token(db, data, reason="logout")
        except HTTPException:
            pass

    return Message(detail=f"Logged out. {revoked} token(s) revoked.")
