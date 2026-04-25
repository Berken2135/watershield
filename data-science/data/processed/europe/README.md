# European Climate Data — Processed Outputs

Parquet files produced by `src/european_data/`. All data is sourced from
public APIs (no partner data, no PII).

---

## Files

| File | Resolution | Period | Source |
|------|-----------|--------|--------|
| `era5_cities.parquet` | Monthly | 2024-01–2024-12 | ERA5 via Open-Meteo / CDS API |
| `hsaf_soil_moisture.parquet` | Monthly | 2024-01–2024-12 | ERA5-Land via Open-Meteo (H-SAF proxy) |
| `ecmwf_forecast.parquet` | Daily (7-day) | rolling forecast | ECMWF IFS via Open-Meteo |
| `europe_combined.parquet` | Mixed | mixed | All of the above merged |

---

## Schema

### `era5_cities.parquet`

| Column | Type | Description |
|--------|------|-------------|
| `city` | str | City name |
| `country` | str | Country name |
| `lat` | float64 | Latitude (WGS84) |
| `lon` | float64 | Longitude (WGS84) |
| `date` | str | First of month, YYYY-MM-DD |
| `temperature_c` | float64 | Monthly mean 2 m temperature (°C) |
| `precipitation_mm` | float64 | Monthly total precipitation (mm) |
| `snow_cover_cm` | float64 | Monthly total snowfall (cm water equivalent) |
| `source` | str | `"ERA5 (Open-Meteo)"` or `"ERA5 (CDS)"` |

### `hsaf_soil_moisture.parquet`

| Column | Type | Description |
|--------|------|-------------|
| `city` | str | City name |
| `country` | str | Country name |
| `lat` | float64 | Latitude (WGS84) |
| `lon` | float64 | Longitude (WGS84) |
| `date` | str | First of month, YYYY-MM-DD |
| `soil_moisture_m3m3` | float64 | Volumetric soil moisture 0–7 cm (m³/m³) |
| `source` | str | `"ERA5-Land (Open-Meteo) — H-SAF proxy"` |

> **Note**: Full ASCAT-based H-SAF products (H10 surface SWI, H14 profile SWI,
> H26 precipitation) require free registration at https://hsaf.meteoam.it/.
> ERA5-Land soil moisture is used here as a physics-consistent proxy (it is
> the background field for H-SAF retrievals).

### `ecmwf_forecast.parquet`

| Column | Type | Description |
|--------|------|-------------|
| `city` | str | City name |
| `country` | str | Country name |
| `lat` | float64 | Latitude (WGS84) |
| `lon` | float64 | Longitude (WGS84) |
| `date` | str | Forecast date, YYYY-MM-DD |
| `temperature_max_c` | float64 | Daily maximum 2 m temperature (°C) |
| `temperature_min_c` | float64 | Daily minimum 2 m temperature (°C) |
| `precipitation_mm` | float64 | Daily precipitation sum (mm) |
| `source` | str | `"ECMWF IFS (Open-Meteo)"` or `"ECMWF IFS (ecmwf-opendata)"` |

### `europe_combined.parquet`

Merged view of all three sources. Forecast rows have `snow_cover` and
`soil_moisture` as `null` (those products are historical/monthly only).

| Column | Type | Description |
|--------|------|-------------|
| `city` | str | City name |
| `country` | str | Country name |
| `lat` | float64 | Latitude (WGS84) |
| `lon` | float64 | Longitude (WGS84) |
| `date` | str | YYYY-MM-DD |
| `temperature` | float64 | °C (monthly mean or daily mean of max/min) |
| `precipitation` | float64 | mm |
| `snow_cover` | float64 | cm w.e. (null for forecast rows) |
| `soil_moisture` | float64 | m³/m³ (null for forecast rows) |
| `source` | str | Original source string |

---

## Cities Covered

30 European cities across all EU member states + Norway
(defined in `src/european_data/cities.py`):

Poland (Wrocław, Kraków, Warsaw), Germany (Berlin), France (Paris),
Netherlands (Amsterdam), Belgium (Brussels), Luxembourg, Ireland (Dublin),
Spain (Madrid), Portugal (Lisbon), Italy (Rome), Greece (Athens),
Malta (Valletta), Cyprus (Nicosia), Austria (Vienna), Czechia (Prague),
Hungary (Budapest), Slovakia (Bratislava), Slovenia (Ljubljana),
Croatia (Zagreb), Romania (Bucharest), Bulgaria (Sofia),
Estonia (Tallinn), Latvia (Riga), Lithuania (Vilnius),
Sweden (Stockholm), Norway (Oslo), Finland (Helsinki), Denmark (Copenhagen).

---

## Optional: Copernicus CDS API Key

The ERA5 fetcher (`copernicus_climate.py`) will use the free
[Copernicus Climate Data Store](https://cds.climate.copernicus.eu/) API
when a key is configured. Without a key it falls back to Open-Meteo
(same ERA5 data, no auth required).

**To configure CDS API access (free):**

1. Register at https://cds.climate.copernicus.eu/user/register
2. Log in and go to **My profile → API key**
3. Create `~/.cdsapirc`:

```
url: https://cds.climate.copernicus.eu/api/v2
key: <UID>:<API-KEY>
```

4. Install the client: `pip install cdsapi`

The fetcher auto-detects `~/.cdsapirc` and uses CDS if present.

---

## Optional: H-SAF Full Products

To access ASCAT-based SWI (H10, H14) and precipitation (H26):

1. Register free at https://hsaf.meteoam.it/
2. FTP/HTTP credentials are emailed within 1–2 business days
3. Products are available in BUFR/HDF5 format via FTP

This module uses ERA5-Land as a proxy. For operational use, replace
the Open-Meteo call in `eumetsat_hsaf.py` with direct H-SAF product
download via the registered FTP credentials.
