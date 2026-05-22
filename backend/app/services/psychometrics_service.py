"""
Epoch 7 psychometric analytics: per-item (Stage 1) and per-test (Stage 2) statistics.

Stage 1: P-value, D-value, distractor analysis, version history, quality flags.
Stage 2: Score distribution, Cronbach's Alpha / KR-20, SEM, pass rate, cut-score analysis.

Pure statistical functions live in ctt_metrics.py (CTT) and reliability.py.
This module contains only the DB-backed orchestration layer.
"""
import math
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.prisma_db import prisma
from app.models.scheduled_exam_session import CourseSessionStatus
from app.services.ctt_metrics import (
    _parse_json,
    _parse_options,
    build_flags as _build_flags,
    compute_distractor_stats as _compute_distractor_stats,
    point_biserial as _point_biserial,
)
from app.services.reliability import (
    DEFAULT_CUT_SCORES as _DEFAULT_CUT_SCORES,
    cronbach_alpha as _cronbach_alpha,
    cut_score_analysis as _cut_score_analysis,
    mean as _mean,
    median as _median,
    score_distribution as _score_distribution,
    std_dev as _std_dev,
)
from app.services.run_filter import build_session_results_run_filter
from app.services.scheduled_sessions_service import ensure_utc


# ─────────────────────────────────────────────
# DB-backed service functions
# ─────────────────────────────────────────────

