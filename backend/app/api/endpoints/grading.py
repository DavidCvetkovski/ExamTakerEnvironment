"""
Grading API endpoints.
Handles auto-grading outcomes, manual essay grading, result publication, and CSV export.
All endpoints enforce RBAC at the route level.
"""
import io
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.dependencies import get_current_user, require_role
from app.models.user import UserRole
from app.schemas.grading import (
    ManualGradeSubmit,
    ScoringConfigUpdate,
    SessionGradingSummary,
)
from app.services import grading_service, results_service
from app.services.run_filter import assert_run_belongs_to_test, assert_test_access

router = APIRouter()


def _require_instructor_or_admin(current_user=Depends(get_current_user)):
    """Dependency: ensures only ADMIN or CONSTRUCTOR can access."""
    if current_user.role not in (UserRole.ADMIN.value, UserRole.CONSTRUCTOR.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires ADMIN or CONSTRUCTOR role.",
        )
    return current_user


def _require_admin(current_user=Depends(get_current_user)):
    """Dependency: ensures only ADMIN can access."""
    if current_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires ADMIN role.",
        )
    return current_user


# ─────────────────────────────────────────────
# Session-level grade inspection (instructor)
# ─────────────────────────────────────────────

@router.get("/sessions/{session_id}/grades", summary="Get all question grades for a session")
async def get_session_grades(
    session_id: UUID,
    current_user=Depends(_require_instructor_or_admin),
) -> List[Dict[str, Any]]:
    """
    Fetch all question_grade records for a submitted session.
    Returns per-question scores, answers, auto-graded flags, and feedback.
    """
    from app.core.prisma_db import prisma
    session = await prisma.exam_sessions.find_unique(where={"id": str(session_id)})
    # Ownership: a CONSTRUCTOR may only read grades for tests they created (ADMIN
    # sees all). Without this, role alone leaked student answers + feedback across
    # tenants. (Epoch 14 audit H-10.)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    await assert_test_access(str(session.test_definition_id), current_user)
    grades = await prisma.question_grades.find_many(
        where={"session_id": str(session_id)},
        order={"created_at": "asc"},
    )

    items_raw = session.items if session else []
    if isinstance(items_raw, str):
        import json
        try:
            items_raw = json.loads(items_raw)
        except json.JSONDecodeError:
            items_raw = []
    if not isinstance(items_raw, list):
        items_raw = []

    items_by_learning_object = {
        str(item.get("learning_object_id")): item
        for item in items_raw
        if isinstance(item, dict) and item.get("learning_object_id")
    }

    return [
        {
            "id": g.id,
            "session_id": g.session_id,
            "learning_object_id": g.learning_object_id,
            "item_version_id": g.item_version_id,
            "question_type": items_by_learning_object.get(str(g.learning_object_id), {}).get("question_type"),
            "question_content": items_by_learning_object.get(str(g.learning_object_id), {}).get("content"),
            "question_options": items_by_learning_object.get(str(g.learning_object_id), {}).get("options"),
            "points_awarded": g.points_awarded,
            "points_possible": g.points_possible,
            "is_correct": g.is_correct,
            "is_auto_graded": g.is_auto_graded,
            "feedback": g.feedback,
            "rubric_data": g.rubric_data,
            "student_answer": g.student_answer,
            "correct_answer": g.correct_answer,
            "created_at": g.created_at,
            "updated_at": g.updated_at,
        }
        for g in grades
    ]


