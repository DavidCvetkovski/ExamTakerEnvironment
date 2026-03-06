from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status, Response

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
)
from app.core.config import settings
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserPublic

def build_token_payload(user: User) -> dict:
    return {"sub": str(user.id), "email": user.email, "role": user.role.value}

def set_refresh_cookie(response: Response, refresh_token: str):
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,  # Set True in production
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )

def register_user(db: Session, payload: RegisterRequest, response: Response) -> TokenResponse:
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

    token_data = build_token_payload(user)
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    set_refresh_cookie(response, refresh_token)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserPublic.model_validate(user),
    )

def authenticate_user(db: Session, payload: LoginRequest, response: Response) -> TokenResponse:
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

    token_data = build_token_payload(user)
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    set_refresh_cookie(response, refresh_token)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserPublic.model_validate(user),
    )

def refresh_tokens(db: Session, user_id: str, response: Response) -> TokenResponse:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated.",
        )

    token_data = build_token_payload(user)
    new_access = create_access_token(token_data)
    new_refresh = create_refresh_token(token_data)
    set_refresh_cookie(response, new_refresh)

    return TokenResponse(
        access_token=new_access,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserPublic.model_validate(user),
    )
