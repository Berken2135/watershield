"""GET /api/countries/history — monthly WQI history aggregated by country."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(tags=["countries"])


@router.get("/countries/history")
def all_countries_history(
    request: Request,
    year: Optional[int] = Query(None, description="Filter to a single year, e.g. 2025"),
):
    """Return monthly WQI for every country (Jan 2024 – Apr 2026).

    Poland is the average of Wrocław + Kraków + Warsaw.
    All other countries have one city, so country = city value.
    """
    df = request.app.state.countries_df
    if year is not None:
        df = df[df["date"].str.startswith(str(year))]

    records = df[["country", "country_code", "date", "wqi", "risk_level",
                  "cities_count", "data_source"]].to_dict(orient="records")

    return {
        "months":    df["date"].nunique() if not df.empty else 0,
        "countries": df["country"].nunique() if not df.empty else 0,
        "data":      records,
    }


@router.get("/countries/{country_code}/history")
def country_history(
    country_code: str,
    request: Request,
    year: Optional[int] = Query(None, description="Filter to a single year, e.g. 2025"),
):
    """Return monthly WQI for a single country by ISO 3166-1 alpha-2 code (e.g. PL)."""
    df = request.app.state.countries_df
    rows = df[df["country_code"] == country_code.upper()].copy()

    if rows.empty:
        raise HTTPException(status_code=404, detail=f"Country code '{country_code}' not found")

    if year is not None:
        rows = rows[rows["date"].str.startswith(str(year))]

    if rows.empty:
        raise HTTPException(status_code=404, detail=f"No data for '{country_code}' year={year}")

    records = rows[["date", "wqi", "risk_level", "cities_count",
                    "data_source"]].to_dict(orient="records")

    return {
        "country":      rows.iloc[0]["country"],
        "country_code": country_code.upper(),
        "months":       len(records),
        "history":      records,
    }
