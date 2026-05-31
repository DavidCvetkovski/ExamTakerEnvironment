"""AGS grade passback: push a published OpenVision result to a Canvas line item.

Every passback is recorded in ``lti_grade_passbacks`` with an explicit state
machine so failures are visible and retryable. External calls go through
``platform_client`` (mocked in tests). Access tokens never reach the frontend
and raw errors are sanitized before storage.
"""

import logging
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.services.integration_audit_service import record_integration_audit
from app.services.lti import platform_client

logger = logging.getLogger(__name__)

# Passback state machine.
PENDING = "PENDING"
PUSHING = "PUSHING"
SUCCEEDED = "SUCCEEDED"
FAILED_RETRYABLE = "FAILED_RETRYABLE"
FAILED_PERMANENT = "FAILED_PERMANENT"

_RETRYABLE_STATES = {PENDING, FAILED_RETRYABLE}


def _sanitize_error(message: str) -> str:
    """Trim an error to a safe, bounded string for storage."""
    return message.replace("\n", " ")[:500]


async def _load_passback_context(session_result_id: str):
    """Resolve and validate everything needed to push a result's grade.

    Returns ``(result, resource_link, user_link)``. Raises 400/404 when the
    result is not publishable or no Canvas line item maps to it.
    """
    result = await prisma.session_results.find_unique(where={"id": session_result_id})
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session result not found.")
    if not result.is_published:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Result is not published yet.")

    session = await prisma.exam_sessions.find_unique(where={"id": result.session_id})
    if not session or not session.scheduled_session_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Result is not from a scheduled exam.")

    resource_link = await prisma.lti_resource_links.find_first(
        where={"scheduled_session_id": session.scheduled_session_id, "line_item_url": {"not": None}}
    )
    if not resource_link:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No Canvas line item is linked to this exam.",
        )

    user_link = await prisma.lti_user_links.find_first(
        where={"user_id": result.student_id, "platform_id": resource_link.platform_id}
    )
    if not user_link:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Student is not linked to the launching platform.",
        )
    return result, resource_link, user_link


async def create_passback_for_result(session_result_id: str, actor_user_id: str):
    """Create (or reuse) a PENDING passback record for a published result."""
    result, resource_link, user_link = await _load_passback_context(session_result_id)

    existing = await prisma.lti_grade_passbacks.find_first(
        where={"resource_link_id": resource_link.id, "session_result_id": session_result_id}
    )
    if existing:
        return existing

    return await prisma.lti_grade_passbacks.create(
        data={
            "resource_link_id": resource_link.id,
            "session_result_id": session_result_id,
            "student_user_id": result.student_id,
            "platform_user_sub": user_link.subject,
            "line_item_url": resource_link.line_item_url,
            "score_given": result.total_points,
            "score_maximum": result.max_points,
            "activity_progress": "Completed",
            "grading_progress": "FullyGraded",
            "status": PENDING,
        }
    )


async def push_passback(passback_id: str, actor_user_id: str):
    """Attempt to push a passback's score to Canvas, recording the outcome."""
    passback = await prisma.lti_grade_passbacks.find_unique(where={"id": passback_id})
    if not passback:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Passback not found.")
    if passback.status == SUCCEEDED:
        return passback

    resource_link = await prisma.lti_resource_links.find_unique(
        where={"id": passback.resource_link_id}
    )
    platform = await prisma.lti_platforms.find_unique(where={"id": resource_link.platform_id})

    await prisma.lti_grade_passbacks.update(
        where={"id": passback_id},
        data={"status": PUSHING, "attempts": {"increment": 1},
              "last_attempt_at": datetime.now(timezone.utc)},
    )

    new_status, error = await _attempt_push(platform, passback)
    data = {"status": new_status, "last_error": error}
    if new_status == SUCCEEDED:
        data["pushed_at"] = datetime.now(timezone.utc)
    updated = await prisma.lti_grade_passbacks.update(where={"id": passback_id}, data=data)

    await record_integration_audit(
        integration="lti", action="grade_passback.push",
        status="success" if new_status == SUCCEEDED else "failed",
        actor_user_id=actor_user_id, resource_type="lti_grade_passback",
        resource_id=passback_id, metadata={"result_status": new_status},
    )
    return updated


async def _attempt_push(platform, passback):
    """Do the network push. Returns ``(new_status, sanitized_error_or_None)``."""
    try:
        token = await platform_client.get_access_token(platform)
        payload = platform_client.build_score_payload(
            subject=passback.platform_user_sub,
            score_given=passback.score_given,
            score_maximum=passback.score_maximum,
        )
        resp = await platform_client.post_score(passback.line_item_url, token, payload)
    except httpx.HTTPError as exc:
        return FAILED_RETRYABLE, _sanitize_error(f"Transport error: {exc}")

    if resp.status_code < 300:
        return SUCCEEDED, None
    if resp.status_code in (401, 408, 429) or resp.status_code >= 500:
        # Auth refresh / throttling / server faults are worth retrying.
        return FAILED_RETRYABLE, _sanitize_error(f"HTTP {resp.status_code}: {resp.text}")
    return FAILED_PERMANENT, _sanitize_error(f"HTTP {resp.status_code}: {resp.text}")


async def list_passbacks(*, skip: int, limit: int, status_filter: str | None = None):
    """Return a paginated list of grade passbacks, optionally filtered by state."""
    from app.schemas.lti import LtiGradePassbackPage, LtiGradePassbackResponse

    where = {"status": status_filter} if status_filter else {}
    total = await prisma.lti_grade_passbacks.count(where=where)
    rows = await prisma.lti_grade_passbacks.find_many(
        where=where, order={"created_at": "desc"}, skip=skip, take=limit
    )
    return LtiGradePassbackPage(
        items=[LtiGradePassbackResponse.model_validate(r) for r in rows],
        total=total, skip=skip, limit=limit,
    )


async def retry_passback(passback_id: str, actor_user_id: str):
    """Manually retry a passback that is pending or retryably failed."""
    passback = await prisma.lti_grade_passbacks.find_unique(where={"id": passback_id})
    if not passback:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Passback not found.")
    if passback.status not in _RETRYABLE_STATES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Passback in state {passback.status} cannot be retried.",
        )
    return await push_passback(passback_id, actor_user_id)
