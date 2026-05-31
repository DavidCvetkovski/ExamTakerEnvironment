"""LTI 1.3 launch and OIDC login initiation services."""

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

from fastapi import HTTPException, status
from jose import jwt
from jose.exceptions import JWTError

from app.core.prisma_db import prisma
from app.services.integration_audit_service import record_integration_audit
from app.services.lti import jwks_client, mapping_service
from app.services.lti.claims import LtiLaunchClaims, parse_claims

# LTI 1.3 message types this tool can service.
SUPPORTED_MESSAGE_TYPES = {"LtiResourceLinkRequest", "LtiDeepLinkingRequest"}
# Required prefix on the LTI version claim.
LTI_VERSION_PREFIX = "1.3"


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


# ---------------------------------------------------------------------------
# LTI 1.3 launch validation
# ---------------------------------------------------------------------------


@dataclass
class LaunchOutcome:
    """Result of a validated launch handed back to the endpoint layer."""

    user: object
    message_type: str
    redirect_path: str  # SPA-relative path the launch resolver should route to


def _aware(dt: datetime) -> datetime:
    """Normalize a (possibly naive) DB timestamp to an aware UTC datetime."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def _record_launch_audit(
    *,
    platform,
    claims: Optional[LtiLaunchClaims],
    status: str,
    request_id: Optional[str],
    failure_reason: Optional[str] = None,
    user_id: Optional[str] = None,
) -> None:
    """Append a row to the LTI launch audit trail (success or failure)."""
    await prisma.lti_launch_audits.create(
        data={
            "platform_id": str(platform.id) if platform else None,
            "issuer": claims.issuer if claims else (platform.issuer if platform else "unknown"),
            "subject": claims.subject if claims else None,
            "user_id": user_id,
            "deployment_id": claims.deployment_id if claims else None,
            "context_id": claims.context_id if claims else None,
            "resource_link_id": claims.resource_link_id if claims else None,
            "message_type": claims.message_type if claims else None,
            "status": status,
            "failure_reason": failure_reason,
            "request_id": request_id,
        }
    )


async def _fail(
    *,
    platform,
    claims: Optional[LtiLaunchClaims],
    message: str,
    request_id: Optional[str],
    status_code: int = status.HTTP_400_BAD_REQUEST,
) -> None:
    """Audit a launch rejection and raise the matching HTTP error."""
    await _record_launch_audit(
        platform=platform,
        claims=claims,
        status="failed",
        request_id=request_id,
        failure_reason=message,
    )
    raise HTTPException(status_code=status_code, detail=message)


async def _load_unconsumed_state(state_value: str, request_id: Optional[str]):
    """Load a launch state row, asserting it is live and unused (replay guard)."""
    state_row = await prisma.lti_oidc_states.find_unique(where={"state": state_value})
    if not state_row or state_row.consumed_at is not None:
        await _fail(
            platform=None, claims=None,
            message="Invalid or already-used launch state.", request_id=request_id,
        )
    if _aware(state_row.expires_at) < datetime.now(timezone.utc):
        await _fail(
            platform=None, claims=None,
            message="Launch state has expired.", request_id=request_id,
        )
    return state_row


async def _verify_token(id_token: str, platform, request_id: Optional[str]) -> dict:
    """Verify the platform-signed id_token against the platform JWKS."""
    try:
        kid = jwt.get_unverified_header(id_token).get("kid")
    except JWTError:
        await _fail(
            platform=platform, claims=None,
            message="Malformed launch token.", request_id=request_id,
        )

    signing_key = await jwks_client.get_signing_key(platform.auth_jwks_url, kid)
    if not signing_key:
        await _fail(
            platform=platform, claims=None,
            message="Launch token signed by an unknown key.", request_id=request_id,
        )

    try:
        return jwt.decode(
            id_token,
            signing_key,
            algorithms=["RS256"],
            audience=platform.client_id,
            issuer=platform.issuer,
        )
    except JWTError:
        await _fail(
            platform=platform, claims=None,
            message="Launch token failed signature or claim verification.",
            request_id=request_id,
        )


async def _check_lti_claims(
    payload: dict, claims: LtiLaunchClaims, platform, state_row, request_id: Optional[str]
):
    """Enforce the LTI-specific claim rules and return the active deployment."""
    azp = payload.get("azp")
    if azp and azp != platform.client_id:
        await _fail(platform=platform, claims=claims,
                    message="Authorized party does not match registration.", request_id=request_id)
    if payload.get("nonce") != state_row.nonce:
        await _fail(platform=platform, claims=claims,
                    message="Launch nonce mismatch.", request_id=request_id)
    if not claims.version.startswith(LTI_VERSION_PREFIX):
        await _fail(platform=platform, claims=claims,
                    message="Unsupported LTI version.", request_id=request_id)
    if claims.message_type not in SUPPORTED_MESSAGE_TYPES:
        await _fail(platform=platform, claims=claims,
                    message=f"Unsupported LTI message type: {claims.message_type or 'none'}.",
                    request_id=request_id)

    deployment = await mapping_service.resolve_deployment(platform, claims.deployment_id)
    if not deployment:
        await _fail(platform=platform, claims=claims,
                    message="Launch deployment is not registered or inactive.", request_id=request_id)
    return deployment


async def _resolve_student_target(claims, platform, deployment, context_link, user, request_id):
    """Map a learner resource-link launch to a joinable exam, enrolling them."""
    if not context_link or not context_link.course_id:
        await _fail(platform=platform, claims=claims,
                    message="This course is not yet configured in OpenVision.", request_id=request_id)

    resource_link = await mapping_service.resolve_lti_resource_link(
        claims, platform, deployment, context_link
    )
    if not resource_link or not resource_link.scheduled_session_id:
        await _fail(platform=platform, claims=claims,
                    message="This assignment is not yet linked to an exam.", request_id=request_id)

    await mapping_service.ensure_enrollment(str(user.id), context_link.course_id)
    return f"/exam/join/{resource_link.scheduled_session_id}"


async def _resolve_instructor_target(claims, platform, deployment, context_link):
    """Map an instructor/deep-link launch to the relevant integration surface."""
    if claims.message_type == "LtiDeepLinkingRequest":
        return "/integrations/lti/deep-link"
    resource_link = await mapping_service.resolve_lti_resource_link(
        claims, platform, deployment, context_link
    )
    if resource_link:
        return f"/integrations/lti/resource-links/{resource_link.id}"
    return "/integrations/lti"


async def validate_launch(
    state_value: str, id_token: str, request_id: Optional[str] = None
) -> LaunchOutcome:
    """Validate an LTI 1.3 launch and resolve it to an OpenVision session target.

    Treats every launch parameter as hostile until the id_token is verified
    against the registered platform's JWKS (CLAUDE.md §1). On success the state
    is consumed (single-use), the user/context/resource are mapped, and a launch
    audit row is written. Raises ``HTTPException`` on any validation failure.
    """
    state_row = await _load_unconsumed_state(state_value, request_id)

    platform = await prisma.lti_platforms.find_first(
        where={"issuer": state_row.issuer, "client_id": state_row.client_id, "is_active": True}
    )
    if not platform:
        await _fail(platform=None, claims=None,
                    message="Launch platform registration not found or inactive.", request_id=request_id)

    payload = await _verify_token(id_token, platform, request_id)
    claims = parse_claims(payload)
    deployment = await _check_lti_claims(payload, claims, platform, state_row, request_id)

    # Single-use: consume the state now that the token and nonce are trusted.
    await prisma.lti_oidc_states.update(
        where={"state": state_value},
        data={"consumed_at": datetime.now(timezone.utc)},
    )

    user = await mapping_service.resolve_lti_user(claims, platform)
    context_link = await mapping_service.resolve_lti_context(claims, platform, deployment)

    if mapping_service.is_instructor_launch(claims):
        redirect_path = await _resolve_instructor_target(claims, platform, deployment, context_link)
    else:
        redirect_path = await _resolve_student_target(
            claims, platform, deployment, context_link, user, request_id
        )

    await _record_launch_audit(
        platform=platform, claims=claims, status="success",
        request_id=request_id, user_id=str(user.id),
    )
    return LaunchOutcome(user=user, message_type=claims.message_type, redirect_path=redirect_path)
