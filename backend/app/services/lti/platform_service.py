"""LTI platform registration and deployment management."""

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from prisma import Json

from app.core.prisma_db import prisma
from app.schemas.lti import (
    LtiPlatformCreate,
    LtiPlatformPage,
    LtiPlatformResponse,
    LtiPlatformUpdate,
)
from app.services.integration_audit_service import record_integration_audit


def _url(value: Any) -> str | None:
    """Convert Pydantic URL values to strings for Prisma."""
    return str(value) if value is not None else None


async def _serialize_platform(platform) -> LtiPlatformResponse:
    """Load deployment rows and shape a platform response."""
    with_deployments = await prisma.lti_platforms.find_unique(
        where={"id": str(platform.id)},
        include={"deployments": True},
    )
    return LtiPlatformResponse.model_validate(with_deployments)


async def list_platforms(skip: int, limit: int) -> LtiPlatformPage:
    """Return a paginated list of registered LTI platforms."""
    total = await prisma.lti_platforms.count()
    platforms = await prisma.lti_platforms.find_many(
        order={"created_at": "desc"},
        skip=skip,
        take=limit,
        include={"deployments": True},
    )
    return LtiPlatformPage(
        items=[LtiPlatformResponse.model_validate(platform) for platform in platforms],
        total=total,
        skip=skip,
        limit=limit,
    )


async def create_platform(payload: LtiPlatformCreate, actor_user_id: str) -> LtiPlatformResponse:
    """Register a trusted LTI platform and its deployment IDs."""
    issuer = _url(payload.issuer)
    existing = await prisma.lti_platforms.find_first(
        where={"issuer": issuer, "client_id": payload.client_id}
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An LTI platform with this issuer and client ID already exists.",
        )

    async with prisma.tx() as tx:
        platform = await tx.lti_platforms.create(
            data={
                "name": payload.name.strip(),
                "issuer": issuer,
                "client_id": payload.client_id.strip(),
                "auth_login_url": _url(payload.auth_login_url),
                "auth_token_url": _url(payload.auth_token_url),
                "auth_jwks_url": _url(payload.auth_jwks_url),
                "deployment_ids": Json(payload.deployment_ids),
                "canvas_base_url": _url(payload.canvas_base_url),
                "is_active": True,
                "created_by": actor_user_id,
            }
        )
        for deployment_id in payload.deployment_ids:
            await tx.lti_deployments.create(
                data={
                    "platform_id": str(platform.id),
                    "deployment_id": deployment_id,
                    "is_active": True,
                }
            )

    await record_integration_audit(
        integration="lti",
        action="platform.create",
        status="success",
        actor_user_id=actor_user_id,
        resource_type="lti_platform",
        resource_id=str(platform.id),
        metadata={
            "issuer": issuer,
            "client_id": payload.client_id,
            "deployment_count": len(payload.deployment_ids),
        },
    )
    return await _serialize_platform(platform)


async def update_platform(
    platform_id: str,
    payload: LtiPlatformUpdate,
    actor_user_id: str,
) -> LtiPlatformResponse:
    """Update non-identity platform registration fields."""
    platform = await prisma.lti_platforms.find_unique(where={"id": platform_id})
    if not platform:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LTI platform not found.")

    data: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if payload.name is not None:
        data["name"] = payload.name.strip()
    if payload.auth_login_url is not None:
        data["auth_login_url"] = _url(payload.auth_login_url)
    if payload.auth_token_url is not None:
        data["auth_token_url"] = _url(payload.auth_token_url)
    if payload.auth_jwks_url is not None:
        data["auth_jwks_url"] = _url(payload.auth_jwks_url)
    if payload.canvas_base_url is not None:
        data["canvas_base_url"] = _url(payload.canvas_base_url)
    if payload.is_active is not None:
        data["is_active"] = payload.is_active

    updated = await prisma.lti_platforms.update(where={"id": platform_id}, data=data)
    await record_integration_audit(
        integration="lti",
        action="platform.update",
        status="success",
        actor_user_id=actor_user_id,
        resource_type="lti_platform",
        resource_id=platform_id,
        metadata={"updated_fields": sorted(data.keys())},
    )
    return await _serialize_platform(updated)


async def deactivate_platform(platform_id: str, actor_user_id: str) -> LtiPlatformResponse:
    """Deactivate a platform and its deployments without deleting audit history."""
    platform = await prisma.lti_platforms.find_unique(where={"id": platform_id})
    if not platform:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LTI platform not found.")

    async with prisma.tx() as tx:
        updated = await tx.lti_platforms.update(
            where={"id": platform_id},
            data={"is_active": False, "updated_at": datetime.now(timezone.utc)},
        )
        await tx.lti_deployments.update_many(
            where={"platform_id": platform_id},
            data={"is_active": False},
        )

    await record_integration_audit(
        integration="lti",
        action="platform.deactivate",
        status="success",
        actor_user_id=actor_user_id,
        resource_type="lti_platform",
        resource_id=platform_id,
        metadata={"issuer": platform.issuer, "client_id": platform.client_id},
    )
    return await _serialize_platform(updated)
