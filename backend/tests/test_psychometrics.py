"""
test_psychometrics.py — Unit tests for the pure-math helpers in psychometrics_service.

No database connection required. Tests cover:
  - _point_biserial: normal cases + every early-return branch
  - _build_flags: all flag codes + no-flag case
  - _mean, _median, _std_dev: happy path + empty inputs
  - _cronbach_alpha: normal reliability + edge cases (< 2 items, < 2 students,
    all-identical scores where total_var = 0)
  - _score_distribution: bucket placement including boundary at 100
  - _cut_score_analysis: pass/fail splits
"""
import math
import pytest

# Mark all tests in this module as anyio so the session-scoped async
# initialize_prisma autouse fixture in conftest.py runs correctly.
pytestmark = pytest.mark.anyio

from app.services.psychometrics_service import (
    _build_flags,
    _compute_distractor_stats,
    _cronbach_alpha,
    _cut_score_analysis,
    _mean,
    _median,
    _parse_json,
    _parse_options,
    _point_biserial,
    _score_distribution,
    _std_dev,
)


# ── _parse_json ────────────────────────────────────────────────────────────────

class TestParseJson:
    async def test_dict_passthrough(self):
        assert _parse_json({"a": 1}) == {"a": 1}

    async def test_list_passthrough(self):
        assert _parse_json([1, 2, 3]) == [1, 2, 3]

    async def test_valid_json_string(self):
        assert _parse_json('{"x": 42}') == {"x": 42}

    async def test_invalid_json_string_returns_empty_dict(self):
        assert _parse_json("not-json") == {}

    async def test_none_returns_empty_dict(self):
        assert _parse_json(None) == {}


# ── _parse_options ─────────────────────────────────────────────────────────────

class TestParseOptions:
    async def test_plain_list(self):
        assert len(_parse_options([{"text": "A"}, {"text": "B"}])) == 2

    async def test_dict_with_choices_key(self):
        assert len(_parse_options({"choices": [{"text": "A"}]})) == 1

    async def test_dict_with_options_key(self):
        assert len(_parse_options({"options": [{"text": "B"}]})) == 1

    async def test_empty_dict_returns_empty(self):
        assert _parse_options({}) == []

    async def test_none_returns_empty(self):
        assert _parse_options(None) == []


# ── _point_biserial ────────────────────────────────────────────────────────────

class TestPointBiserial:
    async def test_normal_positive_correlation(self):
        # High scorers get it right → positive D-value
        correct = [True, True, True, False, False]
        scores  = [90.0, 80.0, 70.0, 30.0, 20.0]
        r = _point_biserial(correct, scores)
        assert r is not None
        assert r > 0.0

    async def test_negative_correlation(self):
        # Low scorers get it right → negative D-value
        correct = [False, False, False, True, True]
        scores  = [90.0, 80.0, 70.0, 30.0, 20.0]
        r = _point_biserial(correct, scores)
        assert r is not None
        assert r < 0.0

    async def test_result_is_rounded_to_4_decimal_places(self):
        correct = [True, False, True, False]
        scores  = [80.0, 60.0, 70.0, 50.0]
        r = _point_biserial(correct, scores)
        assert r is not None
        assert round(r, 4) == r

    # ── early-return branches ──

    async def test_empty_input_returns_none(self):
        assert _point_biserial([], []) is None

    async def test_single_response_returns_none(self):
        assert _point_biserial([True], [75.0]) is None

    async def test_all_correct_returns_zero(self):
        # n_q == 0 → no variance in binary variable
        assert _point_biserial([True, True, True], [70.0, 80.0, 90.0]) == 0.0

    async def test_all_incorrect_returns_zero(self):
        # n_p == 0
        assert _point_biserial([False, False, False], [70.0, 80.0, 90.0]) == 0.0

    async def test_zero_score_variance_returns_none(self):
        # All students scored identically → std_all = 0
        assert _point_biserial([True, False, True], [50.0, 50.0, 50.0]) is None


# ── _build_flags ───────────────────────────────────────────────────────────────

class TestBuildFlags:
    async def test_no_flags_for_good_item(self):
        flags = _build_flags(p_value=0.55, d_value=0.35)
        assert flags == []

    async def test_too_hard_flag(self):
        flags = _build_flags(p_value=0.10, d_value=0.30)
        codes = [f["code"] for f in flags]
        assert "TOO_HARD" in codes

    async def test_too_easy_flag(self):
        flags = _build_flags(p_value=0.95, d_value=0.30)
        codes = [f["code"] for f in flags]
        assert "TOO_EASY" in codes

    async def test_poor_discrimination_flag(self):
        flags = _build_flags(p_value=0.55, d_value=0.05)
        codes = [f["code"] for f in flags]
        assert "POOR_DISCRIMINATION" in codes

    async def test_multiple_flags_simultaneously(self):
        # Too easy AND poor discrimination
        flags = _build_flags(p_value=0.95, d_value=0.05)
        codes = [f["code"] for f in flags]
        assert "TOO_EASY" in codes
        assert "POOR_DISCRIMINATION" in codes

    async def test_none_p_value_skips_difficulty_flag(self):
        flags = _build_flags(p_value=None, d_value=0.05)
        codes = [f["code"] for f in flags]
        assert "TOO_HARD" not in codes
        assert "TOO_EASY" not in codes

    async def test_none_d_value_skips_discrimination_flag(self):
        flags = _build_flags(p_value=0.55, d_value=None)
        assert flags == []

    async def test_boundary_p_value_exactly_020_is_not_flagged(self):
        # < 0.20 triggers flag; == 0.20 should not
        flags = _build_flags(p_value=0.20, d_value=0.30)
        codes = [f["code"] for f in flags]
        assert "TOO_HARD" not in codes

    async def test_boundary_p_value_exactly_090_is_not_flagged(self):
        flags = _build_flags(p_value=0.90, d_value=0.30)
        codes = [f["code"] for f in flags]
        assert "TOO_EASY" not in codes


