"""Append-only audit logging for external integrations."""

from typing import Any, Optional

from prisma import Json

from app.core.prisma_db import prisma


async def record_integration_audit(
    *,
    integration: str,
    action: str,
    status: str,
    actor_user_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    """Write a safe, append-only integration audit entry.

    Metadata must contain only non-secret identifiers, counts, and operational
    context. Never pass raw JWTs, service tokens, CSV contents, or XML bodies.
    """
    await prisma.integration_audit_logs.create(
        data={
            "actor_user_id": actor_user_id,
            "integration": integration,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "status": status,
            "metadata": Json(metadata or {}),
        }
    )
