"""
FastAPI dependency injection for authentication and role-based access control.
"""
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError

from app.core.config import settings
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


async def require_seb_integrity(
    session_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    """Enforce Safe Exam Browser + IP policy for one exam-data request (Epoch 11 §9.2).

    Loads the session and its test's proctoring policy, reconstructs the
    browser-facing URL, validates the SEB hash and IP allowlist, and on failure
    records a CRITICAL incident, flags the attempt, and raises 403. A test with no
    proctoring policy (the default) is a transparent pass-through, and the global
    ``PROCTORING_ENABLED`` kill switch bypasses all checks.

    Returns the authenticated user so endpoints can depend on this in place of
    ``get_current_user`` without a second DB fetch (FastAPI caches the sub-dep).
    """
    if not settings.PROCTORING_ENABLED:
        return current_user

    # Imported here (not at module top) to avoid an import cycle: these service
    # modules import models/config, none of which import this module.
    from app.core.prisma_db import prisma
    from app.core.rate_limit import client_ip
    from app.models.proctoring_incident import (
        ProctoringIncidentSource,
        ProctoringIncidentType,
        ProctoringSeverity,
    )
    from app.services.proctoring import seb_service
    from app.services.proctoring.incident_service import record_incident
    from app.services.proctoring.policy import resolve_proctoring_config

    session = await prisma.exam_sessions.find_unique(where={"id": str(session_id)})
    if session is None:
        # Let the endpoint's own loader return the canonical 404.
        return current_user

    test = await prisma.test_definitions.find_unique(where={"id": str(session.test_definition_id)})
    policy = resolve_proctoring_config(test)

    if not policy.require_seb and not policy.ip_allowlist:
        return current_user

    ip = client_ip(request)
    absolute_url = seb_service.build_absolute_url(
        request.url.path, request.url.query or None
    )

    async def _reject(incident_type, message: str) -> None:
        await record_incident(
            incident_type=incident_type,
            severity=ProctoringSeverity.CRITICAL,
            source=ProctoringIncidentSource.SERVER,
            exam_session_id=str(session.id),
            scheduled_session_id=str(session.scheduled_session_id)
            if session.scheduled_session_id
            else None,
            student_id=str(session.student_id),
            client_ip=ip,
            detail={"route": request.url.path},
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)

    # IP allowlist (cheap, fails closed when set).
    if not seb_service.ip_is_allowed(ip, policy.ip_allowlist):
        await _reject(
            ProctoringIncidentType.IP_NOT_ALLOWED,
            "This exam can only be taken from an approved network.",
        )

    # SEB integrity.
    if policy.require_seb and not seb_service.verify_seb_request(
        absolute_url=absolute_url, policy=policy, headers=request.headers
    ):
        if seb_service.has_any_seb_header(request.headers):
            await _reject(
                ProctoringIncidentType.SEB_HASH_INVALID,
                "Safe Exam Browser integrity check failed.",
            )
        await _reject(
            ProctoringIncidentType.SEB_HEADER_MISSING,
            "This exam must be taken in Safe Exam Browser.",
        )

    return current_user
