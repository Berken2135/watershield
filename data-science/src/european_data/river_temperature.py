"""River water temperature — historical (ERA5) + live (ECMWF IFS).

Strategy
--------
Direct river water temperature measurements are not freely available at
continental scale.  We use the Stefan-Preud'homme linear model, the
standard hydrology proxy when in-situ sensors are absent:

    T_water = clip(alpha * max(T_air, 0) + beta, 0.0, 30.0)

Coefficients are tuned by climate zone; water can't be below 0 °C
in rivers we monitor and rarely exceeds 30 °C in Europe.

Data sources
------------
Historical  : Open-Meteo archive API (ERA5 reanalysis, free, no key)
              Monthly mean air temperature at each river coordinate.
Live / NRT  : Open-Meteo current-weather endpoint (ECMWF IFS, ~1–6 h lag)
              Returns temperature at time of request.

Output files
------------
data/processed/europe/river_temperature.parquet
    city, date, air_temp_c, water_temp_c, zone, confidence, data_source

data/outputs/river_temperature_live.json
    { city_key: {air_temp_c, water_temp_c, as_of, zone, confidence,
                 data_source, lat, lon, country} }
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.config import DATA_OUTPUTS, DATA_PROCESSED
from src.european_data.rivers import RIVERS

EUROPE_DIR = DATA_PROCESSED / "europe"
EUROPE_DIR.mkdir(parents=True, exist_ok=True)

OUT_PARQUET  = EUROPE_DIR / "river_temperature.parquet"
OUT_LIVE     = DATA_OUTPUTS / "river_temperature_live.json"

HIST_START = "2024-01-01"
HIST_END   = "2026-04-25"
BATCH_SIZE = 5    # rivers per Open-Meteo request (archive API rate limits)

# ── Stefan-Preud'homme parameters by climate zone ─────────────────────────────
# Higher alpha → stronger coupling between air and water temperature.
# Higher beta  → warmer baseline (Mediterranean sun, lower flow velocity).
# confidence   → how reliable this zone's estimate typically is [0–1].

ZONE_PARAMS: dict[str, dict] = {
    "alpine":        {"alpha": 0.65, "beta": 2.0,  "confidence": 0.72},
    "nordic":        {"alpha": 0.70, "beta": 1.5,  "confidence": 0.74},
    "mediterranean": {"alpha": 0.80, "beta": 5.0,  "confidence": 0.73},
    "atlantic":      {"alpha": 0.75, "beta": 3.0,  "confidence": 0.76},
    "eastern":       {"alpha": 0.78, "beta": 3.0,  "confidence": 0.73},
    "continental":   {"alpha": 0.75, "beta": 3.5,  "confidence": 0.75},
}

# Rivers whose alpine snowmelt source dominates the Stefan response.
_ALPINE_RIVERS = {"Inn", "Salzach", "Isar", "Aare", "Limmat", "Piave", "Adige"}
_ALPINE_CITIES = {"Basel", "Bern", "Zurich", "Innsbruck", "Salzburg", "Graz", "Belluno", "Verona"}

_NORDIC_COUNTRIES  = {"Norway", "Finland", "Sweden"}
_ATLANTIC_RIVERS   = {"Loire", "Garonne", "Shannon", "Liffey", "Douro", "Severn", "Clyde", "Mersey"}
_MEDIT_COUNTRIES   = {"Greece", "Spain"}
_EASTERN_COUNTRIES = {"Ukraine", "Moldova"}


def _climate_zone(river: dict) -> str:
    rname   = river["river_name"]
    country = river["country"]
    city    = river["representative_city"]
    lat     = river["lat"]

    if rname in _ALPINE_RIVERS or city in _ALPINE_CITIES:
        return "alpine"
    if country in _NORDIC_COUNTRIES or (country == "Estonia" and lat > 58):
        return "nordic"
    if country in _MEDIT_COUNTRIES or (country == "Italy" and lat < 44):
        return "mediterranean"
    if country == "Portugal" or rname in _ATLANTIC_RIVERS or country in ("Ireland", "United Kingdom"):
        return "atlantic"
    if country in _EASTERN_COUNTRIES:
        return "eastern"
    return "continental"


def _air_to_water(air_temp_c: float, zone: str) -> float:
    p = ZONE_PARAMS[zone]
    raw = p["alpha"] * max(air_temp_c, 0.0) + p["beta"]
    return round(float(max(0.0, min(30.0, raw))), 2)


# ── Historical temperature (monthly, ERA5 via Open-Meteo archive) ─────────────

def _fetch_hist_batch(batch: list[dict]) -> list[pd.DataFrame]:
    params = {
        "latitude":   ",".join(str(r["lat"]) for r in batch),
        "longitude":  ",".join(str(r["lon"]) for r in batch),
        "start_date": HIST_START,
        "end_date":   HIST_END,
        "daily":      "temperature_2m_mean",
        "timezone":   "UTC",
    }
    resp = requests.get(
        "https://archive-api.open-meteo.com/v1/archive",
        params=params, timeout=90,
    )
    resp.raise_for_status()
    results = resp.json()
    if isinstance(results, dict):
        results = [results]

    frames = []
    for river, data in zip(batch, results):
        daily = data.get("daily", {})
        if not daily.get("time"):
            continue
        df = pd.DataFrame({
            "date":         pd.to_datetime(daily["time"]),
            "air_temp_c":   daily["temperature_2m_mean"],
        })
        df["city"]    = river["city"]
        df["country"] = river["country"]
        df["lat"]     = float(river["lat"])
        df["lon"]     = float(river["lon"])
        df["zone"]    = _climate_zone(river)
        frames.append(df)
    return frames


def fetch_historical() -> pd.DataFrame:
    """Fetch monthly ERA5 air temp for all rivers, apply Stefan → water temp."""
    print(f"  [RiverTemp] Fetching historical ERA5 ({HIST_START} → {HIST_END}) …")
    all_daily: list[pd.DataFrame] = []

    for i in range(0, len(RIVERS), BATCH_SIZE):
        batch = RIVERS[i : i + BATCH_SIZE]
        print(f"    batch {i // BATCH_SIZE + 1}/{(len(RIVERS) - 1) // BATCH_SIZE + 1}: "
              f"{[r['city'] for r in batch]}")
        for attempt in range(4):
            try:
                frames = _fetch_hist_batch(batch)
                all_daily.extend(frames)
                break
            except Exception as exc:
                if attempt == 3:
                    raise
                wait = 15 * (attempt + 1)
                print(f"    ⚠ batch failed ({exc}), retrying in {wait}s …")
                time.sleep(wait)
        if i + BATCH_SIZE < len(RIVERS):
            time.sleep(3.0)

    if not all_daily:
        raise RuntimeError("No temperature data returned from Open-Meteo archive")

    daily = pd.concat(all_daily, ignore_index=True)

    # Monthly aggregation
    monthly = (
        daily.groupby(["city", "country", "lat", "lon", "zone",
                       pd.Grouper(key="date", freq="MS")])
        ["air_temp_c"].mean()
        .round(2)
        .reset_index()
    )
    monthly["date"] = monthly["date"].dt.strftime("%Y-%m-%d")

    # Stefan equation → water temperature
    monthly["water_temp_c"] = monthly.apply(
        lambda row: _air_to_water(row["air_temp_c"], row["zone"]), axis=1
    )
    monthly["confidence"]   = monthly["zone"].map(
        lambda z: ZONE_PARAMS[z]["confidence"]
    )
    monthly["data_source"] = "ERA5 reanalysis + Stefan model (Open-Meteo)"

    return monthly[[
        "city", "country", "lat", "lon", "date",
        "air_temp_c", "water_temp_c", "zone", "confidence", "data_source"
    ]]


# ── Live / near-real-time temperature (ECMWF IFS via Open-Meteo) ──────────────

def _fetch_live_batch(batch: list[dict]) -> list[dict]:
    params = {
        "latitude":  ",".join(str(r["lat"]) for r in batch),
        "longitude": ",".join(str(r["lon"]) for r in batch),
        "current":   "temperature_2m",
        "timezone":  "UTC",
    }
    resp = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params=params, timeout=30,
    )
    resp.raise_for_status()
    results = resp.json()
    if isinstance(results, dict):
        results = [results]

    records = []
    for river, data in zip(batch, results):
        current = data.get("current", {})
        air_t   = current.get("temperature_2m")
        if air_t is None:
            continue
        zone     = _climate_zone(river)
        water_t  = _air_to_water(float(air_t), zone)
        as_of    = current.get("time", datetime.now(timezone.utc).isoformat())
        records.append({
            "city":         river["city"],
            "country":      river["country"],
            "country_code": river["country_code"],
            "lat":          float(river["lat"]),
            "lon":          float(river["lon"]),
            "air_temp_c":   round(float(air_t), 2),
            "water_temp_c": water_t,
            "zone":         zone,
            "confidence":   ZONE_PARAMS[zone]["confidence"],
            "data_source":  "ECMWF IFS (Open-Meteo current) + Stefan model",
            "as_of":        as_of,
        })
    return records


def fetch_live() -> dict[str, dict]:
    """Fetch current temperature for all 102 rivers (< 30 s).

    Returns a dict keyed by river `city` field
    (e.g. "Odra (Wrocław)") for easy lookup.
    """
    print("  [RiverTemp] Fetching live ECMWF IFS temperatures …")
    all_records: list[dict] = []

    for i in range(0, len(RIVERS), BATCH_SIZE):
        batch = RIVERS[i : i + BATCH_SIZE]
        records = _fetch_live_batch(batch)
        all_records.extend(records)
        if i + BATCH_SIZE < len(RIVERS):
            time.sleep(0.2)

    return {r["city"]: r for r in all_records}


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("River temperature pipeline")
    print(f"  Rivers : {len(RIVERS)}")
    print()

    # Historical
    hist = fetch_historical()
    hist.to_parquet(OUT_PARQUET, index=False)
    print(f"\nSaved → {OUT_PARQUET}")
    print(f"  rows    : {len(hist):,}")
    print(f"  rivers  : {hist['city'].nunique()}")
    print(f"  range   : {hist['air_temp_c'].min():.1f} – {hist['air_temp_c'].max():.1f} °C (air)")
    print(f"  water   : {hist['water_temp_c'].min():.1f} – {hist['water_temp_c'].max():.1f} °C")

    # Live
    print()
    live = fetch_live()
    with OUT_LIVE.open("w", encoding="utf-8") as f:
        json.dump(live, f, indent=2, ensure_ascii=False)
    print(f"Saved → {OUT_LIVE}")

    if live:
        water_temps = [v["water_temp_c"] for v in live.values()]
        print(f"  current water temp range: {min(water_temps):.1f} – {max(water_temps):.1f} °C")

    print("\n── Sample: Odra (Wrocław) ─────────────────────────────────────────")
    odra = hist[hist["city"] == "Odra (Wrocław)"][["date", "air_temp_c", "water_temp_c", "zone"]].tail(6)
    print(odra.to_string(index=False))

    if "Odra (Wrocław)" in live:
        r = live["Odra (Wrocław)"]
        print(f"\nLive → air: {r['air_temp_c']} °C  |  water: {r['water_temp_c']} °C  |  as_of: {r['as_of']}")


if __name__ == "__main__":
    main()
