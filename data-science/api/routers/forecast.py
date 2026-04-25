"""GET /api/water-bodies/{water_body_id}/forecast — 30-day WQI forecast."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(tags=["forecast"])

WROCLAW_ID = "wroclaw_odra_001"

RISK_THRESHOLDS = [
    (200.0, "clean"),
    (150.0, "moderate"),
    (100.0, "high"),
    (0.0,   "critical"),
]


def _risk_label(wqi: float) -> str:
    for threshold, label in RISK_THRESHOLDS:
        if wqi >= threshold:
            return label
    return "critical"


def _synthetic_forecast(wqi_current: float, wqi_30d: float, wqi_lower: float, wqi_upper: float) -> list[dict]:
    """Linear interpolation from wqi_current to wqi_30d over 30 days.

    Confidence interval also interpolates linearly from zero width at day 0
    to (wqi_lower_30d, wqi_upper_30d) at day 30.
    """
    today = date.today()
    rows = []
    for i in range(1, 31):
        t = i / 30.0
        wqi  = round(wqi_current + (wqi_30d - wqi_current) * t, 1)
        lower = round(wqi_current + (wqi_lower - wqi_current) * t, 1)
        upper = round(wqi_current + (wqi_upper - wqi_current) * t, 1)
        rows.append({
            "date":          (today + timedelta(days=i)).isoformat(),
            "wqi_predicted": wqi,
            "wqi_lower":     lower,
            "wqi_upper":     upper,
            "risk_level":    _risk_label(wqi),
            "data_source":   "synthetic",
        })
    return rows


@router.get("/water-bodies/{water_body_id}/forecast")
def get_forecast(water_body_id: str, request: Request):
    """Return 30-day WQI forecast for a water body.

    Wrocław returns the real model forecast (Prophet / XGBoost winner).
    All other cities return a synthetic linear interpolation between
    wqi_current and wqi_predicted_30d from the GeoJSON properties.
    """
    # Find the feature to validate ID and get properties
    feature = None
    for f in request.app.state.geojson["features"]:
        if f["properties"].get("water_body_id") == water_body_id:
            feature = f
            break

    if feature is None:
        raise HTTPException(status_code=404, detail=f"Water body '{water_body_id}' not found")

    props = feature["properties"]

    if water_body_id == WROCLAW_ID:
        forecast = request.app.state.forecast_30d
        return {
            "water_body_id": water_body_id,
            "name":          props["name"],
            "data_source":   "real",
            "forecast":      forecast,
        }

    # Synthetic forecast for all other cities
    forecast = _synthetic_forecast(
        wqi_current=props["wqi_current"],
        wqi_30d=props["wqi_predicted_30d"],
        wqi_lower=props["wqi_lower_30d"],
        wqi_upper=props["wqi_upper_30d"],
    )
    return {
        "water_body_id": water_body_id,
        "name":          props["name"],
        "data_source":   "synthetic",
        "note":          "Linear interpolation from current WQI to 30-day estimate; no sensor model.",
        "forecast":      forecast,
    }
