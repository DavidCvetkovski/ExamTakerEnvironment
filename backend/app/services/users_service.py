from typing import Optional
from fastapi import HTTPException, status, Response

from jose import JWTError

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.config import settings
from app.core.dependencies import assert_token_version
from app.core.prisma_db import prisma
from app.models.user import UserRole
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserPublic

def build_token_payload(user) -> dict:
    """Assemble the JWT claim set for a user.

    The ``tv`` (token version) claim is the spine of session invalidation:
    every token carries the user's current ``token_version`` and every
    authenticated read re-checks it (see ``dependencies._assert_token_version``).
    This is the single place the claim shape is defined — token factories stay
    generic and encode whatever dict they're handed.
    """
    return {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "tv": user.token_version,
    }

def set_refresh_cookie(response: Response, refresh_token: str):
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        # Secure in production so the long-lived refresh token is never sent over
        # plaintext HTTP; left off in dev/test where the app runs on http://.
        secure=settings.ENVIRONMENT == "production",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


def issue_session(user, response: Response) -> TokenResponse:
    """Mint an access+refresh pair for ``user``, set the refresh cookie, and
    shape the standard ``TokenResponse``.

    The single tail shared by register, login, refresh, password change, and
    sign-out-everywhere — so the token shape, expiry, and cookie policy live in
    exactly one place (CLAUDE.md §2). The user object must already carry the
    current ``token_version`` (i.e. be freshly loaded after any bump).
    """
    token_data = build_token_payload(user)
    set_refresh_cookie(response, create_refresh_token(token_data))
    return TokenResponse(
        access_token=create_access_token(token_data),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserPublic.model_validate(user),
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
            # Forced, never client-supplied — see RegisterRequest security note.
            "role": UserRole.STUDENT.value,
            "vunet_id": payload.vunet_id,
            "is_active": True,
            "provision_time_multiplier": 1.0
        }
    )

    return issue_session(user, response)

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

    return issue_session(user, response)

async def refresh_tokens(payload: dict, response: Response) -> TokenResponse:
    """Mint a new token pair from a validated refresh-token payload.

    Re-checks the ``tv`` claim against the live user so a stale refresh cookie
    (issued before a password change / sign-out-everywhere) cannot mint a fresh
    access token — the same invalidation rule enforced on every read.
    """
    user = await prisma.users.find_unique(where={"id": payload["sub"]})
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated.",
        )

    assert_token_version(payload, user)

    return issue_session(user, response)


async def change_password(
    user_id: str,
    current_password: str,
    new_password: str,
    response: Response,
) -> TokenResponse:
    """Rotate a user's password and invalidate every other session.

    Verifies the current password, rejects a no-op change, then writes the new
    bcrypt hash **and** bumps ``token_version`` in a single atomic update — so a
    changed credential can never coexist with still-valid pre-change tokens. The
    caller's own token is now stale too, so we re-mint this session's tokens and
    return them (the active tab stays signed in; all other devices are dead).
    """
    user = await prisma.users.find_unique(where={"id": user_id})
    if not user:
        # Authenticated dependency guarantees existence; defensive 404.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if not verify_password(current_password, user.hashed_password):
        # 400, not 401: the session is valid, the *input* is wrong. Generic message.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    if verify_password(new_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current one.",
        )

    updated = await prisma.users.update(
        where={"id": user_id},
        data={
            "hashed_password": hash_password(new_password),
            "token_version": {"increment": 1},
        },
    )
    return issue_session(updated, response)


async def sign_out_everywhere(
    user_id: str,
    current_password: str,
    response: Response,
) -> TokenResponse:
    """Invalidate all sessions by bumping ``token_version``, keeping the current
    tab alive via freshly minted tokens. Re-verifies the password as defense in
    depth for a destructive action."""
    user = await prisma.users.find_unique(where={"id": user_id})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is incorrect.",
        )

    updated = await prisma.users.update(
        where={"id": user_id},
        data={"token_version": {"increment": 1}},
    )
    return issue_session(updated, response)


async def logout_user(refresh_token: Optional[str], response: Response) -> None:
    """Clear the refresh cookie and invalidate the presented refresh token.

    Bumping ``token_version`` kills the refresh token server-side immediately, so
    a captured cookie can't be replayed after the user logs out (plain logout was
    previously cookie-clear only). Best-effort: an expired or malformed cookie
    still clears cleanly — logout is idempotent and never errors.
    """
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            user_id = payload.get("sub")
            if user_id and payload.get("type") == "refresh":
                await prisma.users.update(
                    where={"id": user_id},
                    data={"token_version": {"increment": 1}},
                )
        except JWTError:
            pass  # already-invalid token — nothing to revoke
    response.delete_cookie("refresh_token")


async def deactivate_self(
    user,
    current_password: str,
    response: Response,
) -> None:
    """Self-deactivate the account (reversible by an admin; never a hard delete,
    to preserve referential integrity across authored questions, results, and
    grades). Bumps ``token_version`` to kill sessions immediately and clears the
    refresh cookie. Admins are barred to prevent locking the platform out of its
    last administrator."""
    if user.role == "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot deactivate their own account.",
        )

    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is incorrect.",
        )

    await prisma.users.update(
        where={"id": str(user.id)},
        data={"is_active": False, "token_version": {"increment": 1}},
    )
    response.delete_cookie("refresh_token")
