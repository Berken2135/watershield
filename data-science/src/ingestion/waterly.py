"""Ingest Waterly buoy sensor CSV → data/processed/waterly.parquet."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

# Allow running as `python -m src.ingestion.waterly` from data-science/
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.config import WATERLY_COLUMNS, WATERLY_CSV, WATERLY_PARQUET


def load(path: Path = WATERLY_CSV) -> pd.DataFrame:
    """Read the Waterly buoy CSV and return a cleaned DataFrame."""
    df = pd.read_csv(
        path,
        sep=";",
        decimal=",",
        encoding="utf-8-sig",
        on_bad_lines="skip",
    )

    # Rename Polish → English; drop unknown columns silently
    df = df.rename(columns=WATERLY_COLUMNS)

    # Drop the raw unix column if present (we keep the human-readable timestamp)
    df = df.drop(columns=["unix_ts"], errors="ignore")

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    # Coerce all numeric columns
    numeric_cols = [c for c in df.columns if c != "timestamp"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df


def main() -> None:
    """Load, save as parquet, and print a summary."""
    df = load()
    WATERLY_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(WATERLY_PARQUET, index=False)

    print(f"Saved → {WATERLY_PARQUET}")
    print(f"  rows      : {len(df):,}")
    print(f"  date range: {df['timestamp'].min()}  →  {df['timestamp'].max()}")
    print(f"  columns   : {list(df.columns)}")
    null_counts = df.isnull().sum()
    nonzero = null_counts[null_counts > 0]
    if nonzero.empty:
        print("  nulls     : none")
    else:
        print("  nulls     :")
        for col, n in nonzero.items():
            print(f"    {col}: {n}")


if __name__ == "__main__":
    main()
