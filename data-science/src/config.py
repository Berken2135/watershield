"""Central path constants and column mappings for the WaterShield data-science module."""

from pathlib import Path

# ---------------------------------------------------------------------------
# Root paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]   # data-science/

DATA_RAW       = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"
DATA_OUTPUTS   = ROOT / "data" / "outputs"

# Sub-directories created on import so modules never have to mkdir themselves
for _d in (DATA_RAW, DATA_PROCESSED, DATA_OUTPUTS, DATA_PROCESSED / "europe"):
    _d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Raw file paths (populated by user after extraction)
# ---------------------------------------------------------------------------

WATERLY_CSV = DATA_RAW / "dane_boja_20240817_1140-20241016_1140.csv"

MPWIK_RPT_DIR  = DATA_RAW / "Measurement points_data"
MPWIK_XLSX_DIR = DATA_RAW / "Sample collection points_data"
URZAD_DIR      = DATA_RAW / "urzad"

# ---------------------------------------------------------------------------
# Processed parquet paths
# ---------------------------------------------------------------------------

WATERLY_PARQUET   = DATA_PROCESSED / "waterly.parquet"
MPWIK_RPT_PARQUET = DATA_PROCESSED / "mpwik_rpt.parquet"
MPWIK_XLSX_PARQUET = DATA_PROCESSED / "mpwik_xlsx.parquet"
URZAD_PARQUET     = DATA_PROCESSED / "urzad.parquet"

# ---------------------------------------------------------------------------
# Output paths
# ---------------------------------------------------------------------------

GEOJSON_OUT  = DATA_OUTPUTS / "watershield_europe.geojson"
MODEL_OUT    = DATA_OUTPUTS / "model.pkl"

# ---------------------------------------------------------------------------
# Waterly column mapping  (Polish → English)
# ---------------------------------------------------------------------------

WATERLY_COLUMNS: dict[str, str] = {
    "UNIX":                        "unix_ts",
    "Czas (GMT+0)":                "timestamp",
    "Temperatura wody [°C]":       "water_temp_c",
    "Indeks jakości [Waterly WQI]": "wqi",
    "Przewodność [uS/cm]":         "conductivity_us_cm",
    "Zasolenie [ppt]":             "salinity_ppt",
    "TDS [ppm]":                   "tds_ppm",
    "Odczyn pH":                   "ph",
    "Natlenienie [%]":             "oxygen_saturation_pct",
    "Ilość tlenu [mg/l]":          "dissolved_oxygen_mg_l",
    "Temperatura powietrza [°C]":  "air_temp_c",
    "Wilgotność powietrza [%]":    "air_humidity_pct",
    "Ciśnienie powietrza [hPa]":   "air_pressure_hpa",
}

# ---------------------------------------------------------------------------
# MPWiK RPT parameter registry
# ---------------------------------------------------------------------------

MPWIK_PARAMS: dict[str, dict[str, str]] = {
    "QIA201": {"param": "dissolved_oxygen_mg_l",  "unit": "mgO2/l",  "station": "Oława - Stacja Oława"},
    "QIA205": {"param": "turbidity_ntu",           "unit": "NTU",     "station": "Oława - Stacja Oława"},
    "QIA207": {"param": "absorbance_1_m",          "unit": "1/m",     "station": "Oława - Stacja Oława"},
    "QIA208": {"param": "toc_mg_l",                "unit": "mgC/l",   "station": "Oława - Stacja Oława"},
    "QIR1001": {"param": "absorbance_1_m",         "unit": "1/m",     "station": "Oława śluza dolna"},
    "QIR1002": {"param": "turbidity_ntu",          "unit": "NTU",     "station": "Oława śluza dolna"},
}

# ---------------------------------------------------------------------------
# Risk thresholds (WQI → risk level)
# Waterly WQI: higher = better quality
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
