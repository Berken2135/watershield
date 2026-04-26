"""WaterShield data-science API.

Runs on port 8001 (port 8000 is reserved for the backend team's service).
Start: uvicorn main:app --port 8001 --reload
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.european_data.rivers import RIVERS

from routers import anomalies, countries, forecast, history, temperature, water_bodies

DATA_DIR  = Path(__file__).resolve().parents[1] / "data" / "outputs"
PROC_DIR  = Path(__file__).resolve().parents[1] / "data" / "processed" / "europe"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load all outputs into memory once at startup."""
    app.state.geojson      = json.loads((DATA_DIR / "watershield_europe.geojson").read_text())
    app.state.summary      = json.loads((DATA_DIR / "watershield_summary.json").read_text())
    app.state.forecast_30d = json.loads((DATA_DIR / "wqi_forecast_30d.json").read_text())
    app.state.anomalies_df = pd.read_parquet(DATA_DIR / "anomalies.parquet")
    app.state.history_df   = pd.read_parquet(DATA_DIR / "historical_monthly.parquet")
    app.state.countries_df = pd.read_parquet(DATA_DIR / "historical_monthly_countries.parquet")
    app.state.rivers       = RIVERS   # list[dict] for temperature router

    temp_path = PROC_DIR / "river_temperature.parquet"
    app.state.temp_df = pd.read_parquet(temp_path) if temp_path.exists() else pd.DataFrame()
    yield


app = FastAPI(
    title="WaterShield Data-Science API",
    description=(
        "Exposes pre-computed water-quality outputs for the WaterShield frontend. "
        "Complements the backend team's real-time analysis API on port 8000."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(water_bodies.router, prefix="/api")
app.include_router(forecast.router,     prefix="/api")
app.include_router(history.router,      prefix="/api")
app.include_router(countries.router,    prefix="/api")
app.include_router(anomalies.router,    prefix="/api")
app.include_router(temperature.router,  prefix="/api")


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "service": "watershield-data-science"}


@app.get("/api/summary", tags=["summary"])
def get_summary(request: Request):
    return request.app.state.summary
