"""Merge all European climate sources into one combined parquet.

Inputs  (all in data/processed/europe/):
  era5_cities.parquet        – monthly ERA5 climate (temp, precip, snow)
  hsaf_soil_moisture.parquet – monthly ERA5-Land soil moisture (H-SAF proxy)
  ecmwf_forecast.parquet     – 7-day ECMWF IFS daily forecast

Output: data/processed/europe/europe_combined.parquet
Schema : city, country, lat, lon, date (YYYY-MM-DD),
         temperature, precipitation, snow_cover, soil_moisture, source
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.config import DATA_PROCESSED

EUROPE_DIR = DATA_PROCESSED / "europe"
OUT_PATH   = EUROPE_DIR / "europe_combined.parquet"


def load_era5() -> pd.DataFrame:
    path = EUROPE_DIR / "era5_cities.parquet"
    if not path.exists():
        raise FileNotFoundError(f"Missing: {path}")
    df = pd.read_parquet(path)
    return df.rename(columns={
        "temperature_c":    "temperature",
        "precipitation_mm": "precipitation",
        "snow_cover_cm":    "snow_cover",
    })[["city", "country", "lat", "lon", "date", "temperature", "precipitation", "snow_cover", "source"]]


def load_soil() -> pd.DataFrame:
    path = EUROPE_DIR / "hsaf_soil_moisture.parquet"
    if not path.exists():
        raise FileNotFoundError(f"Missing: {path}")
    df = pd.read_parquet(path)
    return df.rename(columns={"soil_moisture_m3m3": "soil_moisture"})[
        ["city", "country", "lat", "lon", "date", "soil_moisture", "source"]
    ]


def load_forecast() -> pd.DataFrame:
    path = EUROPE_DIR / "ecmwf_forecast.parquet"
    if not path.exists():
        raise FileNotFoundError(f"Missing: {path}")
    df = pd.read_parquet(path)
    df["temperature"] = (df["temperature_max_c"] + df["temperature_min_c"]) / 2
    return df.rename(columns={"precipitation_mm": "precipitation"})[
        ["city", "country", "lat", "lon", "date", "temperature", "precipitation", "source"]
    ]


def combine() -> pd.DataFrame:
    print("  Loading ERA5 climate …")
    era5 = load_era5()
    print(f"    {len(era5):,} rows from era5_cities.parquet")

    print("  Loading H-SAF soil moisture …")
    soil = load_soil()
    print(f"    {len(soil):,} rows from hsaf_soil_moisture.parquet")

    print("  Loading ECMWF forecast …")
    fcast = load_forecast()
    print(f"    {len(fcast):,} rows from ecmwf_forecast.parquet")

    # ERA5 monthly + soil moisture monthly — merge on city+date
    key = ["city", "country", "lat", "lon", "date"]
    combined = pd.merge(era5, soil[key + ["soil_moisture"]], on=key, how="outer")

    # Append forecast rows (different date range / resolution)
    fcast["snow_cover"]    = None
    fcast["soil_moisture"] = None
    combined = pd.concat([combined, fcast], ignore_index=True)

    # Ensure canonical column order
    for col in ["temperature", "precipitation", "snow_cover", "soil_moisture"]:
        if col not in combined.columns:
            combined[col] = None

    combined = combined[
        ["city", "country", "lat", "lon", "date",
         "temperature", "precipitation", "snow_cover", "soil_moisture", "source"]
    ]
    combined = combined.sort_values(["city", "date"]).reset_index(drop=True)
    return combined


def main() -> None:
    print("European data combiner")
    EUROPE_DIR.mkdir(parents=True, exist_ok=True)

    df = combine()
    df.to_parquet(OUT_PATH, index=False)

    print(f"\nSaved → {OUT_PATH}")
    print(f"  rows    : {len(df):,}")
    print(f"  cities  : {df['city'].nunique()}")
    print(f"  sources : {sorted(df['source'].dropna().unique())}")
    print(f"  date range: {df['date'].min()} → {df['date'].max()}")
    print(f"\nColumn nulls:")
    print(df[["temperature", "precipitation", "snow_cover", "soil_moisture"]].isnull().sum().to_string())
    print("\nSample (Wrocław):")
    print(df[df["city"] == "Wrocław"].to_string(index=False))


if __name__ == "__main__":
    main()
