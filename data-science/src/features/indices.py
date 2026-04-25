"""Water-quality index features for WaterShield.

Functions operate on DataFrames that already contain the relevant sensor
columns (typically from waterly.parquet or waterly_features.parquet).
Each function returns a new DataFrame with additional columns appended.

Column presence is checked before computing; functions skip gracefully
when required columns are absent.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


# ── constants ─────────────────────────────────────────────────────────────────

PH_LOW  = 6.5    # below → acidic stress
PH_HIGH = 8.5    # above → alkaline stress
DO_CRITICAL = 5.0  # mg/L — aquatic life stress threshold
DO_SHARP_DROP = 2.0  # mg/L change within the lookback window


# ── index functions ───────────────────────────────────────────────────────────

def oxygen_saturation_anomaly(
    df: pd.DataFrame,
    oxygen_col: str = "oxygen_mg_l",
    time_col: str = "timestamp",
    lookback: str = "1h",
    drop_threshold: float = DO_SHARP_DROP,
) -> pd.DataFrame:
    """Flag rows where dissolved oxygen drops sharply within *lookback*.

    Added columns:
    - ``do_drop_1h``  : O2 change over the lookback window (negative = drop)
    - ``do_anomaly``  : 1 when drop ≥ threshold, else 0
    - ``do_below_critical``: 1 when absolute O2 < DO_CRITICAL (5 mg/L)
    """
    if oxygen_col not in df.columns:
        return df

    df = df.copy().sort_values(time_col).reset_index(drop=True)
    indexed = df.set_index(time_col)[oxygen_col]

    # Minimum O2 in the lookback window ending at each timestamp
    rolling_min = indexed.rolling(lookback, min_periods=1).min()
    # Change = current value − minimum in window  (negative = current < past → rising)
    # We want: how much did O2 fall from max-in-window to current value
    rolling_max = indexed.rolling(lookback, min_periods=1).max()
    drop = indexed - rolling_max           # ≤ 0 when current is below the window peak

    df["do_drop_1h"]        = drop.values
    df["do_anomaly"]        = (drop <= -drop_threshold).astype("int8").values
    df["do_below_critical"] = (indexed < DO_CRITICAL).astype("int8").values

    return df


def ph_stress_indicator(
    df: pd.DataFrame,
    ph_col: str = "ph",
    time_col: str = "timestamp",
) -> pd.DataFrame:
    """Flag pH outside the healthy aquatic range (6.5 – 8.5).

    Added columns:
    - ``ph_stress``    : 1 when pH < 6.5 or pH > 8.5, else 0
    - ``ph_deviation`` : signed distance from the nearest healthy boundary
                         (negative = acidic, positive = alkaline; 0 = healthy)
    - ``ph_severity``  : 0 = healthy, 1 = mild (within 0.5 of boundary), 2 = severe
    """
    if ph_col not in df.columns:
        return df

    df = df.copy()
    ph = df[ph_col]

    low_stress  = ph < PH_LOW
    high_stress = ph > PH_HIGH
    stress      = low_stress | high_stress

    deviation = pd.Series(np.where(
        low_stress,  ph - PH_LOW,
        np.where(high_stress, ph - PH_HIGH, 0.0)
    ), index=df.index)

    severity = pd.Series(0, index=df.index, dtype="int8")
    severity[stress & (deviation.abs() <= 0.5)] = 1
    severity[stress & (deviation.abs() >  0.5)] = 2

    df["ph_stress"]    = stress.astype("int8")
    df["ph_deviation"] = deviation.round(3)
    df["ph_severity"]  = severity

    return df


def temperature_oxygen_correlation(
    df: pd.DataFrame,
    temp_col: str = "water_temp_c",
    oxygen_col: str = "oxygen_mg_l",
    time_col: str = "timestamp",
    window: str = "24h",
) -> pd.DataFrame:
    """Derived features capturing the temperature–oxygen relationship.

    At cold temperatures, water holds more dissolved oxygen (inverse
    relationship). Divergence from the expected inverse trend can signal
    pollution or biological oxygen demand.

    Added columns:
    - ``temp_do_ratio``   : water_temp_c / oxygen_mg_l  (dimensionless)
    - ``temp_do_corr_24h``: rolling 24-h Pearson correlation
    - ``do_temp_anomaly`` : 1 when current DO is > 1.5 σ below the
                            temperature-predicted expectation (simple linear)
    """
    if temp_col not in df.columns or oxygen_col not in df.columns:
        return df

    df = df.copy().sort_values(time_col).reset_index(drop=True)
    indexed = df.set_index(time_col)[[temp_col, oxygen_col]]

    ratio = indexed[temp_col] / indexed[oxygen_col].replace(0, np.nan)
    df["temp_do_ratio"] = ratio.values

    # Rolling correlation
    roll_corr = (
        indexed[temp_col]
        .rolling(window, min_periods=10)
        .corr(indexed[oxygen_col])
    )
    df["temp_do_corr_24h"] = roll_corr.values

    # Simple expected DO from temperature (linear proxy):
    # DO ≈ 14.6 − 0.41 × T  (empirical approximation for freshwater at 1 atm)
    expected_do = 14.6 - 0.41 * df[temp_col]
    residual    = df[oxygen_col] - expected_do
    roll_std    = (
        pd.Series(residual.values, index=df[time_col])
        .rolling(window, min_periods=5)
        .std()
    )
    df["do_temp_anomaly"] = (
        (residual < -1.5 * roll_std.values).astype("int8")
    )

    return df


def pollution_composite_index(
    df: pd.DataFrame,
    wqi_col: str = "wqi",
    turbidity_col: str | None = None,
    oxygen_col: str = "oxygen_mg_l",
    ph_col: str = "ph",
    time_col: str = "timestamp",
) -> pd.DataFrame:
    """Compute a 0–100 composite pollution score (higher = more polluted).

    Components (each normalised to 0–1 before combining):
    - WQI component     (35 %) : low WQI → high risk; inverted & clamped
    - Dissolved oxygen  (30 %) : low DO  → high risk
    - pH stress         (20 %) : deviation from 7.0 midpoint
    - Turbidity         (15 %) : high turbidity → high risk (if column present)
      If turbidity is absent the WQI weight absorbs its 15 %.

    The final score is multiplied by 100 and clipped to [0, 100].
    Result column: ``pollution_index``.
    """
    df = df.copy()
    scores: dict[str, tuple[pd.Series, float]] = {}  # name → (series 0-1, weight)

    # ── WQI component ──────────────────────────────────────────────────────
    if wqi_col in df.columns:
        # Waterly WQI range observed: ~25–300.  Invert: 0 = perfect, 1 = critical
        wqi_norm = 1.0 - (df[wqi_col].clip(lower=0, upper=300) / 300.0)
        scores["wqi"] = (wqi_norm, 0.35)

    # ── Dissolved oxygen component ──────────────────────────────────────────
    if oxygen_col in df.columns:
        # 0 mg/L → fully polluted; 12 mg/L+ → clean
        do_risk = 1.0 - (df[oxygen_col].clip(lower=0, upper=12) / 12.0)
        scores["do"] = (do_risk, 0.30)

    # ── pH component ───────────────────────────────────────────────────────
    if ph_col in df.columns:
        # Distance from neutral 7.0, clamped to [0, 3]
        ph_risk = (df[ph_col] - 7.0).abs().clip(upper=3.0) / 3.0
        scores["ph"] = (ph_risk, 0.20)

    # ── Turbidity component ────────────────────────────────────────────────
    turb_col = turbidity_col or next(
        (c for c in df.columns if "turbid" in c.lower()), None
    )
    if turb_col and turb_col in df.columns:
        # 0 NTU → clean, 300+ NTU → very turbid
        turb_risk = df[turb_col].clip(lower=0, upper=300) / 300.0
        scores["turbidity"] = (turb_risk, 0.15)

    if not scores:
        return df     # no recognised columns; return unchanged

    # Redistribute weights to sum to 1.0 based on available components
    total_weight = sum(w for _, w in scores.values())
    combined = sum(
        series * (weight / total_weight)
        for series, weight in scores.values()
    )
    df["pollution_index"] = (combined * 100).round(1).clip(lower=0, upper=100)

    return df


# ── standalone runner ─────────────────────────────────────────────────────────

def main() -> None:
    """Apply all index functions to waterly_features.parquet (or waterly.parquet)."""
    from src.config import DATA_PROCESSED, WATERLY_PARQUET

    feat_path = DATA_PROCESSED / "waterly_features.parquet"
    src_path  = feat_path if feat_path.exists() else WATERLY_PARQUET

    print(f"Loading {src_path.name} …")
    df = pd.read_parquet(src_path)
    cols_before = set(df.columns)

    df = oxygen_saturation_anomaly(df)
    df = ph_stress_indicator(df)
    df = temperature_oxygen_correlation(df)
    df = pollution_composite_index(df)

    new_cols = [c for c in df.columns if c not in cols_before]
    print(f"  Added {len(new_cols)} index columns: {new_cols}")

    # Overwrite the features parquet with index columns included
    df.to_parquet(feat_path, index=False)
    print(f"Saved → {feat_path}")

    print("\nAnomaly summary (Waterly):")
    if "do_anomaly" in df.columns:
        print(f"  DO anomaly events   : {df['do_anomaly'].sum():,}")
    if "do_below_critical" in df.columns:
        print(f"  DO below 5 mg/L     : {df['do_below_critical'].sum():,}")
    if "ph_stress" in df.columns:
        print(f"  pH stress events    : {df['ph_stress'].sum():,}")
    if "pollution_index" in df.columns:
        print(f"  Pollution index stats:\n{df['pollution_index'].describe().round(2).to_string()}")


if __name__ == "__main__":
    main()
