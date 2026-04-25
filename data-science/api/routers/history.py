"""GET /api/water-bodies/{water_body_id}/history — monthly WQI history."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(tags=["history"])


def _id_to_city(water_body_id: str, features: list[dict]) -> str | None:
    for f in features:
        if f["properties"].get("water_body_id") == water_body_id:
            return f["properties"]["name"].split(" - ")[-1].strip()
    return None


@router.get("/water-bodies/{water_body_id}/history")
def get_history(
    water_body_id: str,
    request: Request,
    year: Optional[int] = Query(None, description="Filter to a single year, e.g. 2025"),
):
    """Return monthly WQI history for a water body (Jan 2024 – Apr 2026).

    Wrocław Aug–Oct 2024 is backed by real Waterly sensor data; all other
    months and cities are synthetic_historical.
    """
    # Resolve city name from water_body_id via GeoJSON features
    features = request.app.state.geojson["features"]
    city_name = None
    for f in features:
        if f["properties"].get("water_body_id") == water_body_id:
            # name is like "Odra River - Wrocław" or "Spree - Berlin"
            city_name = f["properties"]["name"].split(" - ")[-1].strip()
            break

    if city_name is None:
        raise HTTPException(status_code=404, detail=f"Water body '{water_body_id}' not found")

    df = request.app.state.history_df
    rows = df[df["city"] == city_name].copy()

    if year is not None:
        rows = rows[rows["date"].str.startswith(str(year))]

    if rows.empty:
        raise HTTPException(status_code=404, detail=f"No history for '{water_body_id}' year={year}")

    records = rows[["date", "wqi", "risk_level", "data_source"]].to_dict(orient="records")

    return {
        "water_body_id": water_body_id,
        "city":          city_name,
        "months":        len(records),
        "history":       records,
    }
