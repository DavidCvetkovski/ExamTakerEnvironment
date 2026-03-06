from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Optional
from jose import JWTError

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserPublic
from app.services import users_service as svc

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

from app.core.prisma_db import get_prisma, prisma
from prisma import Prisma

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, response: Response):
    """Create a new user account."""
    return await svc.register_user(payload=payload, response=response)

@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, response: Response):
    """Authenticate with email + password."""
    return await svc.authenticate_user(payload=payload, response=response)

@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
):
    """Use refresh token cookie to get new tokens."""
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided.",
        )

    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")

    return await svc.refresh_tokens(user_id=payload["sub"], response=response)

@router.post("/logout")
async def logout(response: Response):
    """Clear the refresh token cookie."""
    response.delete_cookie("refresh_token")
    return {"detail": "Logged out successfully."}

@router.get("/me", response_model=UserPublic)
async def get_me(
    token: str = Depends(oauth2_scheme),
):
    """Return the current user's profile."""
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await prisma.users.find_unique(where={"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user
