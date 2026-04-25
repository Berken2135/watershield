"""
EU Water Framework Directive style report generator.

Produces a downloadable PDF using ReportLab. The design mirrors official
EU compliance documents: cover banner, metadata table, measurements table
benchmarked against EU thresholds, AI summary section, and a footer.

Endpoint:
    POST /api/reports/generate
        body: ReportRequest
        returns: application/pdf (binary)
"""

from __future__ import annotations

import io
import json
import os
import platform
import unicodedata
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)


router = APIRouter()


# ------------------------------------------------------------------
# Unicode font registration
# ------------------------------------------------------------------

_FONT_REGULAR = "Helvetica"
_FONT_BOLD = "Helvetica-Bold"
_FONT_REGISTERED = False


def _ensure_font() -> None:
    """Try to register a Unicode-capable TTF font; fall back to Helvetica."""
    global _FONT_REGULAR, _FONT_BOLD, _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    _FONT_REGISTERED = True

    candidates: list[tuple[str, str | None]] = []
    system = platform.system()
    if system == "Linux":
        candidates = [
            ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
            ("/usr/share/fonts/dejavu/DejaVuSans.ttf",
             "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
        ]
    elif system == "Darwin":
        candidates = [
            ("/System/Library/Fonts/Supplemental/Arial.ttf",
             "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
            ("/Library/Fonts/Arial.ttf", None),
        ]
    elif system == "Windows":
        candidates = [
            ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
        ]

    for regular, bold in candidates:
        if os.path.exists(regular):
            try:
                pdfmetrics.registerFont(TTFont("WSFont", regular))
                _FONT_REGULAR = "WSFont"
                if bold and os.path.exists(bold):
                    pdfmetrics.registerFont(TTFont("WSFont-Bold", bold))
                    _FONT_BOLD = "WSFont-Bold"
                return
            except Exception:
                continue


def _safe(text: str) -> str:
    """Transliterate non-ASCII characters so Helvetica can render them."""
    if _FONT_REGULAR != "Helvetica":
        return text  # Unicode font is registered — no need to sanitize
    # NFKD decomposes e.g. 'ł' → but ł has no decomposition, so handle manually
    _REPLACEMENTS = str.maketrans(
        "ąćęłńóśźżĄĆĘŁŃÓŚŹŻàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ"
        "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ",
        "acelnoszzACELNOSZZaaaaaaaceeeeiiiidnoooooouuuuythy"
        "AAAAAAAACEEEEIIIIDNOOOOOOUUUUYb",
    )
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii") \
        if False else text.translate(_REPLACEMENTS)



class ReportMetrics(BaseModel):
    ph: float
    dissolved_oxygen: float
    turbidity: float
    contaminant: Optional[str] = None


class ReportRequest(BaseModel):
    event_id: str
    river: str
    location: str
    severity: str
    type: str
    date: str
    description: str
    metrics: ReportMetrics
    ai_summary: Optional[str] = None
    snapshot_date: Optional[str] = None
    confidence: Optional[float] = None
    is_predictive: Optional[bool] = None


# ------------------------------------------------------------------
# Models
# ------------------------------------------------------------------

EU_THRESHOLDS = {
    "ph": ("6.5 – 8.5", lambda v: 6.5 <= v <= 8.5),
    "dissolved_oxygen": ("≥ 5.0 mg/L", lambda v: v >= 5.0),
    "turbidity": ("≤ 25 NTU", lambda v: v <= 25),
}


def _classify(metric: str, value: float) -> tuple[str, colors.Color]:
    spec, ok = EU_THRESHOLDS[metric]
    if ok(value):
        return "WITHIN LIMITS", colors.HexColor("#10b981")
    return "BREACH", colors.HexColor("#ef4444")


# ------------------------------------------------------------------
# EU thresholds (simplified WFD reference values)
# ------------------------------------------------------------------

def _ai_summary(req: ReportRequest) -> str:
    """If OPENAI_API_KEY is set, ask LLM for a ministry-grade summary."""
    if req.ai_summary:
        return req.ai_summary

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return _fallback_summary(req)
    try:
        from openai import OpenAI  # type: ignore
    except Exception:
        return _fallback_summary(req)

    try:
        client = OpenAI(api_key=api_key)
        prompt = (
            "You are drafting an executive summary for a Ministry-of-Environment "
            "compliance report under the EU Water Framework Directive. "
            "Write 4-6 sentences in formal English covering: source of pollution, "
            "risks to ecosystem and public health, and recommended actions. "
            "Return JSON with key 'summary' only."
        )
        body = json.dumps({
            "river": req.river,
            "location": req.location,
            "type": req.type,
            "severity": req.severity,
            "date": req.date,
            "description": req.description,
            "metrics": req.metrics.model_dump(),
        })
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": body},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        return data.get("summary") or _fallback_summary(req)
    except Exception:
        return _fallback_summary(req)


def _fallback_summary(req: ReportRequest) -> str:
    return (
        f"On {req.date}, an event of type '{req.type}' was recorded on the {req.river} "
        f"near {req.location}. Severity was classified as {req.severity}. {req.description} "
        "The measurements compared against EU Water Framework Directive thresholds are "
        "presented in the table below. Recommended actions include increased sampling "
        "frequency, source identification within 24 hours, and notification to the "
        "regional environmental authority."
    )


# ------------------------------------------------------------------
# PDF generation
# ------------------------------------------------------------------


def _build_pdf(req: ReportRequest, summary: str) -> bytes:
    _ensure_font()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=24 * mm,
        bottomMargin=22 * mm,
        title=f"WaterShield Report — {req.river}",
        author="WaterShield AI",
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="EUHeading",
        parent=styles["Heading1"],
        fontName=_FONT_BOLD,
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        name="EUSubtle",
        parent=styles["Normal"],
        fontName=_FONT_REGULAR,
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=2,
    ))
    styles.add(ParagraphStyle(
        name="EUSection",
        parent=styles["Heading2"],
        fontName=_FONT_BOLD,
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=14,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="EUBody",
        parent=styles["Normal"],
        fontName=_FONT_REGULAR,
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
    ))

    story: list = []

    # ---------- Banner ----------
    banner = Table(
        [[
            Paragraph(
                '<font color="#22d3ee" size="9"><b>EU WATER FRAMEWORK DIRECTIVE 2000/60/EC</b></font>',
                styles["Normal"],
            ),
            Paragraph(
                f'<font color="#64748b" size="8">Ref. WS-{req.event_id.upper()} · {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}</font>',
                styles["Normal"],
            ),
        ]],
        colWidths=[110 * mm, 56 * mm],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0f172a")),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(banner)
    story.append(Spacer(1, 14))

    # ---------- Title ----------
    story.append(Paragraph("Water Pollution Compliance Report", styles["EUHeading"]))
    story.append(Paragraph(
        f"{_safe(req.river)} — {_safe(req.location)}",
        styles["EUSubtle"],
    ))
    story.append(Spacer(1, 6))

    # ---------- Metadata table ----------
    severity_color = {
        "High": "#ef4444",
        "Medium": "#f59e0b",
        "Low": "#10b981",
    }.get(req.severity, "#64748b")

    snapshot_date = req.snapshot_date or req.date
    is_predictive = bool(req.is_predictive)
    confidence = req.confidence if req.confidence is not None else (100.0 if not is_predictive else 0.0)
    snapshot_kind = "FORECAST" if is_predictive else "HISTORICAL"
    snapshot_color = "#a855f7" if is_predictive else "#0ea5e9"
    snapshot_cell = Paragraph(
        f'<font color="{snapshot_color}"><b>{snapshot_date}</b></font>'
        f' <font color="#64748b" size="8">· {snapshot_kind} · conf {confidence:.0f}%</font>',
        styles["Normal"],
    )

    meta = Table(
        [
            ["Event ID", req.event_id, "Snapshot", snapshot_cell],
            ["Pollution Type", req.type, "Severity",
                Paragraph(f'<font color="{severity_color}"><b>{req.severity.upper()}</b></font>', styles["Normal"])],
            ["River", req.river, "Location", req.location],
            ["Incident Date", req.date, "Mode",
                Paragraph(f'<font color="{snapshot_color}"><b>{snapshot_kind}</b></font>', styles["Normal"])],
        ],
        colWidths=[28 * mm, 55 * mm, 28 * mm, 55 * mm],
    )
    meta.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), _FONT_REGULAR),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
        ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#64748b")),
        ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (3, 0), (3, -1), colors.HexColor("#0f172a")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e8f0")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(meta)

    # ---------- Executive summary ----------
    story.append(Paragraph("1 · Executive Summary", styles["EUSection"]))
    story.append(Paragraph(_safe(summary), styles["EUBody"]))

    # ---------- Description ----------
    story.append(Paragraph("2 · Event Description", styles["EUSection"]))
    story.append(Paragraph(_safe(req.description), styles["EUBody"]))

    # ---------- Measurements ----------
    story.append(Paragraph("3 · Measurement Compliance Table", styles["EUSection"]))

    rows = [["Parameter", "Measured", "EU Threshold", "Status"]]
    measurements = [
        ("pH", f"{req.metrics.ph:.2f}", "ph", req.metrics.ph),
        ("Dissolved Oxygen", f"{req.metrics.dissolved_oxygen:.2f} mg/L", "dissolved_oxygen", req.metrics.dissolved_oxygen),
        ("Turbidity", f"{req.metrics.turbidity:.1f} NTU", "turbidity", req.metrics.turbidity),
    ]
    for name, measured, key, value in measurements:
        spec, _ = EU_THRESHOLDS[key]
        status_text, status_color = _classify(key, value)
        rows.append([
            name,
            measured,
            spec,
            Paragraph(f'<font color="{status_color.hexval()}"><b>{status_text}</b></font>', styles["Normal"]),
        ])

    if req.metrics.contaminant:
        rows.append([
            "Detected Contaminant",
            req.metrics.contaminant,
            "—",
            Paragraph('<font color="#ef4444"><b>FLAGGED</b></font>', styles["Normal"]),
        ])

    measurement_table = Table(rows, colWidths=[45 * mm, 40 * mm, 40 * mm, 41 * mm])
    measurement_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), _FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
        ("LINEABOVE", (0, 1), (-1, 1), 0.4, colors.HexColor("#cbd5e1")),
        ("LINEBELOW", (0, -1), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("ALIGN", (1, 0), (-1, -1), "LEFT"),
    ]))
    story.append(measurement_table)

    # ---------- Recommendations ----------
    story.append(Paragraph("4 · Recommended Actions", styles["EUSection"]))
    actions = [
        "Notify the regional environmental authority within statutory deadlines.",
        "Increase sampling frequency at the affected segment to hourly intervals.",
        "Identify the upstream source within 24 hours; deploy mobile sampling unit.",
        "Inform municipal water operators and downstream stakeholders.",
        "Re-evaluate compliance status after the next Sentinel-2 satellite pass.",
    ]
    for a in actions:
        story.append(Paragraph(f"• {a}", styles["EUBody"]))

    # ---------- Footer signature block ----------
    story.append(Spacer(1, 22))
    sig = Table(
        [[
            Paragraph(
                '<font size="7" color="#64748b">Generated by WaterShield AI · Sentinel-2 (Copernicus) + Neural Anomaly Detection</font>',
                styles["Normal"],
            ),
            Paragraph(
                '<font size="7" color="#64748b">Document is AI-assisted and intended for review by a qualified compliance officer.</font>',
                styles["Normal"],
            ),
        ]],
        colWidths=[80 * mm, 86 * mm],
    )
    sig.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.4, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(sig)

    doc.build(story)
    return buf.getvalue()


# ------------------------------------------------------------------
# Endpoint
# ------------------------------------------------------------------

@router.post("/generate")
def generate_report(req: ReportRequest):
    """Generate a downloadable PDF compliance report."""
    try:
        summary = _ai_summary(req)
        pdf = _build_pdf(req, summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    filename = f"WaterShield-Report-{req.event_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
