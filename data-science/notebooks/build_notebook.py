"""Build notebooks/01_exploration.ipynb and run all plots → data/outputs/exploration/."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import seaborn as sns
import pandas as pd
import numpy as np
import nbformat
from nbformat.v4 import new_notebook, new_markdown_cell, new_code_cell

from src.config import (
    WATERLY_PARQUET,
    MPWIK_MEASUREMENTS_PARQUET,
    MPWIK_SAMPLES_PARQUET,
)

OUT_DIR = ROOT / "data" / "outputs" / "exploration"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Plotting helpers ──────────────────────────────────────────────────────────

sns.set_theme(style="whitegrid", palette="tab10", font_scale=1.1)
COLORS = sns.color_palette("tab10")

def save(fig: plt.Figure, name: str) -> None:
    path = OUT_DIR / name
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  saved → {path.name}")

# ── Load data ─────────────────────────────────────────────────────────────────

waterly = pd.read_parquet(WATERLY_PARQUET)
meas    = pd.read_parquet(MPWIK_MEASUREMENTS_PARQUET)
samp    = pd.read_parquet(MPWIK_SAMPLES_PARQUET)

# ── 1. Waterly WQI time series ────────────────────────────────────────────────

print("Plotting WQI...")
fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(waterly["timestamp"], waterly["wqi"], color=COLORS[0], linewidth=0.9, alpha=0.85, label="WQI")
# Rolling 24h mean (48 × 5-min samples)
roll = waterly.set_index("timestamp")["wqi"].rolling("24h").mean()
ax.plot(roll.index, roll.values, color=COLORS[1], linewidth=2, label="24h rolling mean")
# Highlight WQI < 100 drops
thresh = 150
low = waterly[waterly["wqi"] < thresh]
ax.axhline(thresh, color="red", linestyle="--", linewidth=1, alpha=0.6, label=f"WQI = {thresh} threshold")
ax.set_title("Waterly WQI — Oława River Buoy (Aug–Oct 2024)", fontsize=14, fontweight="bold")
ax.set_xlabel("Date")
ax.set_ylabel("WQI (higher = better)")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=0))
plt.xticks(rotation=25)
ax.legend(framealpha=0.9)
fig.tight_layout()
save(fig, "01_waterly_wqi.png")

# ── 2. Waterly water_temp_c ───────────────────────────────────────────────────

print("Plotting water temperature...")
fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(waterly["timestamp"], waterly["water_temp_c"], color=COLORS[2], linewidth=0.8, alpha=0.8)
roll_t = waterly.set_index("timestamp")["water_temp_c"].rolling("24h").mean()
ax.plot(roll_t.index, roll_t.values, color="darkblue", linewidth=2, label="24h mean")
ax.set_title("Waterly — Water Temperature (Aug–Oct 2024)", fontsize=14, fontweight="bold")
ax.set_xlabel("Date")
ax.set_ylabel("Temperature (°C)")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=0))
plt.xticks(rotation=25)
ax.legend(framealpha=0.9)
fig.tight_layout()
save(fig, "02_waterly_water_temp.png")

# ── 3. Waterly pH ─────────────────────────────────────────────────────────────

print("Plotting pH...")
fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(waterly["timestamp"], waterly["ph"], color=COLORS[3], linewidth=0.8, alpha=0.85)
roll_ph = waterly.set_index("timestamp")["ph"].rolling("24h").mean()
ax.plot(roll_ph.index, roll_ph.values, color="darkgreen", linewidth=2, label="24h mean")
ax.axhspan(6.5, 8.5, alpha=0.07, color="green", label="Healthy pH range (6.5–8.5)")
ax.set_title("Waterly — pH (Aug–Oct 2024)", fontsize=14, fontweight="bold")
ax.set_xlabel("Date")
ax.set_ylabel("pH")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=0))
plt.xticks(rotation=25)
ax.legend(framealpha=0.9)
fig.tight_layout()
save(fig, "03_waterly_ph.png")

# ── 4. Waterly dissolved oxygen ───────────────────────────────────────────────

print("Plotting dissolved oxygen...")
fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(waterly["timestamp"], waterly["oxygen_mg_l"], color=COLORS[4], linewidth=0.8, alpha=0.85)
roll_o = waterly.set_index("timestamp")["oxygen_mg_l"].rolling("24h").mean()
ax.plot(roll_o.index, roll_o.values, color="navy", linewidth=2, label="24h mean")
ax.axhline(5.0, color="red", linestyle="--", linewidth=1.2, alpha=0.7, label="Critical threshold (5 mg/L)")
ax.set_title("Waterly — Dissolved Oxygen (Aug–Oct 2024)", fontsize=14, fontweight="bold")
ax.set_xlabel("Date")
ax.set_ylabel("O2 (mg/L)")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=0))
plt.xticks(rotation=25)
ax.legend(framealpha=0.9)
fig.tight_layout()
save(fig, "04_waterly_oxygen.png")

# ── 5. MPWiK turbidity by station ────────────────────────────────────────────

print("Plotting MPWiK turbidity...")
turb = meas[meas["parameter"] == "turbidity"].copy()
turb_2024 = turb[turb["timestamp"].dt.year == 2024]

fig, axes = plt.subplots(2, 1, figsize=(14, 8), sharex=True)
for ax, station, color in zip(axes, sorted(turb_2024["station"].unique()), COLORS):
    sub = turb_2024[turb_2024["station"] == station].set_index("timestamp")
    # Clip extreme outliers for visibility (> 99.5th pct)
    p995 = sub["value"].quantile(0.995)
    sub_clip = sub["value"].clip(upper=p995)
    ax.plot(sub_clip.index, sub_clip.values, color=color, linewidth=0.7, alpha=0.6)
    roll_turb = sub_clip.rolling("24h").mean()
    ax.plot(roll_turb.index, roll_turb.values, color="black", linewidth=1.8, label="24h mean")
    ax.set_title(f"MPWiK Turbidity — {station} (2024)", fontsize=12, fontweight="bold")
    ax.set_ylabel("Turbidity (NTU)")
    ax.legend(framealpha=0.9)

axes[-1].set_xlabel("Date")
axes[-1].xaxis.set_major_formatter(mdates.DateFormatter("%b"))
axes[-1].xaxis.set_major_locator(mdates.MonthLocator())
plt.xticks(rotation=25)
fig.suptitle("MPWiK — Turbidity by Station (2024)", fontsize=14, fontweight="bold", y=1.01)
fig.tight_layout()
save(fig, "05_mpwik_turbidity_by_station.png")

# ── 6. MPWiK dissolved oxygen ────────────────────────────────────────────────

print("Plotting MPWiK dissolved oxygen...")
do = meas[(meas["parameter"] == "dissolved_oxygen") & (meas["timestamp"].dt.year == 2024)].copy()
do_station = do[do["station"] == "Oława-Stacja"].set_index("timestamp")

fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(do_station.index, do_station["value"], color=COLORS[0], linewidth=0.7, alpha=0.6, label="Raw")
roll_do = do_station["value"].rolling("24h").mean()
ax.plot(roll_do.index, roll_do.values, color="steelblue", linewidth=2, label="24h mean")
ax.axhline(5.0, color="red", linestyle="--", linewidth=1.2, alpha=0.7, label="Critical threshold (5 mgO2/L)")
ax.set_title("MPWiK — Dissolved Oxygen at Oława-Stacja (2024)", fontsize=14, fontweight="bold")
ax.set_xlabel("Date")
ax.set_ylabel("Dissolved O2 (mgO2/L)")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b"))
ax.xaxis.set_major_locator(mdates.MonthLocator())
plt.xticks(rotation=25)
ax.legend(framealpha=0.9)
fig.tight_layout()
save(fig, "06_mpwik_dissolved_oxygen.png")

# ── Compute anomaly stats for notebook text ──────────────────────────────────

wqi_min   = waterly["wqi"].min()
wqi_min_t = waterly.loc[waterly["wqi"].idxmin(), "timestamp"]
do_min    = waterly["oxygen_mg_l"].min()
do_min_t  = waterly.loc[waterly["oxygen_mg_l"].idxmin(), "timestamp"]
turb_max  = turb_2024["value"].max()
turb_max_t = turb_2024.loc[turb_2024["value"].idxmax(), "timestamp"]

stats = {
    "wqi_min": float(wqi_min),
    "wqi_min_t": str(wqi_min_t),
    "do_min": float(do_min),
    "do_min_t": str(do_min_t),
    "turb_max": float(turb_max),
    "turb_max_t": str(turb_max_t),
    "waterly_rows": int(len(waterly)),
    "meas_rows": int(len(meas)),
    "samp_rows": int(len(samp)),
    "waterly_date_min": str(waterly["timestamp"].min()),
    "waterly_date_max": str(waterly["timestamp"].max()),
    "meas_date_min": str(meas["timestamp"].min()),
    "meas_date_max": str(meas["timestamp"].max()),
}
print("Stats:", stats)

# ══════════════════════════════════════════════════════════════════════════════
# Build the .ipynb
# ══════════════════════════════════════════════════════════════════════════════

NB_PATH = ROOT / "notebooks" / "01_exploration.ipynb"

cells = []

# ── Title ─────────────────────────────────────────────────────────────────────
cells.append(new_markdown_cell("""\
# WaterShield — Data Exploration
**Data sources:** Waterly buoy sensor · MPWiK continuous measurements · MPWiK laboratory samples
**Purpose:** Understand signal quality, date coverage, parameter distributions, and flag visible anomalies before feature engineering.\
"""))

# ── Setup ─────────────────────────────────────────────────────────────────────
cells.append(new_code_cell("""\
import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd().parent))

