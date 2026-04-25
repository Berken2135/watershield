"""Fetch ECMWF medium-range weather forecast for 30 European cities.

Primary path  : `ecmwf-opendata` Python package → downloads latest IFS HRES
                GRIB2 from https://data.ecmwf.int (no API key required).
Fallback path : Open-Meteo forecast API (uses the same ECMWF IFS model
                data, no auth required).

Output: data/processed/europe/ecmwf_forecast.parquet
Schema : city, country, lat, lon, date (YYYY-MM-DD, daily),
         temperature_max_c, temperature_min_c, precipitation_mm, source
"""

from __future__ import annotations

import sys
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.config import DATA_PROCESSED
from src.european_data.cities import CITIES

OUT_PATH = DATA_PROCESSED / "europe" / "ecmwf_forecast.parquet"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

FORECAST_DAYS = 7
BATCH_SIZE    = 10


# ── Open-Meteo fallback (ECMWF IFS data) ─────────────────────────────────────

def _fetch_forecast_batch(cities_batch: list[dict]) -> list[pd.DataFrame]:
    """Fetch 7-day daily forecast for a batch of cities via Open-Meteo."""
    params = {
        "latitude":       ",".join(str(c["lat"]) for c in cities_batch),
        "longitude":      ",".join(str(c["lon"]) for c in cities_batch),
        "daily":          "temperature_2m_max,temperature_2m_min,precipitation_sum",
        "forecast_days":  FORECAST_DAYS,
        "timezone":       "UTC",
    }
    resp = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params=params, timeout=30,
    )
    resp.raise_for_status()
    results = resp.json()
    if isinstance(results, dict):
        results = [results]

    frames = []
    for city_meta, city_data in zip(cities_batch, results):
        daily = city_data.get("daily", {})
        if not daily.get("time"):
            continue
        df = pd.DataFrame({
            "date":              daily["time"],
            "temperature_max_c": daily.get("temperature_2m_max"),
            "temperature_min_c": daily.get("temperature_2m_min"),
            "precipitation_mm":  daily.get("precipitation_sum"),
        })
        df["city"]    = city_meta["city"]
        df["country"] = city_meta["country"]
        df["lat"]     = float(city_meta["lat"])
        df["lon"]     = float(city_meta["lon"])
        df["source"]  = "ECMWF IFS (Open-Meteo)"
        frames.append(df)
    return frames


def fetch_openmeteo() -> pd.DataFrame:
    """Fetch ECMWF 7-day daily forecast for all cities."""
    print("  [ECMWF] Fetching via Open-Meteo forecast (ECMWF IFS) …")
    all_frames: list[pd.DataFrame] = []

    for i in range(0, len(CITIES), BATCH_SIZE):
        batch = CITIES[i : i + BATCH_SIZE]
        print(f"    batch {i//BATCH_SIZE + 1}: {[c['city'] for c in batch]}")
        frames = _fetch_forecast_batch(batch)
        all_frames.extend(frames)
        if i + BATCH_SIZE < len(CITIES):
            time.sleep(0.2)

    if not all_frames:
        raise RuntimeError("No ECMWF data returned from Open-Meteo")

    df = pd.concat(all_frames, ignore_index=True)
    df["date"] = df["date"].astype(str)
    return df


# ── ecmwf-opendata primary path ────────────────────────────────────────────────

def fetch_ecmwf_opendata() -> pd.DataFrame | None:
    """Try the ecmwf-opendata package (GRIB2 download + extraction).

    Requires `cfgrib` and the `eccodes` C library.  Falls through to None
    if either is missing or if the download fails.
    """
    try:
        import cfgrib  # noqa — just check it's present
        from ecmwf.opendata import Client
        import tempfile, xarray as xr, numpy as np

        c = Client(source="ecmwf")
        with tempfile.TemporaryDirectory() as tmp:
            grib_path = Path(tmp) / "forecast.grib2"
            c.retrieve(
                step=[24, 48, 72, 96, 120, 144, 168],
                param=["2t", "tp"],
                target=str(grib_path),
            )
            ds = xr.open_dataset(str(grib_path), engine="cfgrib",
                                 backend_kwargs={"indexpath": ""})

            rows = []
            for city in CITIES:
                city_ds = ds.sel(
                    latitude=city["lat"], longitude=city["lon"], method="nearest"
                )
                for step in city_ds.step.values:
                    valid = pd.Timestamp(ds.time.values) + pd.Timedelta(step)
                    t2m = float(city_ds["t2m"].sel(step=step).values) - 273.15
                    tp  = float(city_ds["tp"].sel(step=step).values) * 1000
                    rows.append({
                        "city":              city["city"],
                        "country":           city["country"],
                        "lat":               float(city["lat"]),
                        "lon":               float(city["lon"]),
                        "date":              valid.strftime("%Y-%m-%d"),
                        "temperature_max_c": t2m,
                        "temperature_min_c": t2m,
                        "precipitation_mm":  tp,
                        "source":            "ECMWF IFS (ecmwf-opendata)",
                    })
            return pd.DataFrame(rows)

    except Exception as exc:
        print(f"  [ECMWF/opendata] Not available ({type(exc).__name__}: {exc}) — falling back to Open-Meteo")
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

def load_or_fetch() -> pd.DataFrame:
    df = fetch_ecmwf_opendata()
    if df is None:
        df = fetch_openmeteo()
    return df


def main() -> None:
    today = date.today()
    print("ECMWF medium-range forecast fetcher")
    print(f"  Horizon : {today} → {today + timedelta(days=FORECAST_DAYS - 1)}")
    print(f"  Cities  : {len(CITIES)}")

    df = load_or_fetch()
    df.to_parquet(OUT_PATH, index=False)

    print(f"\nSaved → {OUT_PATH}")
    print(f"  rows    : {len(df):,}")
    print(f"  cities  : {df['city'].nunique()}")
    print(f"  dates   : {sorted(df['date'].unique())[:7]}")
    print(f"  source  : {df['source'].unique()}")
    print("\nSample (Wrocław):")
    print(df[df["city"] == "Wrocław"].to_string(index=False))


if __name__ == "__main__":
    main()
