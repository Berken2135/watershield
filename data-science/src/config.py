"""Central path constants and column mappings for the WaterShield data-science module."""

from pathlib import Path

# ---------------------------------------------------------------------------
# Root paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]   # data-science/

DATA_RAW       = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"
DATA_OUTPUTS   = ROOT / "data" / "outputs"

for _d in (DATA_RAW, DATA_PROCESSED, DATA_OUTPUTS):
    _d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Raw file paths
# ---------------------------------------------------------------------------

WATERLY_CSV = DATA_RAW / "Waterly" / "dane_boja_20240817_1140-20241016_1140.csv"

_CASE2 = DATA_RAW / "MPWiK" / "Dane Cassini Hackathon" / "Case 2"
MPWIK_RPT_DIR  = _CASE2 / "Measurement points_data"
MPWIK_XLSX_DIR = _CASE2 / "Sample collection points_data"

URZAD_DIR = DATA_RAW / "Urząd Statystyczny we Wrocławiu"

# ---------------------------------------------------------------------------
# Processed parquet paths
# ---------------------------------------------------------------------------

WATERLY_PARQUET        = DATA_PROCESSED / "waterly.parquet"
MPWIK_MEASUREMENTS_PARQUET = DATA_PROCESSED / "mpwik_measurements.parquet"
MPWIK_SAMPLES_PARQUET  = DATA_PROCESSED / "mpwik_samples.parquet"
URZAD_META_JSON        = DATA_PROCESSED / "urzad_meta.json"

# ---------------------------------------------------------------------------
# Output paths
# ---------------------------------------------------------------------------

GEOJSON_OUT = DATA_OUTPUTS / "watershield_europe.geojson"
MODEL_OUT   = DATA_OUTPUTS / "model.pkl"

# ---------------------------------------------------------------------------
# Waterly column mapping  (Polish → English)
# ---------------------------------------------------------------------------

WATERLY_COLUMNS: dict[str, str] = {
    "UNIX":                         "unix_ts",
    "Czas (GMT+0)":                 "timestamp",
    "Temperatura wody [°C]":        "water_temp_c",
    "Indeks jakości [Waterly WQI]": "wqi",
    "Przewodność [uS/cm]":          "conductivity_us_cm",
    "Zasolenie [ppt]":              "salinity_ppt",
    "TDS [ppm]":                    "tds_ppm",
    "Odczyn pH":                    "ph",
    "Natlenienie [%]":              "oxygen_saturation_pct",
    "Ilość tlenu [mg/l]":           "oxygen_mg_l",
    "Temperatura powietrza [°C]":   "air_temp_c",
    "Wilgotność powietrza [%]":     "air_humidity_pct",
    "Ciśnienie powietrza [hPa]":    "air_pressure_hpa",
}

# ---------------------------------------------------------------------------
# MPWiK RPT parameter registry
# ---------------------------------------------------------------------------

MPWIK_PARAMS: dict[str, dict[str, str]] = {
    "QIA201":  {"parameter": "dissolved_oxygen", "unit": "mgO2/l", "station": "Oława-Stacja"},
    "QIA205":  {"parameter": "turbidity",        "unit": "NTU",    "station": "Oława-Stacja"},
    "QIA207":  {"parameter": "absorbance",       "unit": "1/m",    "station": "Oława-Stacja"},
    "QIA208":  {"parameter": "toc",              "unit": "mgC/l",  "station": "Oława-Stacja"},
    "QIR1001": {"parameter": "absorbance",       "unit": "1/m",    "station": "Oława-Śluza"},
    "QIR1002": {"parameter": "turbidity",        "unit": "NTU",    "station": "Oława-Śluza"},
}

# ---------------------------------------------------------------------------
# Risk thresholds (WQI → risk level)  — Waterly WQI: higher = better quality
# ---------------------------------------------------------------------------

WQI_RISK_LEVELS: list[tuple[float, str]] = [
    (80.0, "clean"),
    (60.0, "moderate"),
    (40.0, "high"),
    (0.0,  "critical"),
]


def wqi_to_risk(wqi: float) -> str:
    """Map a WQI value to a risk label."""
    for threshold, label in WQI_RISK_LEVELS:
        if wqi >= threshold:
            return label
    return "critical"
