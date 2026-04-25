import os
import json
import tempfile
from typing import Optional, Union
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from routers.auth import get_connection

load_dotenv()

router = APIRouter()


class WaterQualityRequest(BaseModel):
    # GeoJSON polygon geometry drawn by the user on the map
    geometry: dict                  # {"type": "Polygon", "coordinates": [...]}
    start_date: str                 # "2024-01-01"
    end_date: str                   # "2024-06-01"
    max_cloud_cover: Optional[int] = 30


def _bbox_from_geometry(geometry: dict) -> dict:
    """Extract spatial_extent dict from a GeoJSON polygon for openEO."""
    coords = geometry["coordinates"][0]
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return {
        "west": min(lons),
        "south": min(lats),
        "east": max(lons),
        "north": max(lats),
    }


def _compute_indices(b02, b03, b04, b05, b08, b11) -> dict:
    """
    Compute water pollution indices from mean band reflectance values.

    NDWI  = (B03 - B08) / (B03 + B08)   → water presence (>0 = water)
    Chl   = (B05 / B04) - 1              → chlorophyll / algae blooms
    NDTI  = (B04 - B03) / (B04 + B03)   → turbidity / suspended sediment
    CDOM  = B03 / B02                    → dissolved organic / chemical matter
    """
    def safe_div(a, b):
        return round(a / b, 4) if b and b != 0 else 0.0

    ndwi = safe_div(b03 - b08, b03 + b08)
    chl  = round(safe_div(b05, b04) - 1, 4)
    ndti = safe_div(b04 - b03, b04 + b03)
    cdom = safe_div(b03, b02)

    return {"ndwi": ndwi, "chlorophyll_index": chl, "turbidity_ndti": ndti, "cdom_proxy": cdom}


def _pollution_score(ndwi: float, chl: float, ndti: float, cdom: float) -> float:
    """
    Combine indices into a 0–100 pollution score.
    Only meaningful when NDWI > 0 (pixel is actually water).
    """
    if ndwi < 0:
        return 0.0

    # Each component clamped to 0–1 before scaling
    chl_score  = min(max(chl  / 2.0,  0), 1) * 40   # max weight 40
    ndti_score = min(max(ndti / 0.3,  0), 1) * 30   # max weight 30
    cdom_score = min(max((cdom - 1) / 2.0, 0), 1) * 30  # max weight 30

    return round(chl_score + ndti_score + cdom_score, 1)


def _alert_level(score: float) -> str:
    if score >= 70:
        return "critical"
    elif score >= 45:
        return "high"
    elif score >= 20:
        return "moderate"
    else:
        return "clean"


def _parse_openeo_timeseries(raw: dict, band_order: list[str]) -> list[dict]:
    """
    openEO aggregate_spatial JSON output:
    { "2024-06-01T...": [[[b02, b03, b04, b05, b08, b11]]], ... }
    Returns list of {date, band values}.
    """
    rows = []
    for timestamp, feature_list in raw.items():
        try:
            # Nested structure: feature_list[feature_idx][timestep][band]
            values = feature_list[0]
            if isinstance(values[0], list):
                values = values[0]
            band_vals = {band_order[i]: float(values[i]) for i in range(len(band_order))}
            rows.append({"date": timestamp[:10], "bands": band_vals})
        except Exception:
            continue
    rows.sort(key=lambda r: r["date"])
    return rows


