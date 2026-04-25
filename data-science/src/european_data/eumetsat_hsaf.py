"""Fetch soil moisture data for 30 European cities.

H-SAF (EUMETSAT Satellite Application Facility on Support to Operational
Hydrology and Water Management) products used as reference:
  - H10  : Soil wetness index (surface, from ASCAT radar backscatter)
  - H14  : Soil wetness index (profile, from ASCAT)
  - H26  : Precipitation (combined MW/IR)
  - H SAF portal: https://hsaf.meteoam.it/
  - Full FTP/HTTP access requires free registration at that portal.

This module fetches ERA5-Land volumetric soil moisture (0–7 cm depth) from
Open-Meteo as a physics-consistent proxy for H-SAF SWI (surface wetness
index).  ERA5-Land soil moisture is produced by ECMWF and is used as
background field for H-SAF retrievals, so the correlation is high.

Output: data/processed/europe/hsaf_soil_moisture.parquet
Schema : city, country, lat, lon, date (YYYY-MM-DD, first of month),
         soil_moisture_m3m3 (monthly mean volumetric moisture, m³/m³),
         source
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.config import DATA_PROCESSED
from src.european_data.cities import CITIES

OUT_PATH = DATA_PROCESSED / "europe" / "hsaf_soil_moisture.parquet"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

HIST_START  = "2024-01-01"
HIST_END    = "2024-12-31"
BATCH_SIZE  = 5    # smaller batch for hourly data (larger response)


# ── Open-Meteo ERA5-Land hourly soil moisture ─────────────────────────────────

def _fetch_soil_batch(cities_batch: list[dict]) -> list[pd.DataFrame]:
    """Fetch hourly ERA5-Land soil moisture for a batch, aggregate to daily."""
    params = {
        "latitude":  ",".join(str(c["lat"]) for c in cities_batch),
        "longitude": ",".join(str(c["lon"]) for c in cities_batch),
        "start_date": HIST_START,
        "end_date":   HIST_END,
        "hourly":     "soil_moisture_0_to_7cm",
        "models":     "era5_land",
        "timezone":   "UTC",
    }
    resp = requests.get(
        "https://archive-api.open-meteo.com/v1/archive",
        params=params, timeout=120,
    )
    resp.raise_for_status()
    results = resp.json()
    if isinstance(results, dict):
        results = [results]

    frames = []
    for city_meta, city_data in zip(cities_batch, results):
        hourly = city_data.get("hourly", {})
        if not hourly.get("time"):
            continue

        df = pd.DataFrame({
            "datetime":            pd.to_datetime(hourly["time"]),
            "soil_moisture_m3m3":  hourly.get("soil_moisture_0_to_7cm"),
        })
        df["city"]    = city_meta["city"]
        df["country"] = city_meta["country"]
        df["lat"]     = float(city_meta["lat"])
        df["lon"]     = float(city_meta["lon"])
        df["source"]  = "ERA5-Land (Open-Meteo) — H-SAF proxy"
        frames.append(df)
    return frames


def fetch_soil_moisture() -> pd.DataFrame:
    """Fetch ERA5-Land hourly soil moisture, aggregate to monthly means."""
    print("  [H-SAF proxy] Fetching ERA5-Land soil moisture via Open-Meteo …")
    all_frames: list[pd.DataFrame] = []

    for i in range(0, len(CITIES), BATCH_SIZE):
        batch = CITIES[i : i + BATCH_SIZE]
        print(f"    batch {i//BATCH_SIZE + 1}: {[c['city'] for c in batch]}")
        frames = _fetch_soil_batch(batch)
        all_frames.extend(frames)
        time.sleep(0.5)    # be polite to the API

    if not all_frames:
        raise RuntimeError("No soil moisture data returned")

    hourly = pd.concat(all_frames, ignore_index=True)

    # Daily mean → monthly mean
    hourly["date"] = hourly["datetime"].dt.normalize()
    daily = (
        hourly.groupby(["city", "country", "lat", "lon", "source", "date"])
        ["soil_moisture_m3m3"].mean()
        .reset_index()
    )
    monthly = (
        daily.groupby(["city", "country", "lat", "lon", "source",
                       pd.Grouper(key="date", freq="MS")])
        ["soil_moisture_m3m3"].mean()
        .reset_index()
    )
    monthly["date"] = monthly["date"].dt.strftime("%Y-%m-%d")
    return monthly


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("EUMETSAT H-SAF soil moisture fetcher (ERA5-Land proxy)")
    print(f"  Period : {HIST_START} → {HIST_END}")
    print(f"  Cities : {len(CITIES)}")
    print()
    print("  NOTE: Full H-SAF products (ASCAT-based SWI) require free")
    print("        registration at https://hsaf.meteoam.it/")
    print("        Products: H10 (surface SWI), H14 (profile SWI), H26 (precip)")
    print()

    df = fetch_soil_moisture()
    df.to_parquet(OUT_PATH, index=False)

    print(f"\nSaved → {OUT_PATH}")
    print(f"  rows    : {len(df):,}")
    print(f"  cities  : {df['city'].nunique()}")
    print(f"  months  : {df['date'].nunique()}")
    print(f"  source  : {df['source'].unique()}")
    print(f"\n  Soil moisture range (m³/m³): {df['soil_moisture_m3m3'].min():.3f} – {df['soil_moisture_m3m3'].max():.3f}")
    print("\nSample (Wrocław):")
    print(df[df["city"] == "Wrocław"].to_string(index=False))


if __name__ == "__main__":
    main()
