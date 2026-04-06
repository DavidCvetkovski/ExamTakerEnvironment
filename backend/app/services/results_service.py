"""
Results publication, manual grading, and CSV export service.
"""
import csv
import io
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.models.question_grade import GradingStatus
from app.models.user import UserRole
from app.services.grading_service import compute_session_aggregate


def _parse_json(value: Any) -> Any:
    """Safely parse a value that may already be a dict/list or JSON string."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError):
            return {}
    return value or {}


def _sanitize_csv_cell(value: str) -> str:
    """
    Prevent CSV injection by prefixing formula-starting characters.
    https://owasp.org/www-community/attacks/CSV_Injection
    """
    if value and value[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


# ─────────────────────────────────────────────
# Grading dashboard / overview
# ─────────────────────────────────────────────

async def get_grading_overview(
    test_definition_id: str,
) -> List[Dict[str, Any]]:
    """
    List all submitted exam sessions for a test definition,
    with grading progress information from session_results.
    """
    # Get all submitted sessions for this test
    sessions = await prisma.exam_sessions.find_many(
        where={
            "test_definition_id": test_definition_id,
            "status": "SUBMITTED",
        },
        order={"submitted_at": "desc"},
        include={"users": True},
    )

    overview = []
    for sess in sessions:
        result = await prisma.session_results.find_unique(
            where={"session_id": sess.id}
        )
        overview.append({
            "session_id": sess.id,
            "student_id": sess.student_id,
            "student_email": sess.users.email if sess.users else None,
            "student_vunet_id": sess.users.vunet_id if sess.users else None,
            "submitted_at": sess.submitted_at,
            "grading_status": result.grading_status if result else GradingStatus.UNGRADED.value,
            "questions_graded": result.questions_graded if result else 0,
            "questions_total": result.questions_total if result else 0,
            "total_points": result.total_points if result else 0.0,
            "max_points": result.max_points if result else 0.0,
            "percentage": result.percentage if result else 0.0,
            "is_published": result.is_published if result else False,
        })
    return overview


async def get_grading_queue(
    test_definition_id: str,
    question_lo_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Return ungraded essay question_grade records (across all sessions for a test).
    If question_lo_id is specified, returns all responses for that specific question
    (useful for "grade by question" batch workflow).
    """
    where_filter: Dict[str, Any] = {
        "is_auto_graded": False,
        "feedback": None,
        "exam_sessions": {"test_definition_id": test_definition_id},
    }
    if question_lo_id:
        where_filter["learning_object_id"] = question_lo_id

    grades = await prisma.question_grades.find_many(
        where=where_filter,
        order={"created_at": "asc"},
    )

    return [
        {
            "grade_id": g.id,
            "session_id": g.session_id,
            "learning_object_id": g.learning_object_id,
            "item_version_id": g.item_version_id,
            "student_answer": _parse_json(g.student_answer),
            "points_possible": g.points_possible,
            "points_awarded": g.points_awarded,
            "feedback": g.feedback,
        }
        for g in grades
    ]


# ─────────────────────────────────────────────
# Manual grading
# ─────────────────────────────────────────────

