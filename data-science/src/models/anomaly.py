"""Anomaly detection on Waterly sensor data using IsolationForest.

Fits on the full waterly_features series (no train/test split needed for
unsupervised detection), flags the top contamination fraction as anomalies,
and saves results + a summary report.
"""

from __future__ import annotations

import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.config import DATA_OUTPUTS, DATA_PROCESSED

DATA_OUTPUTS.mkdir(parents=True, exist_ok=True)

# Columns fed to the model — core sensor + key index signals
ANOMALY_FEATURES = [
    "wqi",
    "ph",
    "oxygen_mg_l",
    "water_temp_c",
    "conductivity_us_cm",
    "salinity_ppt",
    "tds_ppm",
    "air_temp_c",
    "air_humidity_pct",
    "air_pressure_hpa",
    # engineered signals (present in waterly_features.parquet)
    "wqi_zscore",
    "oxygen_mg_l_zscore",
    "ph_zscore",
    "do_drop_1h",
    "ph_deviation",
    "pollution_index",
]

CONTAMINATION = 0.05   # expected anomaly fraction (5 %)


def detect(path: Path) -> pd.DataFrame:
    """Fit IsolationForest and return DataFrame with anomaly flags."""
    df = pd.read_parquet(path)

    # Keep only features that actually exist in the file
    feat_cols = [c for c in ANOMALY_FEATURES if c in df.columns]
    print(f"  Using {len(feat_cols)} features: {feat_cols}")

    X_raw = df[feat_cols].copy()

    # Forward-fill then back-fill short NaN gaps; drop rows that remain NaN
    X_raw = X_raw.ffill(limit=5).bfill(limit=5)
    valid_mask = X_raw.notna().all(axis=1)
    X_valid = X_raw[valid_mask]

    # Standardise (IsolationForest is not scale-invariant in practice)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_valid)

    print(f"  Fitting IsolationForest on {len(X_valid):,} rows …")
    iso = IsolationForest(
        n_estimators=200,
        contamination=CONTAMINATION,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    iso.fit(X_scaled)

    predictions  = iso.predict(X_scaled)     # +1 = normal, -1 = anomaly
    scores       = iso.score_samples(X_scaled)  # lower = more anomalous

    out = df.loc[valid_mask, ["timestamp"] + feat_cols].copy()
    out["is_anomaly"]    = (predictions == -1).astype("int8")
    out["anomaly_score"] = scores.round(6)  # lower = more anomalous

    return out, iso, scaler


def main() -> None:
    feat_path = DATA_PROCESSED / "waterly_features.parquet"
    print(f"Loading {feat_path.name} …")

    result, model, scaler = detect(feat_path)

    # Save parquet
    out_path = DATA_OUTPUTS / "anomalies.parquet"
    result.to_parquet(out_path, index=False)
    print(f"Saved → {out_path}")

    # Save model + scaler
    joblib.dump({"model": model, "scaler": scaler},
                DATA_OUTPUTS / "anomaly_model.pkl")

    # ── Summary ────────────────────────────────────────────────────────────────
    total      = len(result)
    n_anomaly  = int(result["is_anomaly"].sum())
    pct        = n_anomaly / total * 100

    print(f"\n── Anomaly Detection Summary ───────────────────────────────────────")
    print(f"  Total data points : {total:,}")
    print(f"  Anomalies flagged : {n_anomaly:,}  ({pct:.1f}%)")
    print(f"  Normal points     : {total - n_anomaly:,}")

    # Top 10 most anomalous rows (lowest score = most anomalous)
    top10 = (
        result[result["is_anomaly"] == 1]
        .nsmallest(10, "anomaly_score")
        [["timestamp", "anomaly_score", "wqi", "ph", "oxygen_mg_l",
          "water_temp_c", "pollution_index"]]
    )
    print(f"\n  Top 10 most anomalous timestamps:")
    print(top10.to_string(index=False))

    # Anomaly rate by month
    result["month"] = result["timestamp"].dt.to_period("M")
    monthly = result.groupby("month")["is_anomaly"].agg(["sum", "count"])
    monthly["pct"] = (monthly["sum"] / monthly["count"] * 100).round(1)
    monthly.columns = ["anomalies", "total", "pct_%"]
    print(f"\n  Anomaly rate by month:")
    print(monthly.to_string())


if __name__ == "__main__":
    main()
