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

from app.services.analytics_formatters import fmt as _fmt

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


def _flagged_table(items: List[Dict[str, Any]]) -> Table:
    """Flagged items table. Returns a placeholder row when no flags exist."""
    styles = getSampleStyleSheet()
    header_para_style = ParagraphStyle(
        "fh", parent=styles["Normal"], fontSize=7.5, textColor=_HEADER_FG, fontName="Helvetica-Bold"
    )
    cell_style = ParagraphStyle("fc", parent=styles["Normal"], fontSize=7.5, textColor=_TEXT)
    flag_style = ParagraphStyle("ff", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#b91c1c"))

    flagged = [it for it in items if it.get("flags")]

    header = [
        Paragraph("Item (LO ID)", header_para_style),
        Paragraph("Ver.", header_para_style),
        Paragraph("P-value", header_para_style),
        Paragraph("D-value", header_para_style),
        Paragraph("Flags", header_para_style),
    ]

    if not flagged:
        placeholder = [
            Paragraph("—", cell_style),
            Paragraph("—", cell_style),
            Paragraph("—", cell_style),
            Paragraph("—", cell_style),
            Paragraph("No flagged items", cell_style),
        ]
        data_rows = [placeholder]
    else:
        data_rows = []
        for item in flagged:
            lo_short = str(item.get("learning_object_id", ""))[:8]
            ver = str(item.get("version_number") or "—")
            p_val = _fmt(item.get("p_value"))
            d_val = _fmt(item.get("d_value"))
            flag_txt = "; ".join(f["code"] for f in item["flags"])
            data_rows.append([
                Paragraph(lo_short, cell_style),
                Paragraph(ver, cell_style),
                Paragraph(p_val, cell_style),
                Paragraph(d_val, cell_style),
                Paragraph(flag_txt, flag_style),
            ])

    rows = [header] + data_rows
    col_widths = [3.5 * cm, 1.2 * cm, 2 * cm, 2 * cm, 7 * cm]
    tbl = Table(rows, colWidths=col_widths, hAlign="LEFT")
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _FLAG_BG if flagged else colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e5e7eb")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return tbl


async def render_pdf(
    test_definition_id: str,
    run_id: "str | None" = None,
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

    test_stats, item_stats = await asyncio.gather(
        psychometrics_service.compute_test_stats(test_definition_id, run_id=run_id),
        psychometrics_service.compute_test_item_stats(test_definition_id, run_id=run_id),
    )

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

    story = [
        Paragraph("Analytics Report", title_style),
        Paragraph(f"Test ID: {test_definition_id}", subtitle_style),
        Paragraph(f"Sessions: {n_sessions}  ·  Generated: {computed_at}", subtitle_style),
        Spacer(1, 0.4 * cm),

        Paragraph("Summary Statistics", section_style),
        _summary_table(test_stats),
        Spacer(1, 0.5 * cm),

        Paragraph("Score Distribution", section_style),
        _build_histogram_image(test_stats["distribution"]),
        Spacer(1, 0.5 * cm),

        Paragraph("Flagged Items", section_style),
        _flagged_table(item_stats["items"]),
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
        title=f"Analytics Report — {test_definition_id}",
        author="OpenVision",
    )
    doc.build(story)
    return buf.getvalue()