async def list_analytics_index(
    user_id: str,
    is_admin: bool,
) -> List[Dict[str, Any]]:
    """Per-blueprint summary for the analytics index page.

    For each blueprint the caller can access, returns:
      * basic metadata (title, description, blocks_count, duration, pass %)
      * ``completed_sessions`` — count of CLOSED scheduled runs (the
        user-facing meaning of "session" — one scheduled exam window)
      * ``scheduled_upcoming`` — count of SCHEDULED runs still in the future
      * ``submissions_total`` — count of SUBMITTED exam_sessions (student
        attempts, across all runs and practice)
      * ``published_results`` — count of session_results with is_published=True
      * ``pending_grading`` — count of question_grades awaiting manual grading
      * ``latest_completed_run_at`` — most recent CLOSED run's ends_at
      * ``latest_submission_at`` — most recent submitted_at (any attempt)
      * ``primary_course_code`` / ``primary_course_title`` — most-used course
        among the test's scheduled runs (None for practice-only blueprints)

    Frontend uses this to group blueprints by course and surface the ones
    with real submissions ahead of the long curriculum-extension tail.
    """
    if is_admin:
        tests = await prisma.test_definitions.find_many(order={"created_at": "asc"})
    else:
        tests = await prisma.test_definitions.find_many(
            where={"created_by": user_id}, order={"created_at": "asc"}
        )
    if not tests:
        return []

    test_ids = [t.id for t in tests]

    # Submission counts and latest_submitted_at per test in one batched query.
    # Excludes PRACTICE-mode (author previews) so the index headline numbers
    # match the per-blueprint Combined view, which also excludes practice.
    all_sessions = await prisma.exam_sessions.find_many(
        where={
            "test_definition_id": {"in": test_ids},
            "status": "SUBMITTED",
            "session_mode": "ASSIGNED",
        },
    )
    sessions_by_test: Dict[str, list] = defaultdict(list)
    for s in all_sessions:
        sessions_by_test[s.test_definition_id].append(s)

    all_results = await prisma.session_results.find_many(
        where={"test_definition_id": {"in": test_ids}, "is_published": True},
    )
    published_by_test: Dict[str, int] = defaultdict(int)
    for r in all_results:
        published_by_test[r.test_definition_id] += 1

    # Pending grading — manual essays not yet graded — across all submitted
    # sessions for the test. Single query per request.
    pending_grades = await prisma.question_grades.find_many(
        where={
            "is_auto_graded": False,
            "feedback": None,
            "exam_sessions": {
                "test_definition_id": {"in": test_ids},
                "status": "SUBMITTED",
                "session_mode": "ASSIGNED",
            },
        },
        include={"exam_sessions": True},
    )
    pending_by_test: Dict[str, int] = defaultdict(int)
    for g in pending_grades:
        if g.exam_sessions:
            pending_by_test[g.exam_sessions.test_definition_id] += 1

    # Primary course = the course code that appears most often among the
    # blueprint's scheduled runs. Practice-only blueprints get None.
    # Also pre-aggregate per-test run lifecycle counts + last completion.
    runs = await prisma.scheduled_exam_sessions.find_many(
        where={"test_definition_id": {"in": test_ids}},
        include={"courses": True},
    )
    course_votes: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    course_titles: Dict[str, str] = {}
    completed_runs_by_test: Dict[str, int] = defaultdict(int)
    scheduled_runs_by_test: Dict[str, int] = defaultdict(int)
    latest_completed_run_by_test: Dict[str, Optional[datetime]] = defaultdict(lambda: None)
    now = datetime.now(timezone.utc)
    for run in runs:
        if run.courses:
            course_votes[run.test_definition_id][run.courses.code] += 1
            course_titles[run.courses.code] = run.courses.title
        # "Completed" = scheduled run that finished normally (CLOSED status,
        # or window-ended-past-now and not CANCELED). Matches CLAUDE.md §7.9.
        run_status = str(run.status) if run.status is not None else ""
        ends_at = ensure_utc(run.ends_at) if run.ends_at else None
        is_completed = (
            run_status == CourseSessionStatus.CLOSED.value
            or (ends_at is not None and ends_at <= now and run_status != CourseSessionStatus.CANCELED.value)
        )
        if is_completed:
            completed_runs_by_test[run.test_definition_id] += 1
            current = latest_completed_run_by_test[run.test_definition_id]
            if ends_at is not None and (current is None or ends_at > current):
                latest_completed_run_by_test[run.test_definition_id] = ends_at
        elif run_status == CourseSessionStatus.SCHEDULED.value:
            scheduled_runs_by_test[run.test_definition_id] += 1

    rows: List[Dict[str, Any]] = []
    for t in tests:
        sessions = sessions_by_test.get(t.id, [])
        latest = max(
            (s.submitted_at for s in sessions if s.submitted_at is not None),
            default=None,
        )
        votes = course_votes.get(t.id, {})
        primary_code = (
            max(votes.items(), key=lambda kv: kv[1])[0] if votes else None
        )
        scoring = _parse_json(t.scoring_config) if t.scoring_config else {}
        if not isinstance(scoring, dict):
            scoring = {}
        blocks = _parse_json(t.blocks) if t.blocks else []
        if not isinstance(blocks, list):
            blocks = []
        rows.append({
            "test_definition_id": t.id,
            "title": t.title,
            "description": t.description,
            "blocks_count": len(blocks),
            "duration_minutes": t.duration_minutes,
            "pass_percentage": scoring.get("pass_percentage", 55),
            "completed_sessions": completed_runs_by_test.get(t.id, 0),
            "scheduled_upcoming": scheduled_runs_by_test.get(t.id, 0),
            "submissions_total": len(sessions),
            "published_results": published_by_test.get(t.id, 0),
            "pending_grading": pending_by_test.get(t.id, 0),
            "latest_completed_run_at": latest_completed_run_by_test.get(t.id),
            "latest_submission_at": latest,
            "primary_course_code": primary_code,
            "primary_course_title": course_titles.get(primary_code) if primary_code else None,
        })
    return rows


