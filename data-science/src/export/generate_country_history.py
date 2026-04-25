"""Aggregate city-level monthly WQI to country level.

Reads historical_monthly.parquet (city level) and averages WQI across all
cities in each country per month.  Poland is the only multi-city country
(Wrocław + Kraków + Warsaw); all others have exactly one city so the
country value equals the city value.

Output
------
  data/outputs/historical_monthly_countries.parquet
  data/outputs/historical_monthly_countries.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.config import DATA_OUTPUTS

COUNTRY_CODES = {
    "Poland": "PL", "Germany": "DE", "France": "FR", "Netherlands": "NL",
    "Belgium": "BE", "Luxembourg": "LU", "Ireland": "IE", "Spain": "ES",
    "Portugal": "PT", "Italy": "IT", "Greece": "GR", "Malta": "MT",
    "Cyprus": "CY", "Austria": "AT", "Czechia": "CZ", "Hungary": "HU",
    "Slovakia": "SK", "Slovenia": "SI", "Croatia": "HR", "Romania": "RO",
    "Bulgaria": "BG", "Estonia": "EE", "Latvia": "LV", "Lithuania": "LT",
    "Sweden": "SE", "Norway": "NO", "Finland": "FI", "Denmark": "DK",
}

RISK_THRESHOLDS = [(200, "clean"), (150, "moderate"), (100, "high"), (0, "critical")]


def _risk(wqi: float) -> str:
    for threshold, label in RISK_THRESHOLDS:
        if wqi >= threshold:
            return label
    return "critical"


def main() -> None:
    city_df = pd.read_parquet(DATA_OUTPUTS / "historical_monthly.parquet")

    country_df = (
        city_df.groupby(["country", "date"])["wqi"]
        .mean()
        .round(1)
        .reset_index()
    )
    country_df["country_code"] = country_df["country"].map(COUNTRY_CODES)
    country_df["risk_level"]   = country_df["wqi"].apply(_risk)
    country_df["data_source"]  = "synthetic_historical"
    country_df["cities_count"] = country_df["country"].map(
        city_df.groupby("country")["city"].nunique()
    )

    country_df = country_df.sort_values(["country", "date"]).reset_index(drop=True)

    out_parquet = DATA_OUTPUTS / "historical_monthly_countries.parquet"
    out_json    = DATA_OUTPUTS / "historical_monthly_countries.json"

    country_df.to_parquet(out_parquet, index=False)
    records = country_df.to_dict(orient="records")
    with out_json.open("w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    print(f"Saved → {out_parquet}")
    print(f"Saved → {out_json}")
    print(f"  Countries : {country_df['country'].nunique()}")
    print(f"  Months    : {country_df['date'].nunique()}")
    print(f"  Rows      : {len(country_df)}")
    print(f"\n  Risk counts: {country_df['risk_level'].value_counts().to_dict()}")
    print(f"\nSample — Poland all months:")
    print(country_df[country_df["country"] == "Poland"][["date","wqi","risk_level"]].to_string(index=False))


if __name__ == "__main__":
    main()
