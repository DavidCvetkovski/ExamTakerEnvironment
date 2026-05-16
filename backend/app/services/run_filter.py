"""
Run-scoping helpers for per-scheduled-session drill-ins on grading + analytics.

A "run" is one scheduled occurrence of a test definition (one row in
``scheduled_exam_sessions``). The grading and analytics dashboards both
support optionally narrowing their query to a single run, or to the
synthetic "practice" bucket (sessions with ``scheduled_session_id IS NULL``
and ``session_mode='PRACTICE'``).

Sentinels accepted in ``run_id``:
  * ``None`` / ``"combined"`` — no filter, all sessions for the test.
  * ``"practice"`` — synthetic bucket for practice attempts only.
  * Any other string — treated as a ``scheduled_exam_sessions.id`` UUID and
    must belong to the same ``test_definition_id`` (see ``assert_run_belongs_to_test``).

Security: every endpoint that accepts a ``run_id`` MUST call
``assert_run_belongs_to_test`` before passing the value to a query helper.
Cross-tenant ``run_id`` injection is the threat we're guarding against.
"""
from typing import Any, Dict, Optional

from fastapi import HTTPException, status

from app.core.prisma_db import prisma

COMBINED_SENTINEL = "combined"
PRACTICE_SENTINEL = "practice"


def is_combined(run_id: Optional[str]) -> bool:
    """True when the caller wants no run-filter (default behavior)."""
    return run_id is None or run_id == COMBINED_SENTINEL


def build_exam_session_run_filter(run_id: Optional[str]) -> Dict[str, Any]:
    """Where-clause fragment for ``prisma.exam_sessions.find_many``.

    Returns an empty dict when ``run_id`` is the combined sentinel — caller
    spreads the result into the outer ``where``.
    """
    if is_combined(run_id):
        return {}
    if run_id == PRACTICE_SENTINEL:
        return {"scheduled_session_id": None, "session_mode": "PRACTICE"}
    return {"scheduled_session_id": run_id}


def build_session_results_run_filter(run_id: Optional[str]) -> Dict[str, Any]:
    """Where-clause fragment for ``prisma.session_results.find_many``.

    Filters via the nested ``exam_sessions`` relation. Empty dict when combined.
    """
    if is_combined(run_id):
        return {}
    if run_id == PRACTICE_SENTINEL:
        return {
            "exam_sessions": {
                "scheduled_session_id": None,
                "session_mode": "PRACTICE",
            }
        }
    return {"exam_sessions": {"scheduled_session_id": run_id}}


async def assert_run_belongs_to_test(
    run_id: Optional[str],
    test_definition_id: str,
) -> None:
    """Reject a ``run_id`` that doesn't belong to the requested test.

    No-op when ``run_id`` is the combined or practice sentinel — those are
    not tenant-scoped (practice covers the whole test by definition).

    Raises 404 (not 403) when the run exists but belongs to a different
    test definition — we don't want to leak whether the UUID is valid
    elsewhere in the system.
    """
    if is_combined(run_id) or run_id == PRACTICE_SENTINEL:
        return
    record = await prisma.scheduled_exam_sessions.find_unique(where={"id": run_id})
    if not record or record.test_definition_id != test_definition_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run not found for this test.",
        )


async def assert_test_access(test_definition_id: str, current_user) -> Any:
    """Per-test ownership check shared by grading + analytics drill-ins.

    ADMINs see all. CONSTRUCTORs see only tests they created. Returns the
    loaded test definition so the caller can avoid a second lookup.

    Mirrors the long-standing private ``_require_test_access`` in
    ``api/endpoints/analytics.py`` — kept consistent intentionally so the
    grading and analytics runs endpoints share one authorization model.
    """
    from app.models.user import UserRole  # local import — avoids circular deps

    test_definition = await prisma.test_definitions.find_unique(
        where={"id": test_definition_id}
    )
    if not test_definition:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Test not found."
        )
    if (
        current_user.role != UserRole.ADMIN.value
        and test_definition.created_by != current_user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this test.",
        )
    return test_definition