@router.post("/water-quality")
def analyze_water_quality(req: WaterQualityRequest):
    """
    Full water pollution analysis for a drawn polygon.
    Returns a per-date timeline of pollution indices and an overall alert.

    Indices returned per date:
      - ndwi            → is this area water? (>0 = yes)
      - chlorophyll_index → algae / eutrophication level
      - turbidity_ndti  → sediment / murky water
      - cdom_proxy      → dissolved organic / chemical pollution
      - pollution_score → combined 0–100 score
      - alert           → clean / moderate / high / critical
    """
    if req.geometry.get("type") not in ("Polygon", "MultiPolygon"):
        raise HTTPException(status_code=422, detail="geometry must be a GeoJSON Polygon or MultiPolygon")

    spatial_extent = _bbox_from_geometry(req.geometry)
    bands = ["B02", "B03", "B04", "B05", "B08", "B11"]

    conn = get_connection()

    cube = conn.load_collection(
        "SENTINEL2_L2A",
        spatial_extent=spatial_extent,
        temporal_extent=[req.start_date, req.end_date],
        bands=bands,
        max_cloud_cover=req.max_cloud_cover,
    )

    # Aggregate mean reflectance per band per date over the drawn polygon
    stats = cube.aggregate_spatial(
        geometries=req.geometry,
        reducer="mean",
    )

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        stats.download(tmp_path, format="JSON")
        with open(tmp_path) as f:
            raw = json.load(f)
    finally:
        os.unlink(tmp_path)

    rows = _parse_openeo_timeseries(raw, bands)

    if not rows:
        raise HTTPException(status_code=404, detail="No cloud-free Sentinel-2 scenes found for this area and period")

    timeline = []
    for row in rows:
        b = row["bands"]
        indices = _compute_indices(b["B02"], b["B03"], b["B04"], b["B05"], b["B08"], b["B11"])
        score = _pollution_score(
            indices["ndwi"],
            indices["chlorophyll_index"],
            indices["turbidity_ndti"],
            indices["cdom_proxy"],
        )
        timeline.append({
            "date": row["date"],
            **indices,
            "pollution_score": score,
            "alert": _alert_level(score),
        })

    scores = [t["pollution_score"] for t in timeline]
    current = timeline[-1]

    return {
        "timeline": timeline,
        "current": current,
        "summary": {
            "total_dates_analyzed": len(timeline),
            "avg_pollution_score": round(sum(scores) / len(scores), 1),
            "max_pollution_score": max(scores),
            "worst_date": max(timeline, key=lambda t: t["pollution_score"])["date"],
            "overall_alert": _alert_level(max(scores)),
        },
    }


@router.post("/trend")
def pollution_trend(req: WaterQualityRequest):
    """
    Returns only the trend summary — useful for dashboard cards.
    Calls water-quality internally and strips the full timeline.
    """
    full = analyze_water_quality(req)
    trend_direction = "stable"
    tl = full["timeline"]
    if len(tl) >= 2:
        diff = tl[-1]["pollution_score"] - tl[0]["pollution_score"]
        if diff > 10:
            trend_direction = "worsening"
        elif diff < -10:
            trend_direction = "improving"

    return {
        "current": full["current"],
        "summary": full["summary"],
        "trend": trend_direction,
    }


# ============================================================
# AI Anomaly Detection — OpenAI-powered classifier
# ============================================================

class AnomalyMetrics(BaseModel):
    ph: float
    dissolved_oxygen: float
    turbidity: float
    contaminant: Optional[str] = None
    heavy_metals: Optional[dict] = None  # e.g. {"lead": 0.04, "cadmium": 0.005} mg/L


class AnomalyRequest(BaseModel):
    river: str
    location: str
    type: str                    # "Chemical" / "Oil Spill" / "Biological" / "Industrial"
    severity: str                # "High" / "Medium" / "Low"
    date: str
    description: Optional[str] = None
    metrics: AnomalyMetrics


class AnomalyResponse(BaseModel):
    verdict: str                 # "normal" | "anomaly" | "critical"
    confidence: int              # 0-100
    summary: str
    risks: list[str]
    recommendations: list[str]
    pollutant_likely: Optional[str] = None


# EU Water Framework Directive reference thresholds (simplified)
EU_THRESHOLDS = {
    "ph_min": 6.5,
    "ph_max": 8.5,
    "dissolved_oxygen_min": 5.0,   # mg/L
    "turbidity_max": 25,            # NTU (typical surface water)
}


