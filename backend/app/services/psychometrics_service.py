"""
Epoch 7 psychometric analytics: per-item (Stage 1) and per-test (Stage 2) statistics.

Stage 1: P-value, D-value, distractor analysis, version history, quality flags.
Stage 2: Score distribution, Cronbach's Alpha / KR-20, SEM, pass rate, cut-score analysis.
"""
import json
import math
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from app.core.prisma_db import prisma


# ─────────────────────────────────────────────
# Pure-function helpers (easily unit-testable)
# ─────────────────────────────────────────────

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


def _point_biserial(correct_flags: List[bool], scores: List[float]) -> Optional[float]:
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
        return None  # no variance in the binary variable

    p = n_p / n
    mean_all = sum(scores) / n
    variance = sum((s - mean_all) ** 2 for s in scores) / n
    if variance == 0:
        return None  # no variance in scores — everyone scored the same

    std_all = math.sqrt(variance)
    correct_scores = [s for c, s in zip(correct_flags, scores) if c]
    mean_p = sum(correct_scores) / n_p

    r_pb = (mean_p - mean_all) / std_all * math.sqrt(p * (1 - p))
    return round(r_pb, 4)


def _build_flags(p_value: Optional[float], d_value: Optional[float]) -> List[Dict]:
    """Return a list of quality-flag dicts based on psychometric thresholds."""
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


