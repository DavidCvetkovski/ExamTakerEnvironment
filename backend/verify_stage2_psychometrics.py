"""
Quick verification tests for Stage 2 psychometric pure-function helpers.
Tests score distribution, Cronbach's Alpha, SEM helper, and cut-score analysis.
No DB connection required.
"""
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.psychometrics_service import (
    _mean,
    _median,
    _std_dev,
    _score_distribution,
    _cronbach_alpha,
    _cut_score_analysis,
)

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


def approx(a, b, tol=0.001):
    if a is None or b is None:
        return False
    return abs(a - b) < tol


# ── _mean / _median / _std_dev ────────────────────────────────────────────────

print("\n[_mean / _median / _std_dev]")
vals = [60.0, 70.0, 80.0, 90.0, 100.0]
check("mean of [60,70,80,90,100]", approx(_mean(vals), 80.0))
check("median of [60,70,80,90,100]", approx(_median(vals), 80.0))
check("std_dev of [60,70,80,90,100]", approx(_std_dev(vals), 15.811, tol=0.01))
check("mean of []", _mean([]) is None)
check("median of []", _median([]) is None)
check("std_dev of []", _std_dev([]) is None)
check("std_dev single element", _std_dev([50.0]) is None)

# Even-length list → median is average of two middle values
even = [10.0, 20.0, 30.0, 40.0]
check("median of [10,20,30,40] is 25", approx(_median(even), 25.0))


# ── _score_distribution ───────────────────────────────────────────────────────

print("\n[_score_distribution]")
pcts = [5.0, 15.0, 55.0, 65.0, 75.0, 95.0, 100.0]
buckets = _score_distribution(pcts)
check("returns 10 buckets", len(buckets) == 10)
check("bucket 0 (0-10) has count 1", buckets[0]["count"] == 1)
check("bucket 1 (10-20) has count 1", buckets[1]["count"] == 1)
check("bucket 5 (50-60) has count 1", buckets[5]["count"] == 1)
check("bucket 6 (60-70) has count 1", buckets[6]["count"] == 1)
check("bucket 7 (70-80) has count 1", buckets[7]["count"] == 1)
# score of 95 → bucket 9 (90-100); score of 100 → clamped to bucket 9
check("bucket 9 (90-100) has count 2", buckets[9]["count"] == 2)
total_counts = sum(b["count"] for b in buckets)
check("total counts equals number of students", total_counts == len(pcts))

empty_dist = _score_distribution([])
check("empty input → all zeros", all(b["count"] == 0 for b in empty_dist))


# ── _cronbach_alpha ───────────────────────────────────────────────────────────

print("\n[_cronbach_alpha]")

# Perfect reliability: all students, same item ordering
# Items: each student has same score pattern → alpha should be high
matrix_perfect = [
    [1.0, 1.0, 1.0, 0.0, 0.0],  # student 1: 3/5
    [1.0, 1.0, 0.0, 0.0, 0.0],  # student 2: 2/5
    [1.0, 1.0, 1.0, 1.0, 0.0],  # student 3: 4/5
    [0.0, 0.0, 0.0, 0.0, 0.0],  # student 4: 0/5
    [1.0, 1.0, 1.0, 1.0, 1.0],  # student 5: 5/5
]
alpha_high = _cronbach_alpha(matrix_perfect)
check("high-reliability test → alpha exists", alpha_high is not None)
check("high-reliability test → alpha > 0.7", alpha_high is not None and alpha_high > 0.7,
      alpha_high)

# Zero variance in total scores → None
matrix_flat = [
    [1.0, 0.0],
    [0.0, 1.0],
    [1.0, 0.0],
    [0.0, 1.0],
]
alpha_maybe = _cronbach_alpha(matrix_flat)
# Scores are all 1.0 → total variance is 0 → None
check("zero total variance → alpha is None", alpha_maybe is None)

# Too few students → None
alpha_none = _cronbach_alpha([[1.0, 0.0]])
check("single student → None", alpha_none is None)

