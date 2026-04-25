"""
Real-data endpoints — serves the artefacts produced by the
data-science pipeline (GeoJSON, summary, 30-day forecast).

Resolves files relative to the repo so no env wiring is needed:
    backend/        ← we live here
    data-science/data/outputs/
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter()

# repo-root/backend/routers/data.py  →  repo-root/data-science/data/outputs
_DS_OUTPUTS = (
    Path(__file__).resolve().parents[2] / "data-science" / "data" / "outputs"
)

_FILES: dict[str, Path] = {
    "europe":   _DS_OUTPUTS / "watershield_europe.geojson",
    "wroclaw":  _DS_OUTPUTS / "watershield_wroclaw.geojson",
    "summary":  _DS_OUTPUTS / "watershield_summary.json",
    "forecast": _DS_OUTPUTS / "wqi_forecast_30d.json",
}


def _load(name: str) -> Any:
    path = _FILES.get(name)
    if path is None or not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"data file '{name}' not found at {path}",
        )
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/europe")
def europe_geojson():
    """Full FeatureCollection — 30 European cities + Wrocław."""
    return _load("europe")


@router.get("/wroclaw")
def wroclaw_geojson():
    """Single feature for the real-data Wrocław station."""
    return _load("wroclaw")


@router.get("/summary")
def summary():
    """Aggregate stats (risk counts, avg WQI by country)."""
    return _load("summary")


@router.get("/forecast")
def forecast():
    """30-day Wrocław WQI forecast (Prophet/XGBoost)."""
    return _load("forecast")
