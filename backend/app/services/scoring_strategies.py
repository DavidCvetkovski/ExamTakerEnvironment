"""
Pure scoring functions for MCQ and multiple-response questions.

Zero database dependencies — every function here takes plain Python values
and returns plain Python values, making them independently unit-testable.
"""
import json
from typing import Any, Dict, List, Tuple

from app.core.json_utils import extract_choices, parse_json

__all__ = [
    "grade_mcq_single",
    "grade_multiple_response",
    "apply_grade_boundaries",
]


def _get_correct_options(options: Any) -> List[int]:
    """
    Return indices of all options whose is_correct flag is True.
    options is either a JSON string or a list of dicts with an ``is_correct`` key.
    """
    choices = extract_choices(options)

    return [
        index
        for index, option in enumerate(choices)
        if isinstance(option, dict) and option.get("is_correct", False)
    ]


def _normalize_student_answer(student_answer: Any, options: Any) -> Dict[str, Any]:
    """
    Prefer stable option IDs when available and derive snapshot-local indices from them.
    This keeps grading correct even if the answer payload contains stale indices.
    """
    if not isinstance(student_answer, dict):
        return {}

    normalized = dict(student_answer)
    choices = extract_choices(options)

    choice_id_to_index = {
        option.get("id"): index
        for index, option in enumerate(choices)
        if isinstance(option, dict) and option.get("id")
    }

    selected_option_id = normalized.get("selected_option_id")
    if isinstance(selected_option_id, str) and selected_option_id in choice_id_to_index:
        normalized["selected_option_index"] = choice_id_to_index[selected_option_id]

    selected_option_ids = normalized.get("selected_option_ids")
    if isinstance(selected_option_ids, list):
        normalized["selected_option_indices"] = [
            choice_id_to_index[option_id]
            for option_id in selected_option_ids
            if isinstance(option_id, str) and option_id in choice_id_to_index
        ]

    return normalized


def _default_grade_boundaries() -> List[Dict[str, Any]]:
    return [
        {"min_percentage": 55.0, "grade": "Pass"},
        {"min_percentage": 0.0, "grade": "Fail"},
    ]


def _get_scoring_config(test_definition: Any) -> Dict[str, Any]:
    """Safely deserialise the scoring_config JSONB column."""
    raw = getattr(test_definition, "scoring_config", None)
    cfg = parse_json(raw) if raw else {}
    defaults = {
        "pass_percentage": 55.0,
        "negative_marking": False,
        "negative_marking_penalty": 0.25,
        "multiple_response_strategy": "PARTIAL_CREDIT",
        "grade_boundaries": _default_grade_boundaries(),
        "essay_points": {},
    }
    return {**defaults, **cfg}


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

    if not correct_set:
        return 0.0, False

    per_option = points_possible / len(correct_set)
    correct_selected = len(selected_set & correct_set)
    wrong_selected = len(selected_set - correct_set)

    raw_points = (correct_selected * per_option) - (wrong_selected * per_option if negative_marking else 0)
    points = max(0.0, min(raw_points, points_possible))
    is_correct = selected_set == correct_set

    return round(points, 2), is_correct
