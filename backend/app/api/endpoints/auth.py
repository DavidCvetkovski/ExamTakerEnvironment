from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
from jose import JWTError

from app.core.dependencies import get_current_user
from app.core.security import decode_token
from app.models.user import User
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserPublic,
    ChangePasswordRequest,
    ConfirmPasswordRequest,
)
from app.core.rate_limit import (
    rate_limit_login,
    rate_limit_register,
    rate_limit_refresh,
)
from app.services import users_service as svc

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit_register)],
)
async def register(payload: RegisterRequest, response: Response):
    """Create a new user account."""
    return await svc.register_user(payload=payload, response=response)

@router.post("/login", response_model=TokenResponse, dependencies=[Depends(rate_limit_login)])
async def login(payload: LoginRequest, response: Response):
    """Authenticate with email + password."""
    return await svc.authenticate_user(payload=payload, response=response)

@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(rate_limit_refresh)])
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

    return await svc.refresh_tokens(payload=payload, response=response)

@router.post("/logout")
async def logout(
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
):
    """Clear the refresh token cookie and revoke it server-side."""
    await svc.logout_user(refresh_token=refresh_token, response=response)
    return {"detail": "Logged out successfully."}

@router.post("/change-password", response_model=TokenResponse)
async def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
):
    """Change the authenticated user's password.

    Verifies the current password, enforces the strength rule, and invalidates
    all other sessions. Returns a fresh token pair so the current tab stays
    signed in.
    """
    return await svc.change_password(
        user_id=str(current_user.id),
        current_password=payload.current_password,
        new_password=payload.new_password,
        response=response,
    )

@router.post("/logout-all", response_model=TokenResponse)
async def logout_all(
    payload: ConfirmPasswordRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
):
    """Sign out of all other devices (re-verifies the current password)."""
    return await svc.sign_out_everywhere(
        user_id=str(current_user.id),
        current_password=payload.password,
        response=response,
    )

@router.get("/me", response_model=UserPublic)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the current user's profile.

    Routes through ``get_current_user`` so the token_version and is_active
    checks apply here too — a single source of "who is this request" rather than
    a second, weaker inline decode.
    """
    return current_user
