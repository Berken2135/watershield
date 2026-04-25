"""GET /api/water-bodies/{water_body_id}/history — monthly WQI history."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(tags=["history"])


@router.get("/water-bodies/{water_body_id}/history")
def get_history(
    water_body_id: str,
    request: Request,
    year: Optional[int] = Query(None, description="Filter to a single year, e.g. 2025"),
):
    """Return monthly WQI history for a water body (Jan 2024 – Apr 2026).

    Odra/Wrocław Aug–Oct 2024 is backed by real Waterly sensor data; all other
    months and rivers are synthetic_historical.
    """
    # Resolve city_key from water_body_id via GeoJSON features
    # city_key matches the `city` column in historical_monthly.parquet
    features = request.app.state.geojson["features"]
    city_key = None
    for f in features:
        if f["properties"].get("water_body_id") == water_body_id:
            city_key = f["properties"].get("city_key") or \
                       f["properties"]["name"].split(" - ")[-1].strip()
            break

    if city_key is None:
        raise HTTPException(status_code=404, detail=f"Water body '{water_body_id}' not found")

    df = request.app.state.history_df
    rows = df[df["city"] == city_key].copy()

    if year is not None:
        rows = rows[rows["date"].str.startswith(str(year))]

    if rows.empty:
        raise HTTPException(status_code=404, detail=f"No history for '{water_body_id}' year={year}")

    records = rows[["date", "wqi", "risk_level", "data_source"]].to_dict(orient="records")

    return {
        "water_body_id": water_body_id,
        "city":          city_key,
        "months":        len(records),
        "history":       records,
    }
