"""
Psychometric analytics endpoints (Epoch 7 — Stages 1, 2 & 3).
Stage 1: per-item P/D values, distractor analysis, version history.
Stage 2: score distribution, reliability (Cronbach's Alpha), SEM, pass rate, cut-score analysis.
Stage 3: combined dashboard, flagged items list (per-test & per-bank), CSV export.
Stage 4: bundle-style REST contract for frontend consumption.
"""
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse

from app.core.prisma_db import prisma
from app.core.dependencies import get_current_user
from app.models.user import UserRole
from app.schemas.analytics import (
    CutScoreEntry,
    ItemHistoryResponse,
    ItemVersionStats,
    TestAnalyticsBundleResponse,
    TestStatsResponse,
)
from app.services import psychometrics_service
from app.services.run_filter import assert_run_belongs_to_test

router = APIRouter()


def _require_analytics_user(current_user=Depends(get_current_user)):
    if current_user.role not in (
        UserRole.ADMIN.value,
        UserRole.CONSTRUCTOR.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires CONSTRUCTOR or ADMIN role.",
        )
    return current_user


async def _require_test_access(test_definition_id: str, current_user) -> None:
    test_definition = await prisma.test_definitions.find_unique(
        where={"id": test_definition_id}
    )
    if not test_definition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found.")

    if current_user.role != UserRole.ADMIN.value and test_definition.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this test's analytics.",
        )


async def _require_learning_object_access(learning_object_id: str, current_user) -> None:
    learning_object = await prisma.learning_objects.find_unique(
        where={"id": learning_object_id}
    )
    if not learning_object:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning object not found.",
        )

    if current_user.role != UserRole.ADMIN.value and learning_object.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this item's analytics.",
        )


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
    "/tests/{test_definition_id}/runs",
    summary="Per-run analytics aggregates",
)
async def list_analytics_runs(
    test_definition_id: UUID,
    current_user=Depends(_require_analytics_user),
) -> List[Dict[str, Any]]:
    """
    Per-scheduled-session analytics aggregates plus a pinned "Combined"
    sentinel row representing the all-runs cohort (the recommended default
    for psychometric power — splitting halves the sample per run).
    """
    await _require_test_access(str(test_definition_id), current_user)
    return await psychometrics_service.list_analytics_runs(str(test_definition_id))


@router.get(
    "/tests/{test_definition_id}",
    response_model=TestAnalyticsBundleResponse,
    summary="Latest analytics bundle for a test",
)
async def get_test_analytics_bundle(
    test_definition_id: UUID,
    cut_scores: Optional[str] = Query(default=None),
    run_id: Optional[str] = Query(default=None, description="Scoped to one scheduled run, 'practice', or 'combined' / omit for all."),
    current_user=Depends(_require_analytics_user),
) -> Dict[str, Any]:
    await _require_test_access(str(test_definition_id), current_user)
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    bundle = await psychometrics_service.get_latest_test_analytics_bundle(
        str(test_definition_id),
        cut_scores=_parse_cut_scores(cut_scores),
        run_id=run_id,
    )
    if bundle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analytics computed yet.",
        )
    return bundle


@router.post(
    "/tests/{test_definition_id}/recompute",
    response_model=TestAnalyticsBundleResponse,
    summary="Recompute analytics for a test",
)
async def recompute_test_analytics_bundle(
    test_definition_id: UUID,
    cut_scores: Optional[str] = Query(default=None),
    run_id: Optional[str] = Query(default=None),
    current_user=Depends(_require_analytics_user),
) -> Dict[str, Any]:
    await _require_test_access(str(test_definition_id), current_user)
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    try:
        return await psychometrics_service.recompute_test_analytics_bundle(
            str(test_definition_id),
            cut_scores=_parse_cut_scores(cut_scores),
            run_id=run_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get(
    "/items/{learning_object_id}/history",
    response_model=ItemHistoryResponse,
    summary="Analytics history for an item",
)
async def get_item_history(
    learning_object_id: UUID,
    current_user=Depends(_require_analytics_user),
) -> Dict[str, Any]:
    await _require_learning_object_access(str(learning_object_id), current_user)
    return await psychometrics_service.get_item_history_entries(str(learning_object_id))


@router.get(
    "/tests/{test_definition_id}/cut-score-scenarios",
    response_model=List[CutScoreEntry],
    summary="Candidate cut-score pass-rate scenarios",
)
async def get_cut_score_scenarios(
    test_definition_id: UUID,
    cuts: str = Query(..., description="Comma-separated cut score percentages."),
    run_id: Optional[str] = Query(default=None),
    current_user=Depends(_require_analytics_user),
) -> List[Dict[str, Any]]:
    await _require_test_access(str(test_definition_id), current_user)
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    parsed_cuts = _parse_cut_scores(cuts)
    if not parsed_cuts:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one cut score must be supplied.",
        )
    return await psychometrics_service.get_cut_score_scenarios(
        str(test_definition_id),
        parsed_cuts,
        run_id=run_id,
    )


