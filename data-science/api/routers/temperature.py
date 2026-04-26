"""GET /api/river-temp — live and historical river water temperature."""

from __future__ import annotations

import math
import time
from typing import Optional

import requests
from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(tags=["temperature"])

# ── Stefan-Preud'homme zone parameters (mirrors river_temperature.py) ─────────

_ZONE_PARAMS = {
    "alpine":        {"alpha": 0.65, "beta": 2.0,  "confidence": 0.72},
    "nordic":        {"alpha": 0.70, "beta": 1.5,  "confidence": 0.74},
    "mediterranean": {"alpha": 0.80, "beta": 5.0,  "confidence": 0.73},
    "atlantic":      {"alpha": 0.75, "beta": 3.0,  "confidence": 0.76},
    "eastern":       {"alpha": 0.78, "beta": 3.0,  "confidence": 0.73},
    "continental":   {"alpha": 0.75, "beta": 3.5,  "confidence": 0.75},
}

_ALPINE_RIVERS = {"Inn", "Salzach", "Isar", "Aare", "Limmat", "Piave", "Adige"}
_ALPINE_CITIES = {"Basel", "Bern", "Zurich", "Innsbruck", "Salzburg", "Graz", "Belluno", "Verona"}


def _zone(river: dict) -> str:
    rname   = river["river_name"]
    country = river["country"]
    city    = river["representative_city"]
    lat     = river["lat"]
    if rname in _ALPINE_RIVERS or city in _ALPINE_CITIES:
        return "alpine"
    if country in ("Norway", "Finland", "Sweden") or (country == "Estonia" and lat > 58):
        return "nordic"
    if country in ("Greece", "Spain") or (country == "Italy" and lat < 44):
        return "mediterranean"
    if country == "Portugal" or rname in ("Loire", "Garonne", "Shannon", "Liffey",
                                           "Douro", "Severn", "Clyde", "Mersey") \
            or country in ("Ireland", "United Kingdom"):
        return "atlantic"
    if country in ("Ukraine", "Moldova"):
        return "eastern"
    return "continental"


def _air_to_water(air_c: float, zone: str) -> float:
    p = _ZONE_PARAMS[zone]
    return round(float(max(0.0, min(30.0, p["alpha"] * max(air_c, 0.0) + p["beta"]))), 2)


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _get_live_temp(lat: float, lon: float) -> tuple[float, str]:
    """Fetch current air temperature from Open-Meteo (ECMWF IFS). Returns (temp_c, as_of)."""
    resp = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={"latitude": lat, "longitude": lon, "current": "temperature_2m", "timezone": "UTC"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    current = data.get("current", {})
    return float(current["temperature_2m"]), current.get("time", "")


def _river_response(river: dict, air_c: float, as_of: str) -> dict:
    z   = _zone(river)
    w_c = _air_to_water(air_c, z)
    return {
        "city_key":         river["city"],
        "river_name":       river["river_name"],
        "representative_city": river["representative_city"],
        "country":          river["country"],
        "country_code":     river["country_code"],
        "coordinates":      {"lat": river["lat"], "lon": river["lon"]},
        "air_temp_c":       round(air_c, 2),
        "water_temp_c":     w_c,
        "zone":             z,
        "confidence":       _ZONE_PARAMS[z]["confidence"],
        "data_source":      "ECMWF IFS (Open-Meteo) + Stefan-Preud'homme model",
        "as_of":            as_of,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/river-temp")
def get_river_temp(
    request: Request,
    city: Optional[str] = Query(None, description="River city key, e.g. 'Odra (Wrocław)'"),
    lat: Optional[float] = Query(None, description="Latitude for nearest-river lookup"),
    lon: Optional[float] = Query(None, description="Longitude for nearest-river lookup"),
):
    """Return live water temperature for one river (by city key or lat/lon)
    or for all 102 rivers when no filter is supplied.

    Temperature is derived from ECMWF IFS current air temperature via the
    Stefan-Preud'homme linear model (T_water = alpha * T_air + beta),
    calibrated per climate zone.  For the Odra at Wrocław, the real-sensor
    WQI is also annotated in the response.
    """
    rivers = request.app.state.rivers   # list[dict] loaded at startup

    # ── Resolve target river(s) ───────────────────────────────────────────────
    if city:
        matches = [r for r in rivers if r["city"].lower() == city.lower()]
        if not matches:
            raise HTTPException(status_code=404, detail=f"River city '{city}' not found")
        targets = matches

    elif lat is not None and lon is not None:
        # Nearest river by haversine distance
        nearest = min(rivers, key=lambda r: _haversine(lat, lon, r["lat"], r["lon"]))
        targets = [nearest]

    else:
        # All rivers — batch fetch in groups of 10
        BATCH = 10
        results = []
        for i in range(0, len(rivers), BATCH):
            batch = rivers[i : i + BATCH]
            params = {
                "latitude":  ",".join(str(r["lat"]) for r in batch),
                "longitude": ",".join(str(r["lon"]) for r in batch),
                "current":   "temperature_2m",
                "timezone":  "UTC",
            }
            try:
                resp = requests.get(
                    "https://api.open-meteo.com/v1/forecast",
                    params=params, timeout=30,
                )
                resp.raise_for_status()
                data_list = resp.json()
                if isinstance(data_list, dict):
                    data_list = [data_list]
                for river, data in zip(batch, data_list):
                    cur = data.get("current", {})
                    air_c = float(cur.get("temperature_2m", 10.0))
                    as_of = cur.get("time", "")
                    results.append(_river_response(river, air_c, as_of))
            except Exception:
                for river in batch:
                    results.append({**_river_response(river, 10.0, ""), "confidence": 0.0, "error": "fetch failed"})
            if i + BATCH < len(rivers):
                time.sleep(0.2)

        return {
            "count": len(results),
            "data_source": "ECMWF IFS (Open-Meteo) + Stefan-Preud'homme model",
            "rivers": results,
        }

    # ── Single or filtered river ───────────────────────────────────────────────
    results = []
    for river in targets:
        try:
            air_c, as_of = _get_live_temp(river["lat"], river["lon"])
            results.append(_river_response(river, air_c, as_of))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Open-Meteo fetch failed: {exc}") from exc

    return results[0] if len(results) == 1 else results


@router.get("/river-temp/{city_key}/history")
def get_river_temp_history(
    city_key: str,
    request: Request,
    year: Optional[int] = Query(None, description="Filter to a single year, e.g. 2025"),
):
    """Return monthly historical water temperature for a river (Jan 2024 – Apr 2026).

    Loaded from river_temperature.parquet at startup.
    """
    df = request.app.state.temp_df

    # URL-decode slashes / parentheses are passed as-is in path segments
    rows = df[df["city"].str.lower() == city_key.lower()].copy()

    if rows.empty:
        # Try partial match (city key contains the city name)
        rows = df[df["city"].str.lower().str.contains(city_key.lower(), regex=False)].copy()

    if rows.empty:
        raise HTTPException(status_code=404, detail=f"No temperature history for '{city_key}'")

    if year is not None:
        rows = rows[rows["date"].str.startswith(str(year))]

    records = rows[["date", "air_temp_c", "water_temp_c", "zone", "confidence",
                    "data_source"]].to_dict(orient="records")

    return {
        "city_key":   rows.iloc[0]["city"],
        "country":    rows.iloc[0]["country"],
        "zone":       rows.iloc[0]["zone"],
        "months":     len(records),
        "history":    records,
    }
