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
from app.models.scheduled_exam_session import CourseSessionStatus
from app.models.user import UserRole
from app.services.grading_service import compute_session_aggregate
from app.services.run_filter import (
    PRACTICE_SENTINEL,
    build_exam_session_run_filter,
)
from app.services.scheduled_sessions_service import ensure_utc


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
    run_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    List all submitted exam sessions for a test definition,
    with grading progress information from session_results.

    ``run_id`` narrows the result to one scheduled-session run, the
    practice bucket, or (default ``None`` / ``"combined"``) all submissions
    for the test. Caller must verify run ownership via
    :func:`app.services.run_filter.assert_run_belongs_to_test` first.
    """
    where: Dict[str, Any] = {
        "test_definition_id": test_definition_id,
        "status": "SUBMITTED",
        **build_exam_session_run_filter(run_id),
    }
    sessions = await prisma.exam_sessions.find_many(
        where=where,
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
            "scheduled_session_id": sess.scheduled_session_id,
            "session_mode": sess.session_mode,
            "grading_status": result.grading_status if result else GradingStatus.UNGRADED.value,
            "questions_graded": result.questions_graded if result else 0,
            "questions_total": result.questions_total if result else 0,
            "total_points": result.total_points if result else 0.0,
            "max_points": result.max_points if result else 0.0,
            "percentage": result.percentage if result else 0.0,
            "is_published": result.is_published if result else False,
        })
    return overview


async def get_grading_runs(test_definition_id: str) -> List[Dict[str, Any]]:
    """Per-run grading aggregates for a single test definition.

    Each row is one scheduled exam session (course-bound run) or — if any
    practice submissions exist — a single synthetic "practice" bucket.

    The lifecycle status is derived server-side from `now` vs the window so
    the frontend doesn't need to second-guess it (the Epoch 8.6 Stage 1
    primitives handle live ticking, but the picker page renders once on
    landing and benefits from the authoritative answer here).

    Sort order: gradable runs (CLOSED / CANCELED) first by ``ends_at`` desc,
    then ONGOING by ``ends_at`` asc, then SCHEDULED by ``starts_at`` asc,
    then practice last. Matches the visual prominence we want in the picker.

    Caller is responsible for ``assert_test_access(test_definition_id, user)``
    before invoking — this function does no authorization itself.
    """
    scheduled_runs = await prisma.scheduled_exam_sessions.find_many(
        where={"test_definition_id": test_definition_id},
        include={"courses": True},
        order={"starts_at": "asc"},
    )

    now = datetime.now(timezone.utc)
    rows: List[Dict[str, Any]] = []
    for run in scheduled_runs:
        if run.status == CourseSessionStatus.CANCELED.value:
            lifecycle = "CANCELED"
        else:
            starts_at = ensure_utc(run.starts_at)
            ends_at = ensure_utc(run.ends_at)
            if now >= ends_at:
                lifecycle = "CLOSED"
            elif now >= starts_at:
                lifecycle = "ACTIVE"
            else:
                lifecycle = "SCHEDULED"

        submissions_total = await prisma.exam_sessions.count(
            where={"scheduled_session_id": run.id, "status": "SUBMITTED"},
        )
        ungraded_count = await prisma.question_grades.count(
            where={
                "is_auto_graded": False,
                "feedback": None,
                "exam_sessions": {
                    "scheduled_session_id": run.id,
                    "status": "SUBMITTED",
                },
            }
        )
        # A run is gradable once its window is closed (or canceled with
        # submissions to review). ONGOING / SCHEDULED runs are listed for
        # situational awareness but disabled in the UI.
        is_gradable = lifecycle in ("CLOSED", "CANCELED") and submissions_total > 0

        rows.append({
            "run_id": run.id,
            "kind": "ASSIGNED",
            "course_id": run.course_id,
            "course_code": run.courses.code if run.courses else None,
            "course_title": run.courses.title if run.courses else None,
            "starts_at": run.starts_at,
            "ends_at": run.ends_at,
            "lifecycle_status": lifecycle,
            "submissions_total": submissions_total,
            "ungraded_response_count": ungraded_count,
            "is_gradable": is_gradable,
        })

    # Practice bucket — only surface it when at least one practice submission
    # exists for this test. Otherwise it just clutters the picker.
    practice_total = await prisma.exam_sessions.count(
        where={
            "test_definition_id": test_definition_id,
            "scheduled_session_id": None,
            "session_mode": "PRACTICE",
            "status": "SUBMITTED",
        }
    )
    if practice_total > 0:
        practice_ungraded = await prisma.question_grades.count(
            where={
                "is_auto_graded": False,
                "feedback": None,
                "exam_sessions": {
                    "test_definition_id": test_definition_id,
                    "scheduled_session_id": None,
                    "session_mode": "PRACTICE",
                    "status": "SUBMITTED",
                },
            }
        )
        rows.append({
            "run_id": PRACTICE_SENTINEL,
            "kind": "PRACTICE",
            "course_id": None,
            "course_code": None,
            "course_title": None,
            "starts_at": None,
            "ends_at": None,
            "lifecycle_status": "CLOSED",  # practice is always reviewable
            "submissions_total": practice_total,
            "ungraded_response_count": practice_ungraded,
            "is_gradable": True,
        })

    def _sort_key(row: Dict[str, Any]) -> tuple:
        # Lower tuple sorts earlier.
        order = {"CLOSED": 0, "CANCELED": 0, "ACTIVE": 1, "SCHEDULED": 2}.get(
            row["lifecycle_status"], 3,
        )
        if row["kind"] == "PRACTICE":
            order = 4  # always last
        # Within CLOSED/CANCELED bucket → most-recent ends_at first.
        ends_ts = -(row["ends_at"].timestamp()) if row["ends_at"] else 0
        starts_ts = row["starts_at"].timestamp() if row["starts_at"] else 0
        return (order, ends_ts, starts_ts)

    rows.sort(key=_sort_key)
    return rows


async def get_all_grading_sessions(
    user_id: str,
    is_admin: bool,
) -> List[Dict[str, Any]]:
    """
    List all SUBMITTED sessions across blueprints owned by user_id (or all for admins).
    Includes ungraded_response_count — number of manual-grading questions not yet graded.
    Sorted: ungraded DESC, submitted_at DESC.
    """
    if is_admin:
        test_defs = await prisma.test_definitions.find_many()
    else:
        test_defs = await prisma.test_definitions.find_many(
            where={"created_by": user_id},
        )

    if not test_defs:
        return []

    test_def_ids = [td.id for td in test_defs]
    test_def_map = {td.id: td.title for td in test_defs}

    sessions = await prisma.exam_sessions.find_many(
        where={"test_definition_id": {"in": test_def_ids}, "status": "SUBMITTED"},
        order={"submitted_at": "desc"},
        include={
            "users": True,
            "scheduled_exam_sessions": {"include": {"courses": True}},
        },
    )

    rows: List[Dict[str, Any]] = []
    for sess in sessions:
        sr = await prisma.session_results.find_unique(where={"session_id": sess.id})
        ungraded_count = await prisma.question_grades.count(
            where={"session_id": sess.id, "is_auto_graded": False, "feedback": None}
        )
        scheduled = sess.scheduled_exam_sessions
        rows.append({
            "session_id": sess.id,
            "test_definition_id": sess.test_definition_id,
            "test_title": test_def_map.get(sess.test_definition_id, "Unknown"),
            "student_id": sess.student_id,
            "student_email": sess.users.email if sess.users else None,
            "submitted_at": sess.submitted_at,
            "scheduled_session_id": sess.scheduled_session_id,
            "session_mode": sess.session_mode,
            "course_code": scheduled.courses.code if scheduled and scheduled.courses else None,
            "course_title": scheduled.courses.title if scheduled and scheduled.courses else None,
            "grading_status": sr.grading_status if sr else GradingStatus.UNGRADED.value,
            "questions_graded": sr.questions_graded if sr else 0,
            "questions_total": sr.questions_total if sr else 0,
            "ungraded_response_count": ungraded_count,
            "total_points": float(sr.total_points) if sr else 0.0,
            "max_points": float(sr.max_points) if sr else 0.0,
            "percentage": float(sr.percentage) if sr else 0.0,
            "is_published": sr.is_published if sr else False,
        })

    rows.sort(key=lambda x: (
        -x["ungraded_response_count"],
        -(x["submitted_at"].timestamp() if x["submitted_at"] else 0),
    ))
    return rows


async def get_grading_queue(
    test_definition_id: str,
    question_lo_id: Optional[str] = None,
    run_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Return ungraded essay question_grade records (across all sessions for a test).
    If question_lo_id is specified, returns all responses for that specific question
    (useful for "grade by question" batch workflow).

    ``run_id`` narrows the queue to one scheduled-session run (or the practice
    bucket). Caller must verify ownership via ``assert_run_belongs_to_test``.
    """
    exam_sessions_filter: Dict[str, Any] = {"test_definition_id": test_definition_id}
    exam_sessions_filter.update(build_exam_session_run_filter(run_id))

    where_filter: Dict[str, Any] = {
        "is_auto_graded": False,
        "feedback": None,
        "exam_sessions": exam_sessions_filter,
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

async def get_student_published_results(
    student_id: str,
    include_unpublished: bool = False,
) -> List[Dict[str, Any]]:
    """
    Return results for a specific student.

    By default returns only published results. When ``include_unpublished`` is true,
    submitted-but-unpublished session results are also included so the student-facing
    "My Grades" tab can surface a pending-grading section.
    """
    where: Dict[str, Any] = {"student_id": student_id}
    if not include_unpublished:
        where["is_published"] = True

    results = await prisma.session_results.find_many(
        where=where,
        include={"test_definitions": True, "exam_sessions": True},
        order={"created_at": "desc"},
    )
    return [
        {
            "session_id": r.session_id,
            "test_definition_id": r.test_definition_id,
            "test_title": r.test_definitions.title if r.test_definitions else None,
            "total_points": r.total_points,
            "max_points": r.max_points,
            "percentage": r.percentage,
            "letter_grade": r.letter_grade,
            "passed": r.passed,
            "grading_status": r.grading_status,
            "is_published": r.is_published,
            "published_at": r.published_at,
            "submitted_at": getattr(r.exam_sessions, "submitted_at", None) if getattr(r, "exam_sessions", None) else None,
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