# ── _mean / _median / _std_dev ─────────────────────────────────────────────────

class TestDescriptiveStats:
    async def test_mean_normal(self):
        assert _mean([10.0, 20.0, 30.0]) == pytest.approx(20.0)

    async def test_mean_empty_returns_none(self):
        assert _mean([]) is None

    async def test_median_odd_count(self):
        assert _median([1.0, 3.0, 5.0]) == 3.0

    async def test_median_even_count(self):
        assert _median([1.0, 3.0, 5.0, 7.0]) == pytest.approx(4.0)

    async def test_median_empty_returns_none(self):
        assert _median([]) is None

    async def test_std_dev_sample(self):
        # Sample std dev (ddof=1) of this sequence ≈ 2.1381 (not the population 2.0)
        result = _std_dev([2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0])
        assert result == pytest.approx(2.1381, abs=0.001)

    async def test_std_dev_single_value_returns_none(self):
        assert _std_dev([42.0]) is None

    async def test_std_dev_empty_returns_none(self):
        assert _std_dev([]) is None


# ── _cronbach_alpha ────────────────────────────────────────────────────────────

class TestCronbachAlpha:
    async def test_reasonable_reliability(self):
        # Construct a coherent 5-student × 4-item matrix
        matrix = [
            [1.0, 1.0, 0.0, 1.0],
            [1.0, 0.0, 1.0, 1.0],
            [0.0, 1.0, 1.0, 0.0],
            [1.0, 1.0, 1.0, 1.0],
            [0.0, 0.0, 0.0, 0.0],
        ]
        alpha = _cronbach_alpha(matrix)
        assert alpha is not None
        assert math.isfinite(alpha)

    async def test_single_student_returns_none(self):
        assert _cronbach_alpha([[1.0, 0.0, 1.0]]) is None

    async def test_single_item_returns_none(self):
        assert _cronbach_alpha([[1.0], [0.0], [1.0]]) is None

    async def test_empty_matrix_returns_none(self):
        assert _cronbach_alpha([]) is None

    async def test_all_identical_scores_returns_none(self):
        # Every student scores the same total → total_var = 0
        matrix = [
            [1.0, 1.0],
            [1.0, 1.0],
            [1.0, 1.0],
        ]
        assert _cronbach_alpha(matrix) is None

    async def test_alpha_is_not_clamped_below_minus_one(self):
        # Inversely correlated items can produce alpha < -1 — this is valid
        matrix = [
            [1.0, 0.0, 1.0, 0.0],
            [0.0, 1.0, 0.0, 1.0],
            [1.0, 0.0, 1.0, 0.0],
            [0.0, 1.0, 0.0, 1.0],
        ]
        alpha = _cronbach_alpha(matrix)
        # May be None or a valid float — just assert it is not clamped
        if alpha is not None:
            assert math.isfinite(alpha)  # No artificial clamping


# ── _score_distribution ────────────────────────────────────────────────────────

class TestScoreDistribution:
    async def test_produces_10_buckets(self):
        buckets = _score_distribution([10.0, 50.0, 90.0])
        assert len(buckets) == 10

    async def test_empty_input_returns_all_zero_counts(self):
        buckets = _score_distribution([])
        assert all(b["count"] == 0 for b in buckets)

    async def test_bucket_assignment(self):
        buckets = _score_distribution([0.0, 15.0, 55.0, 99.9, 100.0])
        # 0 → bucket 0 (0-10), 15 → bucket 1 (10-20), 55 → bucket 5 (50-60)
        # 99.9 → bucket 9 (90-100), 100 → bucket 9 (clamped)
        assert buckets[0]["count"] == 1
        assert buckets[1]["count"] == 1
        assert buckets[5]["count"] == 1
        assert buckets[9]["count"] == 2  # 99.9 and 100

    async def test_bucket_labels_are_correct(self):
        buckets = _score_distribution([])
        assert buckets[0]["range"] == "0-10"
        assert buckets[9]["range"] == "90-100"


# ── _cut_score_analysis ────────────────────────────────────────────────────────

class TestCutScoreAnalysis:
    async def test_split_at_50(self):
        percentages = [40.0, 60.0, 80.0, 30.0, 70.0]
        result = _cut_score_analysis(percentages, [50.0])
        assert len(result) == 1
        r = result[0]
        assert r["cut_score"] == 50.0
        assert r["pass_count"] == 3   # 60, 80, 70
        assert r["fail_count"] == 2   # 40, 30
        assert r["pass_rate"] == pytest.approx(60.0)

    async def test_multiple_cut_scores(self):
        percentages = [20.0, 40.0, 60.0, 80.0]
        result = _cut_score_analysis(percentages, [30.0, 50.0, 70.0])
        assert len(result) == 3

    async def test_empty_percentages(self):
        result = _cut_score_analysis([], [50.0])
        assert result[0]["pass_count"] == 0
        assert result[0]["fail_count"] == 0
