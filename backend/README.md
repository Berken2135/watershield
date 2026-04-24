# WaterShield — Backend

Water pollution tracking API using real Sentinel-2 satellite data via Copernicus openEO.

---

## What it does

The user draws a polygon on the map. The backend fetches satellite imagery for that area and returns water pollution indicators:

| Index | Detects |
|---|---|
| NDWI | Whether the area is actually water |
| Chlorophyll Index | Algae blooms / eutrophication |
| Turbidity (NDTI) | Murky / sediment-heavy water |
| CDOM Proxy | Dissolved chemicals / organic waste |

Results include a **pollution score (0–100)** and an **alert level**: `clean` / `moderate` / `high` / `critical`.

---

## Requirements

- Python 3.12 (not 3.13+, pydantic-core requires 3.12)
- A Copernicus Data Space account with client credentials

Install Python 3.12 on Mac:
```bash
brew install python@3.12
```

---

## Setup

```bash
cd watershield/backend

# Create virtual environment with Python 3.12
python3.12 -m venv .venv
source .venv/bin/activate      # Mac/Linux
# .venv\Scripts\activate       # Windows

# Install dependencies
pip install -r requirements.txt
```

---

## Credentials

Create a `.env` file in `watershield/backend/` with:

```
CDSE_USERNAME=your_email@example.com
CDSE_PASSWORD=your_password

CDSE_CLIENT_ID=sh-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CDSE_CLIENT_SECRET=your_client_secret

OPENEO_URL=https://openeo.dataspace.copernicus.eu
```

> The `.env` file is gitignored. Never commit credentials.

---

## Run the server

```bash
cd watershield/backend
source .venv/bin/activate
uvicorn main:app --port 8000 --reload
```

Server starts at `http://localhost:8000`

---

## Endpoints

### Health check
```
GET /health
```
```json
{ "status": "ok", "service": "watershield-backend" }
```

---

### Check credentials
```
GET /api/auth/status
```
Returns whether your CDSE credentials authenticate successfully.

---

### Search available satellite scenes
```
POST /api/search/scenes
```
**Body:**
```json
{
  "bbox": [19.9, 50.0, 20.1, 50.2],
  "start_date": "2024-06-01",
  "end_date": "2024-06-30",
  "max_cloud_cover": 20,
  "limit": 10
}
```
**Returns:** list of available Sentinel-2 L2A scenes (id, date, cloud cover, bbox).

---

### Full water quality analysis
```
POST /api/analysis/water-quality
```
**Body:**
```json
{
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[19.9, 50.0], [20.1, 50.0], [20.1, 50.2], [19.9, 50.2], [19.9, 50.0]]]
  },
  "start_date": "2024-06-01",
  "end_date": "2024-06-30",
  "max_cloud_cover": 30
}
```
**Returns:** per-date timeline of all 4 pollution indices + pollution score + alert level + summary.

> ⚠️ This endpoint calls openEO and processes real satellite data. It takes **60–120 seconds** to respond. This is normal.

---

### Trend summary (dashboard card)
```
POST /api/analysis/trend
```
Same body as `/water-quality`. Returns only the current status + trend direction (`improving` / `worsening` / `stable`). Still takes 60–120 seconds.

---

## Interactive API docs

While the server is running, open:
```
http://localhost:8000/docs
```
This gives you a full Swagger UI to test all endpoints in the browser.

---

## Project structure

```
backend/
├── main.py              # FastAPI app + CORS
├── requirements.txt
├── .env                 # credentials (gitignored)
├── .gitignore
└── routers/
    ├── auth.py          # openEO client credentials auth
    ├── search.py        # STAC scene search
    └── analysis.py      # NDWI, chlorophyll, turbidity, CDOM
```

---

## Frontend integration

The backend accepts CORS from `http://localhost:3000` (Next.js default).

Send the polygon the user draws on the map as a GeoJSON geometry object directly to `/api/analysis/water-quality`.
