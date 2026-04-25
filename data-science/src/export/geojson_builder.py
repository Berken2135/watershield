"""Build GeoJSON FeatureCollection for WaterShield frontend (MapLibre).

Inputs
------
data/processed/waterly.parquet              – real-time Wrocław sensor data
data/outputs/wqi_forecast_30d.json         – 30-day WQI forecast (Prophet/XGBoost)
data/outputs/anomalies.parquet             – IsolationForest anomaly labels
data/processed/europe/europe_combined.parquet – ERA5 + ECMWF European climate
data/processed/mpwik_measurements.parquet  – MPWiK continuous measurements (turbidity)
src/european_data/cities.py               – city metadata (lat, lon, water body)

Outputs
-------
data/outputs/watershield_europe.geojson    – full FeatureCollection (30 cities + Wrocław)
data/outputs/watershield_wroclaw.geojson  – Wrocław-only (single feature)
data/outputs/watershield_summary.json      – quick stats

WQI thresholds (tuned to actual Waterly WQI range: 25–358)
-----------------------------------------------------------
  clean    : WQI >= 200
  moderate : 150 <= WQI < 200
  high     : 100 <= WQI < 150
  critical : WQI < 100

The existing config.py thresholds (80/60/40) were designed for a
normalised 0-100 scale and are not used here.

Synthetic WQI formula (European cities, ERA5 monthly data)
-----------------------------------------------------------
European cities lack real sensor data; WQI is derived from three
climate proxies that are physically linked to river water quality:

  1. Temperature score  (-10 to +50 pts)
     Optimal river-health temperature: ~12 °C.
     Penalty increases linearly away from optimum (3 pts/°C), capped at 60 pts.
     Very cold or very warm water reduces oxygen solubility and stresses biota.

  2. Precipitation score  (-50 to +30 pts)
     Low monthly rain (< 10 mm) → +30 (minimal runoff, low pollutant load).
     Each additional mm above 10 mm subtracts 0.6 pts (heavy rain → more runoff).
     Capped at -50 to avoid extreme outliers in Atlantic cities.

  3. Soil moisture score  (-50 to +20 pts)
     Dry soils (< 0.1 m³/m³) → +20 (low saturation → less runoff).
     Each 0.1 m³/m³ above 0.1 subtracts 18 pts (saturated soils flush pollutants).
     Capped at -50.

  synthetic_wqi = 200 + temp_score + precip_score + soil_score
  Clipped to [50, 350] to remain within the Waterly reference range.

The formula is intentionally simple (three additive components, no
interaction terms) and transparently documented so that frontend
consumers know these are synthetic estimates, not measured values.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.config import DATA_OUTPUTS, DATA_PROCESSED
from src.european_data.cities import CITIES

# ── Paths ─────────────────────────────────────────────────────────────────────

EUROPE_DIR   = DATA_PROCESSED / "europe"
OUT_EUROPE   = DATA_OUTPUTS / "watershield_europe.geojson"
OUT_WROCLAW  = DATA_OUTPUTS / "watershield_wroclaw.geojson"
OUT_SUMMARY  = DATA_OUTPUTS / "watershield_summary.json"

DATA_OUTPUTS.mkdir(parents=True, exist_ok=True)

# ── Constants ─────────────────────────────────────────────────────────────────

RISK_THRESHOLDS = [
    (200.0, "clean",    "#10B981"),
    (150.0, "moderate", "#F59E0B"),
    (100.0, "high",     "#EF4444"),
    (0.0,   "critical", "#7C2D12"),
]

COUNTRY_CODES: dict[str, str] = {
    "Poland":      "PL", "Germany":     "DE", "France":       "FR",
    "Netherlands": "NL", "Belgium":     "BE", "Luxembourg":   "LU",
    "Ireland":     "IE", "Spain":       "ES", "Portugal":     "PT",
    "Italy":       "IT", "Greece":      "GR", "Malta":        "MT",
    "Cyprus":      "CY", "Austria":     "AT", "Czechia":      "CZ",
    "Hungary":     "HU", "Slovakia":    "SK", "Slovenia":     "SI",
    "Croatia":     "HR", "Romania":     "RO", "Bulgaria":     "BG",
    "Estonia":     "EE", "Latvia":      "LV", "Lithuania":    "LT",
    "Sweden":      "SE", "Norway":      "NO", "Finland":      "FI",
    "Denmark":     "DK",
}

TREND_THRESHOLD_PCT = 5.0   # ±5% → stable


# ── Risk helpers ──────────────────────────────────────────────────────────────

def _risk_label(wqi: float) -> str:
    for threshold, label, _ in RISK_THRESHOLDS:
        if wqi >= threshold:
            return label
    return "critical"


def _risk_color(wqi: float) -> str:
    for threshold, _, color in RISK_THRESHOLDS:
        if wqi >= threshold:
            return color
    return "#7C2D12"


def _trend(current: float, predicted_30d: float) -> tuple[str, float]:
    if current == 0:
        return "stable", 0.0
    pct = (predicted_30d - current) / current * 100
    if pct > TREND_THRESHOLD_PCT:
        trend = "improving"
    elif pct < -TREND_THRESHOLD_PCT:
        trend = "worsening"
    else:
        trend = "stable"
    return trend, round(pct, 1)


# ── Wrocław feature (real data) ───────────────────────────────────────────────

def _load_wroclaw(now_iso: str) -> dict:
    print("  Loading Wrocław real data …")

    # Latest sensor snapshot
    waterly = pd.read_parquet(DATA_PROCESSED / "waterly.parquet")
    last_row = waterly.iloc[-1]
    wqi_current = round(float(last_row["wqi"]), 1)

    # Forecast JSON
    with open(DATA_OUTPUTS / "wqi_forecast_30d.json") as f:
        forecast = json.load(f)
    wqi_7d  = round(float(forecast[6]["wqi_predicted"]), 1)   # day 7
    wqi_30d = round(float(forecast[-1]["wqi_predicted"]), 1)  # day 30
    wqi_lower_30d = round(float(forecast[-1]["wqi_lower"]), 1)
    wqi_upper_30d = round(float(forecast[-1]["wqi_upper"]), 1)

    # Anomaly count — last 30 days of sensor data
    anomalies = pd.read_parquet(DATA_OUTPUTS / "anomalies.parquet")
    last_ts  = anomalies["timestamp"].max()
    cutoff   = last_ts - pd.Timedelta(days=30)
    anomaly_count = int((anomalies[anomalies["timestamp"] >= cutoff]["is_anomaly"] == 1).sum())

    # Turbidity from MPWiK — value closest to Waterly end date
    mpwik = pd.read_parquet(DATA_PROCESSED / "mpwik_measurements.parquet")
    turb_df  = mpwik[mpwik["parameter"] == "turbidity"].copy()
    waterly_end = waterly["timestamp"].max()
    turb_df  = turb_df[turb_df["timestamp"] <= waterly_end].sort_values("timestamp")
    turbidity = round(float(turb_df["value"].iloc[-1]), 2) if len(turb_df) else None

    trend, trend_pct = _trend(wqi_current, wqi_30d)

    city_meta = next(c for c in CITIES if c["city"] == "Wrocław")

    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [city_meta["lon"], city_meta["lat"]],
        },
        "properties": {
            "water_body_id":      _water_body_id("wroclaw", city_meta["water_body"]),
            "name":               f"{city_meta['water_body']} River - Wrocław",
            "country":            city_meta["country"],
            "country_code":       COUNTRY_CODES[city_meta["country"]],
            "water_body_type":    city_meta["water_body_type"],
            "wqi_current":        wqi_current,
            "wqi_predicted_7d":   wqi_7d,
            "wqi_predicted_30d":  wqi_30d,
            "wqi_lower_30d":      wqi_lower_30d,
            "wqi_upper_30d":      wqi_upper_30d,
            "risk_level":         _risk_label(wqi_current),
            "risk_color":         _risk_color(wqi_current),
            "trend":              trend,
            "trend_pct_change":   trend_pct,
            "anomaly_count_30d":  anomaly_count,
            "data_source":        "real",
            "last_updated":       now_iso,
            "metrics": {
                "temperature_c": round(float(last_row["water_temp_c"]), 1),
                "ph":            round(float(last_row["ph"]), 2),
                "oxygen_mg_l":   round(float(last_row["oxygen_mg_l"]), 2),
                "turbidity_ntu": turbidity,
            },
        },
    }


# ── Synthetic WQI for European cities ─────────────────────────────────────────

def _synthetic_wqi(temperature: float, precipitation: float, soil_moisture: float) -> float:
    """Derive a synthetic WQI from ERA5 climate variables.

    See module docstring for full formula documentation.
    """
    # Temperature component
    temp_penalty = min(60.0, abs(temperature - 12.0) * 3.0)
    temp_score   = 50.0 - temp_penalty                         # -10 to +50

    # Precipitation component
    excess_precip  = max(0.0, precipitation - 10.0)
    precip_score   = 30.0 - min(80.0, excess_precip * 0.6)    # -50 to +30

    # Soil moisture component
    excess_soil    = max(0.0, soil_moisture - 0.1)
    soil_score     = 20.0 - min(70.0, excess_soil * 180.0)    # -50 to +20

    wqi = 200.0 + temp_score + precip_score + soil_score
    return round(max(50.0, min(350.0, wqi)), 1)


def _load_european_features(now_iso: str) -> list[dict]:
    print("  Loading European ERA5 data …")
    europe = pd.read_parquet(EUROPE_DIR / "europe_combined.parquet")

    # Use ERA5 monthly rows only (have soil_moisture; forecast rows are null)
    era5 = europe[europe["soil_moisture"].notna()].copy()

    # Latest available month per city
    era5 = era5.sort_values("date")
    latest = era5.groupby("city").last().reset_index()

    # City metadata as dict keyed by city name
    city_meta = {c["city"]: c for c in CITIES}

    features = []
    for _, row in latest.iterrows():
        city = row["city"]
        if city == "Wrocław":
            continue   # Wrocław uses real data

        meta = city_meta.get(city)
        if meta is None:
            continue

        temp   = float(row["temperature"])
        precip = float(row["precipitation"])
        soil   = float(row["soil_moisture"])
        wqi    = _synthetic_wqi(temp, precip, soil)

        # Synthetic forecast: assume modest 5% mean reversion toward 200 over 30d
        wqi_30d  = round(wqi + (200.0 - wqi) * 0.05, 1)
        wqi_7d   = round(wqi + (200.0 - wqi) * 0.01, 1)
        # Uncertainty: ±20% of value (crude estimate for synthetic data)
        margin   = round(wqi * 0.20, 1)

        trend, trend_pct = _trend(wqi, wqi_30d)

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [meta["lon"], meta["lat"]],
            },
            "properties": {
                "water_body_id":     _water_body_id(city, meta["water_body"]),
                "name":              f"{meta['water_body']} - {city}",
                "country":           meta["country"],
                "country_code":      COUNTRY_CODES.get(meta["country"], "??"),
                "water_body_type":   meta["water_body_type"],
                "wqi_current":       wqi,
                "wqi_predicted_7d":  wqi_7d,
                "wqi_predicted_30d": wqi_30d,
                "wqi_lower_30d":     round(max(50.0, wqi_30d - margin), 1),
                "wqi_upper_30d":     round(min(350.0, wqi_30d + margin), 1),
                "risk_level":        _risk_label(wqi),
                "risk_color":        _risk_color(wqi),
                "trend":             trend,
                "trend_pct_change":  trend_pct,
                "anomaly_count_30d": None,
                "data_source":       "synthetic",
                "last_updated":      now_iso,
                "metrics": {
                    "temperature_c": round(temp, 1),
                    "ph":            None,
                    "oxygen_mg_l":   None,
                    "turbidity_ntu": None,
                },
            },
        })

    return features


# ── GeoJSON validation ────────────────────────────────────────────────────────

def _validate(fc: dict) -> None:
    assert fc.get("type") == "FeatureCollection", "type must be FeatureCollection"
    assert isinstance(fc.get("features"), list), "features must be a list"
    for i, feat in enumerate(fc["features"]):
        assert feat.get("type") == "Feature", f"feature {i}: type must be Feature"
        geom = feat.get("geometry", {})
        assert geom.get("type") == "Point", f"feature {i}: geometry type must be Point"
        coords = geom.get("coordinates", [])
        assert len(coords) == 2, f"feature {i}: coordinates must have 2 elements"
        lon, lat = coords
        assert -180 <= lon <= 180, f"feature {i}: lon {lon} out of range"
        assert -90  <= lat <= 90,  f"feature {i}: lat {lat} out of range"
    print(f"  Validation passed ({len(fc['features'])} features)")


# ── Summary JSON ──────────────────────────────────────────────────────────────

def _build_summary(features: list[dict]) -> dict:
    risk_counts: dict[str, int] = {"clean": 0, "moderate": 0, "high": 0, "critical": 0}
    wqi_by_country: dict[str, list[float]] = {}

    for feat in features:
        props = feat["properties"]
        risk  = props["risk_level"]
        risk_counts[risk] = risk_counts.get(risk, 0) + 1
        country = props["country"]
        wqi_by_country.setdefault(country, []).append(props["wqi_current"])

    avg_wqi_by_country = {
        country: round(sum(vals) / len(vals), 1)
        for country, vals in sorted(wqi_by_country.items())
    }

    return {
        "total_cities":       len(features),
        "risk_counts":        risk_counts,
        "avg_wqi_by_country": avg_wqi_by_country,
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def _slug(s: str) -> str:
    """Slugify for water_body_id (handles ASCII-range Polish chars)."""
    replacements = {
        "ą": "a", "ę": "e", "ó": "o", "ś": "s", "ł": "l",
        "ż": "z", "ź": "z", "ć": "c", "ń": "n",
    }
    s = s.lower().replace(" ", "_")
    for src, dst in replacements.items():
        s = s.replace(src, dst)
    return s


# Patch the module-level _water_body_id to use the correct slug function
def _water_body_id(city: str, water_body: str) -> str:
    return f"{_slug(city)}_{_slug(water_body)}_001"


def main() -> None:
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"WaterShield GeoJSON builder  [{now_iso}]")

    wroclaw_feature  = _load_wroclaw(now_iso)
    european_features = _load_european_features(now_iso)

    all_features = [wroclaw_feature] + european_features

    metadata = {
        "generated_at": now_iso,
        "source":       "WaterShield data-science pipeline",
        "version":      "1.0",
    }
    feature_collection = {
        "type":     "FeatureCollection",
        "metadata": metadata,
        "features": all_features,
    }

    print("\n  Validating GeoJSON …")
    _validate(feature_collection)

    # Save full FeatureCollection
    with OUT_EUROPE.open("w", encoding="utf-8") as f:
        json.dump(feature_collection, f, indent=2, ensure_ascii=False)
    print(f"\n  Saved → {OUT_EUROPE}")

    # Save Wrocław-only
    wroclaw_fc = {
        "type": "FeatureCollection",
        "metadata": metadata,
        "features": [wroclaw_feature],
    }
    with OUT_WROCLAW.open("w", encoding="utf-8") as f:
        json.dump(wroclaw_fc, f, indent=2, ensure_ascii=False)
    print(f"  Saved → {OUT_WROCLAW}")

    # Save summary
    summary = _build_summary(all_features)
    with OUT_SUMMARY.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"  Saved → {OUT_SUMMARY}")

    # ── Print summary ─────────────────────────────────────────────────────────
    print(f"\n── Summary ──────────────────────────────────────────────────────────")
    print(f"  Total features : {len(all_features)}")
    print(f"  Risk counts    : {summary['risk_counts']}")

    high_risk = [
        f['properties']['name']
        for f in all_features
        if f['properties']['risk_level'] in ('critical', 'high')
    ]
    if high_risk:
        print(f"  High/Critical  : {high_risk}")
    else:
        print("  No high/critical cities")

    # Pretty-print first feature as example
    print("\n── First feature (Wrocław) ──────────────────────────────────────────")
    print(json.dumps(wroclaw_feature, indent=2, ensure_ascii=False))

    # ── Frontend team note ────────────────────────────────────────────────────
    print("\n── Frontend integration note ────────────────────────────────────────")
    print(f"  File    : data/outputs/watershield_europe.geojson")
    print(f"  Usage   : Drop directly into MapLibre as a GeoJSON source")
    print(f"  Colors  : Use risk_color for circle-color paint property")
    print(f"  Note    : All properties are pre-computed; no client-side math needed")
    print(f"  Sources : data_source='real' (Wrocław) | data_source='synthetic' (EU)")


if __name__ == "__main__":
    main()