async def compute_test_item_stats(
    test_definition_id: str,
    run_id: Optional[str] = None,
    include_unpublished: bool = False,
) -> Dict:
    """
    For a given test, compute P-value, D-value, distractor analysis, and flags
    for every item used in graded sessions.

    Only sessions with a grading_status other than UNGRADED are included so that
    partially graded tests (e.g. essays still pending) still return MCQ stats.

    ``run_id`` narrows the cohort to one scheduled-session run or (default)
    all ASSIGNED-mode sessions for the test. Practice attempts are excluded
    by the combined filter (see :mod:`app.services.run_filter`) — they're
    author previews, not cohort data. The combined cohort is the
    statistically right default; per-run drill-in is for cohort comparisons.
    Caller is responsible for ``assert_run_belongs_to_test`` first.

    ``include_unpublished`` (educator preview only) drops the published-only
    filter so analytics can be reviewed before grades are released.
    """
    where: Dict[str, Any] = {
        "test_definition_id": test_definition_id,
        **build_session_results_run_filter(run_id),
    }
    if not include_unpublished:
        where["is_published"] = True
    all_results = await prisma.session_results.find_many(where=where)
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

        # Only count responses that have actually been graded — auto-graded
        # (MCQ) or manually scored (essay with a grader). Ungraded essays would
        # otherwise drag the difficulty toward 0 and inflate the response count.
        graded = [g for g in grades if g.is_auto_graded or g.graded_by is not None]

        # P and D apply only to objective (dichotomously-scored) questions.
        # Essays are point-scored, so "proportion correct" is meaningless —
        # leave their difficulty/discrimination as N/A and rely on score.
        is_essay = "ESSAY" in (question_type or "").upper()
        points_possible = grades[0].points_possible if grades else None
        exclude_essay = is_essay and (points_possible is None or points_possible > 1.0)
        objective_grades = [] if exclude_essay else [g for g in graded if g.is_correct is not None]
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
            "n_responses": len(graded),
            "mean_score": round(sum(g.points_awarded for g in graded) / len(graded), 4) if graded else None,
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
        question_type = str(iv.question_type) if iv else None
        is_essay = "ESSAY" in (question_type or "").upper()
        points_possible = grades[0].points_possible if grades else None
        exclude_essay = is_essay and (points_possible is None or points_possible > 1.0)
        objective_grades = [] if exclude_essay else [g for g in grades if g.is_correct is not None]
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
# Stage 2 / 3 DB-backed service functions
# ─────────────────────────────────────────────


async def compute_test_stats(
    test_definition_id: str,
    cut_scores: Optional[List[float]] = None,
    run_id: Optional[str] = None,
    include_unpublished: bool = False,
) -> Dict:
    """
    Per-test analytics for Stage 2:
    - Score distribution histogram with mean / median / SD
    - Cronbach's Alpha (or KR-20 for binary items) and SEM
    - Pass rate (based on stored passed flag)
    - Cut-score analysis for a configurable list of thresholds

    ``run_id`` narrows the cohort exactly as in :func:`compute_test_item_stats`.
    """
    if cut_scores is None:
        cut_scores = _DEFAULT_CUT_SCORES

    stats_where: Dict[str, Any] = {
        "test_definition_id": test_definition_id,
        **build_session_results_run_filter(run_id),
    }
    if not include_unpublished:
        stats_where["is_published"] = True
    all_results = await prisma.session_results.find_many(where=stats_where)
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


async def compute_dashboard(
    test_definition_id: str,
    cut_scores: Optional[List[float]] = None,
    run_id: Optional[str] = None,
) -> Dict:
    """
    Combined dashboard response: test-level stats + per-item stats + flagged items list.
    Runs Stage 1 and Stage 2 concurrently. ``run_id`` propagates to both legs.
    """
    import asyncio

    test_stats, item_stats = await asyncio.gather(
        compute_test_stats(test_definition_id, cut_scores=cut_scores, run_id=run_id),
        compute_test_item_stats(test_definition_id, run_id=run_id),
    )
    flagged = [item for item in item_stats["items"] if item["flags"]]
    return {
        "test_stats": test_stats,
        "item_stats": item_stats,
        "flagged_items": flagged,
        "total_flagged": len(flagged),
    }


