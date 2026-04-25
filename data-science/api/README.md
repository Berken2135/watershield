# WaterShield Data-Science API

FastAPI service that exposes the data-science pipeline outputs as REST endpoints.
Runs on **port 8001** — port 8000 is used by the backend team's real-time analysis API.

---

## Quick start

```bash
cd data-science/api
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
```

Interactive docs: http://localhost:8001/docs

---

## Endpoints

### Health

```bash
curl http://localhost:8001/health
# {"status":"ok","service":"watershield-data-science"}
```

---

### Water bodies

**List all** (30 cities, full GeoJSON FeatureCollection):
```bash
curl http://localhost:8001/api/water-bodies
```

**Filter by country** (ISO 3166-1 alpha-2):
```bash
curl "http://localhost:8001/api/water-bodies?country=PL"
curl "http://localhost:8001/api/water-bodies?country=DE"
```

**Filter by risk level** (`clean` | `moderate` | `high` | `critical`):
```bash
curl "http://localhost:8001/api/water-bodies?risk_level=moderate"
curl "http://localhost:8001/api/water-bodies?risk_level=high"
```

**Combine filters:**
```bash
curl "http://localhost:8001/api/water-bodies?country=PL&risk_level=moderate"
```

**Single water body by ID:**
```bash
curl http://localhost:8001/api/water-bodies/wroclaw_odra_001
curl http://localhost:8001/api/water-bodies/berlin_spree_001
# → 404 if ID not found
```

---

### Forecast

**30-day WQI forecast for a water body:**
```bash
curl http://localhost:8001/api/water-bodies/wroclaw_odra_001/forecast
curl http://localhost:8001/api/water-bodies/berlin_spree_001/forecast
```

- **Wrocław** returns the real model forecast (Prophet / XGBoost winner, `data_source: "real"`).
- All other cities return a synthetic linear interpolation between `wqi_current` and
  `wqi_predicted_30d` from the GeoJSON properties (`data_source: "synthetic"`).

---

### Anomalies

**Recent anomaly events** (Wrocław sensor only):
```bash
curl http://localhost:8001/api/anomalies/recent
curl "http://localhost:8001/api/anomalies/recent?limit=5&days=7"
```

Query params:
| Param | Default | Description |
|-------|---------|-------------|
| `limit` | 10 | Max events to return (1–500) |
| `days` | 30 | Look-back window in days |

Severity is derived from WQI at anomaly time:
`low` (≥200) → `moderate` (≥150) → `high` (≥100) → `critical` (<100)

---

### Summary

Quick stats for a dashboard header:
```bash
curl http://localhost:8001/api/summary
```

Returns total city count, risk-level breakdown, and average WQI by country.

---

## Data sources

| Endpoint | File read at startup |
|----------|----------------------|
| `/api/water-bodies` | `data/outputs/watershield_europe.geojson` |
| `/api/water-bodies/{id}/forecast` | `data/outputs/wqi_forecast_30d.json` |
| `/api/anomalies/recent` | `data/outputs/anomalies.parquet` |
| `/api/summary` | `data/outputs/watershield_summary.json` |

All files are loaded once into memory at startup — no disk I/O on individual requests.

---

## Integration notes

- CORS is enabled for `http://localhost:3000` (Next.js frontend dev server).
- All properties in `/api/water-bodies` are pre-computed — no client-side math needed.
- Use `risk_color` directly as a MapLibre `circle-color` paint property.
- `data_source: "real"` = live Waterly sensor data (Wrocław only).
- `data_source: "synthetic"` = ERA5 climate proxy (all other European cities).
- This API serves static pipeline outputs. For live sensor streaming, use the
  backend team's API on port 8000.
