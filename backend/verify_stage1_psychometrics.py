"""
Quick verification tests for Stage 1 psychometric pure-function helpers.
Tests P-value computation, D-value (point-biserial), distractor analysis, and flagging.
No DB connection required — exercises the pure logic layer.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.psychometrics_service import (
    _point_biserial,
    _build_flags,
    _compute_distractor_stats,
    _parse_options,
    _parse_json,
)


# ── helpers ──────────────────────────────────────────────────────────────────

class _Grade:
    """Minimal mock for a question_grade row."""
    def __init__(self, is_correct, session_id, student_answer):
        self.is_correct = is_correct
        self.session_id = session_id
        self.student_answer = student_answer


PASSED = 0
FAILED = 0


def check(name, condition, detail=""):
    global PASSED, FAILED
    if condition:
        print(f"  ✓  {name}")
        PASSED += 1
    else:
        print(f"  ✗  {name}" + (f" — {detail}" if detail else ""))
        FAILED += 1


# ── _parse_json ───────────────────────────────────────────────────────────────

print("\n[_parse_json]")
check("dict passthrough", _parse_json({"a": 1}) == {"a": 1})
check("list passthrough", _parse_json([1, 2]) == [1, 2])
check("JSON string decode", _parse_json('{"x": 2}') == {"x": 2})
check("bad string returns empty dict", _parse_json("not-json") == {})
check("None returns empty dict", _parse_json(None) == {})


# ── _parse_options ────────────────────────────────────────────────────────────

print("\n[_parse_options]")
check("plain list", len(_parse_options([{"text": "A"}, {"text": "B"}])) == 2)
check("dict with choices key", len(_parse_options({"choices": [{"text": "A"}]})) == 1)
check("dict with options key", len(_parse_options({"options": [{"text": "A"}]})) == 1)
check("empty dict returns []", _parse_options({}) == [])
check("None returns []", _parse_options(None) == [])


# ── _point_biserial ───────────────────────────────────────────────────────────

print("\n[_point_biserial]")

# Perfect positive discrimination: top scorers all correct
d = _point_biserial([True, True, True, False, False], [100.0, 80.0, 60.0, 40.0, 20.0])
check("positive discrimination is > 0", d is not None and d > 0, d)
check("result within [-1, 1]", d is not None and -1.0 <= d <= 1.0, d)

# All correct → no binary variance → should return None
d_none = _point_biserial([True, True, True], [90.0, 80.0, 70.0])
check("all correct returns None", d_none is None)

# All wrong → no binary variance → should return None
d_none2 = _point_biserial([False, False, False], [90.0, 80.0, 70.0])
check("all wrong returns None", d_none2 is None)

# Only 1 data point → should return None
d_one = _point_biserial([True], [80.0])
check("single observation returns None", d_one is None)

# All scores identical → no score variance → should return None
d_flat = _point_biserial([True, False, True, False], [50.0, 50.0, 50.0, 50.0])
check("flat scores return None", d_flat is None)

# Negative discrimination: low scorers got it right
d_neg = _point_biserial([False, False, True, True], [100.0, 90.0, 20.0, 10.0])
check("negative discrimination is < 0", d_neg is not None and d_neg < 0, d_neg)


# ── _build_flags ─────────────────────────────────────────────────────────────

print("\n[_build_flags]")

flags = _build_flags(p_value=0.15, d_value=0.5)
codes = {f["code"] for f in flags}
check("P < 0.20 flags TOO_HARD", "TOO_HARD" in codes)
check("P < 0.20 does NOT flag TOO_EASY", "TOO_EASY" not in codes)

flags = _build_flags(p_value=0.95, d_value=0.5)
codes = {f["code"] for f in flags}
check("P > 0.90 flags TOO_EASY", "TOO_EASY" in codes)

flags = _build_flags(p_value=0.50, d_value=0.10)
codes = {f["code"] for f in flags}
check("D < 0.15 flags POOR_DISCRIMINATION", "POOR_DISCRIMINATION" in codes)

flags = _build_flags(p_value=0.65, d_value=0.40)
check("good item → no flags", len(flags) == 0, flags)

flags = _build_flags(p_value=None, d_value=None)
check("both None → no flags", len(flags) == 0)

# Boundary values
flags = _build_flags(p_value=0.20, d_value=0.15)
check("P exactly 0.20 is not TOO_HARD", "TOO_HARD" not in {f["code"] for f in flags})
check("P exactly 0.20 is not TOO_EASY", "TOO_EASY" not in {f["code"] for f in flags})
check("D exactly 0.15 is not POOR_DISCRIMINATION",
      "POOR_DISCRIMINATION" not in {f["code"] for f in flags})


# ── _compute_distractor_stats ─────────────────────────────────────────────────

print("\n[_compute_distractor_stats]")

options = [
    {"text": "Option A (wrong)",    "is_correct": False},
    {"text": "Option B (correct)",  "is_correct": True},
    {"text": "Option C (wrong)",    "is_correct": False},
    {"text": "Option D (non-func)", "is_correct": False},   # never selected
]
grades = [
    _Grade(True,  "s1", {"selected_option_index": 1}),
    _Grade(True,  "s2", {"selected_option_index": 1}),
    _Grade(False, "s3", {"selected_option_index": 2}),
    _Grade(False, "s4", {"selected_option_index": 0}),
    _Grade(False, "s5", {"selected_option_index": 0}),
    # option D (index 3) never selected — non-functional
]

stats = _compute_distractor_stats(grades, options, "MULTIPLE_CHOICE")
check("returns 4 entries for 4 options", len(stats) == 4)

opt_d = next(s for s in stats if s["option_index"] == 3)
check("option D is non-functional (0% < 5%)", opt_d["is_non_functional"])
check("option D count is 0", opt_d["count"] == 0)

opt_b = next(s for s in stats if s["option_index"] == 1)
check("correct option is_correct=True", opt_b["is_correct"])
check("correct option NOT non-functional", not opt_b["is_non_functional"])
check("correct option percentage correct", abs(opt_b["percentage"] - 40.0) < 0.01)

opt_a = next(s for s in stats if s["option_index"] == 0)
check("option A percentage is 40%", abs(opt_a["percentage"] - 40.0) < 0.01)
check("option A is NOT non-functional (40% >= 5%)", not opt_a["is_non_functional"])

# ESSAY → empty
stats_essay = _compute_distractor_stats(grades, options, "ESSAY")
check("essay returns []", stats_essay == [])

# no grades → empty
stats_empty = _compute_distractor_stats([], options, "MULTIPLE_CHOICE")
check("no grades returns []", stats_empty == [])

# MR type
mr_grades = [
    _Grade(True,  "s1", {"selected_option_indices": [0, 1]}),
    _Grade(False, "s2", {"selected_option_indices": [1]}),
]
mr_opts = [{"text": "A", "is_correct": True}, {"text": "B", "is_correct": True}]
mr_stats = _compute_distractor_stats(mr_grades, mr_opts, "MULTIPLE_RESPONSE")
check("MR returns 2 entries", len(mr_stats) == 2)
opt_0 = next(s for s in mr_stats if s["option_index"] == 0)
check("MR option 0 selected by 1/2 students", opt_0["count"] == 1)


# ── summary ───────────────────────────────────────────────────────────────────

print(f"\n{'═' * 50}")
total = PASSED + FAILED
print(f"  {PASSED}/{total} passed  |  {FAILED} failed")
if FAILED == 0:
    print("  ✓  Stage 1 verification PASSED")
    sys.exit(0)
else:
    print("  ✗  Stage 1 verification FAILED")
    sys.exit(1)