async def get_flagged_items_for_test(
    test_definition_id: str,
    run_id: Optional[str] = None,
) -> Dict:
    """Return only flagged items (any quality flag) from a test's item stats."""
    result = await compute_test_item_stats(test_definition_id, run_id=run_id)
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
            question_type = str(iv.question_type) if iv else None
            is_essay = "ESSAY" in (question_type or "").upper()
            points_possible = grades[0].points_possible if grades else None
            exclude_essay = is_essay and (points_possible is None or points_possible > 1.0)
            objective_grades = [] if exclude_essay else [g for g in grades if g.is_correct is not None]
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


async def export_test_analytics_report(
    test_definition_id: str,
    run_id: Optional[str] = None,
) -> str:
    """
    Build a UTF-8 CSV analytics report for a test.
    Section 1: test-level summary.  Section 2: per-item statistics.
    """
    import asyncio
    import csv
    import io

    test_stats, item_stats = await asyncio.gather(
        compute_test_stats(test_definition_id, run_id=run_id),
        compute_test_item_stats(test_definition_id, run_id=run_id),
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


async def list_analytics_runs(test_definition_id: str) -> List[Dict[str, Any]]:
    """Per-run analytics aggregates for a single test definition.

    Mirrors :func:`app.services.results_service.get_grading_runs` but uses
    *all* submitted attempts (not just gradable closed runs) — analytics
    cares about every cohort with data, including ongoing windows.

    A "Combined" sentinel row is pinned at the top with the unfiltered
    submission count so the picker UI can present today's all-runs
    aggregate as the recommended default.

    Caller is responsible for ``assert_test_access(test_definition_id, user)``.
    """
    scheduled_runs = await prisma.scheduled_exam_sessions.find_many(
        where={"test_definition_id": test_definition_id},
        include={"courses": True},
        order={"starts_at": "asc"},
    )

    now = datetime.now(timezone.utc)
    rows: List[Dict[str, Any]] = []

    # Combined sentinel — always the recommended default for analytics.
    # Excludes PRACTICE-mode submissions to match the downstream psychometric
    # queries (which filter the same way via run_filter.is_combined).
    combined_total = await prisma.exam_sessions.count(
        where={
            "test_definition_id": test_definition_id,
            "status": "SUBMITTED",
            "session_mode": "ASSIGNED",
        },
    )
    rows.append({
        "run_id": "combined",
        "kind": "COMBINED",
        "course_id": None,
        "course_code": None,
        "course_title": None,
        "starts_at": None,
        "ends_at": None,
        "lifecycle_status": "CLOSED",
        "submissions_total": combined_total,
        "is_recommended_default": True,
    })

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
            "is_recommended_default": False,
        })

    return rows


async def get_latest_test_analytics_bundle(
    test_definition_id: str,
    cut_scores: Optional[List[float]] = None,
    run_id: Optional[str] = None,
    include_unpublished: bool = False,
) -> Optional[Dict]:
    """Return a live analytics bundle based on the latest graded results.

    With ``include_unpublished`` (educator preview) the published-only filter
    is dropped so analytics can be reviewed before grades are released.
    """
    import asyncio

    test_stats, item_stats = await asyncio.gather(
        compute_test_stats(test_definition_id, cut_scores=cut_scores, run_id=run_id,
                           include_unpublished=include_unpublished),
        compute_test_item_stats(test_definition_id, run_id=run_id,
                                include_unpublished=include_unpublished),
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
    run_id: Optional[str] = None,
    include_unpublished: bool = False,
) -> Dict:
    """Recompute and return the live analytics bundle."""
    bundle = await get_latest_test_analytics_bundle(
        test_definition_id,
        cut_scores=cut_scores,
        run_id=run_id,
        include_unpublished=include_unpublished,
    )
    if bundle is None:
        test_stats = await compute_test_stats(
            test_definition_id, cut_scores=cut_scores, run_id=run_id,
            include_unpublished=include_unpublished,
        )
        if test_stats["total_sessions"] == 0:
            raise ValueError("No published analytics data available for this test.")
    return bundle or {"test": test_stats, "items": [], "flagged_items_count": 0}


