"""
analytics_pdf_service.py — Epoch 7, Stage 9.

Generates a one-page PDF analytics report for a test definition using
ReportLab (Platypus) with a matplotlib-rendered score distribution histogram
embedded as a PNG image.
"""
from __future__ import annotations

import asyncio
import io
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# matplotlib must be set to non-interactive backend before pyplot import
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image as RLImage,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.core.prisma_db import prisma
from app.services.analytics_formatters import fmt as _fmt
from app.services.items_service import extract_text_from_tiptap_json


def _difficulty_pct(item: Dict[str, Any]) -> str:
    """Points-based difficulty (avg points ÷ max), as a whole percent."""
    mean_score = item.get("mean_score")
    points_possible = item.get("points_possible")
    if mean_score is None or not points_possible:
        return "—"
    return f"{round((mean_score / points_possible) * 100)}%"


def _truncate(text: str, limit: int = 110) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else f"{text[: limit - 1].rstrip()}…"


async def _fetch_item_stems(item_version_ids: List[str]) -> Dict[str, str]:
    """Map item_version_id → plain-text question stem for the report."""
    if not item_version_ids:
        return {}
    versions = await prisma.item_versions.find_many(where={"id": {"in": item_version_ids}})
    stems: Dict[str, str] = {}
    for version in versions:
        content = version.content
        if isinstance(content, str):
            try:
                import json as _json
                content = _json.loads(content)
            except Exception:
                content = {}
        stems[version.id] = extract_text_from_tiptap_json(content) if isinstance(content, dict) else ""
    return stems

# ── Colour palette (dark-accent style matching the UI) ────────────────────────
_DARK_BG = colors.HexColor("#111827")
_HEADER_BG = colors.HexColor("#1e3a5f")
_HEADER_FG = colors.white
_ROW_ALT = colors.HexColor("#f0f4ff")
_FLAG_BG = colors.HexColor("#fef2f2")
_TEXT = colors.HexColor("#1f2937")
_MUTED = colors.HexColor("#6b7280")


def _build_histogram_image(distribution: List[Dict[str, Any]], width_cm: float = 14) -> RLImage:
    """Render the score-distribution bar chart and return a ReportLab Image."""
    labels = [b["range"] for b in distribution]
    counts = [b["count"] for b in distribution]

    fig, ax = plt.subplots(figsize=(width_cm / 2.54, 3.5))
    bar_colors = ["#3b82f6"] * len(counts)

    ax.bar(labels, counts, color=bar_colors, edgecolor="white", linewidth=0.4)
    ax.set_xlabel("Score range (%)", fontsize=8, color="#374151")
    ax.set_ylabel("Sessions", fontsize=8, color="#374151")
    ax.set_title("Score Distribution", fontsize=9, color="#111827", fontweight="bold")
    ax.tick_params(axis="both", labelsize=7, colors="#6b7280")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.patch.set_facecolor("#f9fafb")
    ax.set_facecolor("#f9fafb")
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return RLImage(buf, width=width_cm * cm, height=3.5 * cm)


def _summary_table(test_stats: Dict[str, Any]) -> Table:
    """Two-column Metric / Value summary table."""
    styles = getSampleStyleSheet()
    header_para_style = ParagraphStyle(
        "header_cell",
        parent=styles["Normal"],
        fontSize=8,
        textColor=_HEADER_FG,
        fontName="Helvetica-Bold",
    )
    cell_key_style = ParagraphStyle(
        "key_cell", parent=styles["Normal"], fontSize=8, textColor=_TEXT
    )
    cell_val_style = ParagraphStyle(
        "val_cell",
        parent=styles["Normal"],
        fontSize=8,
        textColor=_TEXT,
        fontName="Helvetica-Bold",
    )

    rows: List[List[Any]] = [
        [Paragraph("Metric", header_para_style), Paragraph("Value", header_para_style)],
        [Paragraph("Total sessions", cell_key_style), Paragraph(str(test_stats["total_sessions"]), cell_val_style)],
        [Paragraph("Mean score (%)", cell_key_style), Paragraph(_fmt(test_stats["mean"]), cell_val_style)],
        [Paragraph("Median score (%)", cell_key_style), Paragraph(_fmt(test_stats["median"]), cell_val_style)],
        [Paragraph("Std deviation (%)", cell_key_style), Paragraph(_fmt(test_stats["std_dev"]), cell_val_style)],
        [Paragraph("Min score (%)", cell_key_style), Paragraph(_fmt(test_stats["min_score"]), cell_val_style)],
        [Paragraph("Max score (%)", cell_key_style), Paragraph(_fmt(test_stats["max_score"]), cell_val_style)],
        [Paragraph("Pass rate (%)", cell_key_style), Paragraph(_fmt(test_stats["pass_rate"]), cell_val_style)],
        [Paragraph("Pass count", cell_key_style), Paragraph(str(test_stats["pass_count"]), cell_val_style)],
        [Paragraph("Fail count", cell_key_style), Paragraph(str(test_stats["fail_count"]), cell_val_style)],
        [Paragraph("Cronbach's α", cell_key_style), Paragraph(_fmt(test_stats["cronbach_alpha"]), cell_val_style)],
        [Paragraph("SEM (%)", cell_key_style), Paragraph(_fmt(test_stats["sem"]), cell_val_style)],
        [Paragraph("Number of items", cell_key_style), Paragraph(str(test_stats["n_items"]), cell_val_style)],
    ]

    col_widths = [8 * cm, 6 * cm]
    tbl = Table(rows, colWidths=col_widths, hAlign="LEFT")
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _ROW_ALT]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e5e7eb")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return tbl


