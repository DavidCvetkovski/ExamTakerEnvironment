"""
Psychometric analytics endpoints (Epoch 7 — Stages 1, 2 & 3).
Stage 1: per-item P/D values, distractor analysis, version history.
Stage 2: score distribution, reliability (Cronbach's Alpha), SEM, pass rate, cut-score analysis.
Stage 3: combined dashboard, flagged items list (per-test & per-bank), CSV export.
All routes require CONSTRUCTOR, REVIEWER, or ADMIN role.
"""
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.core.dependencies import get_current_user
from app.models.user import UserRole
from app.services import psychometrics_service

router = APIRouter()


def _require_instructor(current_user=Depends(get_current_user)):
    if current_user.role not in (
        UserRole.ADMIN.value,
        UserRole.CONSTRUCTOR.value,
        UserRole.REVIEWER.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires CONSTRUCTOR, REVIEWER, or ADMIN role.",
        )
    return current_user


@router.get(
    "/tests/{test_definition_id}/item-stats",
    summary="Per-item psychometric statistics for a test",
)
async def get_test_item_stats(
    test_definition_id: UUID,
    current_user=Depends(_require_instructor),
) -> Dict[str, Any]:
    """
    Compute P-values, D-values, distractor analysis, and quality flags
    for every item used in graded sessions of this test.

    Only sessions that have been graded (at least auto-graded) are included.
    Essay items show P/D as null since is_correct is not set automatically.
    """
    return await psychometrics_service.compute_test_item_stats(str(test_definition_id))


@router.get(
    "/items/{learning_object_id}/version-history",
    summary="P/D value history across item versions",
)
async def get_item_version_history(
    learning_object_id: UUID,
    current_user=Depends(_require_instructor),
) -> Dict[str, Any]:
    """
    Show how P-value and D-value have changed across different versions of the
    same learning object, aggregated across all tests that used each version.
    Useful for evaluating whether edits improved or degraded item quality.
    """
    return await psychometrics_service.compute_item_version_history(
        str(learning_object_id)
    )


# ── Stage 2: per-test statistics ─────────────────────────────────────────────

@router.get(
    "/tests/{test_definition_id}/stats",
    summary="Per-test score distribution and reliability statistics",
)
async def get_test_stats(
    test_definition_id: UUID,
    cut_scores: Optional[str] = Query(
        default=None,
        description="Comma-separated cut-score percentages for pass-rate simulation (e.g. '45,50,55,60').",
    ),
    current_user=Depends(_require_instructor),
) -> Dict[str, Any]:
    """
    Compute per-test psychometric statistics across all graded sessions:
    - Score distribution histogram (10 buckets)
    - Mean, median, standard deviation, min, max
    - Pass rate based on configured grade boundary
    - Cronbach's Alpha / KR-20 for internal consistency
    - Standard Error of Measurement (SEM) in percentage points
    - Cut-score analysis: simulated pass rates at alternative thresholds
    """
    parsed_cuts: Optional[List[float]] = None
    if cut_scores:
        try:
            parsed_cuts = [float(v.strip()) for v in cut_scores.split(",") if v.strip()]
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="cut_scores must be a comma-separated list of numbers.",
            )

    return await psychometrics_service.compute_test_stats(
        str(test_definition_id), cut_scores=parsed_cuts
    )


# ── Stage 3: dashboard, flagged items, export ─────────────────────────────────

def _parse_cut_scores(raw: Optional[str]) -> Optional[List[float]]:
    if not raw:
        return None
    try:
        return [float(v.strip()) for v in raw.split(",") if v.strip()]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="cut_scores must be a comma-separated list of numbers.",
        )


@router.get(
    "/tests/{test_definition_id}/dashboard",
    summary="Combined analytics dashboard for a test",
)
async def get_test_dashboard(
    test_definition_id: UUID,
    cut_scores: Optional[str] = Query(default=None),
    current_user=Depends(_require_instructor),
) -> Dict[str, Any]:
    """
    Single-call dashboard response combining:
    - Test-level stats (Stage 2): distribution, reliability, pass rate, cut-score analysis
    - Item-level stats (Stage 1): P/D values, distractor analysis
    - Flagged items list: items exceeding any psychometric threshold
    """
    return await psychometrics_service.compute_dashboard(
        str(test_definition_id), cut_scores=_parse_cut_scores(cut_scores)
    )


@router.get(
    "/tests/{test_definition_id}/flagged-items",
    summary="Items with psychometric quality flags for a test",
)
async def get_flagged_items_for_test(
    test_definition_id: UUID,
    current_user=Depends(_require_instructor),
) -> Dict[str, Any]:
    """
    Return only items that triggered at least one quality flag
    (TOO_HARD, TOO_EASY, or POOR_DISCRIMINATION) in this test.
    Used to surface items that need revision.
    """
    return await psychometrics_service.get_flagged_items_for_test(str(test_definition_id))


@router.get(
    "/banks/{bank_id}/flagged-items",
    summary="Bank-wide flagged items across all tests",
)
async def get_flagged_items_for_bank(
    bank_id: UUID,
    current_user=Depends(_require_instructor),
) -> Dict[str, Any]:
    """
    Aggregate quality flags across all tests that have used items from this bank.
    Shows P/D values per version and whether the flag is on the latest version.
    """
    return await psychometrics_service.get_flagged_items_for_bank(str(bank_id))


@router.get(
    "/tests/{test_definition_id}/report",
    summary="Download analytics report as CSV",
)
async def export_test_analytics_report(
    test_definition_id: UUID,
    current_user=Depends(_require_instructor),
) -> StreamingResponse:
    """
    Download a CSV analytics report for a test.
    Includes test-level summary, score distribution, and per-item statistics.
    Suitable for exam board reviews.
    """
    csv_content = await psychometrics_service.export_test_analytics_report(
        str(test_definition_id)
    )
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=analytics_{test_definition_id}.csv"
        },
    )
