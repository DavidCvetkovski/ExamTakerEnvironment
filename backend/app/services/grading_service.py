"""
Core auto-grading engine and session result aggregation.

This module is called after a student submits their exam and handles:
1. Reconstructing each answer from interaction events.
2. Scoring MCQ and Multiple Response questions automatically.
3. Creating question_grade records for every question.
4. Computing a session_result aggregate.
"""
import csv
import io
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException, status
from prisma import Json

from app.core.prisma_db import prisma
from app.models.question_grade import GradingStatus
from app.models.user import UserRole


# ─────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────

def _parse_json(value: Any) -> Any:
    """Safely parse a value that may already be a dict/list or still JSON string."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError):
            return {}
    return value or {}


def _get_correct_options(options: Any) -> List[int]:
    """
    Return indices of all options whose is_correct flag is True.
    options is either a JSON string or a list of dicts with an ``is_correct`` key.
    """
    opts_list = _parse_json(options)
    if not isinstance(opts_list, list):
        opts_list = opts_list.get("options", [])
    return [i for i, opt in enumerate(opts_list) if opt.get("is_correct", False)]


def _get_scoring_config(test_definition: Any) -> Dict[str, Any]:
    """Safely deserialise the scoring_config JSONB column."""
    raw = getattr(test_definition, "scoring_config", None)
    cfg = _parse_json(raw) if raw else {}
    # Apply project-wide defaults
    defaults = {
        "pass_percentage": 55.0,
        "negative_marking": False,
        "negative_marking_penalty": 0.25,
        "multiple_response_strategy": "PARTIAL_CREDIT",
        "grade_boundaries": _default_grade_boundaries(),
        "essay_points": {},
    }
    return {**defaults, **cfg}


def _default_grade_boundaries() -> List[Dict[str, Any]]:
    return [
        {"min_percentage": 55.0, "grade": "Pass"},
        {"min_percentage": 0.0, "grade": "Fail"},
    ]


def apply_grade_boundaries(
    percentage: float, boundaries: List[Dict[str, Any]]
) -> Tuple[str, bool]:
    """
    Map a percentage score to a letter grade and pass/fail.
    Boundaries are sorted descending by min_percentage; first match wins.
    """
    sorted_bounds = sorted(boundaries, key=lambda b: b["min_percentage"], reverse=True)
    for boundary in sorted_bounds:
        if percentage >= boundary["min_percentage"]:
            grade = boundary["grade"]
            passed = grade.lower() not in ("fail", "f")
            return grade, passed
    return "Fail", False


# ─────────────────────────────────────────────
# Scoring functions
# ─────────────────────────────────────────────

def grade_mcq_single(
    student_answer: Dict[str, Any],
    correct_indices: List[int],
    negative_marking: bool = False,
    penalty: float = 0.25,
) -> Tuple[float, bool]:
    """
    Score a single-answer MCQ.

    Returns:
        (points_awarded, is_correct)
    """
    selected = student_answer.get("selected_option_index")
    if selected is None:
        return 0.0, False

    if selected in correct_indices:
        return 1.0, True

    if negative_marking:
        return max(0.0 - penalty, -1.0), False

    return 0.0, False


def grade_multiple_response(
    student_answer: Dict[str, Any],
    correct_indices: List[int],
    strategy: str = "PARTIAL_CREDIT",
    negative_marking: bool = False,
    penalty: float = 0.25,
    points_possible: float = 1.0,
) -> Tuple[float, bool]:
    """
    Score a multiple-response (checkbox) question.

    ALL_OR_NOTHING: 1.0 only if the exact correct set is chosen.
    PARTIAL_CREDIT: proportional credit per correct option selected,
                    minus deduction per incorrectly selected option (min 0).

    Returns:
        (points_awarded, is_correct)
    """
    selected: List[int] = student_answer.get("selected_option_indices", [])
    selected_set = set(selected)
    correct_set = set(correct_indices)

    if strategy == "ALL_OR_NOTHING":
        is_correct = selected_set == correct_set
        return (points_possible, True) if is_correct else (0.0, False)

    # PARTIAL_CREDIT: each correct option is worth (points_possible / total_correct)
    if not correct_set:
        return 0.0, False

    per_option = points_possible / len(correct_set)
    correct_selected = len(selected_set & correct_set)
    wrong_selected = len(selected_set - correct_set)

    raw_points = (correct_selected * per_option) - (wrong_selected * per_option if negative_marking else 0)
    points = max(0.0, min(raw_points, points_possible))
    is_correct = selected_set == correct_set

    return round(points, 2), is_correct


# ─────────────────────────────────────────────
# Main auto-grading entry point
# ─────────────────────────────────────────────

async def auto_grade_session(session_id: UUID) -> Dict[str, Any]:
    """
    Called immediately after successful exam submission.

    Steps:
    1. Load the session with frozen items.
    2. Reconstruct final answers from interaction events.
    3. Score each objective question (MCQ / Multiple Response).
    4. Bulk-insert question_grade rows.
    5. Create or update session_result aggregate.

    Returns:
        { "graded": int, "pending_manual": int, "total_points": float }
    """
    session = await prisma.exam_sessions.find_unique(
        where={"id": str(session_id)},
        include={"test_definitions": True},
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    test_definition = session.test_definitions
    scoring_config = _get_scoring_config(test_definition)

    # Load frozen items from snapshot
    items_raw = _parse_json(session.items)
    if not isinstance(items_raw, list):
        items_raw = []

    # Reconstruct latest answers from interaction events (most recent per LO)
    answer_events = await prisma.interaction_events.find_many(
        where={"session_id": str(session_id), "event_type": "ANSWER_CHANGE"},
        order={"created_at": "asc"},
    )
    latest_answers: Dict[str, Dict[str, Any]] = {}
    for event in answer_events:
        if event.learning_object_id:
            latest_answers[event.learning_object_id] = _parse_json(event.payload)

    # Grade each item
    grade_records: List[Dict[str, Any]] = []
    total_points = 0.0
    max_points = 0.0
    auto_graded = 0
    pending_manual = 0
    now = datetime.now(timezone.utc)

    for item in items_raw:
        lo_id = str(item.get("learning_object_id", ""))
        iv_id = str(item.get("item_version_id", ""))
        question_type = item.get("question_type", "")
        options = item.get("options", {})
        student_answer = latest_answers.get(lo_id, {})

        correct_indices = _get_correct_options(options)

        if question_type == "MULTIPLE_CHOICE":
            points_possible = 1.0
            pts, is_correct = grade_mcq_single(
                student_answer,
                correct_indices,
                negative_marking=scoring_config.get("negative_marking", False),
                penalty=scoring_config.get("negative_marking_penalty", 0.25),
            )
            grade_records.append({
                "session_id": str(session_id),
                "learning_object_id": lo_id,
                "item_version_id": iv_id,
                "points_awarded": pts,
                "points_possible": points_possible,
                "is_correct": is_correct,
                "is_auto_graded": True,
                "student_answer": Json(student_answer),
                "correct_answer": Json({"correct_indices": correct_indices}),
                "created_at": now,
            })
            total_points += pts
            max_points += points_possible
            auto_graded += 1

        elif question_type == "MULTIPLE_RESPONSE":
            points_possible = 1.0
            pts, is_correct = grade_multiple_response(
                student_answer,
                correct_indices,
                strategy=scoring_config.get("multiple_response_strategy", "PARTIAL_CREDIT"),
                negative_marking=scoring_config.get("negative_marking", False),
                penalty=scoring_config.get("negative_marking_penalty", 0.25),
                points_possible=points_possible,
            )
            grade_records.append({
                "session_id": str(session_id),
                "learning_object_id": lo_id,
                "item_version_id": iv_id,
                "points_awarded": pts,
                "points_possible": points_possible,
                "is_correct": is_correct,
                "is_auto_graded": True,
                "student_answer": Json(student_answer),
                "correct_answer": Json({"correct_indices": correct_indices}),
                "created_at": now,
            })
            total_points += pts
            max_points += points_possible
            auto_graded += 1

        elif question_type == "ESSAY":
            # Get essay points from scoring_config or default to 10
            essay_pts_map = scoring_config.get("essay_points", {})
            points_possible = float(essay_pts_map.get(lo_id, 10.0))
            grade_records.append({
                "session_id": str(session_id),
                "learning_object_id": lo_id,
                "item_version_id": iv_id,
                "points_awarded": 0.0,
                "points_possible": points_possible,
                "is_correct": None,
                "is_auto_graded": False,
                "student_answer": Json(student_answer),
                "created_at": now,
            })
            max_points += points_possible
            pending_manual += 1

    # Upsert question_grades (skip if already exist to avoid race conditions)
    if grade_records:
        await prisma.question_grades.delete_many(where={"session_id": str(session_id)})
        await prisma.question_grades.create_many(
            data=grade_records,
            skip_duplicates=True,
        )

    # Determine overall grading status
    questions_total = auto_graded + pending_manual
    questions_graded = auto_graded
    if pending_manual == 0:
        grading_status = GradingStatus.AUTO_GRADED.value if auto_graded > 0 else GradingStatus.UNGRADED.value
    else:
        grading_status = GradingStatus.PARTIALLY_GRADED.value

    # Compute percentage and grade
    percentage = round((total_points / max_points * 100), 2) if max_points > 0 else 0.0
    boundaries = scoring_config.get("grade_boundaries", _default_grade_boundaries())
    letter_grade, passed = apply_grade_boundaries(percentage, boundaries)

    # Create or update session_result
    existing = await prisma.session_results.find_unique(
        where={"session_id": str(session_id)}
    )
    result_data = {
        "session_id": str(session_id),
        "test_definition_id": str(session.test_definition_id),
        "student_id": str(session.student_id),
        "total_points": round(total_points, 2),
        "max_points": round(max_points, 2),
        "percentage": percentage,
        "grading_status": grading_status,
        "questions_graded": questions_graded,
        "questions_total": questions_total,
        "letter_grade": letter_grade,
        "passed": passed,
    }
    if existing:
        await prisma.session_results.update(
            where={"session_id": str(session_id)},
            data={**result_data, "updated_at": now},
        )
    else:
        await prisma.session_results.create(data={**result_data, "is_published": False, "created_at": now})

    return {
        "graded": auto_graded,
        "pending_manual": pending_manual,
        "total_points": round(total_points, 2),
        "max_points": round(max_points, 2),
        "grading_status": grading_status,
    }


async def compute_session_aggregate(session_id: str) -> None:
    """
    Recompute and persist the session_result aggregate from question_grades.
    Called after each manual grade update.
    """
    session = await prisma.exam_sessions.find_unique(
        where={"id": session_id},
        include={"test_definitions": True},
    )
    if not session:
        return

    scoring_config = _get_scoring_config(session.test_definitions)
    grades = await prisma.question_grades.find_many(
        where={"session_id": session_id}
    )

    total_points = sum(g.points_awarded for g in grades)
    max_points = sum(g.points_possible for g in grades)
    questions_total = len(grades)
    questions_graded = sum(
        1 for g in grades if g.is_correct is not None or (not g.is_auto_graded and g.points_awarded >= 0 and g.feedback is not None)
    )
    pending = sum(1 for g in grades if not g.is_auto_graded and g.is_correct is None and g.feedback is None)

    if pending == 0 and questions_total > 0:
        grading_status = GradingStatus.FULLY_GRADED.value
    elif pending < questions_total:
        grading_status = GradingStatus.PARTIALLY_GRADED.value
    else:
        grading_status = GradingStatus.UNGRADED.value

    percentage = round((total_points / max_points * 100), 2) if max_points > 0 else 0.0
    boundaries = scoring_config.get("grade_boundaries", _default_grade_boundaries())
    letter_grade, passed = apply_grade_boundaries(percentage, boundaries)

    now = datetime.now(timezone.utc)
    await prisma.session_results.upsert(
        where={"session_id": session_id},
        data={
            "create": {
                "session_id": session_id,
                "test_definition_id": str(session.test_definition_id),
                "student_id": str(session.student_id),
                "total_points": round(total_points, 2),
                "max_points": round(max_points, 2),
                "percentage": percentage,
                "grading_status": grading_status,
                "questions_graded": questions_graded,
                "questions_total": questions_total,
                "letter_grade": letter_grade,
                "passed": passed,
                "is_published": False,
                "created_at": now,
            },
            "update": {
                "total_points": round(total_points, 2),
                "max_points": round(max_points, 2),
                "percentage": percentage,
                "grading_status": grading_status,
                "questions_graded": questions_graded,
                "questions_total": questions_total,
                "letter_grade": letter_grade,
                "passed": passed,
                "updated_at": now,
            },
        },
    )
