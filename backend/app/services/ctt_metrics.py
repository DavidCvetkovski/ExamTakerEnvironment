"""
Classical Test Theory (CTT) pure-function metrics.

Computes item-level statistics: point-biserial discrimination (D-value),
quality flags (P/D thresholds), and distractor-selection analysis.
All functions are database-free and independently unit-testable.
"""
import json
import math
from collections import defaultdict
from typing import Any, Dict, List, Optional

__all__ = [
    "point_biserial",
    "build_flags",
    "compute_distractor_stats",
]


def _parse_json(value: Any) -> Any:
    """Deserialise a value that may already be a dict/list or still a JSON string."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError):
            return {}
    return value or {}


def _parse_options(raw: Any) -> List[Dict]:
    """Normalise item options to a flat list of option dicts."""
    parsed = _parse_json(raw)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        return parsed.get("choices") or parsed.get("options") or []
    return []


def point_biserial(correct_flags: List[bool], scores: List[float]) -> Optional[float]:
    """
    Point-biserial correlation between a binary correct/incorrect vector and
    continuous overall-score vector.  Returns None when insufficient data.

    Formula: r_pb = (M_p - M_all) / S_all * sqrt(p * q)
    """
    n = len(correct_flags)
    if n < 2:
        return None
    n_p = sum(1 for c in correct_flags if c)
    n_q = n - n_p
    if n_p == 0 or n_q == 0:
        return None

    p = n_p / n
    mean_all = sum(scores) / n
    variance = sum((s - mean_all) ** 2 for s in scores) / n
    if variance == 0:
        return None

    std_all = math.sqrt(variance)
    correct_scores = [s for c, s in zip(correct_flags, scores) if c]
    mean_p = sum(correct_scores) / n_p

    r_pb = (mean_p - mean_all) / std_all * math.sqrt(p * (1 - p))
    return round(r_pb, 4)


def build_flags(p_value: Optional[float], d_value: Optional[float]) -> List[Dict]:
    """Return quality-flag dicts based on psychometric thresholds."""
    flags = []
    if p_value is not None:
        if p_value < 0.20:
            flags.append({
                "code": "TOO_HARD",
                "message": "P-value below 0.20 — item may be too difficult.",
            })
        elif p_value > 0.90:
            flags.append({
                "code": "TOO_EASY",
                "message": "P-value above 0.90 — item may be too easy.",
            })
    if d_value is not None and d_value < 0.15:
        flags.append({
            "code": "POOR_DISCRIMINATION",
            "message": "D-value below 0.15 — item does not effectively discriminate between high and low performers.",
        })
    return flags


def compute_distractor_stats(
    grades: List[Any],
    options: List[Dict],
    question_type: str,
) -> List[Dict]:
    """
    For MCQ/MR items, count how many students selected each option.
    Options with < 5% selection that are incorrect are flagged as non-functional.
    """
    if not grades or question_type not in ("MULTIPLE_CHOICE", "MULTIPLE_RESPONSE"):
        return []

    n_respondents = len(grades)
    counts: Dict[int, int] = defaultdict(int)

    for grade in grades:
        answer = _parse_json(grade.student_answer)
        if question_type == "MULTIPLE_CHOICE":
            idx = answer.get("selected_option_index")
            if idx is not None:
                counts[int(idx)] += 1
        else:
            for idx in (answer.get("selected_option_indices") or []):
                counts[int(idx)] += 1

    result = []
    for i, opt in enumerate(options):
        count = counts.get(i, 0)
        pct = round(count / n_respondents * 100, 2)
        is_correct = bool(opt.get("is_correct", False))
        result.append({
            "option_index": i,
            "option_text": opt.get("text"),
            "count": count,
            "percentage": pct,
            "is_correct": is_correct,
            "is_non_functional": not is_correct and pct < 5.0,
        })
    return result
