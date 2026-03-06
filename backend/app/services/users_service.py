from typing import Optional
from fastapi import HTTPException, status, Response

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
)
from app.core.config import settings
from app.core.prisma_db import prisma
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserPublic

def build_token_payload(user) -> dict:
    return {"sub": str(user.id), "email": user.email, "role": user.role}

def set_refresh_cookie(response: Response, refresh_token: str):
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,  # Set True in production
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )

async def register_user(payload: RegisterRequest, response: Response) -> TokenResponse:
    # Check for duplicate email
    existing = await prisma.users.find_unique(where={"email": payload.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    # Check for duplicate vunet_id
    if payload.vunet_id:
        existing_vunet = await prisma.users.find_unique(where={"vunet_id": payload.vunet_id})
        if existing_vunet:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this VUnetID already exists.",
            )

    user = await prisma.users.create(
        data={
            "email": payload.email,
            "hashed_password": hash_password(payload.password),
            "role": payload.role.value,
            "vunet_id": payload.vunet_id,
            "is_active": True,
            "provision_time_multiplier": 1.0
        }
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

async def authenticate_user(payload: LoginRequest, response: Response) -> TokenResponse:
    user = await prisma.users.find_unique(where={"email": payload.email})
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

async def refresh_tokens(user_id: str, response: Response) -> TokenResponse:
    user = await prisma.users.find_unique(where={"id": user_id})
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