@router.get(
    "/tests/{test_definition_id}/item-stats",
    summary="Per-item psychometric statistics for a test",
)
async def get_test_item_stats(
    test_definition_id: UUID,
    run_id: Optional[str] = Query(default=None),
    current_user=Depends(_require_analytics_user),
) -> Dict[str, Any]:
    """
    Compute P-values, D-values, distractor analysis, and quality flags
    for every item used in graded sessions of this test.

    Only sessions that have been graded (at least auto-graded) are included.
    Essay items show P/D as null since is_correct is not set automatically.
    """
    await _require_test_access(str(test_definition_id), current_user)
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    return await psychometrics_service.compute_test_item_stats(
        str(test_definition_id), run_id=run_id,
    )


@router.get(
    "/items/{learning_object_id}/version-history",
    summary="P/D value history across item versions",
)
async def get_item_version_history(
    learning_object_id: UUID,
    current_user=Depends(_require_analytics_user),
) -> Dict[str, Any]:
    """
    Show how P-value and D-value have changed across different versions of the
    same learning object, aggregated across all tests that used each version.
    Useful for evaluating whether edits improved or degraded item quality.
    """
    await _require_learning_object_access(str(learning_object_id), current_user)
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
    run_id: Optional[str] = Query(default=None),
    current_user=Depends(_require_analytics_user),
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
    await _require_test_access(str(test_definition_id), current_user)
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    parsed_cuts = _parse_cut_scores(cut_scores)

    return await psychometrics_service.compute_test_stats(
        str(test_definition_id), cut_scores=parsed_cuts, run_id=run_id,
    )


# ── Stage 3: dashboard, flagged items, export ─────────────────────────────────


@router.get(
    "/tests/{test_definition_id}/dashboard",
    summary="Combined analytics dashboard for a test",
)
async def get_test_dashboard(
    test_definition_id: UUID,
    cut_scores: Optional[str] = Query(default=None),
    run_id: Optional[str] = Query(default=None),
    current_user=Depends(_require_analytics_user),
) -> Dict[str, Any]:
    """
    Single-call dashboard response combining:
    - Test-level stats (Stage 2): distribution, reliability, pass rate, cut-score analysis
    - Item-level stats (Stage 1): P/D values, distractor analysis
    - Flagged items list: items exceeding any psychometric threshold
    """
    await _require_test_access(str(test_definition_id), current_user)
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    return await psychometrics_service.compute_dashboard(
        str(test_definition_id),
        cut_scores=_parse_cut_scores(cut_scores),
        run_id=run_id,
    )


@router.get(
    "/tests/{test_definition_id}/flagged-items",
    response_model=List[ItemVersionStats],
    summary="Items with psychometric quality flags for a test",
)
async def get_flagged_items_for_test(
    test_definition_id: UUID,
    run_id: Optional[str] = Query(default=None),
    current_user=Depends(_require_analytics_user),
) -> List[Dict[str, Any]]:
    """
    Return only items that triggered at least one quality flag
    (TOO_HARD, TOO_EASY, or POOR_DISCRIMINATION) in this test.
    Used to surface items that need revision.
    """
    await _require_test_access(str(test_definition_id), current_user)
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    return await psychometrics_service.list_flagged_items_for_test(
        str(test_definition_id), run_id=run_id,
    )


@router.get(
    "/banks/{bank_id}/flagged-items",
    summary="Bank-wide flagged items across all tests",
)
async def get_flagged_items_for_bank(
    bank_id: UUID,
    current_user=Depends(_require_analytics_user),
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
    run_id: Optional[str] = Query(default=None),
    current_user=Depends(_require_analytics_user),
) -> StreamingResponse:
    """
    Download a CSV analytics report for a test.
    Includes test-level summary, score distribution, and per-item statistics.
    Suitable for exam board reviews.
    """
    await _require_test_access(str(test_definition_id), current_user)
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    csv_content = await psychometrics_service.export_test_analytics_report(
        str(test_definition_id), run_id=run_id,
    )
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=analytics_{test_definition_id}.csv"
        },
    )


@router.get(
    "/tests/{test_definition_id}/sections",
    summary="Per-section (per-block) analytics for a test",
)
async def get_test_section_analytics(
    test_definition_id: UUID,
    run_id: Optional[str] = Query(default=None),
    current_user=Depends(_require_analytics_user),
) -> Dict[str, Any]:
    """
    Aggregate P-value, D-value, and mean score per blueprint block.

    FIXED rules are matched by `learning_object_id`; RANDOM rules contribute
    to the section's `question_count` only.
    """
    await _require_test_access(str(test_definition_id), current_user)
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    return await psychometrics_service.compute_section_analytics(
        str(test_definition_id), run_id=run_id,
    )


@router.get(
    "/tests/{test_definition_id}/export.pdf",
    summary="Download analytics report as PDF",
)
async def export_pdf_report(
    test_definition_id: UUID,
    run_id: Optional[str] = Query(default=None),
    current_user=Depends(_require_analytics_user),
) -> Response:
    """
    Generate and download a one-page PDF analytics report for a test.

    Includes summary statistics, score distribution histogram, and flagged items.
    Suitable for exam-board submission. Requires CONSTRUCTOR or ADMIN role.
    """
    await _require_test_access(str(test_definition_id), current_user)
    await assert_run_belongs_to_test(run_id, str(test_definition_id))
    from app.services.analytics_pdf_service import render_pdf

    pdf_bytes = await render_pdf(str(test_definition_id), run_id=run_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="analytics_{test_definition_id}.pdf"'
        },
    )
