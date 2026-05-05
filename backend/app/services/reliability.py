"""
Reliability and descriptive statistics for test-level analytics.

Contains Cronbach's Alpha (KR-20 for binary items), standard descriptive
statistics (mean, median, std dev), score-distribution histogram bucketing,
and cut-score pass/fail analysis. All functions are database-free.
"""
import math
from typing import Dict, List, Optional

__all__ = [
    "cronbach_alpha",
    "mean",
    "median",
    "std_dev",
    "score_distribution",
    "cut_score_analysis",
    "DEFAULT_CUT_SCORES",
]

DEFAULT_CUT_SCORES: List[float] = [30.0, 40.0, 45.0, 50.0, 55.0, 60.0, 65.0, 70.0]


def mean(values: List[float]) -> Optional[float]:
    """Return the mean of values, or None for an empty list."""
    if not values:
        return None
    return round(sum(values) / len(values), 4)


def median(values: List[float]) -> Optional[float]:
    """Return the median of values, or None for an empty list."""
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return round((s[mid - 1] + s[mid]) / 2 if n % 2 == 0 else s[mid], 4)


def std_dev(values: List[float], population: bool = False) -> Optional[float]:
    """Sample std dev (ddof=1) by default; population (ddof=0) when population=True."""
    n = len(values)
    if n < 2:
        return None
    m = sum(values) / n
    divisor = n if population else n - 1
    variance = sum((v - m) ** 2 for v in values) / divisor
    return round(math.sqrt(variance), 4)


def score_distribution(percentages: List[float]) -> List[Dict]:
    """Return a 10-bucket histogram (0–10, 10–20, …, 90–100)."""
    buckets = [
        {"range": f"{i * 10}-{(i + 1) * 10}", "min": i * 10, "max": (i + 1) * 10, "count": 0}
        for i in range(10)
    ]
    for pct in percentages:
        idx = min(int(pct // 10), 9)
        buckets[idx]["count"] += 1
    return buckets


def cronbach_alpha(item_scores_matrix: List[List[float]]) -> Optional[float]:
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


def cut_score_analysis(percentages: List[float], cut_scores: List[float]) -> List[Dict]:
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
