"""Time-series feature engineering for WaterShield sensor data.

All functions accept a DataFrame and return a new DataFrame with additional
columns appended. The original DataFrame is never mutated.

Rolling operations use a DatetimeIndex (required by pandas time-based
rolling), so `time_col` must contain timezone-naive pandas Timestamps.
Lag features use merge_asof so they are robust to irregular sampling.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


# ── helpers ───────────────────────────────────────────────────────────────────

def _numeric_cols(df: pd.DataFrame, exclude: list[str]) -> list[str]:
    """Return numeric column names, excluding the given list."""
    return [
        c for c in df.select_dtypes(include=[np.number]).columns
        if c not in exclude
    ]


# ── public API ────────────────────────────────────────────────────────────────

def add_rolling_means(
    df: pd.DataFrame,
    time_col: str = "timestamp",
    value_cols: list[str] | None = None,
    windows: list[str] = ["1h", "6h", "24h", "7D"],
) -> pd.DataFrame:
    """Add rolling-mean columns for each window in *windows*.

    New column names follow the pattern: ``{col}_mean_{window}``.
    min_periods=1 so partial windows at the series start still produce values.
    """
    df = df.copy()
    cols = value_cols if value_cols is not None else _numeric_cols(df, [time_col])
    indexed = df.set_index(time_col).sort_index()

    for window in windows:
        rolled = indexed[cols].rolling(window, min_periods=1).mean()
        rolled.columns = [f"{c}_mean_{window}" for c in cols]
        for col in rolled.columns:
            df[col] = rolled[col].values

    return df


def add_zscores(
    df: pd.DataFrame,
    value_cols: list[str] | None = None,
    time_col: str = "timestamp",
    window: str = "24h",
) -> pd.DataFrame:
    """Add rolling z-score columns: ``{col}_zscore``.

    Z-score = (x − rolling_mean) / rolling_std over *window*.
    When rolling std is zero or undefined the z-score is set to 0.
    """
    df = df.copy()
    cols = value_cols if value_cols is not None else _numeric_cols(df, [time_col])
    indexed = df.set_index(time_col).sort_index()

    roll_mean = indexed[cols].rolling(window, min_periods=2).mean()
    roll_std  = indexed[cols].rolling(window, min_periods=2).std()

    for col in cols:
        zscore = (indexed[col] - roll_mean[col]) / roll_std[col].replace(0, np.nan)
        df[f"{col}_zscore"] = zscore.fillna(0).values

    return df


def add_time_features(
    df: pd.DataFrame,
    time_col: str = "timestamp",
) -> pd.DataFrame:
    """Add calendar / cyclical features derived from the timestamp column.

    Added columns: hour, day_of_week, month, is_weekend, is_night.
    """
    df = df.copy()
    ts = df[time_col]
    df["hour"]        = ts.dt.hour.astype("int8")
    df["day_of_week"] = ts.dt.dayofweek.astype("int8")    # 0=Mon … 6=Sun
    df["month"]       = ts.dt.month.astype("int8")
    df["is_weekend"]  = (df["day_of_week"] >= 5).astype("int8")
    df["is_night"]    = ((df["hour"] < 6) | (df["hour"] >= 22)).astype("int8")
    return df


def add_lag_features(
    df: pd.DataFrame,
    value_cols: list[str] | None = None,
    time_col: str = "timestamp",
    lags: list[str] = ["1h", "24h", "7D"],
) -> pd.DataFrame:
    """Add lagged-value columns using merge_asof (robust to irregular sampling).

    For a lag of ``L``, at row with time T we look up the value recorded
    at T − L, accepting the nearest observation within ±10 % of L.

    New column names: ``{col}_lag_{lag}`` (e.g. ``oxygen_mg_l_lag_24h``).
    """
    df = df.copy().sort_values(time_col).reset_index(drop=True)
    cols = value_cols if value_cols is not None else _numeric_cols(df, [time_col])

    for lag in lags:
        lag_td    = pd.Timedelta(lag)
        tolerance = lag_td * 0.25          # allow ±25 % of lag duration
        lag_tag   = lag.replace(" ", "")

        past = df[[time_col] + cols].copy()
        past[time_col] = past[time_col] + lag_td   # shift timestamps forward
        past = past.rename(columns={c: f"{c}_lag_{lag_tag}" for c in cols})

        df = pd.merge_asof(
            df,
            past.sort_values(time_col),
            on=time_col,
            tolerance=tolerance,
            direction="nearest",
        )

    return df


def build_features(
    df: pd.DataFrame,
    target_col: str,
    time_col: str = "timestamp",
    value_cols: list[str] | None = None,
    rolling_windows: list[str] = ["1h", "6h", "24h", "7D"],
    lag_windows: list[str] = ["1h", "24h", "7D"],
    zscore_window: str = "24h",
) -> pd.DataFrame:
    """Apply all time-series feature transforms in sequence.

    Order: sort → time features → rolling means → z-scores → lags.
    The target column is excluded from rolling / lag operations so it
    is never used to predict itself.
    """
    df = df.sort_values(time_col).reset_index(drop=True)

    if value_cols is None:
        value_cols = _numeric_cols(df, exclude=[time_col, target_col])

    df = add_time_features(df, time_col)
    df = add_rolling_means(df, time_col, value_cols, windows=rolling_windows)
    df = add_zscores(df, value_cols, time_col, window=zscore_window)
    df = add_lag_features(df, value_cols, time_col, lags=lag_windows)

    return df


# ── standalone runner ─────────────────────────────────────────────────────────

def main() -> None:
    """Apply build_features to waterly.parquet → waterly_features.parquet."""
    from src.config import WATERLY_PARQUET, DATA_PROCESSED

    print("Loading waterly.parquet …")
    df = pd.read_parquet(WATERLY_PARQUET)
    print(f"  Input  shape: {df.shape}")

    feat = build_features(df, target_col="wqi")

    out = DATA_PROCESSED / "waterly_features.parquet"
    feat.to_parquet(out, index=False)

    new_cols = [c for c in feat.columns if c not in df.columns]
    print(f"  Output shape: {feat.shape}")
    print(f"  New columns : {len(new_cols)}")

    null_new = feat[new_cols].isnull().sum()
    nonzero  = null_new[null_new > 0]
    if nonzero.empty:
        print("  Nulls in new features: none")
    else:
        print("  Nulls in new features:")
        for col, n in nonzero.items():
            print(f"    {col}: {n}")

    print(f"\nSaved → {out}")
    print("\nFirst 5 rows (selected columns):")
    sample_cols = ["timestamp", "wqi", "wqi_zscore",
                   "water_temp_c_mean_24h", "oxygen_mg_l_lag_1h",
                   "hour", "is_night", "is_weekend"]
    print(feat[[c for c in sample_cols if c in feat.columns]].head().to_string(index=False))
    print("\nAll columns:")
    print(list(feat.columns))


if __name__ == "__main__":
    main()
