"""GET /api/anomalies/recent — recent anomaly events from the Wrocław sensor."""

from __future__ import annotations

import math

from fastapi import APIRouter, Query, Request

router = APIRouter(tags=["anomalies"])

WROCLAW_ID = "wroclaw_odra_001"

# Severity from WQI (same thresholds as GeoJSON builder)
def _severity(wqi: float) -> str:
    if wqi >= 200:
        return "low"
    if wqi >= 150:
        return "moderate"
    if wqi >= 100:
        return "high"
    return "critical"


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return None if math.isnan(v) else round(v, 4)
    except (TypeError, ValueError):
        return None


@router.get("/anomalies/recent")
def recent_anomalies(
    request: Request,
    limit: int = Query(10, ge=1, le=500, description="Max number of anomaly events to return"),
    days: int  = Query(30, ge=1, le=365, description="Look-back window in days"),
):
    """Return recent anomaly events detected by IsolationForest on the Wrocław sensor.

    Severity is derived from WQI at the time of the anomaly:
      low      : WQI >= 200 (anomaly pattern but water still clean)
      moderate : 150 <= WQI < 200
      high     : 100 <= WQI < 150
      critical : WQI < 100
    """
    df = request.app.state.anomalies_df
    anomalies = df[df["is_anomaly"] == 1].copy()

    # Apply days filter
    cutoff = anomalies["timestamp"].max() - __import__("pandas").Timedelta(days=days)
    anomalies = anomalies[anomalies["timestamp"] >= cutoff]

    # Most recent first, then limit
    anomalies = anomalies.sort_values("timestamp", ascending=False).head(limit)

    rows = []
    for _, row in anomalies.iterrows():
        wqi = _safe_float(row.get("wqi"))
        rows.append({
            "timestamp":     row["timestamp"].isoformat(),
            "water_body_id": WROCLAW_ID,
            "wqi":           wqi,
            "severity":      _severity(wqi) if wqi is not None else "unknown",
            "anomaly_score": _safe_float(row.get("anomaly_score")),
            "ph":            _safe_float(row.get("ph")),
            "oxygen_mg_l":   _safe_float(row.get("oxygen_mg_l")),
            "water_temp_c":  _safe_float(row.get("water_temp_c")),
            "pollution_index": _safe_float(row.get("pollution_index")),
        })

    return {
        "water_body_id": WROCLAW_ID,
        "days_window":   days,
        "total_returned": len(rows),
        "anomalies":     rows,
    }
