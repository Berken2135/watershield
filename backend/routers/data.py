"""
Real-data endpoints — serves the artefacts produced by the
data-science pipeline (GeoJSON, summary, 30-day forecast).

Resolves files relative to the repo so no env wiring is needed:
    backend/        ← we live here
    data-science/data/outputs/
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

# backend/routers/data.py → backend/data/outputs/ (both Docker /app/data/outputs and local dev)
_DS_OUTPUTS = Path(__file__).resolve().parents[1] / "data" / "outputs"

_FILES: dict[str, Path] = {
    "europe":             _DS_OUTPUTS / "watershield_europe.geojson",
    "wroclaw":            _DS_OUTPUTS / "watershield_wroclaw.geojson",
    "summary":            _DS_OUTPUTS / "watershield_summary.json",
    "forecast":           _DS_OUTPUTS / "wqi_forecast_30d.json",
    "forecast_metrics":   _DS_OUTPUTS / "forecast_metrics.json",
    "history_cities":     _DS_OUTPUTS / "historical_monthly.json",
    "history_countries":  _DS_OUTPUTS / "historical_monthly_countries.json",
    "temperatures":       _DS_OUTPUTS / "river_temperature_live.json",
}


# EU-27 plus a couple of close monitored neighbours visualised on the map.
EU_COUNTRIES: frozenset[str] = frozenset({
    "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia",
    "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
    "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg",
    "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia",
    "Slovenia", "Spain", "Sweden",
    # Non-EU but rendered on the choropleth & marker layer.
    "Norway", "North Macedonia",
})


def _load(name: str) -> Any:
    path = _FILES.get(name)
    if path is None or not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"data file '{name}' not found at {path}",
        )
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _eu_only_geojson(fc: dict) -> dict:
    """Return a copy of a GeoJSON FeatureCollection with only EU-27 features."""
    return {
        **fc,
        "features": [
            f for f in fc["features"]
            if f["properties"].get("country") in EU_COUNTRIES
        ],
    }


def _eu_only_records(records: list[dict]) -> list[dict]:
    """Filter a list of dicts to EU-27 countries only."""
    return [r for r in records if r.get("country") in EU_COUNTRIES]


def _city_match(record_city: str, query: str) -> bool:
    """Match a city query against records where city may be 'River (City)' format."""
    if record_city.lower() == query.lower():
        return True
    m = re.search(r'\((.+?)\)', record_city)
    return bool(m and m.group(1).strip().lower() == query.lower())


# ── Static outputs ────────────────────────────────────────────────────────────

@router.get("/europe")
def europe_geojson():
    """Full FeatureCollection — EU-27 cities only.
    Live water/air temperatures are merged into each feature's `properties`
    when a matching record exists in `river_temperature_live.json`.
    """
    fc = _eu_only_geojson(_load("europe"))
    try:
        temps = _load("temperatures")
    except HTTPException:
        temps = {}

    # Build lookup keyed by station name (matches how data-science writes it,
    # e.g. "Odra (Wrocław)") and also by lower-case for resilience.
    by_name: dict[str, dict] = {}
    for k, v in temps.items():
        by_name[k.lower()] = v

    for feature in fc.get("features", []):
        props = feature.get("properties") or {}
        name = (props.get("name") or "").strip().lower()
        rec = by_name.get(name)
        if rec:
            props["water_temp_c"] = rec.get("water_temp_c")
            props["air_temp_c"] = rec.get("air_temp_c")
            props["temp_as_of"] = rec.get("as_of")
            props["temp_source"] = rec.get("data_source")
            feature["properties"] = props
    return fc


@router.get("/temperatures")
def temperatures():
    """Live river / air temperatures keyed by station name."""
    return _load("temperatures")


@router.get("/wroclaw")
def wroclaw_geojson():
    """Single feature for the real-data Wrocław station."""
    return _load("wroclaw")


@router.get("/summary")
def summary():
    """Aggregate stats (risk counts, avg WQI by country) — EU-27 only."""
    raw: dict = _load("summary")
    eu_avg = {k: v for k, v in raw.get("avg_wqi_by_country", {}).items() if k in EU_COUNTRIES}
    features = _eu_only_geojson(_load("europe"))["features"]
    risk_counts: dict[str, int] = {"clean": 0, "moderate": 0, "high": 0, "critical": 0}
    for f in features:
        level = f["properties"].get("risk_level", "")
        if level in risk_counts:
            risk_counts[level] += 1
    return {
        "total_cities":       len(features),
        "risk_counts":        risk_counts,
        "avg_wqi_by_country": eu_avg,
    }


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
    records: list[dict] = _eu_only_records(_load("history_cities"))

    if city:
        records = [r for r in records if _city_match(r["city"], city)]
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
    # Resolve city name from water_body_id via EU-filtered GeoJSON
    geojson = _eu_only_geojson(_load("europe"))
    city_name: str | None = None
    for feature in geojson["features"]:
        if feature["properties"].get("water_body_id") == water_body_id:
            # name format: "Odra River - Wrocław" or "Spree - Berlin"
            city_name = feature["properties"]["name"].split(" - ")[-1].strip()
            break

    if city_name is None:
        raise HTTPException(status_code=404, detail=f"Water body '{water_body_id}' not found")

    records: list[dict] = _eu_only_records(_load("history_cities"))
    records = [r for r in records if _city_match(r["city"], city_name)]

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
    records: list[dict] = _eu_only_records(_load("history_countries"))

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
    records: list[dict] = _eu_only_records(_load("history_countries"))
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
    geojson = _eu_only_geojson(_load("europe"))
    city_name: str | None = None
    for feature in geojson["features"]:
        if feature["properties"].get("water_body_id") == water_body_id:
            city_name = feature["properties"]["name"].split(" - ")[-1].strip()
            break

    if city_name is None:
        raise HTTPException(status_code=404, detail=f"Water body '{water_body_id}' not found")

    records: list[dict] = [
        r for r in _eu_only_records(_load("history_cities"))
        if _city_match(r["city"], city_name)
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
        r for r in _eu_only_records(_load("history_countries"))
        if r["country_code"] == country_code.upper()
    ]

    if not records:
        raise HTTPException(status_code=404, detail=f"Country code '{country_code}' not found")

    return {
        "country":      records[0]["country"],
        "country_code": country_code.upper(),
        **_snapshot(records, [1, 3, 6, 12]),
    }
