"""GET /api/water-bodies and GET /api/water-bodies/{water_body_id}."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(tags=["water-bodies"])


@router.get("/water-bodies")
def list_water_bodies(
    request: Request,
    country: Optional[str] = Query(None, description="ISO 3166-1 alpha-2 country code, e.g. PL"),
    risk_level: Optional[str] = Query(None, description="clean | moderate | high | critical"),
):
    """Return all water body features, optionally filtered by country or risk level."""
    features = request.app.state.geojson["features"]

    if country:
        country_upper = country.upper()
        features = [
            f for f in features
            if f["properties"].get("country_code", "").upper() == country_upper
        ]

    if risk_level:
        risk_lower = risk_level.lower()
        features = [
            f for f in features
            if f["properties"].get("risk_level") == risk_lower
        ]

    return {
        "type":     "FeatureCollection",
        "metadata": request.app.state.geojson.get("metadata", {}),
        "count":    len(features),
        "features": features,
    }


@router.get("/water-bodies/{water_body_id}")
def get_water_body(water_body_id: str, request: Request):
    """Return a single water body Feature by ID, or 404 if not found."""
    for feature in request.app.state.geojson["features"]:
        if feature["properties"].get("water_body_id") == water_body_id:
            return feature

    raise HTTPException(status_code=404, detail=f"Water body '{water_body_id}' not found")
