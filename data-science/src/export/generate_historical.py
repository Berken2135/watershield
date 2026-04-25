"""Generate synthetic monthly WQI history for all 30 cities, Jan 2024 – Apr 2026.

We have real sensor data only for Wrocław (Aug–Oct 2024).  Everything else
is synthetic but designed to look plausible:

  - Each city gets a seeded base WQI reflecting its geography
    (Mediterranean cities are drier/cleaner; Atlantic cities are wetter;
     industrial Central-European cities sit in the middle)
  - A sinusoidal seasonal curve: summer slightly worse (heat, algae, low flow),
    winter slightly better (cold water holds more oxygen)
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
from src.european_data.cities import CITIES

DATA_OUTPUTS.mkdir(parents=True, exist_ok=True)

OUT_PARQUET = DATA_OUTPUTS / "historical_monthly.parquet"
OUT_JSON    = DATA_OUTPUTS / "historical_monthly.json"

# Jan 2024 → Apr 2026 inclusive
MONTHS = pd.date_range("2024-01-01", "2026-04-01", freq="MS")

RISK_THRESHOLDS = [(200, "clean"), (150, "moderate"), (100, "high"), (0, "critical")]

# Base WQI per city — higher = cleaner.
# Informed by geography: Mediterranean dry & clean, Atlantic wet, industrial Central lower.
BASE_WQI: dict[str, float] = {
    "Wrocław":    182, "Kraków":     188, "Warsaw":     195,
    "Berlin":     205, "Paris":      208, "Amsterdam":  175,
    "Brussels":   190, "Luxembourg": 185, "Dublin":     178,
    "Madrid":     248, "Lisbon":     252, "Rome":       228,
    "Athens":     235, "Valletta":   245, "Nicosia":    250,
    "Vienna":     212, "Prague":     207, "Budapest":   215,
    "Bratislava": 210, "Ljubljana":  195, "Zagreb":     198,
    "Bucharest":  180, "Sofia":      175, "Tallinn":    200,
    "Riga":       197, "Vilnius":    193, "Stockholm":  218,
    "Oslo":       220, "Helsinki":   210, "Copenhagen": 215,
}

# Seasonal amplitude (peak-to-trough, WQI points). Summer = lower WQI.
SEASONAL_AMP: dict[str, float] = {
    "Wrocław":    25, "Kraków":     25, "Warsaw":     28,
    "Berlin":     22, "Paris":      20, "Amsterdam":  18,
    "Brussels":   18, "Luxembourg": 20, "Dublin":     15,
    "Madrid":     35, "Lisbon":     32, "Rome":       30,
    "Athens":     38, "Valletta":   35, "Nicosia":    40,
    "Vienna":     22, "Prague":     22, "Budapest":   25,
    "Bratislava": 22, "Ljubljana":  20, "Zagreb":     25,
    "Bucharest":  28, "Sofia":      28, "Tallinn":    25,
    "Riga":       22, "Vilnius":    24, "Stockholm":  20,
    "Oslo":       18, "Helsinki":   20, "Copenhagen": 18,
}


def _risk(wqi: float) -> str:
    for threshold, label in RISK_THRESHOLDS:
        if wqi >= threshold:
            return label
    return "critical"


def _generate_city(city_meta: dict, rng: np.random.Generator) -> list[dict]:
    city    = city_meta["city"]
    base    = BASE_WQI.get(city, 200.0)
    amp     = SEASONAL_AMP.get(city, 22.0)
    n       = len(MONTHS)

    # Slow random walk (drift)
    drift = np.cumsum(rng.normal(0, 1.5, n))

    # Seasonal: sin peaks at month 7 (July) → summer is lower WQI
    month_nums = np.array([m.month for m in MONTHS])
    seasonal   = -amp * np.sin(2 * np.pi * (month_nums - 1) / 12)

    # Gaussian noise
    noise = rng.normal(0, 8, n)

    wqi_series = base + drift + seasonal + noise

    # Inject 1–2 pollution events (sudden drop, then recovery)
    n_events = rng.integers(1, 3)
    for _ in range(n_events):
        idx   = int(rng.integers(2, n - 2))
        drop  = rng.uniform(40, 65)
        wqi_series[idx]     -= drop
        wqi_series[idx + 1] -= drop * 0.5   # partial recovery next month

    wqi_series = np.clip(wqi_series, 60, 340)

    rows = []
    for i, month in enumerate(MONTHS):
        wqi = round(float(wqi_series[i]), 1)
        rows.append({
            "city":        city,
            "country":     city_meta["country"],
            "lat":         float(city_meta["lat"]),
            "lon":         float(city_meta["lon"]),
            "date":        month.strftime("%Y-%m-%d"),
            "wqi":         wqi,
            "risk_level":  _risk(wqi),
            "data_source": "synthetic_historical",
        })
    return rows


def generate() -> pd.DataFrame:
    all_rows = []
    for city_meta in CITIES:
        # Seed from city name so results are reproducible
        seed = sum(ord(c) for c in city_meta["city"])
        rng  = np.random.default_rng(seed)
        all_rows.extend(_generate_city(city_meta, rng))
    return pd.DataFrame(all_rows)


def main() -> None:
    print(f"Generating monthly WQI history: {MONTHS[0].date()} → {MONTHS[-1].date()}")
    print(f"  Cities : {len(CITIES)}")
    print(f"  Months : {len(MONTHS)}")
    print(f"  Rows   : {len(CITIES) * len(MONTHS)}")

    df = generate()

    df.to_parquet(OUT_PARQUET, index=False)
    records = df.to_dict(orient="records")
    with OUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    print(f"\nSaved → {OUT_PARQUET}")
    print(f"Saved → {OUT_JSON}")

    print("\n── Stats ────────────────────────────────────────────────────────────")
    print(f"  WQI range     : {df['wqi'].min():.1f} – {df['wqi'].max():.1f}")
    print(f"  Risk counts   : {df['risk_level'].value_counts().to_dict()}")

    print("\n── Sample: Wrocław 2024–2026 ────────────────────────────────────────")
    print(df[df["city"] == "Wrocław"][["date", "wqi", "risk_level"]].to_string(index=False))

    print("\n── Cities with at least one critical month ───────────────────────────")
    crit = df[df["risk_level"] == "critical"]["city"].unique()
    print(f"  {list(crit)}")


if __name__ == "__main__":
    main()