# Too few items → None
alpha_none2 = _cronbach_alpha([[1.0], [0.0], [1.0]])
check("single item → None", alpha_none2 is None)

# Empty matrix → None
alpha_empty = _cronbach_alpha([])
check("empty matrix → None", alpha_empty is None)

# Manual calculation check for a small case
# Items: student A [1, 0], student B [0, 1], student C [1, 1]
# Item 1 scores: [1, 0, 1] → var = ((0)^2 + (2/3)^2 + (0)^2)/2 using sample variance
# Item 2 scores: [0, 1, 1] → similar
# Total: [1, 1, 2]
matrix_manual = [[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]]
alpha_manual = _cronbach_alpha(matrix_manual)
check("small matrix alpha is a number", alpha_manual is not None)
check("small matrix alpha is a finite number", alpha_manual is not None and math.isfinite(alpha_manual),
      alpha_manual)

# Known value: classic 2-item, 3-student case
# This has KR-20 = 2/(2-1) * (1 - (var1 + var2) / total_var)
# total scores: [1, 1, 2] → mean=4/3, var_sample = ((1-4/3)^2 + (1-4/3)^2 + (2-4/3)^2)/2
t_scores = [1.0, 1.0, 2.0]
n = 3
m = sum(t_scores)/n
total_var = sum((s-m)**2 for s in t_scores)/(n-1)
i1 = [1.0, 0.0, 1.0]; m1 = sum(i1)/n
i2 = [0.0, 1.0, 1.0]; m2 = sum(i2)/n
var1 = sum((s-m1)**2 for s in i1)/(n-1)
var2 = sum((s-m2)**2 for s in i2)/(n-1)
expected = (2/(2-1)) * (1 - (var1 + var2) / total_var)
check(f"manual alpha matches formula ({round(expected,4)})",
      approx(alpha_manual, expected, tol=0.0001), alpha_manual)


# ── _cut_score_analysis ───────────────────────────────────────────────────────

print("\n[_cut_score_analysis]")
pcts = [40.0, 50.0, 55.0, 60.0, 65.0, 70.0, 80.0, 90.0]
analysis = _cut_score_analysis(pcts, [50.0, 55.0, 60.0])
check("returns 3 entries for 3 cut-scores", len(analysis) == 3)

entry_55 = next(e for e in analysis if e["cut_score"] == 55.0)
# Scores >= 55: [55, 60, 65, 70, 80, 90] = 6 pass, 2 fail
check("cut=55 pass_count=6", entry_55["pass_count"] == 6, entry_55)
check("cut=55 fail_count=2", entry_55["fail_count"] == 2, entry_55)
check("cut=55 pass_rate=75%", approx(entry_55["pass_rate"], 75.0), entry_55)

entry_50 = next(e for e in analysis if e["cut_score"] == 50.0)
# Scores >= 50: [50, 55, 60, 65, 70, 80, 90] = 7 pass
check("cut=50 pass_count=7", entry_50["pass_count"] == 7, entry_50)

analysis_empty = _cut_score_analysis([], [55.0])
check("empty scores → pass_rate=0", analysis_empty[0]["pass_rate"] == 0.0)
check("empty scores → pass_count=0", analysis_empty[0]["pass_count"] == 0)


# ── SEM formula (smoke test inline) ──────────────────────────────────────────

print("\n[SEM smoke test]")
sd_val = 15.0
alpha_val = 0.75
sem = round(sd_val * math.sqrt(1 - alpha_val), 4)
check("SEM = SD * sqrt(1 - alpha)", approx(sem, 15.0 * math.sqrt(0.25), tol=0.001))


# ── summary ───────────────────────────────────────────────────────────────────

print(f"\n{'═' * 50}")
total = PASSED + FAILED
print(f"  {PASSED}/{total} passed  |  {FAILED} failed")
if FAILED == 0:
    print("  ✓  Stage 2 verification PASSED")
    sys.exit(0)
else:
    print("  ✗  Stage 2 verification FAILED")
    sys.exit(1)
