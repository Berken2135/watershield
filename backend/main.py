from dotenv import load_dotenv
load_dotenv()  # auto-load backend/.env (OPENAI_API_KEY, etc.)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, search, analysis, reports, data

app = FastAPI(
    title="WaterShield API",
    description="Water pollution tracking via Sentinel-2 satellite data (Copernicus/openEO) + AI anomaly detection.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,     prefix="/api/auth",     tags=["auth"])
app.include_router(search.router,   prefix="/api/search",   tags=["search"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(reports.router,  prefix="/api/reports",  tags=["reports"])
app.include_router(data.router,     prefix="/api/data",     tags=["data"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "watershield-backend"}


@app.get("/api/endpoints")
def list_endpoints():
    """Quick reference of all available endpoints."""
    return {
        "auth":     ["GET /api/auth/status"],
        "search":   ["POST /api/search/scenes", "GET /api/search/collections"],
        "analysis": [
            "POST /api/analysis/water-quality",
            "POST /api/analysis/trend",
            "POST /api/analysis/anomaly",
        ],
        "reports":  ["POST /api/reports/generate"],
        "data": [
            "GET /api/data/europe",
            "GET /api/data/wroclaw",
            "GET /api/data/summary",
            "GET /api/data/forecast",
            "GET /api/data/forecast-metrics",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