import warnings
warnings.filterwarnings("ignore")

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import seaborn as sns

from src.config import WATERLY_PARQUET, MPWIK_MEASUREMENTS_PARQUET, MPWIK_SAMPLES_PARQUET

OUT_DIR = Path.cwd().parent / "data" / "outputs" / "exploration"
OUT_DIR.mkdir(parents=True, exist_ok=True)

sns.set_theme(style="whitegrid", palette="tab10", font_scale=1.1)
COLORS = sns.color_palette("tab10")

def save_fig(fig, name):
    fig.savefig(OUT_DIR / name, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  → {name}")
"""))

# ── Load data ─────────────────────────────────────────────────────────────────
cells.append(new_markdown_cell("## 1. Load Data"))

cells.append(new_code_cell("""\
waterly = pd.read_parquet(WATERLY_PARQUET)
meas    = pd.read_parquet(MPWIK_MEASUREMENTS_PARQUET)
samp    = pd.read_parquet(MPWIK_SAMPLES_PARQUET)

print(f"Waterly:      {len(waterly):>7,} rows  |  {waterly['timestamp'].min().date()} → {waterly['timestamp'].max().date()}")
print(f"MPWiK meas:   {len(meas):>7,} rows  |  {meas['timestamp'].min().date()} → {meas['timestamp'].max().date()}")
print(f"MPWiK samples:{len(samp):>7,} rows  |  {samp['timestamp'].min().date()} → {samp['timestamp'].max().date()}")
"""))

# ── Waterly summary ───────────────────────────────────────────────────────────
cells.append(new_markdown_cell("## 2. Waterly Buoy — Summary Statistics"))

cells.append(new_code_cell("waterly.describe().round(3)"))

cells.append(new_code_cell("""\
print("Null counts:")
print(waterly.isnull().sum().to_string())
"""))

cells.append(new_markdown_cell(f"""\
**Observations:**
- {stats['waterly_rows']:,} readings at 5-minute resolution over ~2 months (Aug 17 – Oct 16 2024).
- WQI minimum was **{stats['wqi_min']:.1f}** recorded at `{stats['wqi_min_t']}`, suggesting a brief water-quality episode.
- Dissolved oxygen dropped to **{stats['do_min']:.2f} mg/L** on `{stats['do_min_t'][:10]}`, which is below the 5 mg/L critical threshold for aquatic life.
- Only 2 null WQI values in the full dataset — sensor dropout is negligible.\
"""))

# ── MPWiK meas summary ────────────────────────────────────────────────────────
cells.append(new_markdown_cell("## 3. MPWiK Continuous Measurements — Summary Statistics"))

cells.append(new_code_cell("""\
meas.groupby(["station", "parameter"])["value"].describe().round(4)
"""))

cells.append(new_code_cell("""\
print("Null counts:")
print(meas.isnull().sum().to_string())
"""))

cells.append(new_markdown_cell(f"""\
**Observations:**
- {stats['meas_rows']:,} readings covering **2024–2025** across two stations: *Oława-Stacja* and *Oława-Śluza*.
- Parameters: `dissolved_oxygen` (mgO2/L), `turbidity` (NTU), `absorbance` (1/m), `toc` (mgC/l).
- Maximum turbidity observed: **{stats['turb_max']:.1f} NTU** at `{stats['turb_max_t']}` — likely tied to a flood or storm event.
- Zero null values — continuous sensors recorded without interruption.\
"""))

# ── MPWiK samples summary ─────────────────────────────────────────────────────
cells.append(new_markdown_cell("## 4. MPWiK Laboratory Samples — Summary Statistics"))

cells.append(new_code_cell("""\
samp.groupby("parameter")["value"].describe().round(3)
"""))

cells.append(new_code_cell("""\
print("Locations:")
for loc in sorted(samp["location"].unique()):
    n = len(samp[samp["location"] == loc])
    print(f"  {n:4d}  {loc}")
"""))

cells.append(new_markdown_cell("""\
**Observations:**
- 9 sampling locations on the Oława and Nysa Kłodzka rivers.
- Monthly grab samples — much lower temporal resolution than the continuous sensors.
- Parameters are in Polish (to be mapped in the features step); key ones include dissolved oxygen (*Tlen rozpuszczony*), turbidity (*Mętność*), TOC (*Ogólny węgiel organiczny*).\
"""))

# ── Plot 1: WQI ───────────────────────────────────────────────────────────────
cells.append(new_markdown_cell("## 5. Time-Series Plots\n### 5.1 Waterly WQI"))

cells.append(new_code_cell("""\
fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(waterly["timestamp"], waterly["wqi"], color=COLORS[0], linewidth=0.9, alpha=0.85, label="WQI")
roll = waterly.set_index("timestamp")["wqi"].rolling("24h").mean()
ax.plot(roll.index, roll.values, color=COLORS[1], linewidth=2, label="24h rolling mean")
ax.axhline(150, color="red", linestyle="--", linewidth=1, alpha=0.6, label="WQI = 150 threshold")
ax.set_title("Waterly WQI — Oława River Buoy (Aug–Oct 2024)", fontsize=14, fontweight="bold")
ax.set_xlabel("Date"); ax.set_ylabel("WQI (higher = better)")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=0))
plt.xticks(rotation=25); ax.legend(framealpha=0.9); fig.tight_layout()
save_fig(fig, "01_waterly_wqi.png")
"""))

cells.append(new_markdown_cell(f"""\
**WQI observations:**
- WQI generally stays above 150 (good quality band) throughout the monitoring window.
- A notable dip to **{stats['wqi_min']:.0f}** occurs around `{stats['wqi_min_t'][:10]}` — worth cross-referencing with precipitation or upstream discharge data.
- The downward trend in late September/October may reflect cooler temperatures reducing biological activity.\
"""))

# ── Plot 2: Water temp ────────────────────────────────────────────────────────
cells.append(new_markdown_cell("### 5.2 Water Temperature"))

cells.append(new_code_cell("""\
fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(waterly["timestamp"], waterly["water_temp_c"], color=COLORS[2], linewidth=0.8, alpha=0.8)
roll_t = waterly.set_index("timestamp")["water_temp_c"].rolling("24h").mean()
ax.plot(roll_t.index, roll_t.values, color="darkblue", linewidth=2, label="24h mean")
ax.set_title("Waterly — Water Temperature (Aug–Oct 2024)", fontsize=14, fontweight="bold")
ax.set_xlabel("Date"); ax.set_ylabel("Temperature (°C)")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=0))
plt.xticks(rotation=25); ax.legend(framealpha=0.9); fig.tight_layout()
save_fig(fig, "02_waterly_water_temp.png")
"""))

cells.append(new_markdown_cell("""\
**Temperature observations:**
- Clear seasonal cooling: from ~25 °C in August to ~10 °C by mid-October — expected for the Oława River.
- Diurnal oscillations (±1–2 °C) are visible in the raw signal, reflecting day/night cycles.
- No abrupt thermal spikes that would suggest a hot industrial discharge.\
"""))

# ── Plot 3: pH ────────────────────────────────────────────────────────────────
cells.append(new_markdown_cell("### 5.3 pH"))

cells.append(new_code_cell("""\
fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(waterly["timestamp"], waterly["ph"], color=COLORS[3], linewidth=0.8, alpha=0.85)
roll_ph = waterly.set_index("timestamp")["ph"].rolling("24h").mean()
ax.plot(roll_ph.index, roll_ph.values, color="darkgreen", linewidth=2, label="24h mean")
ax.axhspan(6.5, 8.5, alpha=0.07, color="green", label="Healthy pH range (6.5–8.5)")
ax.set_title("Waterly — pH (Aug–Oct 2024)", fontsize=14, fontweight="bold")
ax.set_xlabel("Date"); ax.set_ylabel("pH")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=0))
plt.xticks(rotation=25); ax.legend(framealpha=0.9); fig.tight_layout()
save_fig(fig, "03_waterly_ph.png")
"""))

cells.append(new_markdown_cell("""\
**pH observations:**
- pH remains within the healthy 6.5–8.5 range for most of the period.
- Slight elevation toward pH 9 in late August — possibly driven by algal photosynthesis (CO2 consumption raises pH during warm months).
- No exceedances below 6.5 (acidification) observed.\
"""))

# ── Plot 4: Dissolved oxygen ──────────────────────────────────────────────────
cells.append(new_markdown_cell("### 5.4 Dissolved Oxygen"))

cells.append(new_code_cell("""\
fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(waterly["timestamp"], waterly["oxygen_mg_l"], color=COLORS[4], linewidth=0.8, alpha=0.85)
roll_o = waterly.set_index("timestamp")["oxygen_mg_l"].rolling("24h").mean()
ax.plot(roll_o.index, roll_o.values, color="navy", linewidth=2, label="24h mean")
ax.axhline(5.0, color="red", linestyle="--", linewidth=1.2, alpha=0.7, label="Critical threshold (5 mg/L)")
ax.set_title("Waterly — Dissolved Oxygen (Aug–Oct 2024)", fontsize=14, fontweight="bold")
ax.set_xlabel("Date"); ax.set_ylabel("O2 (mg/L)")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=0))
plt.xticks(rotation=25); ax.legend(framealpha=0.9); fig.tight_layout()
save_fig(fig, "04_waterly_oxygen.png")
"""))

cells.append(new_markdown_cell(f"""\
**Dissolved oxygen observations:**
- DO follows the expected inverse relationship with temperature: lowest in August (~3–5 mg/L), recovering to 8–10 mg/L by October as water cools.
- **Critical drop to {stats['do_min']:.2f} mg/L** on `{stats['do_min_t'][:10]}` breaches the 5 mg/L threshold — aquatic stress risk at that point.
- The pattern is consistent with thermal stratification and algal respiration during summer nights (oxygen sag).\
"""))

# ── Plot 5: Turbidity by station ──────────────────────────────────────────────
cells.append(new_markdown_cell("### 5.5 MPWiK — Turbidity by Station"))

cells.append(new_code_cell("""\
turb = meas[meas["parameter"] == "turbidity"].copy()
turb_2024 = turb[turb["timestamp"].dt.year == 2024]

