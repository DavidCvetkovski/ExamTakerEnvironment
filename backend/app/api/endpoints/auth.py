"""
Authentication endpoints: register, login, refresh, logout, me.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.config import settings
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserPublic

from jose import JWTError

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _build_token_payload(user: User) -> dict:
    return {"sub": str(user.id), "email": user.email, "role": user.role.value}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    """
    Create a new user account. Returns access + refresh tokens.
    """
    # Check for duplicate email
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    # Check for duplicate vunet_id
    if payload.vunet_id:
        existing_vunet = db.query(User).filter(User.vunet_id == payload.vunet_id).first()
        if existing_vunet:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this VUnetID already exists.",
            )

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        vunet_id=payload.vunet_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token_data = _build_token_payload(user)
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Set refresh token as httpOnly cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,  # Set True in production with HTTPS
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserPublic.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Authenticate with email + password. Returns access + refresh tokens.
    """
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    token_data = _build_token_payload(user)
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserPublic.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
    db: Session = Depends(get_db),
):
    """
    Use the httpOnly refresh token cookie to get a new access token.
    """
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided.",
        )

    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type.",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated.",
        )

    token_data = _build_token_payload(user)
    new_access = create_access_token(token_data)
    new_refresh = create_refresh_token(token_data)

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )

    return TokenResponse(
        access_token=new_access,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserPublic.model_validate(user),
    )


@router.post("/logout")
def logout(response: Response):
    """
    Clear the refresh token cookie.
    """
    response.delete_cookie("refresh_token")
    return {"detail": "Logged out successfully."}


@router.get("/me", response_model=UserPublic)
def get_me(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme),
):
    """
    Return the current user's profile from the access token.
    """
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user
