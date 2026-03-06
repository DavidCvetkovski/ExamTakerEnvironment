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

async def get_current_user(
    token: str = Depends(oauth2_scheme),
) -> User:
    """
    Decodes the JWT access token, validates expiry, fetches the User from the DB using Prisma.
    Raises 401 if token is invalid/expired/user not found.
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