@router.get("/sessions/{session_id}/result", summary="Get the aggregated session result")
async def get_session_result(
    session_id: UUID,
    current_user=Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Fetch the aggregated result for a session.
    - ADMIN / CONSTRUCTOR: always visible.
    - STUDENT: only visible if result is published.
    """
    from app.core.prisma_db import prisma

    result = await prisma.session_results.find_unique(
        where={"session_id": str(session_id)},
        include={"test_definitions": True},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Result not yet available.")

    is_instructor = current_user.role in (UserRole.ADMIN.value, UserRole.CONSTRUCTOR.value)
    is_student = current_user.role == UserRole.STUDENT.value

    if is_student:
        if result.student_id != str(current_user.id):
            raise HTTPException(status_code=403, detail="Not authorized.")
        if not result.is_published:
            raise HTTPException(
                status_code=403, detail="Results are not yet published."
            )

    return {
        "id": result.id,
        "session_id": result.session_id,
        "test_definition_id": result.test_definition_id,
        "test_title": result.test_definitions.title if result.test_definitions else None,
        "student_id": result.student_id,
        "total_points": result.total_points,
        "max_points": result.max_points,
        "percentage": result.percentage,
        "grading_status": result.grading_status,
        "questions_graded": result.questions_graded,
        "questions_total": result.questions_total,
        "letter_grade": result.letter_grade,
        "passed": result.passed,
        "is_published": result.is_published,
        "published_at": result.published_at,
    }


# ─────────────────────────────────────────────
# Manual grading
# ─────────────────────────────────────────────

@router.patch("/grades/{grade_id}", summary="Submit or update a manual grade")
async def update_manual_grade(
    grade_id: UUID,
    payload: ManualGradeSubmit,
    current_user=Depends(_require_instructor_or_admin),
) -> Dict[str, Any]:
    """
    Submit a manual grade for an essay question.
    After saving, recalculates the session result aggregate.
    """
    return await results_service.submit_manual_grade(
        grade_id=str(grade_id),
        grader_id=str(current_user.id),
        points_awarded=payload.points_awarded,
        feedback=payload.feedback,
        rubric_data=payload.rubric_data,
    )


# ─────────────────────────────────────────────
# Grading overview / queue (instructor dashboard)
# ─────────────────────────────────────────────

@router.get("/sessions", summary="All submitted sessions across owned blueprints")
async def list_grading_sessions(
    current_user=Depends(_require_instructor_or_admin),
) -> List[Dict[str, Any]]:
    """
    List all SUBMITTED exam sessions for blueprints the caller created (admin: all blueprints).
    Includes ungraded_response_count. Sorted: ungraded DESC, submitted_at DESC.
    """
    from app.models.user import UserRole as _Role
    is_admin = current_user.role == _Role.ADMIN.value
    return await results_service.get_all_grading_sessions(
        user_id=str(current_user.id),
        is_admin=is_admin,
    )


@router.get("/tests/{test_definition_id}/runs", summary="Per-run grading aggregates")
async def get_grading_runs(
    test_definition_id: UUID,
    current_user=Depends(_require_instructor_or_admin),
) -> List[Dict[str, Any]]:
    """
    List per-scheduled-session grading aggregates for a test.

    Each row carries lifecycle status, submission count, ungraded response
    count, and an ``is_gradable`` flag (true once the window has closed
    and there is at least one submission to review). A synthetic
    ``run_id="practice"`` bucket is appended when practice submissions exist.
    """
    await assert_test_access(str(test_definition_id), current_user)
    return await results_service.get_grading_runs(str(test_definition_id))


@router.get("/tests/{test_definition_id}/grading-overview", summary="Grading progress overview")
async def get_grading_overview(
    test_definition_id: UUID,
    run_id: Optional[str] = Query(default=None, description="Scoped to one scheduled run, 'practice', or 'combined' / omit for all."),
    current_user=Depends(_require_instructor_or_admin),
) -> List[Dict[str, Any]]:
    """List all submitted sessions for a test with per-session grading progress.

    When ``run_id`` is set to a scheduled-session UUID or the ``"practice"``
    sentinel, results are narrowed to that bucket. Cross-tenant ``run_id``
    is rejected with 404 by ``assert_run_belongs_to_test``.
    """
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    return await results_service.get_grading_overview(
        str(test_definition_id), run_id=run_id,
    )


@router.get("/tests/{test_definition_id}/grading-queue", summary="Get ungraded essay queue")
async def get_grading_queue(
    test_definition_id: UUID,
    question_lo_id: Optional[str] = Query(default=None),
    run_id: Optional[str] = Query(default=None, description="Scoped to one scheduled run, 'practice', or 'combined' / omit for all."),
    current_user=Depends(_require_instructor_or_admin),
) -> List[Dict[str, Any]]:
    """
    Get all ungraded essay question records for a test.
    If ?question_lo_id=<UUID> is provided, filters to one specific question
    (useful for "grade by question" batch workflow). ``run_id`` further
    narrows to a specific scheduled run or the practice bucket.
    """
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    return await results_service.get_grading_queue(
        test_definition_id=str(test_definition_id),
        question_lo_id=question_lo_id,
        run_id=run_id,
    )


# ─────────────────────────────────────────────
# Grade publication  (admin only)
# ─────────────────────────────────────────────

class PublishRequest(BaseModel):
    details_visible: bool = True


class CutScoreRequest(BaseModel):
    cut_score: float


@router.patch("/tests/{test_definition_id}/cut-score", summary="Set the pass cut score for a test")
async def set_cut_score(
    test_definition_id: UUID,
    payload: CutScoreRequest,
    current_user=Depends(_require_admin),
) -> Dict[str, Any]:
    """Persist the pass threshold and re-derive pass/fail for all results."""
    return await results_service.set_test_cut_score(
        test_definition_id=str(test_definition_id),
        cut_score=payload.cut_score,
    )


@router.post("/tests/{test_definition_id}/publish-results", summary="Publish results for a test")
async def publish_results(
    test_definition_id: UUID,
    payload: Optional[PublishRequest] = None,
    current_user=Depends(_require_admin),
) -> Dict[str, Any]:
    """
    Publish all fully-graded session results for a test.
    Raises 409 if any session is still partially or un-graded.
    Students can only see their results after publication; ``details_visible``
    controls whether they can inspect the per-question breakdown or only the grade.
    """
    return await results_service.publish_results(
        test_definition_id=str(test_definition_id),
        publisher_id=str(current_user.id),
        details_visible=(payload.details_visible if payload else True),
    )


@router.post("/tests/{test_definition_id}/unpublish-results", summary="Retract published results")
async def unpublish_results(
    test_definition_id: UUID,
    current_user=Depends(_require_admin),
) -> Dict[str, Any]:
    """Retract published results (e.g. for grade corrections). Admin only."""
    return await results_service.unpublish_results(str(test_definition_id))


# ─────────────────────────────────────────────
# CSV export (admin only)
# ─────────────────────────────────────────────

@router.get("/tests/{test_definition_id}/export", summary="Export results as CSV")
async def export_results_csv(
    test_definition_id: UUID,
    current_user=Depends(_require_admin),
) -> StreamingResponse:
    """
    Download a UTF-8 BOM CSV of all session results for a test.
    Columns: email, vunet_id, total_points, max_points, percentage, letter_grade, passed.
    This format is compatible with Osiris (VU SIS).
    """
    csv_content = await results_service.export_results_csv(str(test_definition_id))
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=results_{test_definition_id}.csv"
        },
    )


# ─────────────────────────────────────────────
# Student-facing result views
# ─────────────────────────────────────────────

@router.get("/my-results", summary="Get my exam results")
async def get_my_results(
    include_unpublished: bool = False,
    current_user=Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """
    Student-facing: return exam results for the authenticated student.

    By default only published results are returned. Pass ``include_unpublished=true``
    to also surface submitted-but-not-yet-published sessions (for the My Grades tab).
    ADMIN / CONSTRUCTOR requesting this will get an empty list (they should use
    instructors' endpoints).
    """
    if current_user.role != UserRole.STUDENT.value:
        return []
    return await results_service.get_student_published_results(
        str(current_user.id),
        include_unpublished=include_unpublished,
    )


@router.get("/my-results/{session_id}", summary="Detailed result for one exam session")
async def get_my_result_detail(
    session_id: UUID,
    current_user=Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Student-facing: detailed per-question result breakdown for a session.
    Only returns if the result is published and belongs to the requesting student.
    """
    return await results_service.get_student_result_detail(
        session_id=str(session_id),
        student_id=str(current_user.id),
    )


# ─────────────────────────────────────────────
# Scoring config update (instructor)
# ─────────────────────────────────────────────

@router.patch("/tests/{test_definition_id}/scoring-config", summary="Update scoring config for a test")
async def update_scoring_config(
    test_definition_id: UUID,
    payload: ScoringConfigUpdate,
    current_user=Depends(_require_instructor_or_admin),
) -> Dict[str, Any]:
    """Update the grading configuration stored on the test definition."""
    from app.core.prisma_db import prisma
    from prisma import Json

    test_def = await prisma.test_definitions.find_unique(
        where={"id": str(test_definition_id)}
    )
    if not test_def:
        raise HTTPException(status_code=404, detail="Test definition not found.")

    config_dict = payload.model_dump(exclude_none=True)
    updated = await prisma.test_definitions.update(
        where={"id": str(test_definition_id)},
        data={"scoring_config": Json(config_dict)},
    )
    return {"scoring_config": config_dict}