def _heuristic_verdict(m: AnomalyMetrics) -> tuple[str, int, list[str]]:
    """Deterministic baseline so the endpoint works even without OpenAI."""
    risks: list[str] = []
    score = 0
    if m.ph < EU_THRESHOLDS["ph_min"]:
        risks.append(f"pH {m.ph} below EU minimum ({EU_THRESHOLDS['ph_min']}) — acidification.")
        score += 35
    elif m.ph > EU_THRESHOLDS["ph_max"]:
        risks.append(f"pH {m.ph} above EU maximum ({EU_THRESHOLDS['ph_max']}) — alkaline excursion.")
        score += 30
    if m.dissolved_oxygen < EU_THRESHOLDS["dissolved_oxygen_min"]:
        risks.append(f"Dissolved O₂ {m.dissolved_oxygen} mg/L below safe threshold — aquatic life at risk.")
        score += 30
    if m.turbidity > EU_THRESHOLDS["turbidity_max"]:
        risks.append(f"Turbidity {m.turbidity} NTU exceeds typical surface-water limit.")
        score += 20
    if m.contaminant and any(
        k in m.contaminant.lower() for k in ("lead", "cadmium", "mercury", "petroleum", "ammonia", "e. coli", "cyano")
    ):
        risks.append(f"Detected hazardous contaminant: {m.contaminant}.")
        score += 25

    if score >= 70:
        verdict = "critical"
    elif score >= 30:
        verdict = "anomaly"
    else:
        verdict = "normal"

    return verdict, min(99, max(50, score + 50)), risks


def _openai_enrich(req: AnomalyRequest, baseline: tuple[str, int, list[str]]) -> Optional[dict]:
    """Optional: ask OpenAI to enrich the verdict. Returns None if unavailable."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        # Lazy import — keeps endpoint usable when openai isn't installed.
        from openai import OpenAI  # type: ignore
    except Exception:
        return None

    verdict, confidence, risks = baseline
    client = OpenAI(api_key=api_key)
    system = (
        "You are an EU water-quality compliance expert. "
        "Given measurements from a river monitoring station, "
        "explain the situation in 2-3 sentences and propose 3 concrete recommended actions. "
        "Respond ONLY in JSON with keys: summary (string), recommendations (list[string]), "
        "pollutant_likely (string)."
    )
    user = json.dumps({
        "river": req.river,
        "location": req.location,
        "type": req.type,
        "severity": req.severity,
        "date": req.date,
        "description": req.description,
        "metrics": req.metrics.model_dump(),
        "baseline_verdict": verdict,
        "baseline_risks": risks,
        "eu_thresholds": EU_THRESHOLDS,
    })
    try:
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        return json.loads(resp.choices[0].message.content or "{}")
    except Exception as e:
        # Never let LLM failure break the endpoint.
        return {"summary": None, "_error": str(e)}


@router.post("/anomaly", response_model=AnomalyResponse)
def detect_anomaly(req: AnomalyRequest) -> AnomalyResponse:
    """
    Classify a water-quality measurement as normal / anomaly / critical and
    return a human-readable explanation following EU Water Framework Directive.

    OpenAI is used opportunistically — if OPENAI_API_KEY is missing the
    endpoint still returns a deterministic verdict from the heuristic.
    """
    verdict, confidence, risks = _heuristic_verdict(req.metrics)

    fallback_summary = (
        f"Measurements at {req.river} ({req.location}) on {req.date} "
        f"indicate a {verdict} state. "
        f"{'Multiple parameters breach EU thresholds.' if risks else 'All parameters within EU limits.'}"
    )
    fallback_recos = {
        "critical": [
            "Notify regional environmental authority immediately",
            "Restrict water abstraction within 5 km downstream",
            "Deploy mobile sampling unit & containment team",
        ],
        "anomaly": [
            "Increase sampling frequency to hourly",
            "Trace upstream sources within 24 h",
            "Notify municipal water operator",
        ],
        "normal": [
            "Continue routine monitoring",
            "Re-evaluate after next satellite pass",
            "No public action required",
        ],
    }[verdict]

    enriched = _openai_enrich(req, (verdict, confidence, risks)) or {}
    summary = enriched.get("summary") or fallback_summary
    recommendations = enriched.get("recommendations") or fallback_recos
    pollutant = enriched.get("pollutant_likely") or req.metrics.contaminant

    return AnomalyResponse(
        verdict=verdict,
        confidence=confidence,
        summary=summary,
        risks=risks,
        recommendations=recommendations,
        pollutant_likely=pollutant,
    )
