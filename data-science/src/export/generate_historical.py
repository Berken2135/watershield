"""Generate synthetic monthly WQI history for all 105 European rivers, Jan 2024 – Apr 2026.

We have real sensor data only for Odra at Wrocław (Aug–Oct 2024).  Everything
else is synthetic but designed to look plausible:

  - Each river gets a seeded base WQI reflecting its geography and known
    water quality (Nordic/Swiss/Alpine rivers are cleanest; Balkan/Eastern
    rivers score lower)
  - A sinusoidal seasonal curve: summer slightly worse for continental rivers,
    winter worse for Mediterranean rivers; Atlantic rivers have low seasonality
  - A slow random walk that drifts ±30 WQI over the three years
  - Rare pollution spikes (-40 to -60 WQI, 1–2 per river over 28 months)
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
from src.european_data.rivers import RIVERS

DATA_OUTPUTS.mkdir(parents=True, exist_ok=True)

OUT_PARQUET = DATA_OUTPUTS / "historical_monthly.parquet"
OUT_JSON    = DATA_OUTPUTS / "historical_monthly.json"

MONTHS = pd.date_range("2024-01-01", "2026-04-01", freq="MS")

RISK_THRESHOLDS = [(200, "clean"), (150, "moderate"), (100, "high"), (0, "critical")]

# ── Base WQI per river (keyed by the `city` field = "RiverName (City)") ──────
# Higher = better water quality.  Grounded in:
#   - EU Water Framework Directive compliance status
#   - Basin size and upstream land use
#   - Known industrial / agricultural pressure
#   - Alpine/Nordic rivers score highest (low population density, clean source)

BASE_WQI: dict[str, float] = {
    # Poland (8)
    "Odra (Wrocław)":        182, "Vistula (Warsaw)":      188, "Vistula (Kraków)":     185,
    "Warta (Poznań)":        183, "Bug (Brest)":            178, "San (Przemyśl)":       185,
    "Pilica (Tomaszów)":     180, "Narew (Łomża)":         183,
    # Germany (10)
    "Rhine (Cologne)":       205, "Rhine (Düsseldorf)":    202, "Elbe (Hamburg)":       195,
    "Elbe (Dresden)":        200, "Danube (Regensburg)":   215, "Main (Frankfurt)":     200,
    "Spree (Berlin)":        198, "Weser (Bremen)":        205, "Neckar (Stuttgart)":   202,
    "Isar (Munich)":         218,
    # France (8)
    "Seine (Paris)":         205, "Rhône (Lyon)":          215, "Rhône (Avignon)":      218,
    "Loire (Nantes)":        208, "Loire (Orléans)":       210, "Garonne (Bordeaux)":   215,
    "Marne (Châlons)":       207, "Saône (Chalon)":        212,
    # United Kingdom (5)
    "Thames (London)":       200, "Severn (Bristol)":      208, "Mersey (Liverpool)":   195,
    "Tyne (Newcastle)":      202, "Clyde (Glasgow)":       205,
    # Italy (6)
    "Po (Turin)":            205, "Po (Ferrara)":          190, "Tiber (Rome)":         195,
    "Arno (Florence)":       205, "Adige (Verona)":        215, "Piave (Belluno)":      225,
    # Spain (5)
    "Ebro (Zaragoza)":       232, "Tagus (Toledo)":        238, "Guadalquivir (Seville)": 228,
    "Duero (Valladolid)":    240, "Miño (Ourense)":        245,
    # Netherlands (3)
    "Rhine (Rotterdam)":     185, "Maas (Maastricht)":     183, "IJssel (Deventer)":    188,
    # Belgium (2)
    "Schelde (Antwerp)":     178, "Meuse (Liège)":         180,
    # Portugal (2)
    "Tagus (Lisbon)":        242, "Douro (Porto)":         248,
    # Ireland (2)
    "Liffey (Dublin)":       212, "Shannon (Limerick)":    228,
    # Switzerland (3)
    "Rhine (Basel)":         255, "Aare (Bern)":           260, "Limmat (Zurich)":      258,
    # Austria (4)
    "Danube (Vienna)":       215, "Inn (Innsbruck)":       235, "Salzach (Salzburg)":   240,
    "Mur (Graz)":            225,
    # Czechia (2)
    "Vltava (Prague)":       210, "Elbe (Ústí)":          195,
    # Slovakia (2)
    "Danube (Bratislava)":   212, "Váh (Trenčín)":         215,
    # Hungary (3)
    "Danube (Budapest)":     208, "Tisza (Szeged)":        195, "Rába (Győr)":           200,
    # Slovenia (2)
    "Sava (Ljubljana)":      215, "Drava (Maribor)":       218,
    # Croatia (2)
    "Sava (Zagreb)":         200, "Drava (Osijek)":        195,
    # Romania (4)
    "Danube (Galați)":       182, "Mureș (Arad)":          175, "Olt (Slatina)":        172,
    "Prut (Iași)":           178,
    # Bulgaria (2)
    "Danube (Ruse)":         185, "Maritsa (Plovdiv)":     170,
    # Serbia (2)
    "Danube (Belgrade)":     185, "Sava (Belgrade)":       180,
    # Greece (3)
    "Aliakmonas (Kozani)":   228, "Pinios (Larissa)":      222, "Axios (Thessaloniki)":  218,
    # Sweden (3)
    "Göta älv (Gothenburg)": 235, "Klarälven (Karlstad)":  240, "Dalälven (Falun)":     238,
    # Norway (3)
    "Glomma (Sarpsborg)":    238, "Drammenselva (Drammen)": 235, "Lågen (Lillehammer)": 242,
    # Finland (3)
    "Kymijoki (Kouvola)":    232, "Vuoksi (Lappeenranta)": 238, "Oulujoki (Oulu)":      240,
    # Denmark (2)
    "Gudenå (Silkeborg)":    225, "Odense Å (Odense)":     222,
    # Lithuania (2)
    "Neris (Vilnius)":       195, "Nemunas (Kaunas)":      198,
    # Latvia (2)
    "Daugava (Riga)":        192, "Gauja (Valmiera)":      205,
    # Estonia (2)
    "Emajõgi (Tartu)":       198, "Pärnu (Pärnu)":         202,
    # Ukraine (2)
    "Dnipro (Kyiv)":         168, "Dniester (Odessa)":     162,
    # Moldova (1)
    "Dniester (Tiraspol)":   155,
    # Luxembourg (1)
    "Alzette (Luxembourg)":  205,
    # Iceland (1)
    "Ölfusá (Selfoss)":      275,
}

# ── Seasonal amplitude ────────────────────────────────────────────────────────
# Peak-to-trough WQI swing across the year.
# Mediterranean / dry-summer rivers: high (30–40)
# Atlantic / maritime rivers: low (14–20)
# Continental / boreal rivers: moderate (20–28)

SEASONAL_AMP: dict[str, float] = {
    # Poland (8) — continental, strong summer runoff
    "Odra (Wrocław)":        25, "Vistula (Warsaw)":      28, "Vistula (Kraków)":     26,
    "Warta (Poznań)":        26, "Bug (Brest)":            28, "San (Przemyśl)":       25,
    "Pilica (Tomaszów)":     25, "Narew (Łomża)":         28,
    # Germany (10)
    "Rhine (Cologne)":       20, "Rhine (Düsseldorf)":    20, "Elbe (Hamburg)":       20,
    "Elbe (Dresden)":        22, "Danube (Regensburg)":   24, "Main (Frankfurt)":     20,
    "Spree (Berlin)":        22, "Weser (Bremen)":        18, "Neckar (Stuttgart)":   22,
    "Isar (Munich)":         24,
    # France (8)
    "Seine (Paris)":         20, "Rhône (Lyon)":          25, "Rhône (Avignon)":      30,
    "Loire (Nantes)":        20, "Loire (Orléans)":       22, "Garonne (Bordeaux)":   22,
    "Marne (Châlons)":       20, "Saône (Chalon)":        22,
    # United Kingdom (5) — maritime, low seasonality
    "Thames (London)":       16, "Severn (Bristol)":      16, "Mersey (Liverpool)":   15,
    "Tyne (Newcastle)":      18, "Clyde (Glasgow)":       18,
    # Italy (6)
    "Po (Turin)":            22, "Po (Ferrara)":          25, "Tiber (Rome)":         30,
    "Arno (Florence)":       28, "Adige (Verona)":        22, "Piave (Belluno)":      20,
    # Spain (5) — dry Mediterranean/continental, high amplitude
    "Ebro (Zaragoza)":       35, "Tagus (Toledo)":        38, "Guadalquivir (Seville)": 40,
    "Duero (Valladolid)":    35, "Miño (Ourense)":        28,
    # Netherlands (3)
    "Rhine (Rotterdam)":     18, "Maas (Maastricht)":     18, "IJssel (Deventer)":    18,
    # Belgium (2)
    "Schelde (Antwerp)":     18, "Meuse (Liège)":         20,
    # Portugal (2)
    "Tagus (Lisbon)":        32, "Douro (Porto)":         28,
    # Ireland (2) — maritime, very low seasonality
    "Liffey (Dublin)":       14, "Shannon (Limerick)":    16,
    # Switzerland (3) — alpine snowmelt
    "Rhine (Basel)":         22, "Aare (Bern)":           20, "Limmat (Zurich)":      20,
    # Austria (4) — alpine
    "Danube (Vienna)":       22, "Inn (Innsbruck)":       22, "Salzach (Salzburg)":   20,
    "Mur (Graz)":            24,
    # Czechia (2)
    "Vltava (Prague)":       22, "Elbe (Ústí)":          22,
    # Slovakia (2)
    "Danube (Bratislava)":   22, "Váh (Trenčín)":         22,
    # Hungary (3)
    "Danube (Budapest)":     25, "Tisza (Szeged)":        28, "Rába (Győr)":           24,
    # Slovenia (2)
    "Sava (Ljubljana)":      22, "Drava (Maribor)":       22,
    # Croatia (2)
    "Sava (Zagreb)":         25, "Drava (Osijek)":        25,
    # Romania (4) — continental, strong seasonality
    "Danube (Galați)":       28, "Mureș (Arad)":          28, "Olt (Slatina)":        28,
    "Prut (Iași)":           30,
    # Bulgaria (2) — Mediterranean influence
    "Danube (Ruse)":         28, "Maritsa (Plovdiv)":     32,
    # Serbia (2)
    "Danube (Belgrade)":     25, "Sava (Belgrade)":       25,
    # Greece (3) — Mediterranean
    "Aliakmonas (Kozani)":   35, "Pinios (Larissa)":      35, "Axios (Thessaloniki)":  35,
    # Sweden (3) — boreal
    "Göta älv (Gothenburg)": 20, "Klarälven (Karlstad)":  22, "Dalälven (Falun)":     20,
    # Norway (3) — maritime
    "Glomma (Sarpsborg)":    18, "Drammenselva (Drammen)": 18, "Lågen (Lillehammer)": 20,
    # Finland (3) — subarctic
    "Kymijoki (Kouvola)":    22, "Vuoksi (Lappeenranta)": 20, "Oulujoki (Oulu)":      20,
    # Denmark (2)
    "Gudenå (Silkeborg)":    18, "Odense Å (Odense)":     18,
    # Lithuania (2)
    "Neris (Vilnius)":       25, "Nemunas (Kaunas)":      25,
    # Latvia (2)
    "Daugava (Riga)":        24, "Gauja (Valmiera)":      22,
    # Estonia (2)
    "Emajõgi (Tartu)":       24, "Pärnu (Pärnu)":         22,
    # Ukraine (2) — continental
    "Dnipro (Kyiv)":         28, "Dniester (Odessa)":     25,
    # Moldova (1)
    "Dniester (Tiraspol)":   28,
    # Luxembourg (1)
    "Alzette (Luxembourg)":  20,
    # Iceland (1) — subarctic maritime, very low seasonality
    "Ölfusá (Selfoss)":      12,
}


def _risk(wqi: float) -> str:
    for threshold, label in RISK_THRESHOLDS:
        if wqi >= threshold:
            return label
    return "critical"


def _generate_river(river_meta: dict, rng: np.random.Generator) -> list[dict]:
    city    = river_meta["city"]   # unique key e.g. "Odra (Wrocław)"
    base    = BASE_WQI.get(city, 200.0)
    amp     = SEASONAL_AMP.get(city, 20.0)
    n       = len(MONTHS)

    # Slow random walk
    drift = np.cumsum(rng.normal(0, 1.5, n))

    # Seasonal: WQI dips in summer (July peak runoff / algae for most EU rivers)
    month_nums = np.array([m.month for m in MONTHS])
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
            "country":     river_meta["country"],
            "country_code": river_meta["country_code"],
            "lat":         float(river_meta["lat"]),
            "lon":         float(river_meta["lon"]),
            "date":        month.strftime("%Y-%m-%d"),
            "wqi":         wqi,
            "risk_level":  _risk(wqi),
            "data_source": "synthetic_historical",
        })
    return rows


def generate() -> pd.DataFrame:
    all_rows = []
    for river_meta in RIVERS:
        seed = sum(ord(c) for c in river_meta["city"])
        rng  = np.random.default_rng(seed)
        all_rows.extend(_generate_river(river_meta, rng))
    return pd.DataFrame(all_rows)


def main() -> None:
    print(f"Generating monthly WQI history: {MONTHS[0].date()} → {MONTHS[-1].date()}")
    print(f"  Rivers : {len(RIVERS)}")
    print(f"  Months : {len(MONTHS)}")
    print(f"  Rows   : {len(RIVERS) * len(MONTHS)}")

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

    print("\n── Rivers with critical months ──────────────────────────────────────")
    crit = df[df["risk_level"] == "critical"]["city"].unique()
    print(f"  {list(crit) if len(crit) else 'none'}")

    print("\n── Risk by country ──────────────────────────────────────────────────")
    print(df.groupby(["country", "risk_level"]).size().unstack(fill_value=0).to_string())

    print("\n── Sample: Odra (Wrocław) ───────────────────────────────────────────")
    print(df[df["city"] == "Odra (Wrocław)"][["date", "wqi", "risk_level"]].to_string(index=False))

    print("\n── Sample: Maritsa (Plovdiv) ────────────────────────────────────────")
    print(df[df["city"] == "Maritsa (Plovdiv)"][["date", "wqi", "risk_level"]].to_string(index=False))


if __name__ == "__main__":
    main()
