"""Unit tests for run_filter helper functions.

These are the pure-function half of the module — no DB. The
``assert_run_belongs_to_test`` integration tests live alongside the
grading/analytics endpoint tests where a Prisma client is available.

Why so many for one tiny module: ``run_filter`` is the single point that
answers "what is Combined?", and a change here silently re-introduces
practice-mode submissions into psychometric reliability calculations
(see Epoch 8.6.1). Every branch + sentinel + downstream caller's
expected dict shape is locked in here.
"""
import pytest

from app.services.run_filter import (
    COMBINED_SENTINEL,
    PRACTICE_SENTINEL,
    build_exam_session_run_filter,
    build_session_results_run_filter,
    is_combined,
)


# ─────────────────────────────────────────────
# is_combined — single-line classifier, big consequences
# ─────────────────────────────────────────────

@pytest.mark.parametrize("value", [None, "combined"])
def test_is_combined_true_for_none_and_sentinel(value):
    assert is_combined(value) is True


@pytest.mark.parametrize("value", ["practice", "uuid-here", "", " ", "Combined", "COMBINED"])
def test_is_combined_false_for_anything_else(value):
    """Case-sensitive; whitespace counts; empty string is not combined."""
    assert is_combined(value) is False


def test_combined_sentinel_constant():
    assert COMBINED_SENTINEL == "combined"


def test_practice_sentinel_constant():
    assert PRACTICE_SENTINEL == "practice"


# ─────────────────────────────────────────────
# build_exam_session_run_filter
# ─────────────────────────────────────────────

@pytest.mark.parametrize("value", [None, "combined"])
def test_exam_session_combined_excludes_practice(value):
    """Regression guard: Combined MUST filter to session_mode='ASSIGNED'.
    The whole 8.6.1 cleanup hinges on this single dict.
    """
    assert build_exam_session_run_filter(value) == {"session_mode": "ASSIGNED"}


def test_exam_session_practice_sentinel():
    assert build_exam_session_run_filter("practice") == {
        "scheduled_session_id": None,
        "session_mode": "PRACTICE",
    }


def test_exam_session_uuid_run_id():
    """A non-sentinel string is treated as a scheduled-session UUID."""
    assert build_exam_session_run_filter("abc-123") == {"scheduled_session_id": "abc-123"}


def test_exam_session_uuid_does_not_constrain_mode():
    """When a specific run is requested, mode is not filtered — a scheduled
    run is by definition ASSIGNED, so adding the filter would be redundant
    AND would silently exclude any legacy practice rows accidentally
    attached to a scheduled session."""
    result = build_exam_session_run_filter("abc-123")
    assert "session_mode" not in result


# ─────────────────────────────────────────────
# build_session_results_run_filter — mirrors the above via nested relation
# ─────────────────────────────────────────────

@pytest.mark.parametrize("value", [None, "combined"])
def test_session_results_combined_excludes_practice_via_relation(value):
    assert build_session_results_run_filter(value) == {
        "exam_sessions": {"session_mode": "ASSIGNED"}
    }


def test_session_results_practice_sentinel_via_relation():
    assert build_session_results_run_filter("practice") == {
        "exam_sessions": {
            "scheduled_session_id": None,
            "session_mode": "PRACTICE",
        }
    }


def test_session_results_uuid_via_relation():
    assert build_session_results_run_filter("zzz") == {
        "exam_sessions": {"scheduled_session_id": "zzz"}
    }


# ─────────────────────────────────────────────
# Symmetry — both filters MUST agree on what Combined means
# ─────────────────────────────────────────────

@pytest.mark.parametrize("value", [None, "combined", "practice", "some-uuid"])
def test_exam_session_and_session_results_filters_stay_in_sync(value):
    """Both helpers must encode the same cohort contract — exam-session-side
    and session-results-side — so a query joining the two never disagrees
    about which submissions belong to which view.
    """
    exam_filter = build_exam_session_run_filter(value)
    results_filter = build_session_results_run_filter(value)
    # Strip the relation wrapper for direct comparison.
    inner = results_filter.get("exam_sessions", results_filter)
    assert exam_filter == inner