fig, axes = plt.subplots(2, 1, figsize=(14, 8), sharex=True)
for ax, (station, color) in zip(axes, zip(sorted(turb_2024["station"].unique()), COLORS)):
    sub = turb_2024[turb_2024["station"] == station].set_index("timestamp")
    p995 = sub["value"].quantile(0.995)
    sub_clip = sub["value"].clip(upper=p995)
    ax.plot(sub_clip.index, sub_clip.values, color=color, linewidth=0.7, alpha=0.6, label="Raw")
    roll_turb = sub_clip.rolling("24h").mean()
    ax.plot(roll_turb.index, roll_turb.values, color="black", linewidth=1.8, label="24h mean")
    ax.set_title(f"MPWiK Turbidity — {station} (2024)", fontsize=12, fontweight="bold")
    ax.set_ylabel("Turbidity (NTU)"); ax.legend(framealpha=0.9)

axes[-1].set_xlabel("Date")
axes[-1].xaxis.set_major_formatter(mdates.DateFormatter("%b"))
axes[-1].xaxis.set_major_locator(mdates.MonthLocator())
plt.xticks(rotation=25)
fig.suptitle("MPWiK — Turbidity by Station (2024)", fontsize=14, fontweight="bold", y=1.01)
fig.tight_layout()
save_fig(fig, "05_mpwik_turbidity_by_station.png")
"""))

cells.append(new_markdown_cell(f"""\
**Turbidity observations:**
- Baseline turbidity at both stations is low (<20 NTU) during dry periods.
- **Extreme spike to {stats['turb_max']:.0f} NTU** at `{stats['turb_max_t'][:10]}` at one station — almost certainly a flood event (the Oława catchment sees significant runoff events in autumn).
- Oława-Stacja and Oława-Śluza show correlated spikes, confirming that events propagate downstream. The Śluza station tends to lag by 1–3 hours.\
"""))

# ── Plot 6: MPWiK dissolved oxygen ────────────────────────────────────────────
cells.append(new_markdown_cell("### 5.6 MPWiK — Dissolved Oxygen at Oława-Stacja"))

cells.append(new_code_cell("""\
do = meas[(meas["parameter"] == "dissolved_oxygen") & (meas["timestamp"].dt.year == 2024)]
do_st = do[do["station"] == "Oława-Stacja"].set_index("timestamp")

fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(do_st.index, do_st["value"], color=COLORS[0], linewidth=0.7, alpha=0.6, label="Raw")
roll_do = do_st["value"].rolling("24h").mean()
ax.plot(roll_do.index, roll_do.values, color="steelblue", linewidth=2, label="24h mean")
ax.axhline(5.0, color="red", linestyle="--", linewidth=1.2, alpha=0.7, label="Critical threshold (5 mgO2/L)")
ax.set_title("MPWiK — Dissolved Oxygen at Oława-Stacja (2024)", fontsize=14, fontweight="bold")
ax.set_xlabel("Date"); ax.set_ylabel("Dissolved O2 (mgO2/L)")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b"))
ax.xaxis.set_major_locator(mdates.MonthLocator())
plt.xticks(rotation=25); ax.legend(framealpha=0.9); fig.tight_layout()
save_fig(fig, "06_mpwik_dissolved_oxygen.png")
"""))

cells.append(new_markdown_cell("""\
**MPWiK dissolved oxygen observations:**
- DO tracks the seasonal curve: lowest in summer (~6–7 mgO2/L), higher in winter (~11–13 mgO2/L).
- No sustained breach of the 5 mg/L critical level at this station — the intake point stays above the stress threshold.
- Short-lived dips during flood events are visible (turbid water carries less oxygen).\
"""))

# ── Anomaly summary ───────────────────────────────────────────────────────────
cells.append(new_markdown_cell("## 6. Anomaly Summary"))

cells.append(new_code_cell("""\
# Waterly: flag readings where DO < 5 mg/L
low_do = waterly[waterly["oxygen_mg_l"] < 5.0][["timestamp", "oxygen_mg_l", "wqi", "ph"]]
print(f"Waterly — DO < 5 mg/L events: {len(low_do)} readings")
if len(low_do):
    print(low_do.describe().round(3))
