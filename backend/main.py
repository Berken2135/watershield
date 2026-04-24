from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, search, analysis

app = FastAPI(
    title="WaterShield API",
    description="Water pollution tracking via Sentinel-2 satellite data (Copernicus/openEO)",
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


@app.get("/health")
def health():
    return {"status": "ok", "service": "watershield-backend"}


@app.get("/api/endpoints")
def list_endpoints():
    """Quick reference of all available endpoints."""
    return {
        "auth":     ["GET /api/auth/status"],
        "search":   ["POST /api/search/scenes", "GET /api/search/collections"],
        "analysis": ["POST /api/analysis/water-quality", "POST /api/analysis/trend"],
    }
