"""Ingest MPWiK RPT sensor files → data/processed/mpwik_measurements.parquet.

RPT format (fixed-width, UTF-8 BOM):
  Line 0: header  (TagUID, Timestamp, ValueFloat)
  Line 1: dashes separator
  Lines 2+: data rows with space-padded columns
    - TagUID:     chars  0-35  (UUID, 36 chars)
    - Timestamp:  chars 37-58  (22 chars, may contain interior space)
    - ValueFloat: chars 60+    (European decimal comma)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Iterator

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.config import MPWIK_MEASUREMENTS_PARQUET, MPWIK_PARAMS, MPWIK_RPT_DIR

# Filename stem pattern: QIA201_2024, QIR1001_2025, …
_STEM_RE = re.compile(r"^([A-Z0-9]+)_(\d{4})$", re.IGNORECASE)


def _parse_rpt(path: Path, tag_id: str) -> Iterator[dict]:
    """Yield row dicts from a single RPT file."""
    meta = MPWIK_PARAMS.get(tag_id)
    if meta is None:
        return

    station   = meta["station"]
    parameter = meta["parameter"]
    unit      = meta["unit"]

    with path.open("r", encoding="utf-8-sig") as fh:
        for lineno, raw in enumerate(fh):
            if lineno < 2:          # skip header + dashes
                continue
            line = raw.rstrip("\n")
            if len(line) < 60:
                continue            # skip malformed / empty lines
            try:
                ts_str  = line[37:59].strip()
                val_str = line[60:].strip().replace(",", ".")
                timestamp = pd.Timestamp(ts_str)
                value     = float(val_str)
            except (ValueError, OverflowError):
                continue

            yield {
                "timestamp": timestamp,
                "station":   station,
                "parameter": parameter,
                "value":     value,
                "unit":      unit,
            }


def load(rpt_dir: Path = MPWIK_RPT_DIR) -> pd.DataFrame:
    """Read all RPT files in *rpt_dir* and return a combined DataFrame."""
    rows: list[dict] = []
    for path in sorted(rpt_dir.glob("*.rpt")):
        m = _STEM_RE.match(path.stem)
        if m is None:
            continue
        tag_id = m.group(1).upper()
        rows.extend(_parse_rpt(path, tag_id))

    if not rows:
        raise ValueError(f"No data parsed from {rpt_dir}")

    df = pd.DataFrame(rows)
    df = df.sort_values(["station", "parameter", "timestamp"]).reset_index(drop=True)
    return df


def main() -> None:
    """Load, save as parquet, and print a summary."""
    df = load()
    MPWIK_MEASUREMENTS_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(MPWIK_MEASUREMENTS_PARQUET, index=False)

    print(f"Saved → {MPWIK_MEASUREMENTS_PARQUET}")
    print(f"  rows      : {len(df):,}")
    print(f"  date range: {df['timestamp'].min()}  →  {df['timestamp'].max()}")
    print(f"  stations  : {sorted(df['station'].unique())}")
    print(f"  parameters: {sorted(df['parameter'].unique())}")
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