def _items_table(items: List[Dict[str, Any]], stems: Dict[str, str]) -> Table:
    """Full per-item table: question text + short id, type, difficulty, D, N, flags."""
    styles = getSampleStyleSheet()
    header_para_style = ParagraphStyle(
        "fh", parent=styles["Normal"], fontSize=7.5, textColor=_HEADER_FG, fontName="Helvetica-Bold"
    )
    cell_style = ParagraphStyle("fc", parent=styles["Normal"], fontSize=7.5, textColor=_TEXT, leading=9)
    id_style = ParagraphStyle("fid", parent=styles["Normal"], fontSize=6.5, textColor=_MUTED)
    flag_style = ParagraphStyle("ff", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#b91c1c"))

    header = [
        Paragraph("Question", header_para_style),
        Paragraph("Type", header_para_style),
        Paragraph("Difficulty", header_para_style),
        Paragraph("Discrim.", header_para_style),
        Paragraph("Graded", header_para_style),
        Paragraph("Flags", header_para_style),
    ]

    if not items:
        data_rows = [[Paragraph("No graded items yet", cell_style)] + [Paragraph("—", cell_style)] * 5]
    else:
        data_rows = []
        for item in items:
            stem = _truncate(stems.get(item.get("item_version_id", ""), ""))
            lo_short = str(item.get("learning_object_id", ""))[:8]
            qtype = (item.get("question_type") or "—").replace("_", " ").title()
            flag_txt = "; ".join(f["code"].replace("_", " ").title() for f in item.get("flags", [])) or "—"
            question_cell = [Paragraph(stem or "(no text)", cell_style), Paragraph(lo_short, id_style)]
            data_rows.append([
                question_cell,
                Paragraph(qtype, cell_style),
                Paragraph(_difficulty_pct(item), cell_style),
                Paragraph(_fmt(item.get("d_value")), cell_style),
                Paragraph(str(item.get("n_responses", 0)), cell_style),
                Paragraph(flag_txt, flag_style if item.get("flags") else cell_style),
            ])

    rows = [header] + data_rows
    col_widths = [7.6 * cm, 2.2 * cm, 1.8 * cm, 1.6 * cm, 1.4 * cm, 2.4 * cm]
    tbl = Table(rows, colWidths=col_widths, hAlign="LEFT")
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _ROW_ALT]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e5e7eb")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return tbl


async def render_pdf(
    test_definition_id: str,
    run_id: "str | None" = None,
    include_unpublished: bool = False,
) -> bytes:
    """
    Generate a complete PDF analytics report for the given test definition.

    Fetches live psychometric data, renders a ReportLab A4 document with:
      - header block (title, ID, session count, timestamp)
      - summary statistics table
      - matplotlib score-distribution histogram
      - flagged items table
      - footer

    ``run_id`` narrows the report to one scheduled-session cohort (or
    practice). Defaults to combined when omitted.

    Returns the PDF as raw bytes.
    """
    from app.services import psychometrics_service  # local import avoids circular deps

    test_def = await prisma.test_definitions.find_unique(where={"id": test_definition_id})
    blueprint_title = (test_def.title if test_def else None) or "Untitled blueprint"

    test_stats, item_stats = await asyncio.gather(
        psychometrics_service.compute_test_stats(
            test_definition_id, run_id=run_id, include_unpublished=include_unpublished),
        psychometrics_service.compute_test_item_stats(
            test_definition_id, run_id=run_id, include_unpublished=include_unpublished),
    )
    items = item_stats["items"]
    stems = await _fetch_item_stems([it.get("item_version_id", "") for it in items])

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "title",
        parent=styles["Title"],
        fontSize=18,
        textColor=_DARK_BG,
        fontName="Helvetica-Bold",
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "subtitle",
        parent=styles["Normal"],
        fontSize=9,
        textColor=_MUTED,
        spaceAfter=2,
    )
    section_style = ParagraphStyle(
        "section",
        parent=styles["Heading2"],
        fontSize=11,
        textColor=_HEADER_BG,
        fontName="Helvetica-Bold",
        spaceBefore=10,
        spaceAfter=4,
    )
    footer_style = ParagraphStyle(
        "footer",
        parent=styles["Normal"],
        fontSize=7,
        textColor=_MUTED,
        alignment=1,  # centre
    )

    computed_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    n_sessions = test_stats["total_sessions"]
    cohort = "All runs (combined)" if not run_id or run_id == "combined" else f"Run {run_id[:8]}"
    session_label = "graded" if include_unpublished else "published"

    story = [
        Paragraph("Analytics Report", subtitle_style),
        Paragraph(blueprint_title, title_style),
        Paragraph(f"{cohort}  ·  {n_sessions} {session_label} sessions  ·  Generated {computed_at}", subtitle_style),
        Paragraph(f"Test ID: {test_definition_id}", subtitle_style),
    ]
    if include_unpublished:
        story.append(Paragraph("Preview — includes results not yet released to students.", subtitle_style))
    story += [
        Spacer(1, 0.4 * cm),

        Paragraph("Summary Statistics", section_style),
        _summary_table(test_stats),
        Spacer(1, 0.5 * cm),

        Paragraph("Score Distribution", section_style),
        _build_histogram_image(test_stats["distribution"]),
        Spacer(1, 0.5 * cm),

        Paragraph("Item Statistics", section_style),
        _items_table(items, stems),
        Spacer(1, 0.6 * cm),

        Paragraph(f"Generated by OpenVision  ·  {computed_at}", footer_style),
    ]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=f"Analytics Report — {blueprint_title} ({test_definition_id})",
        author="OpenVision",
    )
    doc.build(story)
    return buf.getvalue()
