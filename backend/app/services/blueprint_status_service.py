"""Single source of truth for blueprint lifecycle status.

Every consumer that needs to know whether a blueprint is editable, deletable, or
purely viewable goes through `derive_blueprint_status`. No caller should re-implement
the priority logic.
"""

from datetime import datetime, timezone
from typing import Any, List

from app.core.prisma_db import prisma
from app.models.blueprint_status import BlueprintStatus
from app.models.scheduled_exam_session import CourseSessionStatus


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _effective_session_status(record: Any, now: datetime) -> str:
    """Derive the current effective status of a scheduled session without persisting.

    Mirrors `ensure_scheduled_session_current` but read-only — used during usage
    checks where we want truth without DB writes on every blueprint listing.
    """
    if record.status == CourseSessionStatus.CANCELED.value:
        return CourseSessionStatus.CANCELED.value
    starts_at = _ensure_utc(record.starts_at)
    ends_at = _ensure_utc(record.ends_at)
    if now >= ends_at:
        return CourseSessionStatus.CLOSED.value
    if now >= starts_at:
        return CourseSessionStatus.ACTIVE.value
    return CourseSessionStatus.SCHEDULED.value


def _classify(sessions: List[Any]) -> BlueprintStatus:
    if not sessions:
        return BlueprintStatus.NEW

    now = datetime.now(timezone.utc)
    has_ongoing = False
    has_passed = False
    has_future = False
    for session in sessions:
        effective = _effective_session_status(session, now)
        if effective == CourseSessionStatus.ACTIVE.value:
            has_ongoing = True
        elif effective in (
            CourseSessionStatus.CLOSED.value,
            CourseSessionStatus.CANCELED.value,
        ):
            has_passed = True
        elif effective == CourseSessionStatus.SCHEDULED.value:
            has_future = True

    if has_ongoing:
        return BlueprintStatus.ONGOING
    if has_passed:
        return BlueprintStatus.PASSED
    if has_future:
        return BlueprintStatus.SCHEDULED
    return BlueprintStatus.NEW


async def derive_blueprint_status(test_definition_id: str) -> BlueprintStatus:
    """Compute the lifecycle status of a blueprint based on its scheduled sessions."""
    sessions = await prisma.scheduled_exam_sessions.find_many(
        where={"test_definition_id": test_definition_id}
    )
    return _classify(sessions)


async def derive_next_session_at(test_definition_id: str) -> datetime | None:
    """Earliest upcoming session start (UTC) for the blueprint, or None.

    "Upcoming" means a session whose effective status is SCHEDULED — future
    start, not yet active, not canceled. Used by the blueprint card subline
    so users can see *when* the next instance fires without opening the
    sessions page.
    """
    sessions = await prisma.scheduled_exam_sessions.find_many(
        where={"test_definition_id": test_definition_id}
    )
    if not sessions:
        return None

    now = datetime.now(timezone.utc)
    upcoming: List[datetime] = []
    for session in sessions:
        effective = _effective_session_status(session, now)
        if effective == CourseSessionStatus.SCHEDULED.value:
            upcoming.append(_ensure_utc(session.starts_at))
        elif effective == CourseSessionStatus.ACTIVE.value:
            # If a session is live right now, "next session" is effectively now.
            upcoming.append(_ensure_utc(session.starts_at))
    return min(upcoming) if upcoming else None


def can_edit_blueprint(status: BlueprintStatus) -> bool:
    """Whether a blueprint in this status is mutable (title, blocks, scoring)."""
    return status in (BlueprintStatus.NEW, BlueprintStatus.SCHEDULED)


def can_delete_blueprint(status: BlueprintStatus) -> bool:
    """Whether a blueprint in this status can be permanently deleted."""
    return status == BlueprintStatus.NEW


def mutation_error_message(status: BlueprintStatus) -> str:
    """Human-readable reason a mutation is blocked. Empty when mutation is allowed."""
    if status == BlueprintStatus.ONGOING:
        return "Editing is locked while a scheduled session is active."
    if status == BlueprintStatus.PASSED:
        return "This blueprint has been used in a completed session and cannot be edited."
    return ""