def _compute_distractor_stats(
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
        else:  # MULTIPLE_RESPONSE
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


# ─────────────────────────────────────────────
# DB-backed service functions
# ─────────────────────────────────────────────

async def compute_test_item_stats(test_definition_id: str) -> Dict:
    """
    For a given test, compute P-value, D-value, distractor analysis, and flags
    for every item used in graded sessions.

    Only sessions with a grading_status other than UNGRADED are included so that
    partially graded tests (e.g. essays still pending) still return MCQ stats.
    """
    all_results = await prisma.session_results.find_many(
        where={"test_definition_id": test_definition_id, "is_published": True}
    )
    graded_results = [r for r in all_results if r.grading_status != "UNGRADED"]

    if not graded_results:
        return {
            "test_definition_id": test_definition_id,
            "total_sessions": 0,
            "items": [],
        }

    session_ids = [r.session_id for r in graded_results]
    score_map = {r.session_id: r.percentage for r in graded_results}

    all_grades = await prisma.question_grades.find_many(
        where={"session_id": {"in": session_ids}}
    )
    if not all_grades:
        return {
            "test_definition_id": test_definition_id,
            "total_sessions": len(graded_results),
            "items": [],
        }

    iv_ids = list({g.item_version_id for g in all_grades})
    item_versions = await prisma.item_versions.find_many(
        where={"id": {"in": iv_ids}}
    )
    iv_map = {iv.id: iv for iv in item_versions}

    grades_by_version: Dict[str, List] = defaultdict(list)
    for g in all_grades:
        grades_by_version[g.item_version_id].append(g)

    items_stats = []
    for iv_id, grades in grades_by_version.items():
        iv = iv_map.get(iv_id)
        question_type = str(iv.question_type) if iv else None

        # P and D only for objective questions (is_correct is not None)
        objective_grades = [g for g in grades if g.is_correct is not None]
        p_value = None
        d_value = None

        if objective_grades:
            n_correct = sum(1 for g in objective_grades if g.is_correct)
            p_value = round(n_correct / len(objective_grades), 4)
            correct_flags = [bool(g.is_correct) for g in objective_grades]
            scores = [score_map.get(g.session_id, 0.0) for g in objective_grades]
            d_value = _point_biserial(correct_flags, scores)

        options = _parse_options(iv.options if iv else {})
        distractors = _compute_distractor_stats(grades, options, question_type or "")
        flags = _build_flags(p_value, d_value)

        items_stats.append({
            "learning_object_id": str(iv.learning_object_id) if iv else "unknown",
            "item_version_id": iv_id,
            "version_number": iv.version_number if iv else None,
            "question_type": question_type,
            "p_value": p_value,
            "d_value": d_value,
            "n_responses": len(grades),
            "mean_score": round(sum(g.points_awarded for g in grades) / len(grades), 4) if grades else None,
            "points_possible": grades[0].points_possible if grades else None,
            "distractors": distractors,
            "flags": flags,
            "computed_at": max(
                (
                    g.updated_at
                    or g.created_at
                    for g in grades
                    if (g.updated_at or g.created_at) is not None
                ),
                default=None,
            ),
        })

    items_stats.sort(key=lambda x: x["learning_object_id"])

    return {
        "test_definition_id": test_definition_id,
        "total_sessions": len(graded_results),
        "items": items_stats,
    }


async def compute_item_version_history(learning_object_id: str) -> Dict:
    """
    For a given learning object, compute P/D stats per version across all tests.
    Shows how a question's psychometric properties evolved as it was revised.
    """
    all_grades = await prisma.question_grades.find_many(
        where={"learning_object_id": learning_object_id}
    )
    if not all_grades:
        return {"learning_object_id": learning_object_id, "versions": []}

    iv_ids = list({g.item_version_id for g in all_grades})
    item_versions = await prisma.item_versions.find_many(
        where={"id": {"in": iv_ids}}
    )
    iv_map = {iv.id: iv for iv in item_versions}

    session_ids = list({g.session_id for g in all_grades})
    session_results = await prisma.session_results.find_many(
        where={"session_id": {"in": session_ids}, "is_published": True}
    )
    score_map = {r.session_id: r.percentage for r in session_results}
    test_def_map = {r.session_id: r.test_definition_id for r in session_results}

    grades_by_version: Dict[str, List] = defaultdict(list)
    for g in all_grades:
        grades_by_version[g.item_version_id].append(g)

    versions = []
    for iv_id, grades in grades_by_version.items():
        iv = iv_map.get(iv_id)
        objective_grades = [g for g in grades if g.is_correct is not None]
        p_value = None
        d_value = None

        if objective_grades:
            n_correct = sum(1 for g in objective_grades if g.is_correct)
            p_value = round(n_correct / len(objective_grades), 4)
            correct_flags = [bool(g.is_correct) for g in objective_grades]
            scores = [score_map.get(g.session_id, 0.0) for g in objective_grades]
            d_value = _point_biserial(correct_flags, scores)

        test_def_ids = list({
            test_def_map[g.session_id]
            for g in grades
            if g.session_id in test_def_map
        })

        versions.append({
            "item_version_id": iv_id,
            "version_number": iv.version_number if iv else None,
            "test_definition_ids": test_def_ids,
            "p_value": p_value,
            "d_value": d_value,
            "n_responses": len(grades),
            "flags": _build_flags(p_value, d_value),
            "computed_at": max(
                (
                    g.updated_at
                    or g.created_at
                    for g in grades
                    if (g.updated_at or g.created_at) is not None
                ),
                default=None,
            ),
        })

    versions.sort(key=lambda x: (x["version_number"] or 0))
    return {"learning_object_id": learning_object_id, "versions": versions}


# ─────────────────────────────────────────────
# Stage 2 helpers
# ─────────────────────────────────────────────

def _mean(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return round(sum(values) / len(values), 4)


def _median(values: List[float]) -> Optional[float]:
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return round((s[mid - 1] + s[mid]) / 2 if n % 2 == 0 else s[mid], 4)


def _std_dev(values: List[float], population: bool = False) -> Optional[float]:
    """Sample std dev (ddof=1) by default; population (ddof=0) when population=True."""
    n = len(values)
    if n < 2:
        return None
    m = sum(values) / n
    divisor = n if population else n - 1
    variance = sum((v - m) ** 2 for v in values) / divisor
    return round(math.sqrt(variance), 4)


def _score_distribution(percentages: List[float]) -> List[Dict]:
    """Return a 10-bucket histogram (0-10, 10-20, …, 90-100)."""
    buckets = [{"range": f"{i*10}-{(i+1)*10}", "min": i * 10, "max": (i + 1) * 10, "count": 0}
               for i in range(10)]
    for pct in percentages:
        idx = min(int(pct // 10), 9)
        buckets[idx]["count"] += 1
    return buckets


def _cronbach_alpha(item_scores_matrix: List[List[float]]) -> Optional[float]:
    """
    Cronbach's Alpha (reduces to KR-20 for binary 0/1 items).
    item_scores_matrix: rows = students, cols = items (raw points_awarded).
    Returns None when there are fewer than 2 students or fewer than 2 items.
    """
    n = len(item_scores_matrix)
    if n < 2:
        return None
    k = len(item_scores_matrix[0]) if item_scores_matrix else 0
    if k < 2:
        return None

    sum_item_var = 0.0
    for col in range(k):
        col_scores = [item_scores_matrix[row][col] for row in range(n)]
        m = sum(col_scores) / n
        var = sum((s - m) ** 2 for s in col_scores) / (n - 1)
        sum_item_var += var

    total_scores = [sum(row) for row in item_scores_matrix]
    m_total = sum(total_scores) / n
    total_var = sum((s - m_total) ** 2 for s in total_scores) / (n - 1)

    if total_var == 0:
        return None

    alpha = (k / (k - 1)) * (1 - sum_item_var / total_var)
    return round(alpha, 4)


def _cut_score_analysis(percentages: List[float], cut_scores: List[float]) -> List[Dict]:
    """For each candidate cut-score, report the resulting pass/fail split."""
    total = len(percentages)
    result = []
    for cut in cut_scores:
        pass_count = sum(1 for p in percentages if p >= cut)
        result.append({
            "cut_score": cut,
            "pass_count": pass_count,
            "fail_count": total - pass_count,
            "pass_rate": round(pass_count / total * 100, 2) if total else 0.0,
        })
    return result


# ─────────────────────────────────────────────
# Stage 2 DB-backed service function
# ─────────────────────────────────────────────

_DEFAULT_CUT_SCORES = [30.0, 40.0, 45.0, 50.0, 55.0, 60.0, 65.0, 70.0]

# ─────────────────────────────────────────────
# Stage 3 helpers
# ─────────────────────────────────────────────


async def compute_test_stats(
    test_definition_id: str,
    cut_scores: Optional[List[float]] = None,
) -> Dict:
    """
    Per-test analytics for Stage 2:
    - Score distribution histogram with mean / median / SD
    - Cronbach's Alpha (or KR-20 for binary items) and SEM
    - Pass rate (based on stored passed flag)
    - Cut-score analysis for a configurable list of thresholds
    """
    if cut_scores is None:
        cut_scores = _DEFAULT_CUT_SCORES

    all_results = await prisma.session_results.find_many(
        where={"test_definition_id": test_definition_id, "is_published": True}
    )
    graded_results = [r for r in all_results if r.grading_status != "UNGRADED"]

    test_definition = await prisma.test_definitions.find_unique(
        where={"id": test_definition_id}
    )
    scoring_config = _parse_json(test_definition.scoring_config) if test_definition else {}
    cut_score = scoring_config.get("pass_percentage")
    try:
        cut_score = float(cut_score) if cut_score is not None else None
    except (TypeError, ValueError):
        cut_score = None

    if not graded_results:
        return {
            "test_definition_id": test_definition_id,
            "total_sessions": 0,
            "distribution": [],
            "mean": None,
            "median": None,
            "std_dev": None,
            "min_score": None,
            "max_score": None,
            "pass_rate": None,
            "pass_count": 0,
            "fail_count": 0,
            "cronbach_alpha": None,
            "sem": None,
            "n_items": 0,
            "cut_score": cut_score,
            "computed_at": None,
            "is_stale": False,
            "cut_score_analysis": [],
        }

    percentages = [r.percentage for r in graded_results]
    session_ids = [r.session_id for r in graded_results]

    pass_count = sum(1 for r in graded_results if r.passed)
    fail_count = len(graded_results) - pass_count
    total = len(graded_results)

    mean_score = _mean(percentages)
    median_score = _median(percentages)
    sd = _std_dev(percentages)

    # Build item score matrix for Cronbach's Alpha
    all_grades = await prisma.question_grades.find_many(
        where={"session_id": {"in": session_ids}}
    )

    # Collect item_version_ids that appear in this test (using union of all sessions)
    iv_ids_ordered: List[str] = []
    seen: set = set()
    for g in all_grades:
        if g.item_version_id not in seen:
            iv_ids_ordered.append(g.item_version_id)
            seen.add(g.item_version_id)

    n_items = len(iv_ids_ordered)
    iv_index = {iv_id: i for i, iv_id in enumerate(iv_ids_ordered)}

    # Build matrix: rows = session, cols = item
    session_index = {sid: i for i, sid in enumerate(session_ids)}
    matrix = [[0.0] * n_items for _ in range(total)]
    for g in all_grades:
        row = session_index.get(g.session_id)
        col = iv_index.get(g.item_version_id)
        if row is not None and col is not None:
            matrix[row][col] = g.points_awarded

    alpha = _cronbach_alpha(matrix)
    sem: Optional[float] = None
    if alpha is not None and sd is not None:
        sem = round(sd * math.sqrt(1 - alpha), 4)

    return {
        "test_definition_id": test_definition_id,
        "total_sessions": total,
        "distribution": _score_distribution(percentages),
        "mean": mean_score,
        "median": median_score,
        "std_dev": sd,
        "min_score": round(min(percentages), 4) if percentages else None,
        "max_score": round(max(percentages), 4) if percentages else None,
        "pass_rate": round(pass_count / total * 100, 2) if total else None,
        "pass_count": pass_count,
        "fail_count": fail_count,
        "cronbach_alpha": alpha,
        "sem": sem,
        "n_items": n_items,
        "cut_score": cut_score,
        "computed_at": max(
            (
                r.published_at
                or r.updated_at
                or r.created_at
                for r in graded_results
                if (r.published_at or r.updated_at or r.created_at) is not None
            ),
            default=None,
        ),
        "is_stale": False,
        "cut_score_analysis": _cut_score_analysis(percentages, cut_scores),
    }


# ─────────────────────────────────────────────
# Stage 3 DB-backed service functions
# ─────────────────────────────────────────────

async def compute_dashboard(
    test_definition_id: str,
    cut_scores: Optional[List[float]] = None,
) -> Dict:
    """
    Combined dashboard response: test-level stats + per-item stats + flagged items list.
    Runs Stage 1 and Stage 2 concurrently.
    """
    import asyncio

    test_stats, item_stats = await asyncio.gather(
        compute_test_stats(test_definition_id, cut_scores=cut_scores),
        compute_test_item_stats(test_definition_id),
    )
    flagged = [item for item in item_stats["items"] if item["flags"]]
    return {
        "test_stats": test_stats,
        "item_stats": item_stats,
        "flagged_items": flagged,
        "total_flagged": len(flagged),
    }


async def get_flagged_items_for_test(test_definition_id: str) -> Dict:
    """Return only flagged items (any quality flag) from a test's item stats."""
    result = await compute_test_item_stats(test_definition_id)
    flagged = [item for item in result["items"] if item["flags"]]
    return {
        "test_definition_id": test_definition_id,
        "total_sessions": result["total_sessions"],
        "total_flagged": len(flagged),
        "items": flagged,
    }


async def get_flagged_items_for_bank(bank_id: str) -> Dict:
    """
    Scan all learning objects in a bank, compute P/D across every test
    that used each version, and return items with at least one quality flag.
    """
    los = await prisma.learning_objects.find_many(where={"bank_id": bank_id})
    if not los:
        return {"bank_id": bank_id, "total_flagged": 0, "items": []}

    lo_ids = [lo.id for lo in los]
    all_grades = await prisma.question_grades.find_many(
        where={"learning_object_id": {"in": lo_ids}}
    )
    if not all_grades:
        return {"bank_id": bank_id, "total_flagged": 0, "items": []}

    iv_ids = list({g.item_version_id for g in all_grades})
    item_versions = await prisma.item_versions.find_many(where={"id": {"in": iv_ids}})
    iv_map = {iv.id: iv for iv in item_versions}

    session_ids = list({g.session_id for g in all_grades})
    session_results = await prisma.session_results.find_many(
        where={"session_id": {"in": session_ids}}
    )
    score_map = {r.session_id: r.percentage for r in session_results}

    # Group by (lo_id, iv_id)
    grades_by_lo: Dict[str, Dict[str, List]] = defaultdict(lambda: defaultdict(list))
    for g in all_grades:
        grades_by_lo[g.learning_object_id][g.item_version_id].append(g)

    flagged_items = []
    for lo_id, versions_dict in grades_by_lo.items():
        latest_iv_id = max(
            versions_dict.keys(),
            key=lambda vid: (iv_map[vid].version_number if vid in iv_map else 0),
        )
        for iv_id, grades in versions_dict.items():
            iv = iv_map.get(iv_id)
            objective_grades = [g for g in grades if g.is_correct is not None]
            p_value = None
            d_value = None
            if objective_grades:
                n_correct = sum(1 for g in objective_grades if g.is_correct)
                p_value = round(n_correct / len(objective_grades), 4)
                correct_flags = [bool(g.is_correct) for g in objective_grades]
                scores = [score_map.get(g.session_id, 0.0) for g in objective_grades]
                d_value = _point_biserial(correct_flags, scores)

            flags = _build_flags(p_value, d_value)
            if flags:
                flagged_items.append({
                    "learning_object_id": lo_id,
                    "item_version_id": iv_id,
                    "version_number": iv.version_number if iv else None,
                    "question_type": str(iv.question_type) if iv else None,
                    "p_value": p_value,
                    "d_value": d_value,
                    "n_responses": len(grades),
                    "flags": flags,
                    "is_latest_version": iv_id == latest_iv_id,
                })

    flagged_items.sort(key=lambda x: (x["learning_object_id"], x["version_number"] or 0))
    return {"bank_id": bank_id, "total_flagged": len(flagged_items), "items": flagged_items}


async def export_test_analytics_report(test_definition_id: str) -> str:
    """
    Build a UTF-8 CSV analytics report for a test.
    Section 1: test-level summary.  Section 2: per-item statistics.
    """
    import asyncio
    import csv
    import io

    test_stats, item_stats = await asyncio.gather(
        compute_test_stats(test_definition_id),
        compute_test_item_stats(test_definition_id),
    )

    output = io.StringIO()
    w = csv.writer(output)

    w.writerow(["# Test Analytics Report"])
    w.writerow(["Section", "Metric", "Value"])
    for metric, val in [
        ("Test Definition ID", test_definition_id),
        ("Total Sessions", test_stats["total_sessions"]),
        ("Mean Score (%)", test_stats["mean"]),
        ("Median Score (%)", test_stats["median"]),
        ("Std Dev (%)", test_stats["std_dev"]),
        ("Min Score (%)", test_stats["min_score"]),
        ("Max Score (%)", test_stats["max_score"]),
        ("Pass Rate (%)", test_stats["pass_rate"]),
        ("Pass Count", test_stats["pass_count"]),
        ("Fail Count", test_stats["fail_count"]),
        ("Cronbach's Alpha", test_stats["cronbach_alpha"]),
        ("SEM (%)", test_stats["sem"]),
        ("Number of Items", test_stats["n_items"]),
    ]:
        w.writerow(["Test Summary", metric, val])

    w.writerow([])
    w.writerow(["# Score Distribution"])
    w.writerow(["Range", "Count"])
    for bucket in test_stats["distribution"]:
        w.writerow([bucket["range"], bucket["count"]])

    w.writerow([])
    w.writerow(["# Item Statistics"])
    w.writerow([
        "learning_object_id", "item_version_id", "version_number",
        "question_type", "p_value", "d_value", "n_responses", "flags",
    ])
    for item in item_stats["items"]:
        flag_codes = "; ".join(f["code"] for f in item["flags"])
        w.writerow([
            item["learning_object_id"],
            item["item_version_id"],
            item["version_number"],
            item["question_type"],
            item["p_value"],
            item["d_value"],
            item["n_responses"],
            flag_codes,
        ])

    return output.getvalue()


async def get_latest_test_analytics_bundle(
    test_definition_id: str,
    cut_scores: Optional[List[float]] = None,
) -> Optional[Dict]:
    """Return a live analytics bundle based on the latest published graded results."""
    import asyncio

    test_stats, item_stats = await asyncio.gather(
        compute_test_stats(test_definition_id, cut_scores=cut_scores),
        compute_test_item_stats(test_definition_id),
    )
    if test_stats["total_sessions"] == 0:
        return None

    return {
        "test": test_stats,
        "items": item_stats["items"],
        "flagged_items_count": sum(1 for item in item_stats["items"] if item["flags"]),
    }


async def recompute_test_analytics_bundle(
    test_definition_id: str,
    cut_scores: Optional[List[float]] = None,
) -> Dict:
    """Recompute and return the live analytics bundle."""
    bundle = await get_latest_test_analytics_bundle(
        test_definition_id,
        cut_scores=cut_scores,
    )
    if bundle is None:
        test_stats = await compute_test_stats(test_definition_id, cut_scores=cut_scores)
        if test_stats["total_sessions"] == 0:
            raise ValueError("No published analytics data available for this test.")
    return bundle or {"test": test_stats, "items": [], "flagged_items_count": 0}


async def list_flagged_items_for_test(test_definition_id: str) -> List[Dict]:
    """Return the flagged items list for a test as a flat array."""
    result = await compute_test_item_stats(test_definition_id)
    return [item for item in result["items"] if item["flags"]]


async def get_cut_score_scenarios(
    test_definition_id: str,
    cut_scores: List[float],
) -> List[Dict]:
    """Return pass-rate scenarios for the supplied cut scores."""
    test_stats = await compute_test_stats(test_definition_id, cut_scores=cut_scores)
    return test_stats["cut_score_analysis"]


async def get_item_history_entries(learning_object_id: str) -> Dict:
    """
    Return one history entry per item-version / test-definition pairing, sorted oldest to newest.
    The live branch does not persist analytics snapshots yet, so computed_at is derived from the
    latest grade timestamp in the group.
    """
    all_grades = await prisma.question_grades.find_many(
        where={"learning_object_id": learning_object_id}
    )
    if not all_grades:
        return {"learning_object_id": learning_object_id, "entries": []}

    session_ids = list({g.session_id for g in all_grades})
    session_results = await prisma.session_results.find_many(
        where={"session_id": {"in": session_ids}, "is_published": True}
    )
    if not session_results:
        return {"learning_object_id": learning_object_id, "entries": []}

    score_map = {r.session_id: r.percentage for r in session_results}
    test_def_map = {r.session_id: r.test_definition_id for r in session_results}
    published_session_ids = set(score_map.keys())
    published_grades = [g for g in all_grades if g.session_id in published_session_ids]
    if not published_grades:
        return {"learning_object_id": learning_object_id, "entries": []}

    iv_ids = list({g.item_version_id for g in published_grades})
    item_versions = await prisma.item_versions.find_many(where={"id": {"in": iv_ids}})
    iv_map = {iv.id: iv for iv in item_versions}

    test_def_ids = list({test_def_map[g.session_id] for g in published_grades if g.session_id in test_def_map})
    test_defs = await prisma.test_definitions.find_many(where={"id": {"in": test_def_ids}})
    test_title_map = {td.id: td.title for td in test_defs}

    grouped: Dict[Tuple[str, str], List[Any]] = defaultdict(list)
    for grade in published_grades:
        test_definition_id = test_def_map.get(grade.session_id)
        if test_definition_id:
            grouped[(grade.item_version_id, test_definition_id)].append(grade)

    entries: List[Dict[str, Any]] = []
    for (item_version_id, test_definition_id), grades in grouped.items():
        iv = iv_map.get(item_version_id)
        objective_grades = [g for g in grades if g.is_correct is not None]
        p_value = None
        d_value = None
        if objective_grades:
            n_correct = sum(1 for g in objective_grades if g.is_correct)
            p_value = round(n_correct / len(objective_grades), 4)
            correct_flags = [bool(g.is_correct) for g in objective_grades]
            scores = [score_map.get(g.session_id, 0.0) for g in objective_grades]
            d_value = _point_biserial(correct_flags, scores)

        entries.append({
            "item_version_id": item_version_id,
            "version_number": iv.version_number if iv else None,
            "test_definition_id": test_definition_id,
            "test_title": test_title_map.get(test_definition_id, "Untitled Test"),
            "p_value": p_value,
            "d_value": d_value,
            "n_responses": len(grades),
            "computed_at": max(
                (
                    g.updated_at
                    or g.created_at
                    for g in grades
                    if (g.updated_at or g.created_at) is not None
                ),
                default=None,
            ),
            "flags": _build_flags(p_value, d_value),
        })

    entries.sort(key=lambda entry: (
        entry["computed_at"].isoformat() if entry["computed_at"] else "",
        entry["version_number"] or 0,
        entry["test_title"],
    ))
    return {"learning_object_id": learning_object_id, "entries": entries}