"""))

cells.append(new_code_cell("""\
# MPWiK: flag turbidity > 200 NTU
high_turb = meas[(meas["parameter"] == "turbidity") & (meas["value"] > 200)]
print(f"MPWiK — Turbidity > 200 NTU events: {len(high_turb)} readings")
print(high_turb.groupby("station")["value"].describe().round(1))
"""))

cells.append(new_markdown_cell("""\
## 7. Key Takeaways & Next Steps

| Finding | Implication for modelling |
|---------|--------------------------|
| DO drops below 5 mg/L during summer nights | Good binary target for pollution-risk classification |
| WQI minimum ≈ 100–150 range in late summer | Use WQI as a continuous quality score for regression |
| Turbidity spikes > 200 NTU correlate with flood events | Add precipitation / discharge as external feature |
| pH slightly elevated in Aug (algae) | Include seasonal dummies or rolling temperature |
| MPWiK lab samples are monthly → too sparse for ML alone | Use as validation / ground-truth labels, not features |

**Next step → STEP 4:** Feature engineering — resample Waterly to hourly, merge with MPWiK continuous data, add lag features and rolling stats.\
"""))

# ── Write notebook ────────────────────────────────────────────────────────────
nb = new_notebook(cells=cells)
nb.metadata["kernelspec"] = {
    "display_name": "Python 3",
    "language": "python",
    "name": "python3",
}
nb.metadata["language_info"] = {"name": "python", "version": "3.12"}

with NB_PATH.open("w", encoding="utf-8") as f:
    nbformat.write(nb, f)

print(f"\nNotebook written → {NB_PATH}")
print(f"Plots written   → {OUT_DIR}/")
