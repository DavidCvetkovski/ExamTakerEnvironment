"""
FastAPI dependency injection for authentication and role-based access control.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


from app.core.prisma_db import get_prisma, prisma


def assert_token_version(payload: dict, user) -> None:
    """Reject tokens minted before the user's current ``token_version``.

    The single derivation of "is this token still valid against the account's
    session generation." A password change, sign-out-everywhere, or
    deactivation bumps ``user.token_version``; any token carrying an older
    ``tv`` claim is now stale. Both ``get_current_user`` and the ``/auth/refresh``
    route call this — no consumer re-implements the comparison.
    """
    if payload.get("tv", 0) != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
) -> User:
    """
    Decodes the JWT access token, validates expiry, fetches the User from the DB using Prisma.
    Raises 401 if token is invalid/expired/user not found/superseded by a newer token version.
    Raises 403 if the user account is deactivated.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Use Prisma to fetch user
    user = await prisma.users.find_unique(where={"id": user_id})
    if user is None:
        raise credentials_exception

    # Reject sessions invalidated by a later password change / sign-out-everywhere.
    assert_token_version(payload, user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )
    return user


def require_role(*allowed_roles: UserRole):
    """
    Factory that returns a FastAPI dependency enforcing role membership.
    Usage: Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN))
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action requires one of: {[r.value for r in allowed_roles]}",
            )
        return current_user
    return role_checker
