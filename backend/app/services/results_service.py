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
from app.services.grading_service import compute_session_aggregate
from app.services.run_filter import build_exam_session_run_filter
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

    ``run_id`` narrows the result to one scheduled-session run, or (default
    ``None`` / ``"combined"``) all ASSIGNED-mode submissions for the test.
    Practice-mode submissions are excluded by the combined filter — see
    :mod:`app.services.run_filter`. Caller must verify run ownership via
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

    Each row is one scheduled exam session (course-bound run). Practice
    submissions are excluded — they're author previews, not gradable
    student work.

    The lifecycle status is derived server-side from `now` vs the window so
    the frontend doesn't need to second-guess it (the Epoch 8.6 Stage 1
    primitives handle live ticking, but the picker page renders once on
    landing and benefits from the authoritative answer here).

    Sort order: gradable runs (CLOSED / CANCELED) first by ``ends_at`` desc,
    then ONGOING by ``ends_at`` asc, then SCHEDULED by ``starts_at`` asc.

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
                "is_correct": None,
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

    def _sort_key(row: Dict[str, Any]) -> tuple:
        # Lower tuple sorts earlier.
        order = {"CLOSED": 0, "CANCELED": 0, "ACTIVE": 1, "SCHEDULED": 2}.get(
            row["lifecycle_status"], 3,
        )
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
            where={"session_id": sess.id, "is_auto_graded": False, "is_correct": None}
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

    ``run_id`` narrows the queue to one scheduled-session run. Caller must
    verify ownership via ``assert_run_belongs_to_test``.
    """
    exam_sessions_filter: Dict[str, Any] = {"test_definition_id": test_definition_id}
    exam_sessions_filter.update(build_exam_session_run_filter(run_id))

    where_filter: Dict[str, Any] = {
        "is_auto_graded": False,
        "is_correct": None,
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

async def set_test_cut_score(test_definition_id: str, cut_score: float) -> Dict[str, Any]:
    """Persist the pass cut score for a test and re-derive pass/fail.

    Stores ``pass_percentage`` and a Pass/Fail boundary at ``cut_score`` on the
    test's ``scoring_config``, then recomputes every existing session_result's
    ``passed``/``letter_grade`` as ``percentage >= cut_score``.
    """
    if cut_score < 0 or cut_score > 100:
        raise HTTPException(status_code=400, detail="Cut score must be between 0 and 100.")

    test_definition = await prisma.test_definitions.find_unique(where={"id": test_definition_id})
    if not test_definition:
        raise HTTPException(status_code=404, detail="Test definition not found.")

    from prisma import Json
    raw = test_definition.scoring_config
    config = (json.loads(raw) if isinstance(raw, str) else raw) or {}
    if not isinstance(config, dict):
        config = {}
    config["pass_percentage"] = cut_score
    config["grade_boundaries"] = [
        {"min_percentage": float(cut_score), "grade": "Pass"},
        {"min_percentage": 0.0, "grade": "Fail"},
    ]
    await prisma.test_definitions.update(
        where={"id": test_definition_id},
        data={"scoring_config": Json(config)},
    )

    now = datetime.now(timezone.utc)
    passed_count = await prisma.session_results.update_many(
        where={"test_definition_id": test_definition_id, "percentage": {"gte": cut_score}},
        data={"passed": True, "letter_grade": "Pass", "updated_at": now},
    )
    failed_count = await prisma.session_results.update_many(
        where={"test_definition_id": test_definition_id, "percentage": {"lt": cut_score}},
        data={"passed": False, "letter_grade": "Fail", "updated_at": now},
    )
    return {"cut_score": cut_score, "passed": passed_count, "failed": failed_count}


async def publish_results(
    test_definition_id: str, publisher_id: str, details_visible: bool = True
) -> Dict[str, Any]:
    """
    Publish all FULLY_GRADED session results for a test.
    Raises 409 if any session is still partially or un-graded.

    ``details_visible`` controls whether students may inspect the per-question
    breakdown, or only see their grade.
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
            "details_visible": details_visible,
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


# Student-facing result views (the "My Grades" read path) live in
# ``student_results_service`` — split out in Epoch 15 (#28) so the student
# read path and the instructor grading workflow don't share a module.
