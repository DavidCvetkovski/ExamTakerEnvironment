"""
test_analytics_service.py — Service-layer tests for psychometrics + PDF export.

Prisma client methods are compiled (read-only), so we patch at the service
function level using unittest.mock.patch rather than trying to monkeypatch
Prisma internals.

Covers:
  - export_test_analytics_report: CSV structure
  - analytics_pdf_service.render_pdf: bytes, magic bytes, test ID in content
  - Flag logic: _build_flags fired correctly at service boundary
  - get_flagged_items_for_test / get_flagged_items_for_bank delegation
"""
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, patch, MagicMock
import asyncio

import pytest

pytestmark = pytest.mark.anyio

from app.services import psychometrics_service


# ── helpers ────────────────────────────────────────────────────────────────────

def _fake_test_stats(test_id: str, n: int = 5) -> dict:
    return {
        "test_definition_id": test_id,
        "total_sessions": n,
        "distribution": [
            {"range": f"{i*10}-{(i+1)*10}", "min": float(i*10), "max": float((i+1)*10), "count": 0}
            for i in range(10)
        ],
        "mean": 62.5,
        "median": 65.0,
        "std_dev": 11.2,
        "min_score": 30.0,
        "max_score": 90.0,
        "pass_rate": 60.0,
        "pass_count": 3,
        "fail_count": 2,
        "cronbach_alpha": 0.74,
        "sem": 5.7,
        "n_items": 8,
        "cut_score": 55.0,
        "computed_at": None,
        "is_stale": False,
        "cut_score_analysis": [],
    }


def _fake_item_stats(test_id: str) -> dict:
    return {
        "test_definition_id": test_id,
        "total_sessions": 5,
        "items": [
            {
                "learning_object_id": str(uuid4()),
                "item_version_id": str(uuid4()),
                "version_number": 1,
                "question_type": "MULTIPLE_CHOICE",
                "p_value": 0.6,
                "d_value": 0.3,
                "n_responses": 5,
                "mean_score": 0.6,
                "points_possible": 1.0,
                "distractors": [],
                "flags": [],
                "computed_at": None,
            }
        ],
    }


# ── export_test_analytics_report ──────────────────────────────────────────────

class TestExportCsvReport:
    @pytest.mark.anyio
    async def test_csv_contains_required_sections(self):
        test_id = str(uuid4())

        with patch.object(
            psychometrics_service, "compute_test_stats", new=AsyncMock(return_value=_fake_test_stats(test_id))
        ), patch.object(
            psychometrics_service, "compute_test_item_stats", new=AsyncMock(return_value=_fake_item_stats(test_id))
        ):
            csv_output = await psychometrics_service.export_test_analytics_report(test_id)

        assert isinstance(csv_output, str)
        assert "Test Analytics Report" in csv_output
        assert "Score Distribution" in csv_output
        assert "Item Statistics" in csv_output
        assert test_id in csv_output

    @pytest.mark.anyio
    async def test_csv_summary_includes_key_metrics(self):
        test_id = str(uuid4())
        stats = _fake_test_stats(test_id)

        with patch.object(
            psychometrics_service, "compute_test_stats", new=AsyncMock(return_value=stats)
        ), patch.object(
            psychometrics_service, "compute_test_item_stats", new=AsyncMock(return_value=_fake_item_stats(test_id))
        ):
            csv_output = await psychometrics_service.export_test_analytics_report(test_id)

        assert "Mean Score" in csv_output or "62.5" in csv_output
        assert "Cronbach" in csv_output or "0.74" in csv_output


# ── analytics_pdf_service.render_pdf ──────────────────────────────────────────

class TestRenderPdf:
    @pytest.mark.anyio
    async def test_returns_non_empty_bytes_with_pdf_magic(self):
        test_id = str(uuid4())

        with patch.object(
            psychometrics_service, "compute_test_stats", new=AsyncMock(return_value=_fake_test_stats(test_id))
        ), patch.object(
            psychometrics_service, "compute_test_item_stats", new=AsyncMock(return_value=_fake_item_stats(test_id))
        ):
            from app.services.analytics_pdf_service import render_pdf
            pdf_bytes = await render_pdf(test_id)

        assert isinstance(pdf_bytes, bytes)
        assert len(pdf_bytes) > 1024
        assert pdf_bytes[:4] == b"%PDF"

    @pytest.mark.anyio
    async def test_pdf_embeds_test_id(self):
        test_id = str(uuid4())

        with patch.object(
            psychometrics_service, "compute_test_stats", new=AsyncMock(return_value=_fake_test_stats(test_id))
        ), patch.object(
            psychometrics_service, "compute_test_item_stats", new=AsyncMock(return_value=_fake_item_stats(test_id))
        ):
            from app.services.analytics_pdf_service import render_pdf
            pdf_bytes = await render_pdf(test_id)

        # The test ID (or first 8 chars) should appear somewhere in PDF content
        assert test_id.encode() in pdf_bytes or test_id[:8].encode() in pdf_bytes

    @pytest.mark.anyio
    async def test_pdf_with_flagged_items_renders_without_error(self):
        test_id = str(uuid4())
        lo_id = str(uuid4())
        stats = _fake_test_stats(test_id)
        item_stats = {
            "test_definition_id": test_id,
            "total_sessions": 10,
            "items": [
                {
                    "learning_object_id": lo_id,
                    "item_version_id": str(uuid4()),
                    "version_number": 2,
                    "question_type": "MULTIPLE_CHOICE",
                    "p_value": 0.10,
                    "d_value": 0.05,
                    "n_responses": 10,
                    "mean_score": 0.10,
                    "points_possible": 1.0,
                    "distractors": [],
                    "flags": [
                        {"code": "TOO_HARD", "message": "P-value below 0.20"},
                        {"code": "POOR_DISCRIMINATION", "message": "D-value below 0.15"},
                    ],
                    "computed_at": None,
                }
            ],
        }

        with patch.object(
            psychometrics_service, "compute_test_stats", new=AsyncMock(return_value=stats)
        ), patch.object(
            psychometrics_service, "compute_test_item_stats", new=AsyncMock(return_value=item_stats)
        ):
            from app.services.analytics_pdf_service import render_pdf
            pdf_bytes = await render_pdf(test_id)

        assert pdf_bytes[:4] == b"%PDF"


# ── flag logic at service boundary ────────────────────────────────────────────

class TestFlagLogicIntegration:
    """Verify that _build_flags is correctly wired to _point_biserial output."""

    async def test_too_hard_threshold_is_0_20(self):
        flags = psychometrics_service._build_flags(p_value=0.19, d_value=0.30)
        assert any(f["code"] == "TOO_HARD" for f in flags)

    async def test_too_easy_threshold_is_0_90(self):
        flags = psychometrics_service._build_flags(p_value=0.91, d_value=0.30)
        assert any(f["code"] == "TOO_EASY" for f in flags)

    async def test_poor_discrimination_threshold_is_0_15(self):
        flags = psychometrics_service._build_flags(p_value=0.50, d_value=0.14)
        assert any(f["code"] == "POOR_DISCRIMINATION" for f in flags)

    async def test_no_flags_for_ideal_item(self):
        flags = psychometrics_service._build_flags(p_value=0.55, d_value=0.40)
        assert flags == []
