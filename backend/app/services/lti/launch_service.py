"""LTI 1.3 launch and OIDC login initiation services."""

import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.services.integration_audit_service import record_integration_audit


async def initiate_login(
    iss: str,
    login_hint: str,
    target_link_uri: str,
    client_id: str | None = None,
    lti_message_hint: str | None = None,
    redirect_uri: str | None = None,
) -> str:
    """Validate parameter validity, locate platforms, persist state/nonce, and return redirect URL.

    Args:
        iss: The issuer identifier representing the platform.
        login_hint: Opaque value used by the platform to identify the user session.
        target_link_uri: The ultimate landing URL within the tool.
        client_id: Optional client ID constraint if multiple clients are registered.
        lti_message_hint: Optional platform-specific message hint.
        redirect_uri: The absolute redirect launch URL of the tool.
    """
    if client_id:
        platform = await prisma.lti_platforms.find_first(
            where={"issuer": iss, "client_id": client_id, "is_active": True}
        )
    else:
        platforms = await prisma.lti_platforms.find_many(
            where={"issuer": iss, "is_active": True}
        )
        if not platforms:
            platform = None
        elif len(platforms) == 1:
            platform = platforms[0]
        else:
            # Audit failure due to ambiguous registration
            await record_integration_audit(
                integration="lti",
                action="login.initiate",
                status="failed",
                metadata={
                    "iss": iss,
                    "reason": "Multiple LTI platform registrations found for issuer. client_id is required."
                }
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Multiple LTI platform registrations found for issuer. A client_id is required."
            )

    if not platform:
        await record_integration_audit(
            integration="lti",
            action="login.initiate",
            status="failed",
            metadata={
                "iss": iss,
                "client_id": client_id,
                "reason": "Platform registration not found or inactive."
            }
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Platform registration not found or inactive."
        )

    # Generate single-use cryptographically strong state and nonce
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)

    # Persist the login attempt state
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    await prisma.lti_oidc_states.create(
        data={
            "state": state,
            "nonce": nonce,
            "issuer": platform.issuer,
            "client_id": platform.client_id,
            "target_link_uri": target_link_uri,
            "message_hint": lti_message_hint,
            "expires_at": expires_at,
        }
    )

    # Construct the redirect URI params according to LTI 1.3/OIDC specifications
    params = {
        "scope": "openid",
        "response_type": "id_token",
        "response_mode": "form_post",
        "prompt": "none",
        "client_id": platform.client_id,
        "redirect_uri": redirect_uri,
        "login_hint": login_hint,
        "state": state,
        "nonce": nonce,
    }
    if lti_message_hint:
        params["lti_message_hint"] = lti_message_hint

    query_string = urlencode(params)
    redirect_url = f"{platform.auth_login_url}?{query_string}"

    # Log successful initiation to audit tables
    await record_integration_audit(
        integration="lti",
        action="login.initiate",
        status="success",
        metadata={
            "platform_id": str(platform.id),
            "iss": iss,
            "client_id": platform.client_id,
            "state": state,
        }
    )

    return redirect_url
