"""Fetch ERA5 reanalysis climate data for 30 European cities.

Primary path  : Copernicus Climate Data Store (CDS) API via `cdsapi`.
Fallback path : Open-Meteo archive API (same ERA5 data, no key required).

Output: data/processed/europe/era5_cities.parquet
Schema : city, country, lat, lon, date (YYYY-MM-DD, first of month),
         temperature_c (monthly mean °C), precipitation_mm (monthly sum),
         snow_cover_cm (monthly sum of daily snowfall cm w.e.), source
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

OUT_PATH = DATA_PROCESSED / "europe" / "era5_cities.parquet"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

HIST_START = "2024-01-01"
HIST_END   = "2024-12-31"
BATCH_SIZE = 10          # cities per Open-Meteo request


# ── Open-Meteo fallback ───────────────────────────────────────────────────────

def _fetch_openmeteo_batch(cities_batch: list[dict]) -> list[pd.DataFrame]:
    """Fetch ERA5 daily data for a batch of cities, return list of DataFrames."""
    lats = [c["lat"] for c in cities_batch]
    lons = [c["lon"] for c in cities_batch]

    params = {
        "latitude":       ",".join(map(str, lats)),
        "longitude":      ",".join(map(str, lons)),
        "start_date":     HIST_START,
        "end_date":       HIST_END,
        "daily":          "temperature_2m_mean,precipitation_sum,snowfall_sum",
        "timezone":       "UTC",
    }
    resp = requests.get(
        "https://archive-api.open-meteo.com/v1/archive",
        params=params, timeout=60,
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
            "date":            pd.to_datetime(daily["time"]),
            "temperature_c":   daily.get("temperature_2m_mean"),
            "precipitation_mm": daily.get("precipitation_sum"),
            "snow_cover_cm":   daily.get("snowfall_sum"),
        })
        df["city"]    = city_meta["city"]
        df["country"] = city_meta["country"]
        df["lat"]     = float(city_meta["lat"])
        df["lon"]     = float(city_meta["lon"])
        df["source"]  = "ERA5 (Open-Meteo)"
        frames.append(df)
    return frames


def fetch_openmeteo() -> pd.DataFrame:
    """Fetch ERA5 daily data for all cities, aggregate to monthly."""
    print("  [ERA5] Fetching via Open-Meteo archive (ERA5) …")
    all_frames: list[pd.DataFrame] = []

    for i in range(0, len(CITIES), BATCH_SIZE):
        batch = CITIES[i : i + BATCH_SIZE]
        print(f"    batch {i//BATCH_SIZE + 1}: {[c['city'] for c in batch]}")
        frames = _fetch_openmeteo_batch(batch)
        all_frames.extend(frames)
        if i + BATCH_SIZE < len(CITIES):
            time.sleep(0.3)

    if not all_frames:
        raise RuntimeError("No ERA5 data returned from Open-Meteo")

    daily = pd.concat(all_frames, ignore_index=True)

    # Monthly aggregation
    daily["date"] = pd.to_datetime(daily["date"])
    monthly = (
        daily.groupby(["city", "country", "lat", "lon", "source",
                       pd.Grouper(key="date", freq="MS")])
        .agg(
            temperature_c    = ("temperature_c",    "mean"),
            precipitation_mm = ("precipitation_mm", "sum"),
            snow_cover_cm    = ("snow_cover_cm",    "sum"),
        )
        .reset_index()
    )
    monthly["date"] = monthly["date"].dt.strftime("%Y-%m-%d")
    return monthly


# ── CDS API path ──────────────────────────────────────────────────────────────

def fetch_cds() -> pd.DataFrame | None:
    """Try the CDS API; return None if key is not configured."""
    import os
    cdsrc = Path.home() / ".cdsapirc"
    if not cdsrc.exists():
        return None

    try:
        import cdsapi, tempfile, xarray as xr

        c = cdsapi.Client(quiet=True)
        with tempfile.TemporaryDirectory() as tmp:
            out_nc = Path(tmp) / "era5.nc"
            c.retrieve(
                "reanalysis-era5-single-levels-monthly-means",
                {
                    "product_type": "monthly_averaged_reanalysis",
                    "variable": ["2m_temperature", "total_precipitation", "snowfall"],
                    "year":  [str(y) for y in range(2024, 2025)],
                    "month": [f"{m:02d}" for m in range(1, 13)],
                    "time":  "00:00",
                    "area":  [72, -15, 34, 42],   # Europe [N, W, S, E]
                    "format": "netcdf",
                },
                str(out_nc),
            )

            ds = xr.open_dataset(out_nc)
            rows = []
            for city in CITIES:
                ts = ds.sel(
                    latitude=city["lat"], longitude=city["lon"], method="nearest"
                )
                for t in ts.valid_time.values:
                    date = pd.Timestamp(t)
                    rows.append({
                        "city":             city["city"],
                        "country":          city["country"],
                        "lat":              float(city["lat"]),
                        "lon":              float(city["lon"]),
                        "date":             date.strftime("%Y-%m-%d"),
                        "temperature_c":    float(ts["t2m"].sel(valid_time=t).values) - 273.15,
                        "precipitation_mm": float(ts["tp"].sel(valid_time=t).values) * 1000,
                        "snow_cover_cm":    float(ts.get("sf", ts.get("snow_cover", 0))
                                                  .sel(valid_time=t).values) if "sf" in ts else 0.0,
                        "source":           "ERA5 (CDS)",
                    })
        return pd.DataFrame(rows)

    except Exception as exc:
        print(f"  [ERA5/CDS] Failed ({type(exc).__name__}: {exc}) — falling back to Open-Meteo")
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

def load_or_fetch() -> pd.DataFrame:
    """Return ERA5 monthly data, fetching if parquet is absent."""
    df = fetch_cds()
    if df is None:
        df = fetch_openmeteo()
    return df


def main() -> None:
    print("ERA5 climate data fetcher")
    print(f"  Period : {HIST_START} → {HIST_END}")
    print(f"  Cities : {len(CITIES)}")

    df = load_or_fetch()
    df.to_parquet(OUT_PATH, index=False)

    print(f"\nSaved → {OUT_PATH}")
    print(f"  rows   : {len(df):,}")
    print(f"  cities : {df['city'].nunique()}")
    print(f"  months : {df['date'].nunique()}")
    print(f"  source : {df['source'].unique()}")
    print("\nSample (Wrocław):")
    print(df[df["city"] == "Wrocław"].to_string(index=False))


if __name__ == "__main__":
    main()