async def list_flagged_items_for_test(
    test_definition_id: str,
    run_id: Optional[str] = None,
) -> List[Dict]:
    """Return the flagged items list for a test as a flat array."""
    result = await compute_test_item_stats(test_definition_id, run_id=run_id)
    return [item for item in result["items"] if item["flags"]]


async def get_cut_score_scenarios(
    test_definition_id: str,
    cut_scores: List[float],
    run_id: Optional[str] = None,
    include_unpublished: bool = False,
) -> List[Dict]:
    """Return pass-rate scenarios for the supplied cut scores."""
    test_stats = await compute_test_stats(
        test_definition_id, cut_scores=cut_scores, run_id=run_id,
        include_unpublished=include_unpublished,
    )
    return test_stats["cut_score_analysis"]


async def compute_section_analytics(
    test_definition_id: str,
    run_id: Optional[str] = None,
    include_unpublished: bool = False,
) -> Dict:
    """
    Per-section (per-block) aggregate analytics for a test (Epoch 8.4 Stage 9).

    Groups items by the section they appear in (FIXED rules carry an explicit
    `learning_object_id`; RANDOM rules are reported by their count only).
    Returns the per-block aggregates of P-value, D-value, and mean score
    derived from the existing `compute_test_item_stats` payload.
    """
    test_definition = await prisma.test_definitions.find_unique(
        where={"id": test_definition_id}
    )
    if test_definition is None:
        return {"test_definition_id": test_definition_id, "sections": []}

    blocks = list(test_definition.blocks or [])

    # Build LO → section index from FIXED rules.
    lo_to_section: Dict[str, int] = {}
    for idx, block in enumerate(blocks):
        for rule in block.get("rules", []) or []:
            if rule.get("rule_type") == "FIXED" and rule.get("learning_object_id"):
                lo_to_section[str(rule["learning_object_id"])] = idx

    item_stats = await compute_test_item_stats(
        test_definition_id, run_id=run_id, include_unpublished=include_unpublished,
    )
    items = item_stats.get("items", [])

    section_items: Dict[int, List[Dict]] = defaultdict(list)
    for item in items:
        section = lo_to_section.get(str(item.get("learning_object_id")))
        if section is not None:
            section_items[section].append(item)

    sections: List[Dict] = []
    for idx, block in enumerate(blocks):
        block_items = section_items.get(idx, [])
        rules = block.get("rules", []) or []
        question_count = sum(
            1 if r.get("rule_type") == "FIXED" else int(r.get("count") or 0)
            for r in rules
        )

        p_values = [it["p_value"] for it in block_items if it.get("p_value") is not None]
        d_values = [it["d_value"] for it in block_items if it.get("d_value") is not None]
        # Normalise each item's average points to a fraction of its max so the
        # section mean is a true 0–1 score (raw points would yield e.g. 400%
        # for a 4-point essay). Falls back to skipping items without a max.
        score_fractions = [
            it["mean_score"] / it["points_possible"]
            for it in block_items
            if it.get("mean_score") is not None and it.get("points_possible")
        ]

        def _avg(xs: List[float]) -> Optional[float]:
            return round(sum(xs) / len(xs), 4) if xs else None

        sections.append({
            "block_index": idx,
            "block_title": block.get("title") or f"Section {idx + 1}",
            "question_count": question_count,
            "graded_item_count": len(block_items),
            "p_value_mean": _avg(p_values),
            "discrimination_mean": _avg(d_values),
            "mean_score": _avg(score_fractions),
            "learning_object_ids": [str(it.get("learning_object_id")) for it in block_items],
        })

    return {
        "test_definition_id": test_definition_id,
        "total_sessions": item_stats.get("total_sessions", 0),
        "sections": sections,
    }


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
        question_type = str(iv.question_type) if iv else None
        is_essay = "ESSAY" in (question_type or "").upper()
        points_possible = grades[0].points_possible if grades else None
        exclude_essay = is_essay and (points_possible is None or points_possible > 1.0)
        objective_grades = [] if exclude_essay else [g for g in grades if g.is_correct is not None]
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