async def submit_manual_grade(
    grade_id: str,
    grader_id: str,
    points_awarded: float,
    feedback: Optional[str],
    rubric_data: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Apply a manual grade to an essay question_grade record,
    then recompute the session aggregate.

    Raises:
        404 if grade not found.
        400 if points_awarded > points_possible.
    """
    grade = await prisma.question_grades.find_unique(where={"id": grade_id})
    if not grade:
        raise HTTPException(status_code=404, detail="Grade record not found.")

    if points_awarded > grade.points_possible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"points_awarded ({points_awarded}) exceeds points_possible ({grade.points_possible}).",
        )
    if points_awarded < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="points_awarded cannot be negative.",
        )

    now = datetime.now(timezone.utc)

    from prisma import Json
    update_data = {
        "points_awarded": points_awarded,
        "is_correct": points_awarded >= grade.points_possible,
        "graded_by": grader_id,
        "is_auto_graded": False,
        "feedback": feedback,
        "updated_at": now,
    }
    if rubric_data is not None:
        update_data["rubric_data"] = Json(rubric_data)

    updated = await prisma.question_grades.update(
        where={"id": grade_id},
        data=update_data,
    )

    # Recompute session aggregate
    await compute_session_aggregate(grade.session_id)

    return {
        "grade_id": updated.id,
        "session_id": updated.session_id,
        "points_awarded": updated.points_awarded,
        "points_possible": updated.points_possible,
        "feedback": updated.feedback,
    }


# ─────────────────────────────────────────────
# Publication
# ─────────────────────────────────────────────

async def publish_results(
    test_definition_id: str, publisher_id: str
) -> Dict[str, Any]:
    """
    Publish all FULLY_GRADED session results for a test.
    Raises 409 if any session is still partially or un-graded.
    """
    results = await prisma.session_results.find_many(
        where={"test_definition_id": test_definition_id, "is_published": False}
    )
    if not results:
        return {"published": 0, "message": "No unpublished results found."}

    # Check for incomplete grading
    incomplete = [
        r for r in results
        if r.grading_status in (GradingStatus.UNGRADED.value, GradingStatus.PARTIALLY_GRADED.value)
    ]
    if incomplete:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{len(incomplete)} session(s) are not fully graded yet. "
                "Complete manual grading before publishing."
            ),
        )

    now = datetime.now(timezone.utc)
    session_ids = [r.session_id for r in results]
    await prisma.session_results.update_many(
        where={"session_id": {"in": session_ids}},
        data={
            "is_published": True,
            "published_at": now,
            "published_by": publisher_id,
            "updated_at": now,
        },
    )
    return {"published": len(session_ids)}


async def unpublish_results(test_definition_id: str) -> Dict[str, Any]:
    """Retract published results (e.g., for grade corrections). Admin only."""
    now = datetime.now(timezone.utc)
    updated = await prisma.session_results.update_many(
        where={"test_definition_id": test_definition_id, "is_published": True},
        data={"is_published": False, "published_at": None, "published_by": None, "updated_at": now},
    )
    return {"unpublished": updated}


# ─────────────────────────────────────────────
# CSV export
# ─────────────────────────────────────────────

async def export_results_csv(test_definition_id: str) -> str:
    """
    Generate CSV content for all published session results of a test.
    Uses UTF-8 BOM for Excel compatibility.
    Returns a CSV string (caller wraps in StreamingResponse).
    """
    results = await prisma.session_results.find_many(
        where={"test_definition_id": test_definition_id},
        include={"students": True},
        order={"students": {"email": "asc"}},
    )

    output = io.StringIO()
    # UTF-8 BOM for Excel compatibility
    output.write("\ufeff")

    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    writer.writerow([
        "email", "vunet_id", "total_points", "max_points",
        "percentage", "letter_grade", "passed", "grading_status",
    ])

    for r in results:
        student = r.students
        writer.writerow([
            _sanitize_csv_cell(student.email if student else ""),
            _sanitize_csv_cell(student.vunet_id or "" if student else ""),
            str(r.total_points),
            str(r.max_points),
            str(r.percentage),
            _sanitize_csv_cell(r.letter_grade or ""),
            "Yes" if r.passed else "No",
            r.grading_status,
        ])

    return output.getvalue()


# ─────────────────────────────────────────────
# Student-facing result views
# ─────────────────────────────────────────────

async def get_student_published_results(student_id: str) -> List[Dict[str, Any]]:
    """Return all published results for a specific student."""
    results = await prisma.session_results.find_many(
        where={"student_id": student_id, "is_published": True},
        include={"test_definitions": True},
        order={"created_at": "desc"},
    )
    return [
        {
            "session_id": r.session_id,
            "test_title": r.test_definitions.title if r.test_definitions else None,
            "total_points": r.total_points,
            "max_points": r.max_points,
            "percentage": r.percentage,
            "letter_grade": r.letter_grade,
            "passed": r.passed,
            "published_at": r.published_at,
        }
        for r in results
    ]


async def get_student_result_detail(
    session_id: str, student_id: str
) -> Dict[str, Any]:
    """
    Return a detailed per-question result for a student's exam session.
    Only available if the result is published.

    Raises:
        403 if not published or not owned by student.
        404 if result not found.
    """
    result = await prisma.session_results.find_unique(
        where={"session_id": session_id},
        include={"test_definitions": True},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Result not found.")

    if result.student_id != student_id:
        raise HTTPException(status_code=403, detail="Not authorized.")

    if not result.is_published:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Results are not yet published.",
        )

    session = await prisma.exam_sessions.find_unique(where={"id": session_id})
    grades = await prisma.question_grades.find_many(
        where={"session_id": session_id},
        order={"created_at": "asc"},
    )

    # Build frozen item lookup for question content
    items_raw = _parse_json(session.items) if session else []
    items_by_lo: Dict[str, Any] = {
        str(item.get("learning_object_id")): item for item in items_raw
    }

    question_details = []
    for grade in grades:
        lo_id = str(grade.learning_object_id or "")
        item = items_by_lo.get(lo_id, {})
        question_details.append({
            "grade_id": grade.id,
            "learning_object_id": lo_id,
            "item_version_id": str(grade.item_version_id or ""),
            "question_type": item.get("question_type"),
            "question_content": item.get("content"),
            "question_options": _parse_json(item.get("options")),
            "student_answer": _parse_json(grade.student_answer),
            "correct_answer": _parse_json(grade.correct_answer),
            "points_awarded": grade.points_awarded,
            "points_possible": grade.points_possible,
            "is_correct": grade.is_correct,
            "is_auto_graded": grade.is_auto_graded,
            "feedback": grade.feedback,
        })

    return {
        "session_id": session_id,
        "test_title": result.test_definitions.title if result.test_definitions else None,
        "submitted_at": session.submitted_at if session else None,
        "total_points": result.total_points,
        "max_points": result.max_points,
        "percentage": result.percentage,
        "letter_grade": result.letter_grade,
        "passed": result.passed,
        "grading_status": result.grading_status,
        "question_results": question_details,
    }
