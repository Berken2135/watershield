# WaterShield — Data Science

Historical analysis, forecasting, and synthetic data generation for the WaterShield water-quality platform.

## What this does

| Layer | Description |
|-------|-------------|
| **Ingestion** | Parse raw partner data (Waterly CSV, MPWiK RPT/XLSX, Urząd Excel) → Parquet |
| **Features** | Rolling statistics, lag features, time-based encodings |
| **Models** | 7-day and 30-day WQI forecasting (Prophet / XGBoost) + anomaly detection |
| **Fake data** | Synthetic time-series for ~30 European cities (demo scalability) |
| **Export** | GeoJSON FeatureCollection consumed directly by MapLibre frontend |

The backend handles **real-time** Sentinel-2 analysis; this module handles **historical + predictive** layers.

## Quick start

```bash
cd data-science

# 1. Create and activate virtual env
python3.12 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Place raw partner zip files in data/raw/

# 4. Run ingestion (after placing files)
python -m src.ingestion.waterly
python -m src.ingestion.mpwik_rpt
python -m src.ingestion.mpwik_xlsx
python -m src.ingestion.urzad

# 5. Open exploration notebook
jupyter notebook notebooks/01_exploration.ipynb

# 6. Train forecaster
python -m src.models.forecaster

# 7. Generate European fake data
python -m src.fake_data.europe_generator

# 8. Export GeoJSON for frontend
python -m src.export.geojson_builder
```

## Data sources

| Source | Format | Coverage |
|--------|--------|----------|
| Waterly buoy | CSV (`;` sep) | Aug–Oct 2024, 5-min intervals, Wrocław |
| MPWiK RPT | Tab-sep `.rpt` | 2024–2025, Oława stations |
| MPWiK XLSX | Excel | Sample collection points, Wrocław |
| Urząd Statystyczny | Excel | Wrocław 2024 water statistics |

## Output

`data/outputs/watershield_europe.geojson` — consumed by the MapLibre frontend. Each feature is a water body with current WQI, 7d/30d predictions, risk level, and trend.

## Project structure

```
data-science/
├── data/
│   ├── raw/           # partner files (gitignored)
│   ├── processed/     # cleaned parquet (gitignored)
│   └── outputs/       # JSON/GeoJSON for frontend
├── notebooks/
│   └── 01_exploration.ipynb
├── src/
│   ├── config.py
│   ├── ingestion/     # one module per data source
│   ├── features/      # feature engineering
│   ├── models/        # forecasting + anomaly detection
│   ├── fake_data/     # synthetic European data
│   └── export/        # GeoJSON builder
└── requirements.txt
```
