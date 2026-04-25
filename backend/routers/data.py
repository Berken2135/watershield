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
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

# repo-root/backend/routers/data.py  →  repo-root/data-science/data/outputs
_DS_OUTPUTS = (
    Path(__file__).resolve().parents[2] / "data-science" / "data" / "outputs"
)

_FILES: dict[str, Path] = {
    "europe":             _DS_OUTPUTS / "watershield_europe.geojson",
    "wroclaw":            _DS_OUTPUTS / "watershield_wroclaw.geojson",
    "summary":            _DS_OUTPUTS / "watershield_summary.json",
    "forecast":           _DS_OUTPUTS / "wqi_forecast_30d.json",
    "forecast_metrics":   _DS_OUTPUTS / "forecast_metrics.json",
    "history_cities":     _DS_OUTPUTS / "historical_monthly.json",
    "history_countries":  _DS_OUTPUTS / "historical_monthly_countries.json",
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


# ── Static outputs ────────────────────────────────────────────────────────────

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


@router.get("/forecast-metrics")
def forecast_metrics():
    """Model evaluation metrics (Prophet vs XGBoost) for 7d/30d horizons."""
    return _load("forecast_metrics")


# ── Historical monthly — city level ──────────────────────────────────────────

@router.get("/history/cities")
def history_cities(
    city: Optional[str] = Query(None, description="Filter by city name, e.g. Wrocław"),
    year: Optional[int] = Query(None, description="Filter by year, e.g. 2024"),
):
    """
    Monthly WQI history for all cities (Jan 2024 – Apr 2026).

    Each record: city, country, lat, lon, date, wqi, risk_level, data_source.
    Filter with ?city=Wrocław and/or ?year=2024.
    """
    records: list[dict] = _load("history_cities")

    if city:
        records = [r for r in records if r["city"].lower() == city.lower()]
        if not records:
            raise HTTPException(status_code=404, detail=f"City '{city}' not found")

    if year:
        records = [r for r in records if r["date"].startswith(str(year))]
        if not records:
            raise HTTPException(status_code=404, detail=f"No data for year {year}")

    return {"months": len(records), "data": records}


@router.get("/history/water-body/{water_body_id}")
def history_water_body(
    water_body_id: str,
    year: Optional[int] = Query(None, description="Filter by year, e.g. 2024"),
):
    """
    Monthly WQI history for a specific water body (Jan 2024 – Apr 2026).

    Looks up the city name from the Europe GeoJSON, then returns its
    monthly history. Use ?year= to narrow to a single year.
    """
    # Resolve city name from water_body_id via the europe GeoJSON
    geojson = _load("europe")
    city_name: str | None = None
    for feature in geojson["features"]:
        if feature["properties"].get("water_body_id") == water_body_id:
            # name format: "Odra River - Wrocław" or "Spree - Berlin"
            city_name = feature["properties"]["name"].split(" - ")[-1].strip()
            break

    if city_name is None:
        raise HTTPException(status_code=404, detail=f"Water body '{water_body_id}' not found")

    records: list[dict] = _load("history_cities")
    records = [r for r in records if r["city"] == city_name]

    if year:
        records = [r for r in records if r["date"].startswith(str(year))]
        if not records:
            raise HTTPException(status_code=404, detail=f"No data for '{water_body_id}' year={year}")

    return {
        "water_body_id": water_body_id,
        "city":          city_name,
        "months":        len(records),
        "history":       [{"date": r["date"], "wqi": r["wqi"], "risk_level": r["risk_level"], "data_source": r["data_source"]} for r in records],
    }


# ── Historical monthly — country level ───────────────────────────────────────

@router.get("/history/countries")
def history_countries(
    year: Optional[int] = Query(None, description="Filter by year, e.g. 2024"),
):
    """
    Monthly WQI history aggregated by country (Jan 2024 – Apr 2026).

    Poland is the average of Wrocław + Kraków + Warsaw.
    All other countries have one city so country = city value.
    Each record: country, country_code, date, wqi, risk_level, cities_count, data_source.
    """
    records: list[dict] = _load("history_countries")

    if year:
        records = [r for r in records if r["date"].startswith(str(year))]
        if not records:
            raise HTTPException(status_code=404, detail=f"No data for year {year}")

    dates     = sorted({r["date"] for r in records})
    countries = sorted({r["country"] for r in records})

    return {
        "months":    len(dates),
        "countries": len(countries),
        "data":      records,
    }


@router.get("/history/countries/{country_code}")
def history_country(
    country_code: str,
    year: Optional[int] = Query(None, description="Filter by year, e.g. 2024"),
):
    """
    Monthly WQI history for a single country by ISO 3166-1 alpha-2 code (e.g. PL).

    Use ?year= to narrow to a single year.
    """
    records: list[dict] = _load("history_countries")
    records = [r for r in records if r["country_code"] == country_code.upper()]

    if not records:
        raise HTTPException(status_code=404, detail=f"Country code '{country_code}' not found")

    if year:
        records = [r for r in records if r["date"].startswith(str(year))]
        if not records:
            raise HTTPException(status_code=404, detail=f"No data for '{country_code}' year={year}")

    return {
        "country":      records[0]["country"],
        "country_code": country_code.upper(),
        "months":       len(records),
        "history":      [{"date": r["date"], "wqi": r["wqi"], "risk_level": r["risk_level"], "cities_count": r["cities_count"], "data_source": r["data_source"]} for r in records],
    }


# ── Snapshot comparisons (now vs N months ago) ────────────────────────────────

def _snapshot(records: list[dict], offsets: list[int]) -> dict:
    """
    Given a sorted list of monthly records and a list of month offsets,
    return a dict with 'current' and one key per offset.

    E.g. offsets=[1, 3, 6, 12] produces:
      current, 1_month_ago, 3_months_ago, 6_months_ago, 12_months_ago
    """
    records = sorted(records, key=lambda r: r["date"])
    if not records:
        return {}

    def _entry(r: dict, reference_wqi: float | None = None) -> dict:
        out = {"date": r["date"], "wqi": r["wqi"], "risk_level": r["risk_level"]}
        if reference_wqi is not None:
            diff = round(r["wqi"] - reference_wqi, 1)
            out["change"]     = diff
            out["change_pct"] = round(diff / reference_wqi * 100, 1) if reference_wqi else 0.0
        return out

    latest = records[-1]
    result: dict = {"current": _entry(latest)}

    for offset in offsets:
        if offset >= len(records):
            continue
        past = records[-(offset + 1)]
        key  = f"{offset}_month{'s' if offset > 1 else ''}_ago"
        result[key] = _entry(past, reference_wqi=latest["wqi"])

    return result


@router.get("/history/compare/water-body/{water_body_id}")
def compare_water_body(water_body_id: str):
    """
    Current WQI vs 1, 3, 6, and 12 months ago for a specific water body.

    Returns each snapshot with the absolute change and % change relative
    to the current value — ready to display directly on the frontend.

    Example response:
      {
        "water_body_id": "wroclaw_odra_001",
        "city": "Wrocław",
        "current":       { "date": "2026-04-01", "wqi": 190.0, "risk_level": "moderate" },
        "1_month_ago":   { "date": "2026-03-01", "wqi": 175.2, "risk_level": "moderate", "change": 14.8, "change_pct": 7.8 },
        "3_months_ago":  { ... },
        "6_months_ago":  { ... },
        "12_months_ago": { ... }
      }
    """
    geojson = _load("europe")
    city_name: str | None = None
    for feature in geojson["features"]:
        if feature["properties"].get("water_body_id") == water_body_id:
            city_name = feature["properties"]["name"].split(" - ")[-1].strip()
            break

    if city_name is None:
        raise HTTPException(status_code=404, detail=f"Water body '{water_body_id}' not found")

    records: list[dict] = [
        r for r in _load("history_cities") if r["city"] == city_name
    ]

    return {"water_body_id": water_body_id, "city": city_name,
            **_snapshot(records, [1, 3, 6, 12])}


@router.get("/history/compare/countries/{country_code}")
def compare_country(country_code: str):
    """
    Current WQI vs 1, 3, 6, and 12 months ago for a country.

    Same shape as the water-body compare endpoint, keyed by country_code.
    """
    records: list[dict] = [
        r for r in _load("history_countries")
        if r["country_code"] == country_code.upper()
    ]

    if not records:
        raise HTTPException(status_code=404, detail=f"Country code '{country_code}' not found")

    return {
        "country":      records[0]["country"],
        "country_code": country_code.upper(),
        **_snapshot(records, [1, 3, 6, 12]),
    }
