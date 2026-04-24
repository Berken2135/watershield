import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

STAC_BASE = "https://stac.dataspace.copernicus.eu/v1"


class SearchRequest(BaseModel):
    bbox: list[float]          # [lon_min, lat_min, lon_max, lat_max]
    start_date: str            # "2024-01-01"
    end_date: str              # "2024-03-01"
    max_cloud_cover: Optional[int] = 30
    limit: Optional[int] = 10


@router.post("/scenes")
async def search_scenes(req: SearchRequest):
    """
    Search Sentinel-2 L2A scenes via STAC API.
    Returns available scenes sorted by date (newest first).
    """
    if len(req.bbox) != 4:
        raise HTTPException(status_code=422, detail="bbox must have 4 values: [lon_min, lat_min, lon_max, lat_max]")

    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": req.bbox,
        "datetime": f"{req.start_date}T00:00:00Z/{req.end_date}T23:59:59Z",
        "limit": req.limit,
        "filter": {
            "op": "<=",
            "args": [{"property": "eo:cloud_cover"}, req.max_cloud_cover],
        },
        "filter-lang": "cql2-json",
        "sortby": [{"field": "datetime", "direction": "desc"}],
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{STAC_BASE}/search", json=payload)

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    features = data.get("features", [])

    results = [
        {
            "id": f["id"],
            "datetime": f["properties"].get("datetime"),
            "cloud_cover": f["properties"].get("eo:cloud_cover"),
            "bbox": f.get("bbox"),
            "collection": f["collection"],
        }
        for f in features
    ]

    return {"count": len(results), "scenes": results}


@router.get("/collections")
async def list_sentinel2_collections():
    """List Sentinel-2 collection info from STAC."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{STAC_BASE}/collections/sentinel-2-l2a")

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return resp.json()
