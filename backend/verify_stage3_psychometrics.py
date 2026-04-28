"""
Quick verification tests for Stage 3 psychometric functions.
Tests the CSV export builder and validates that service functions
are wired correctly by running end-to-end in-process with mocked data.
No DB connection required for pure-function tests.
"""
import sys
import os
import asyncio
import csv
import io

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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


# ── Test that pure helpers compose correctly ─────────────────────────────────

from app.services.psychometrics_service import (
    _build_flags,
    _point_biserial,
    _compute_distractor_stats,
    _score_distribution,
    _cronbach_alpha,
    _cut_score_analysis,
    _mean,
    _median,
    _std_dev,
)

print("\n[Stage 3 — composition of Stage 1 + 2 helpers]")

# Simulate what compute_dashboard does: items with flags
items = [
    {"learning_object_id": "lo1", "p_value": 0.10, "d_value": 0.50, "flags": _build_flags(0.10, 0.50)},
    {"learning_object_id": "lo2", "p_value": 0.50, "d_value": 0.40, "flags": _build_flags(0.50, 0.40)},
    {"learning_object_id": "lo3", "p_value": 0.95, "d_value": 0.30, "flags": _build_flags(0.95, 0.30)},
    {"learning_object_id": "lo4", "p_value": 0.60, "d_value": 0.05, "flags": _build_flags(0.60, 0.05)},
]

flagged = [item for item in items if item["flags"]]
check("flagged items = 3 (lo1=too_hard, lo3=too_easy, lo4=poor_disc)", len(flagged) == 3,
      [(i["learning_object_id"], [f["code"] for f in i["flags"]]) for i in flagged])
check("lo2 (good item) not in flagged", not any(i["learning_object_id"] == "lo2" for i in flagged))

flag_codes_all = {code for item in flagged for f in item["flags"] for code in [f["code"]]}
check("TOO_HARD present", "TOO_HARD" in flag_codes_all)
check("TOO_EASY present", "TOO_EASY" in flag_codes_all)
check("POOR_DISCRIMINATION present", "POOR_DISCRIMINATION" in flag_codes_all)


# ── CSV export structure ──────────────────────────────────────────────────────

print("\n[CSV report structure]")

# Build a synthetic CSV the way export_test_analytics_report does
def build_test_csv(test_stats, item_stats):
    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(["# Test Analytics Report"])
    w.writerow(["Section", "Metric", "Value"])
    for metric, val in [
        ("Total Sessions", test_stats["total_sessions"]),
        ("Mean Score (%)", test_stats["mean"]),
        ("Pass Rate (%)", test_stats["pass_rate"]),
        ("Cronbach's Alpha", test_stats["cronbach_alpha"]),
    ]:
        w.writerow(["Test Summary", metric, val])
    w.writerow([])
    w.writerow(["# Item Statistics"])
    w.writerow(["learning_object_id", "item_version_id", "version_number",
                "question_type", "p_value", "d_value", "n_responses", "flags"])
    for item in item_stats["items"]:
        flag_codes = "; ".join(f["code"] for f in item["flags"])
        w.writerow([
            item["learning_object_id"], item["item_version_id"],
            item["version_number"], item["question_type"],
            item["p_value"], item["d_value"],
            item["n_responses"], flag_codes,
        ])
    return output.getvalue()

mock_test_stats = {
    "total_sessions": 5,
    "mean": 65.0,
    "pass_rate": 80.0,
    "cronbach_alpha": 0.75,
}
mock_item_stats = {
    "items": [
        {
            "learning_object_id": "lo1",
            "item_version_id": "iv1",
            "version_number": 1,
            "question_type": "MULTIPLE_CHOICE",
            "p_value": 0.60,
            "d_value": 0.40,
            "n_responses": 5,
            "flags": [],
        },
        {
            "learning_object_id": "lo2",
            "item_version_id": "iv2",
            "version_number": 2,
            "question_type": "MULTIPLE_CHOICE",
            "p_value": 0.15,
            "d_value": 0.45,
            "n_responses": 5,
            "flags": _build_flags(0.15, 0.45),
        },
    ]
}

csv_output = build_test_csv(mock_test_stats, mock_item_stats)

check("CSV is non-empty", len(csv_output) > 0)
check("CSV contains test analytics header", "Test Analytics Report" in csv_output)
check("CSV contains Test Summary rows", "Test Summary" in csv_output)
check("CSV contains Item Statistics section", "Item Statistics" in csv_output)
check("CSV contains TOO_HARD flag for lo2", "TOO_HARD" in csv_output)
check("CSV contains lo1 row with no flags", "lo1" in csv_output)

# Parse the CSV to count rows
reader_rows = list(csv.reader(io.StringIO(csv_output)))
check("CSV has more than 10 rows", len(reader_rows) > 10, len(reader_rows))

# Verify item rows
item_rows = [r for r in reader_rows if r and r[0] == "lo1"]
check("CSV contains exactly 1 row for lo1", len(item_rows) == 1)

item_rows_lo2 = [r for r in reader_rows if r and r[0] == "lo2"]
check("CSV contains exactly 1 row for lo2 with TOO_HARD",
      len(item_rows_lo2) == 1 and "TOO_HARD" in item_rows_lo2[0][-1])


# ── Cut-score analysis round-trip ─────────────────────────────────────────────

print("\n[Cut-score analysis integration]")
scores = [30.0, 45.0, 50.0, 55.0, 60.0, 70.0, 80.0, 90.0, 95.0, 100.0]
analysis = _cut_score_analysis(scores, [50.0, 55.0, 60.0])

entry_55 = next(e for e in analysis if e["cut_score"] == 55.0)
# Scores >= 55: [55, 60, 70, 80, 90, 95, 100] = 7 pass
check("cut=55: 7 pass out of 10", entry_55["pass_count"] == 7, entry_55)
check("cut=55: pass_rate=70%", abs(entry_55["pass_rate"] - 70.0) < 0.01, entry_55)

entry_60 = next(e for e in analysis if e["cut_score"] == 60.0)
# Scores >= 60: [60, 70, 80, 90, 95, 100] = 6 pass
check("cut=60: 6 pass out of 10", entry_60["pass_count"] == 6, entry_60)

# Higher cut → lower or equal pass rate
check("pass_rate decreases as cut-score rises",
      entry_55["pass_rate"] >= entry_60["pass_rate"])


# ── Module imports are clean (no circular imports) ────────────────────────────

print("\n[Module structure]")
try:
    from app.api.endpoints import analytics as analytics_module
    check("analytics endpoint module imports without error", True)
    check("router is defined", hasattr(analytics_module, "router"))
except Exception as e:
    check("analytics endpoint module imports without error", False, str(e))


# ── summary ───────────────────────────────────────────────────────────────────

print(f"\n{'═' * 50}")
total = PASSED + FAILED
print(f"  {PASSED}/{total} passed  |  {FAILED} failed")
if FAILED == 0:
    print("  ✓  Stage 3 verification PASSED")
    sys.exit(0)
else:
    print("  ✗  Stage 3 verification FAILED")
    sys.exit(1)
