"""Pivot MPWiK measurements to wide format and build time-series features.

Resamples each station-parameter series to 30-min intervals (aligning the
10-min toc series), pivots to wide, then applies build_features().
Output: data/processed/mpwik_features.parquet
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.config import DATA_PROCESSED, MPWIK_MEASUREMENTS_PARQUET
from src.features.time_series import build_features


def _safe_col(station: str, param: str) -> str:
    """Create a clean snake_case column name from station + parameter."""
    s = station.lower().replace("-", "_").replace("ą", "a").replace("ś", "s")
    return f"{s}_{param}"


def pivot_measurements(meas: pd.DataFrame) -> pd.DataFrame:
    """Resample each station-parameter to 30 min and pivot to wide format."""
    parts = []
    for (station, param), grp in meas.groupby(["station", "parameter"]):
        col = _safe_col(station, param)
        series = (
            grp.set_index("timestamp")["value"]
            .sort_index()
            .resample("30min")
            .mean()
        )
        series.name = col
        parts.append(series)

    wide = pd.concat(parts, axis=1).reset_index()
    wide = wide.rename(columns={"index": "timestamp"})
    return wide


def main() -> None:
    print("Loading mpwik_measurements.parquet …")
    meas = pd.read_parquet(MPWIK_MEASUREMENTS_PARQUET)
    print(f"  Raw shape: {meas.shape}")

    print("Pivoting to wide format (30-min grid) …")
    wide = pivot_measurements(meas)
    print(f"  Wide shape: {wide.shape}")
    print(f"  Columns: {list(wide.columns)}")

    # Use dissolved oxygen as target if available, else first numeric col
    value_cols = [c for c in wide.columns if c != "timestamp"]
    target_col = next((c for c in value_cols if "dissolved_oxygen" in c), value_cols[0])

    print(f"\nBuilding features (target: '{target_col}') …")
    feat = build_features(wide, target_col=target_col)

    out = DATA_PROCESSED / "mpwik_features.parquet"
    feat.to_parquet(out, index=False)

    new_cols = [c for c in feat.columns if c not in wide.columns]
    print(f"  Input  shape : {wide.shape}")
    print(f"  Output shape : {feat.shape}")
    print(f"  New columns  : {len(new_cols)}")

    null_counts = feat[new_cols].isnull().sum()
    nonzero = null_counts[null_counts > 0]
    if nonzero.empty:
        print("  Nulls in new features: none")
    else:
        print(f"  Nulls in new features: {len(nonzero)} columns have nulls "
              f"(expected at series start/end due to lag windows)")

    print(f"\nSaved → {out}")

    print("\nFirst 5 rows:")
    display_cols = ["timestamp"] + value_cols[:4]
    print(feat[display_cols].head().to_string(index=False))

    print("\nAll columns:")
    print(list(feat.columns))


if __name__ == "__main__":
    main()
