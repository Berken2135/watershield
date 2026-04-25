"""
EU Water Framework Directive style report generator.

Produces a downloadable PDF using ReportLab. The design mirrors official
EU compliance documents: cover banner, WQI status, compliance table,
historical trend with line chart, forecast comparison, and actions.

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
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

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
    KeepTogether,
)
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.linecharts import HorizontalLineChart


router = APIRouter()

# ── Data file paths (mirrors data.py) ─────────────────────────────────────────

_DS_OUTPUTS = (
    Path(__file__).resolve().parents[2] / "data-science" / "data" / "outputs"
)

_EU_COUNTRIES: frozenset[str] = frozenset({
    "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia",
    "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
    "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg",
    "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia",
    "Slovenia", "Spain", "Sweden",
})


def _load_json(filename: str) -> Any:
    path = _DS_OUTPUTS / filename
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _load_history_for_water_body(water_body_id: str) -> tuple[str | None, list[dict]]:
    """Return (city_name, sorted_monthly_records) for a water body, EU-filtered."""
    geojson = _load_json("watershield_europe.geojson")
    if not geojson:
        return None, []
    city_name: str | None = None
    for feature in geojson.get("features", []):
        props = feature.get("properties", {})
        if props.get("country") not in _EU_COUNTRIES:
            continue
        if props.get("water_body_id") == water_body_id:
            city_name = props["name"].split(" - ")[-1].strip()
            break
    if city_name is None:
        return None, []
    records = _load_json("historical_monthly.json")
    if not records:
        return city_name, []

    def _city_match(record_city: str) -> bool:
        if record_city.lower() == city_name.lower():
            return True
        m = re.search(r'\((.+?)\)', record_city)
        return bool(m and m.group(1).strip().lower() == city_name.lower())

    filtered = sorted(
        [r for r in records
         if _city_match(r.get("city", "")) and r.get("country") in _EU_COUNTRIES],
        key=lambda r: r["date"],
    )
    return city_name, filtered


# ── Font registration ──────────────────────────────────────────────────────────

_FONT_REGULAR = "Helvetica"
_FONT_BOLD = "Helvetica-Bold"
_FONT_REGISTERED = False


def _ensure_font() -> None:
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
        candidates = [("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf")]

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
    """Transliterate non-ASCII chars so Helvetica can render them."""
    if _FONT_REGULAR != "Helvetica":
        return text
    # Dict form of maketrans has no equal-length requirement; handles non-decomposing chars
    _MANUAL = str.maketrans({
        'ł': 'l', 'Ł': 'L', 'ø': 'o', 'Ø': 'O',
        'ð': 'd', 'Ð': 'D', 'þ': 't', 'Þ': 'T',
        'æ': 'a', 'Æ': 'A', 'ß': 'ss',
    })
    # NFKD decomposes accented chars (é → e + combining mark); encode drops the marks
    return (
        unicodedata.normalize("NFKD", text.translate(_MANUAL))
        .encode("ascii", "ignore")
        .decode("ascii")
    )


def _clean_subtitle(river: str, location: str) -> str:
    """Return location only when it already starts with the river name (avoids duplication)."""
    r, loc = river.strip(), location.strip()
    if loc.lower().startswith(r.lower()):
        return loc
    return f"{r} — {loc}"


# ── WQI helpers ────────────────────────────────────────────────────────────────

def _wqi_hex(wqi: float) -> str:
    if wqi >= 200: return "#10b981"
    if wqi >= 150: return "#f59e0b"
    if wqi >= 100: return "#ef4444"
    return "#dc2626"


def _wqi_label(wqi: float) -> str:
    if wqi >= 200: return "CLEAN"
    if wqi >= 150: return "MODERATE"
    if wqi >= 100: return "HIGH RISK"
    return "CRITICAL"


# ── EU thresholds ──────────────────────────────────────────────────────────────

EU_THRESHOLDS: dict[str, tuple[str, Any]] = {
    "ph":               ("6.5 – 8.5",    lambda v: 6.5 <= v <= 8.5),
    "dissolved_oxygen": ("≥ 5.0 mg/L",   lambda v: v >= 5.0),
    "turbidity":        ("≤ 25 NTU",     lambda v: v <= 25),
}


def _classify(metric: str, value: float) -> tuple[str, str]:
    """Return (label, hex_color) for a measured parameter."""
    _, ok = EU_THRESHOLDS[metric]
    return ("WITHIN LIMITS", "#10b981") if ok(value) else ("BREACH", "#ef4444")


def _contaminant_status(text: str) -> tuple[str, str]:
    """Return (label, hex_color) for the contaminant row.

    Strings like 'Within EU thresholds' are benign — don't flag them.
    """
    low = text.lower()
    if any(w in low for w in ("threshold", "within", "no ", "none", "normal", "clear", "n/a")):
        return "NONE DETECTED", "#10b981"
    return "FLAGGED", "#ef4444"


# ── Models ─────────────────────────────────────────────────────────────────────

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
    # Extended fields — optional, enable richer report sections
    water_body_id: Optional[str] = None        # loads historical WQI data
    wqi_current: Optional[float] = None        # shows WQI status badge
    forecast_wqi: Optional[float] = None       # shows forecast comparison table
    forecast_horizon_days: Optional[int] = 30  # label for forecast horizon


# ── AI / fallback summary ──────────────────────────────────────────────────────

def _ai_summary(req: ReportRequest) -> str:
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
            "Do NOT repeat the event description verbatim. "
            "Return JSON with key 'summary' only."
        )
        body = json.dumps({
            "river": req.river,
            "location": req.location,
            "type": req.type,
            "severity": req.severity,
            "date": req.date,
            "metrics": req.metrics.model_dump(),
            "wqi_current": req.wqi_current,
            "forecast_wqi": req.forecast_wqi,
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
    breaches: list[str] = []
    if not (6.5 <= req.metrics.ph <= 8.5):
        breaches.append(f"pH ({req.metrics.ph:.2f}; EU range 6.5–8.5)")
    if req.metrics.dissolved_oxygen < 5.0:
        breaches.append(
            f"dissolved oxygen ({req.metrics.dissolved_oxygen:.2f} mg/L; minimum 5.0 mg/L)"
        )
    if req.metrics.turbidity > 25:
        breaches.append(f"turbidity ({req.metrics.turbidity:.1f} NTU; limit 25 NTU)")

    compliance = (
        f"The following parameters breach EU WFD thresholds: {'; '.join(breaches)}."
        if breaches else
        "All sampled parameters are within EU Water Framework Directive thresholds."
    )

    wqi_txt = (
        f" Current Water Quality Index: {req.wqi_current:.0f} "
        f"({_wqi_label(req.wqi_current).lower()})."
        if req.wqi_current is not None else ""
    )

    fc_txt = ""
    if req.forecast_wqi is not None and req.wqi_current is not None:
        direction = "decline" if req.forecast_wqi < req.wqi_current else "improvement"
        fc_txt = (
            f" The {req.forecast_horizon_days or 30}-day WQI forecast ({req.forecast_wqi:.0f}) "
            f"indicates a further {direction} in water quality."
        )

    action = (
        "Immediate source identification, increased sampling frequency, and notification "
        "to the regional environmental authority are required."
        if req.severity.lower() in ("high", "critical") else
        "Continued monitoring and routine compliance checks are advised."
    )

    loc = _safe(_clean_subtitle(req.river, req.location))
    return (
        f"On {req.date}, a {req.type.lower()} incident classified as "
        f"{req.severity.lower()} severity was recorded at {loc}.{wqi_txt} "
        f"{compliance}{fc_txt} {action} "
        "This document should be reviewed by a qualified compliance officer "
        "prior to submission to the competent environmental authority."
    )


# ── Line chart ─────────────────────────────────────────────────────────────────

_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _wqi_chart(dates: list[str], values: list[float], width_mm: float = 166) -> Drawing | None:
    """Build a ReportLab line chart of monthly WQI. Returns None on any error."""
    if len(values) < 2:
        return None
    try:
        w, h = width_mm * mm, 55 * mm
        drawing = Drawing(w, h)
        chart = HorizontalLineChart()
        chart.x = 10 * mm
        chart.y = 10 * mm
        chart.width = w - 18 * mm
        chart.height = h - 18 * mm
        chart.data = [tuple(values)]

        labels = []
        for d in dates:
            try:
                labels.append(_MONTH_ABBR[int(d[5:7]) - 1])
            except Exception:
                labels.append(d[5:7])
        chart.categoryAxis.categoryNames = labels
        chart.categoryAxis.labels.fontSize = 7
        chart.categoryAxis.labels.dy = -4

        lo = max(50, min(values) - 25)
        hi = min(350, max(values) + 30)
        chart.valueAxis.valueMin = lo
        chart.valueAxis.valueMax = hi
        chart.valueAxis.valueStep = 50
        chart.valueAxis.labels.fontSize = 7

        chart.lines[0].strokeColor = colors.HexColor("#0ea5e9")
        chart.lines[0].strokeWidth = 1.8
        chart.lines[0].symbol = None

        drawing.add(chart)
        return drawing
    except Exception:
        return None


# ── PDF builder ────────────────────────────────────────────────────────────────

def _build_pdf(req: ReportRequest, summary: str) -> bytes:
    _ensure_font()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=22 * mm, rightMargin=22 * mm,
        topMargin=24 * mm,  bottomMargin=22 * mm,
        title=f"WaterShield Report — {req.river}",
        author="WaterShield AI",
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        "EUHeading", parent=styles["Heading1"],
        fontName=_FONT_BOLD, fontSize=20, leading=24,
        textColor=colors.HexColor("#0f172a"), spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "EUSubtle", parent=styles["Normal"],
        fontName=_FONT_REGULAR, fontSize=8, leading=11,
        textColor=colors.HexColor("#64748b"), spaceAfter=2,
    ))
    styles.add(ParagraphStyle(
        "EUSection", parent=styles["Heading2"],
        fontName=_FONT_BOLD, fontSize=11, leading=14,
        textColor=colors.HexColor("#0f172a"), spaceBefore=14, spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        "EUSubSection", parent=styles["Heading3"],
        fontName=_FONT_BOLD, fontSize=9, leading=12,
        textColor=colors.HexColor("#334155"), spaceBefore=10, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "EUBody", parent=styles["Normal"],
        fontName=_FONT_REGULAR, fontSize=10, leading=14,
        textColor=colors.HexColor("#1e293b"),
    ))
    styles.add(ParagraphStyle(
        "EUSmall", parent=styles["Normal"],
        fontName=_FONT_REGULAR, fontSize=8, leading=11,
        textColor=colors.HexColor("#475569"),
    ))

    story: list = []
    sec = 0  # section counter

    # ── Banner ────────────────────────────────────────────────────────────────
    banner = Table(
        [[
            Paragraph(
                '<font color="#22d3ee" size="9"><b>EU WATER FRAMEWORK DIRECTIVE 2000/60/EC</b></font>',
                styles["Normal"],
            ),
            Paragraph(
                f'<font color="#64748b" size="8">'
                f'Ref. WS-{req.event_id.upper()} · '
                f'{datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}</font>',
                styles["Normal"],
            ),
        ]],
        colWidths=[110 * mm, 56 * mm],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND",     (0, 0), (-1, -1), colors.HexColor("#0f172a")),
        ("ALIGN",          (1, 0), (1, 0),   "RIGHT"),
        ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",    (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",   (0, 0), (-1, -1), 12),
        ("TOPPADDING",     (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 8),
    ]))
    story.append(banner)
    story.append(Spacer(1, 14))

    # ── Title ─────────────────────────────────────────────────────────────────
    story.append(Paragraph("Water Pollution Compliance Report", styles["EUHeading"]))
    # Fix: strip river name from subtitle if location already contains it
    story.append(Paragraph(_safe(_clean_subtitle(req.river, req.location)), styles["EUSubtle"]))
    story.append(Spacer(1, 6))

    # ── Metadata table ────────────────────────────────────────────────────────
    severity_color = {"High": "#ef4444", "Medium": "#f59e0b", "Low": "#10b981"}.get(
        req.severity, "#64748b"
    )
    snapshot_date = req.snapshot_date or req.date
    is_predictive = bool(req.is_predictive)
    confidence = req.confidence if req.confidence is not None else (100.0 if not is_predictive else 0.0)
    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    # Fix: CURRENT for today, HISTORICAL for past dates, FORECAST for predictions
    if is_predictive:
        snapshot_kind, snapshot_color = "FORECAST",   "#a855f7"
    elif snapshot_date >= today_str:
        snapshot_kind, snapshot_color = "CURRENT",    "#0ea5e9"
    else:
        snapshot_kind, snapshot_color = "HISTORICAL", "#64748b"

    snapshot_cell = Paragraph(
        f'<font color="{snapshot_color}"><b>{snapshot_date}</b></font>'
        f' <font color="#64748b" size="8">· {snapshot_kind} · conf {confidence:.0f}%</font>',
        styles["Normal"],
    )

    # Strip river prefix from location cell too
    meta_location = req.location.strip()
    if meta_location.lower().startswith(req.river.strip().lower()):
        stripped = meta_location[len(req.river.strip()):].lstrip(" ,—-").strip()
        if stripped:
            meta_location = stripped

    meta = Table(
        [
            ["Event ID",      req.event_id, "Snapshot", snapshot_cell],
            ["Pollution Type", req.type, "Severity",
             Paragraph(f'<font color="{severity_color}"><b>{req.severity.upper()}</b></font>',
                       styles["Normal"])],
            ["River",         req.river,    "Location", meta_location],
            ["Incident Date", req.date,     "Mode",
             Paragraph(f'<font color="{snapshot_color}"><b>{snapshot_kind}</b></font>',
                       styles["Normal"])],
        ],
        colWidths=[28 * mm, 55 * mm, 28 * mm, 55 * mm],
    )
    meta.setStyle(TableStyle([
        ("FONTNAME",      (0, 0), (-1, -1), _FONT_REGULAR),
        ("FONTSIZE",      (0, 0), (-1, -1), 9),
        ("TEXTCOLOR",     (0, 0), (0, -1),  colors.HexColor("#64748b")),
        ("TEXTCOLOR",     (2, 0), (2, -1),  colors.HexColor("#64748b")),
        ("TEXTCOLOR",     (1, 0), (1, -1),  colors.HexColor("#0f172a")),
        ("TEXTCOLOR",     (3, 0), (3, -1),  colors.HexColor("#0f172a")),
        ("LINEBELOW",     (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e8f0")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
    ]))
    story.append(meta)

    # ── WQI Current Status ────────────────────────────────────────────────────
    if req.wqi_current is not None:
        sec += 1
        wqi = req.wqi_current
        story.append(Paragraph(f"{sec} · Water Quality Index — Current Status", styles["EUSection"]))
        wqi_box = Table(
            [[
                Paragraph(
                    f'<font color="{_wqi_hex(wqi)}" size="26"><b>{wqi:.0f}</b></font>'
                    f'<font color="#94a3b8" size="10"> WQI</font>',
                    styles["Normal"],
                ),
                Paragraph(
                    f'<font color="{_wqi_hex(wqi)}" size="12"><b>{_wqi_label(wqi)}</b></font><br/>'
                    f'<font color="#64748b" size="8">'
                    f'Waterly scale: ≥200 Clean · 150–199 Moderate · 100–149 High Risk · &lt;100 Critical'
                    f'</font>',
                    styles["Normal"],
                ),
            ]],
            colWidths=[40 * mm, 126 * mm],
        )
        wqi_box.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("LINEBELOW",     (0, 0), (-1, 0),  0.4, colors.HexColor("#e2e8f0")),
            ("TOPPADDING",    (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(wqi_box)

    # ── Executive Summary ─────────────────────────────────────────────────────
    sec += 1
    story.append(Paragraph(f"{sec} · Executive Summary", styles["EUSection"]))
    story.append(Paragraph(_safe(summary), styles["EUBody"]))

    # ── Event Description ─────────────────────────────────────────────────────
    sec += 1
    story.append(Paragraph(f"{sec} · Event Description", styles["EUSection"]))
    story.append(Paragraph(_safe(req.description), styles["EUBody"]))

    # ── Measurement Compliance Table ──────────────────────────────────────────
    sec += 1
    story.append(Paragraph(f"{sec} · Measurement Compliance Table", styles["EUSection"]))

    rows = [["Parameter", "Measured", "EU Threshold", "Status"]]
    for name, formatted, key, value in [
        ("pH",               f"{req.metrics.ph:.2f}",                      "ph",               req.metrics.ph),
        ("Dissolved Oxygen", f"{req.metrics.dissolved_oxygen:.2f} mg/L",   "dissolved_oxygen", req.metrics.dissolved_oxygen),
        ("Turbidity",        f"{req.metrics.turbidity:.1f} NTU",           "turbidity",        req.metrics.turbidity),
    ]:
        spec, _ = EU_THRESHOLDS[key]
        label, hex_c = _classify(key, value)
        rows.append([
            name, formatted, spec,
            Paragraph(f'<font color="{hex_c}"><b>{label}</b></font>', styles["Normal"]),
        ])

    if req.metrics.contaminant:
        c_label, c_hex = _contaminant_status(req.metrics.contaminant)
        rows.append([
            "Detected Contaminant",
            req.metrics.contaminant,
            "—",
            Paragraph(f'<font color="{c_hex}"><b>{c_label}</b></font>', styles["Normal"]),
        ])

    meas_tbl = Table(rows, colWidths=[45 * mm, 40 * mm, 40 * mm, 41 * mm])
    meas_tbl.setStyle(TableStyle([
        ("FONTNAME",      (0, 0), (-1, 0),  _FONT_BOLD),
        ("FONTSIZE",      (0, 0), (-1, -1), 9),
        ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#0f172a")),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
        ("LINEABOVE",     (0, 1), (-1, 1),  0.4, colors.HexColor("#cbd5e1")),
        ("LINEBELOW",     (0, -1),(-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
    ]))
    story.append(meas_tbl)

    # Warn when pH and DO are suspiciously identical (likely a data entry bug)
    if req.metrics.ph == req.metrics.dissolved_oxygen:
        story.append(Spacer(1, 4))
        story.append(Paragraph(
            '<font color="#f59e0b"><b>Data Notice:</b></font>'
            '<font color="#64748b"> pH and dissolved oxygen values are identical —'
            ' please verify measurement data before filing.</font>',
            styles["EUSmall"],
        ))

    # ── Historical WQI Trend ──────────────────────────────────────────────────
    if req.water_body_id:
        city_name, history = _load_history_for_water_body(req.water_body_id)
        if history:
            sec += 1
            story.append(Paragraph(
                f"{sec} · Historical WQI Trend — Last 12 Months"
                + (f" ({city_name})" if city_name else ""),
                styles["EUSection"],
            ))

            recent = history[-12:]
            dates_c = [r["date"] for r in recent]
            values_c = [float(r["wqi"]) for r in recent]

            chart = _wqi_chart(dates_c, values_c)
            if chart:
                story.append(chart)
                story.append(Spacer(1, 4))

            # Monthly table
            hist_rows = [["Month", "WQI", "Risk Level", "vs Prev Month"]]
            for i, r in enumerate(recent):
                wv = float(r["wqi"])
                change_cell = "—"
                if i > 0:
                    delta = wv - float(recent[i - 1]["wqi"])
                    arrow = "+" if delta >= 0 else ""
                    change_cell = f"{arrow}{delta:.1f}"
                hist_rows.append([
                    r["date"][:7],
                    Paragraph(f'<font color="{_wqi_hex(wv)}"><b>{wv:.0f}</b></font>', styles["Normal"]),
                    Paragraph(f'<font color="{_wqi_hex(wv)}">{r["risk_level"].upper()}</font>', styles["Normal"]),
                    change_cell,
                ])

            hist_tbl = Table(hist_rows, colWidths=[30 * mm, 28 * mm, 42 * mm, 36 * mm], hAlign="LEFT")
            hist_tbl.setStyle(TableStyle([
                ("FONTNAME",      (0, 0), (-1, 0),  _FONT_BOLD),
                ("FONTSIZE",      (0, 0), (-1, -1), 8),
                ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#1e293b")),
                ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
                ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
                ("LINEBELOW",     (0, -1),(-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ]))
            story.append(hist_tbl)

            # Snapshot comparison sub-section
            story.append(Paragraph("WQI Snapshot Comparison", styles["EUSubSection"]))

            latest_wqi = float(history[-1]["wqi"])
            snap_rows = [["Period", "Date", "WQI", "Risk Level", "vs Today"]]
            for offset, label in [(0, "Today"), (1, "1 Month Ago"), (3, "3 Months Ago"), (6, "6 Months Ago")]:
                idx = -(offset + 1)
                if abs(idx) > len(history):
                    continue
                r = history[idx]
                wv = float(r["wqi"])
                if offset == 0:
                    vs_cell = "—"
                else:
                    diff = wv - latest_wqi
                    pct = diff / latest_wqi * 100 if latest_wqi else 0
                    sign = "+" if diff >= 0 else ""
                    vs_cell = f"{sign}{diff:.0f} ({sign}{pct:.1f}%)"
                snap_rows.append([
                    label,
                    r["date"][:7],
                    Paragraph(f'<font color="{_wqi_hex(wv)}"><b>{wv:.0f}</b></font>', styles["Normal"]),
                    Paragraph(f'<font color="{_wqi_hex(wv)}">{r["risk_level"].upper()}</font>', styles["Normal"]),
                    vs_cell,
                ])

            snap_tbl = Table(snap_rows, colWidths=[32 * mm, 22 * mm, 22 * mm, 35 * mm, 38 * mm], hAlign="LEFT")
            snap_tbl.setStyle(TableStyle([
                ("FONTNAME",      (0, 0), (-1, 0),  _FONT_BOLD),
                ("FONTSIZE",      (0, 0), (-1, -1), 9),
                ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#1e293b")),
                ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
                ("BACKGROUND",    (0, 1), (-1, 1),  colors.HexColor("#dbeafe")),  # today row
                ("ROWBACKGROUNDS",(0, 2), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
                ("LINEBELOW",     (0, -1),(-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ]))
            story.append(snap_tbl)

    # ── 30-Day WQI Forecast ───────────────────────────────────────────────────
    if req.forecast_wqi is not None:
        sec += 1
        horizon = req.forecast_horizon_days or 30
        story.append(Paragraph(f"{sec} · {horizon}-Day WQI Forecast", styles["EUSection"]))

        fc = req.forecast_wqi
        cur = req.wqi_current
        fc_rows = [["", "WQI", "Risk Level", "vs Current (higher = better)"]]

        if cur is not None:
            diff = fc - cur
            pct = diff / cur * 100 if cur else 0
            sign = "+" if diff >= 0 else ""
            direction = "improving" if diff >= 0 else "worsening"
            fc_rows.append([
                "Current",
                Paragraph(f'<font color="{_wqi_hex(cur)}"><b>{cur:.0f}</b></font>', styles["Normal"]),
                Paragraph(f'<font color="{_wqi_hex(cur)}">{_wqi_label(cur)}</font>', styles["Normal"]),
                "—",
            ])
            fc_rows.append([
                f"{horizon}-Day Forecast",
                Paragraph(f'<font color="{_wqi_hex(fc)}"><b>{fc:.0f}</b></font>', styles["Normal"]),
                Paragraph(f'<font color="{_wqi_hex(fc)}">{_wqi_label(fc)}</font>', styles["Normal"]),
                f"{sign}{diff:.0f} ({sign}{pct:.1f}%) — {direction}",
            ])
        else:
            fc_rows.append([
                f"{horizon}-Day Forecast",
                Paragraph(f'<font color="{_wqi_hex(fc)}"><b>{fc:.0f}</b></font>', styles["Normal"]),
                Paragraph(f'<font color="{_wqi_hex(fc)}">{_wqi_label(fc)}</font>', styles["Normal"]),
                "—",
            ])

        fc_tbl = Table(fc_rows, colWidths=[42 * mm, 25 * mm, 38 * mm, 61 * mm], hAlign="LEFT")
        fc_tbl.setStyle(TableStyle([
            ("FONTNAME",      (0, 0), (-1, 0),  _FONT_BOLD),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#1e293b")),
            ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
            ("LINEBELOW",     (0, -1),(-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ]))
        story.append(fc_tbl)
        story.append(Spacer(1, 4))
        story.append(Paragraph(
            '<font color="#64748b">Forecast by Prophet + XGBoost ensemble. '
            'WQI scale: higher value = better water quality. '
            'A declining forecast means worsening conditions.</font>',
            styles["EUSmall"],
        ))

    # ── Recommended Actions ───────────────────────────────────────────────────
    sec += 1
    story.append(Paragraph(f"{sec} · Recommended Actions", styles["EUSection"]))
    for action in [
        "Notify the regional environmental authority within statutory deadlines.",
        "Increase sampling frequency at the affected segment to hourly intervals.",
        "Identify the upstream source within 24 hours; deploy mobile sampling unit.",
        "Inform municipal water operators and downstream stakeholders.",
        "Re-evaluate compliance status after the next Sentinel-2 satellite pass.",
    ]:
        story.append(Paragraph(f"• {action}", styles["EUBody"]))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 22))
    sig = Table(
        [[
            Paragraph(
                '<font size="7" color="#64748b">'
                'Generated by WaterShield AI · Sentinel-2 (Copernicus) + Neural Anomaly Detection'
                '</font>',
                styles["Normal"],
            ),
            Paragraph(
                '<font size="7" color="#64748b">'
                'AI-assisted document — review by a qualified compliance officer is required.'
                '</font>',
                styles["Normal"],
            ),
        ]],
        colWidths=[80 * mm, 86 * mm],
    )
    sig.setStyle(TableStyle([
        ("LINEABOVE",  (0, 0), (-1, 0), 0.4, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(sig)

    doc.build(story)
    return buf.getvalue()


# ── Request enrichment ────────────────────────────────────────────────────────

def _enrich(req: ReportRequest) -> ReportRequest:
    """Fill in optional fields the frontend may not send explicitly.

    - water_body_id falls back to event_id (they match in practice)
    - wqi_current and forecast_wqi are parsed from the description string,
      which the frontend already formats as "... WQI 143.3. 30-day forecast: 146.1 ..."
    """
    water_body_id = req.water_body_id or req.event_id

    wqi_current = req.wqi_current
    forecast_wqi = req.forecast_wqi

    _num = r'(\d+(?:\.\d+)?)'  # matches 143 or 143.3 but not trailing dot
    if wqi_current is None:
        m = re.search(r'\bWQI\s+' + _num, req.description)
        if m:
            try:
                wqi_current = float(m.group(1))
            except ValueError:
                pass

    if forecast_wqi is None:
        m = re.search(r'forecast:\s*' + _num, req.description, re.IGNORECASE)
        if m:
            try:
                forecast_wqi = float(m.group(1))
            except ValueError:
                pass

    return req.model_copy(update={
        "water_body_id": water_body_id,
        "wqi_current":   wqi_current,
        "forecast_wqi":  forecast_wqi,
    })


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/generate")
def generate_report(req: ReportRequest):
    """Generate a downloadable PDF compliance report."""
    req = _enrich(req)
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
