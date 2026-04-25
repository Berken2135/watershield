"""Generate synthetic monthly WQI history for all 102 cities, Jan 2024 – Apr 2026.

We have real sensor data only for Wrocław (Aug–Oct 2024).  Everything else
is synthetic but designed to look plausible:

  - Each city gets a seeded base WQI reflecting its geography and known
    water quality (Nordic/Swiss/Australian cities are cleanest; heavily
    industrialised / rapidly urbanising cities in South Asia score lower)
  - A sinusoidal seasonal curve: summer slightly worse for temperate cities,
    winter worse for Mediterranean; tropical cities have minimal seasonality
  - A slow random walk that drifts ±30 WQI over the three years
  - Rare pollution spikes (-40 to -60 WQI, 1–2 per city over 28 months)
  - All values clipped to [60, 340] to stay within the Waterly reference range

Output
------
  data/outputs/historical_monthly.parquet
  data/outputs/historical_monthly.json   (same data, for quick inspection)

Schema
------
  city, country, lat, lon, date (YYYY-MM-DD, first of month),
  wqi, risk_level, data_source
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.config import DATA_OUTPUTS
from src.european_data.cities_all import CITIES_ALL

DATA_OUTPUTS.mkdir(parents=True, exist_ok=True)

OUT_PARQUET = DATA_OUTPUTS / "historical_monthly.parquet"
OUT_JSON    = DATA_OUTPUTS / "historical_monthly.json"

MONTHS = pd.date_range("2024-01-01", "2026-04-01", freq="MS")

RISK_THRESHOLDS = [(200, "clean"), (150, "moderate"), (100, "high"), (0, "critical")]

# ── Base WQI per city ─────────────────────────────────────────────────────────
# Higher = better water quality.  Grounded in:
#   - regulatory environment (EU WFD cities score higher)
#   - climate (dry Mediterranean > wet Atlantic for runoff)
#   - urbanisation/industrialisation pressure
#   - known river/harbour quality

BASE_WQI: dict[str, float] = {
    # Poland
    "Wrocław": 182, "Kraków": 188, "Warsaw": 195, "Gdańsk": 200, "Poznań": 193,
    # Germany
    "Berlin": 205, "Hamburg": 210, "Munich": 218, "Cologne": 200,
    # France
    "Paris": 208, "Lyon": 215, "Marseille": 222, "Bordeaux": 218,
    # UK
    "London": 212, "Manchester": 195, "Edinburgh": 225,
    # Benelux
    "Amsterdam": 175, "Rotterdam": 180, "Brussels": 190, "Antwerp": 185, "Luxembourg": 185,
    # Iberia
    "Madrid": 248, "Barcelona": 238, "Seville": 242, "Valencia": 235,
    "Lisbon": 252, "Porto": 248,
    # Italy
    "Rome": 228, "Milan": 210, "Naples": 215, "Venice": 220,
    # Greece / Mediterranean islands
    "Athens": 235, "Thessaloniki": 225, "Valletta": 245, "Nicosia": 250,
    # Nordics
    "Stockholm": 218, "Oslo": 230, "Helsinki": 222, "Copenhagen": 220,
    # Baltics
    "Tallinn": 200, "Riga": 197, "Vilnius": 193,
    # Central Europe
    "Vienna": 212, "Prague": 207, "Budapest": 215, "Bratislava": 210,
    "Ljubljana": 195, "Zagreb": 198,
    # Eastern / South-Eastern Europe
    "Bucharest": 180, "Sofia": 175, "Belgrade": 185, "Sarajevo": 182,
    "Kyiv": 172,
    # Switzerland
    "Zurich": 258, "Geneva": 262,
    # Turkey / Ireland
    "Istanbul": 190, "Dublin": 185,
    # North America
    "New York": 215, "Los Angeles": 205, "Chicago": 218, "Houston": 198,
    "Miami": 210, "Toronto": 230, "Vancouver": 248, "Montreal": 232,
    "Mexico City": 155,
    # Latin America
    "São Paulo": 148, "Rio de Janeiro": 160, "Buenos Aires": 172,
    "Bogotá": 155, "Lima": 145, "Santiago": 175,
    # East Asia
    "Tokyo": 228, "Osaka": 222, "Seoul": 215, "Beijing": 170, "Shanghai": 175,
    # South Asia
    "Mumbai": 148, "Delhi": 118, "Dhaka": 105, "Karachi": 120,
    # SE Asia
    "Bangkok": 155, "Singapore": 258, "Jakarta": 128,
    "Ho Chi Minh": 140, "Kuala Lumpur": 165,
    # Middle East
    "Dubai": 195, "Tehran": 158, "Riyadh": 185, "Beirut": 162,
    # Africa
    "Cairo": 148, "Lagos": 125, "Nairobi": 138, "Kinshasa": 118,
    "Casablanca": 172, "Cape Town": 205, "Johannesburg": 165, "Accra": 142,
    # Oceania
    "Sydney": 242, "Melbourne": 238, "Brisbane": 235,
    "Auckland": 248, "Perth": 245,
}

# ── Seasonal amplitude ────────────────────────────────────────────────────────
# Peak-to-trough WQI swing across the year.
# Tropical cities: low (5-12); Mediterranean: high (25-40); temperate: moderate (15-25)

SEASONAL_AMP: dict[str, float] = {
    # Poland
    "Wrocław": 25, "Kraków": 25, "Warsaw": 28, "Gdańsk": 22, "Poznań": 25,
    # Germany
    "Berlin": 22, "Hamburg": 20, "Munich": 24, "Cologne": 20,
    # France
    "Paris": 20, "Lyon": 22, "Marseille": 30, "Bordeaux": 22,
    # UK
    "London": 18, "Manchester": 16, "Edinburgh": 18,
    # Benelux
    "Amsterdam": 18, "Rotterdam": 16, "Brussels": 18, "Antwerp": 16, "Luxembourg": 20,
    # Iberia
    "Madrid": 35, "Barcelona": 30, "Seville": 38, "Valencia": 32,
    "Lisbon": 32, "Porto": 28,
    # Italy
    "Rome": 30, "Milan": 22, "Naples": 28, "Venice": 25,
    # Greece / Mediterranean
    "Athens": 38, "Thessaloniki": 35, "Valletta": 35, "Nicosia": 40,
    # Nordics
    "Stockholm": 20, "Oslo": 18, "Helsinki": 20, "Copenhagen": 18,
    # Baltics
    "Tallinn": 25, "Riga": 22, "Vilnius": 24,
    # Central Europe
    "Vienna": 22, "Prague": 22, "Budapest": 25, "Bratislava": 22,
    "Ljubljana": 20, "Zagreb": 25,
    # Eastern / SE Europe
    "Bucharest": 28, "Sofia": 28, "Belgrade": 25, "Sarajevo": 22, "Kyiv": 28,
    # Switzerland
    "Zurich": 20, "Geneva": 22,
    # Turkey / Ireland
    "Istanbul": 25, "Dublin": 15,
    # North America
    "New York": 22, "Los Angeles": 18, "Chicago": 25, "Houston": 15,
    "Miami": 10, "Toronto": 25, "Vancouver": 18, "Montreal": 28,
    "Mexico City": 12,
    # Latin America — mostly tropical, low seasonality
    "São Paulo": 12, "Rio de Janeiro": 10, "Buenos Aires": 18,
    "Bogotá": 8, "Lima": 8, "Santiago": 22,
    # East Asia
    "Tokyo": 20, "Osaka": 18, "Seoul": 25, "Beijing": 25, "Shanghai": 20,
    # South Asia — monsoon drives a large seasonal swing
    "Mumbai": 30, "Delhi": 35, "Dhaka": 35, "Karachi": 25,
    # SE Asia — wet/dry season
    "Bangkok": 20, "Singapore": 8, "Jakarta": 22,
    "Ho Chi Minh": 18, "Kuala Lumpur": 10,
    # Middle East — dry year-round, low seasonality
    "Dubai": 8, "Tehran": 20, "Riyadh": 8, "Beirut": 22,
    # Africa
    "Cairo": 12, "Lagos": 18, "Nairobi": 15, "Kinshasa": 15,
    "Casablanca": 22, "Cape Town": 28, "Johannesburg": 18, "Accra": 12,
    # Oceania — Southern Hemisphere: summer = Dec-Feb
    "Sydney": 22, "Melbourne": 25, "Brisbane": 18,
    "Auckland": 20, "Perth": 28,
}

# Cities in Southern Hemisphere: season is flipped (summer in Dec-Feb)
SOUTHERN_HEMISPHERE = {
    "São Paulo", "Rio de Janeiro", "Buenos Aires", "Lima", "Santiago",
    "Sydney", "Melbourne", "Brisbane", "Auckland", "Perth",
    "Cape Town", "Johannesburg",
}


def _risk(wqi: float) -> str:
    for threshold, label in RISK_THRESHOLDS:
        if wqi >= threshold:
            return label
    return "critical"


def _generate_city(city_meta: dict, rng: np.random.Generator) -> list[dict]:
    city    = city_meta["city"]
    base    = BASE_WQI.get(city, 200.0)
    amp     = SEASONAL_AMP.get(city, 20.0)
    n       = len(MONTHS)

    # Slow random walk
    drift = np.cumsum(rng.normal(0, 1.5, n))

    # Seasonal: sin peaks at July (Northern) or January (Southern) → lower WQI
    month_nums = np.array([m.month for m in MONTHS])
    if city in SOUTHERN_HEMISPHERE:
        # Summer = Dec/Jan/Feb → phase offset by 6 months
        seasonal = -amp * np.sin(2 * np.pi * (month_nums - 7) / 12)
    else:
        seasonal = -amp * np.sin(2 * np.pi * (month_nums - 1) / 12)

    # Noise
    noise = rng.normal(0, 8, n)

    wqi_series = base + drift + seasonal + noise

    # 1–2 pollution spikes
    n_events = rng.integers(1, 3)
    for _ in range(n_events):
        idx  = int(rng.integers(2, n - 2))
        drop = rng.uniform(35, 60)
        wqi_series[idx]     -= drop
        wqi_series[idx + 1] -= drop * 0.5

    wqi_series = np.clip(wqi_series, 60, 340)

    rows = []
    for i, month in enumerate(MONTHS):
        wqi = round(float(wqi_series[i]), 1)
        rows.append({
            "city":        city,
            "country":     city_meta["country"],
            "country_code": city_meta["country_code"],
            "lat":         float(city_meta["lat"]),
            "lon":         float(city_meta["lon"]),
            "region":      city_meta.get("region", ""),
            "date":        month.strftime("%Y-%m-%d"),
            "wqi":         wqi,
            "risk_level":  _risk(wqi),
            "data_source": "synthetic_historical",
        })
    return rows


def generate() -> pd.DataFrame:
    all_rows = []
    for city_meta in CITIES_ALL:
        seed = sum(ord(c) for c in city_meta["city"])
        rng  = np.random.default_rng(seed)
        all_rows.extend(_generate_city(city_meta, rng))
    return pd.DataFrame(all_rows)


def main() -> None:
    print(f"Generating monthly WQI history: {MONTHS[0].date()} → {MONTHS[-1].date()}")
    print(f"  Cities : {len(CITIES_ALL)}")
    print(f"  Months : {len(MONTHS)}")
    print(f"  Rows   : {len(CITIES_ALL) * len(MONTHS)}")

    df = generate()

    df.to_parquet(OUT_PARQUET, index=False)
    records = df.to_dict(orient="records")
    with OUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    print(f"\nSaved → {OUT_PARQUET}")
    print(f"Saved → {OUT_JSON}")

    print("\n── Stats ────────────────────────────────────────────────────────────")
    print(f"  WQI range   : {df['wqi'].min():.1f} – {df['wqi'].max():.1f}")
    print(f"  Risk counts : {df['risk_level'].value_counts().to_dict()}")

    print("\n── Cities with critical months ──────────────────────────────────────")
    crit = df[df["risk_level"] == "critical"]["city"].unique()
    print(f"  {list(crit) if len(crit) else 'none'}")

    print("\n── Risk by region ───────────────────────────────────────────────────")
    print(df.groupby(["region","risk_level"]).size().unstack(fill_value=0).to_string())

    print("\n── Sample: Delhi (high-risk city) ───────────────────────────────────")
    print(df[df["city"] == "Delhi"][["date","wqi","risk_level"]].to_string(index=False))


if __name__ == "__main__":
    main()
