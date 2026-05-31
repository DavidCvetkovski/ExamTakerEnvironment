"""LTI 1.3 Deep Linking response: instructor selects an exam, tool signs a
content-item response that the browser auto-posts back to Canvas.

The platform-controlled return URL and opaque ``data`` are captured at launch
time into ``lti_deep_link_sessions`` (see ``launch_service``), so nothing here
trusts client-supplied launch values.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.services.integration_audit_service import record_integration_audit
from app.services.lti import jwks_service

_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/"
_DL_CLAIM = "https://purl.imsglobal.org/spec/lti-dl/claim/"


@dataclass
class DeepLinkResponse:
    """The signed response and where the browser must post it."""

    return_url: str
    jwt: str


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def load_session(deep_link_session_id: str, user_id: str):
    """Return a live, owned, unconsumed deep-link session or raise."""
    session = await prisma.lti_deep_link_sessions.find_unique(
        where={"id": deep_link_session_id}
    )
    if not session or session.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deep link session not found.")
    if session.consumed_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Deep link session already completed.")
    if _aware(session.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_409_CONFLICT, "Deep link session has expired.")
    return session


async def create_deep_link_response(
    deep_link_session_id: str,
    user_id: str,
    *,
    scheduled_session_id: Optional[str],
    test_definition_id: Optional[str],
    title: str,
    tool_launch_url: str,
) -> DeepLinkResponse:
    """Bind the instructor's selection and sign the Deep Linking response JWT."""
    session = await load_session(deep_link_session_id, user_id)

    scheduled, test_def = await _validate_selection(scheduled_session_id, test_definition_id)
    deployment = await prisma.lti_deployments.find_unique(where={"id": session.deployment_id})
    platform = await prisma.lti_platforms.find_unique(where={"id": session.platform_id})

    resource_link = await _bind_resource_link(
        session, scheduled, test_def, title
    )

    content_item = {
        "type": "ltiResourceLink",
        "title": title,
        "url": tool_launch_url,
        "custom": {"openvision_resource_link_id": str(resource_link.id)},
    }
    claims = {
        "iss": platform.client_id,  # tool acts as issuer in a DL response
        "aud": [platform.issuer],
        "exp": int(datetime.now(timezone.utc).timestamp()) + 600,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "nonce": uuid.uuid4().hex,
        f"{_CLAIM}deployment_id": deployment.deployment_id,
        f"{_CLAIM}message_type": "LtiDeepLinkingResponse",
        f"{_CLAIM}version": "1.3.0",
        f"{_DL_CLAIM}content_items": [content_item],
    }
    if session.data is not None:
        claims[f"{_DL_CLAIM}data"] = session.data

    signed = await jwks_service.sign_tool_jwt(claims)

    await prisma.lti_deep_link_sessions.update(
        where={"id": deep_link_session_id},
        data={"consumed_at": datetime.now(timezone.utc)},
    )
    await record_integration_audit(
        integration="lti", action="deep_link.respond", status="success",
        actor_user_id=user_id, resource_type="lti_resource_link",
        resource_id=str(resource_link.id),
        metadata={"scheduled_session_id": scheduled_session_id, "title": title},
    )
    return DeepLinkResponse(return_url=session.return_url, jwt=signed)


async def _validate_selection(scheduled_session_id: Optional[str], test_definition_id: Optional[str]):
    """Validate the instructor selected at least one existing target."""
    if scheduled_session_id is None and test_definition_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Select a scheduled session and/or a test definition to deep link.",
        )
    scheduled = None
    test_def = None
    if scheduled_session_id is not None:
        scheduled = await prisma.scheduled_exam_sessions.find_unique(
            where={"id": scheduled_session_id}
        )
        if not scheduled:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Scheduled session not found.")
    if test_definition_id is not None:
        test_def = await prisma.test_definitions.find_unique(where={"id": test_definition_id})
        if not test_def:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Test definition not found.")
    return scheduled, test_def


async def _bind_resource_link(session, scheduled, test_def, title):
    """Create the tool-side resource link the deep link points at.

    Canvas assigns the real resource_link_id only when the link is first
    launched; we key on a tool-generated id and echo it in the content item's
    custom params so a future launch can be reconciled to this binding.
    """
    return await prisma.lti_resource_links.create(
        data={
            "platform_id": session.platform_id,
            "deployment_id": session.deployment_id,
            "context_link_id": session.context_link_id,
            "resource_link_id": f"ov-dl-{uuid.uuid4().hex}",
            "resource_title": title,
            "scheduled_session_id": scheduled.id if scheduled else None,
            "test_definition_id": test_def.id if test_def else None,
        }
    )
