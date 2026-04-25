"""All 106 cities used for historical WQI data and GeoJSON export.

The original 30 European cities (cities.py) are kept unchanged and used
by the ERA5/ECMWF fetchers.  This file extends the set to 106 for the
historical data pipeline and the global map view.

region values: "europe" | "americas" | "asia" | "middle_east" | "africa" | "oceania"
"""

from __future__ import annotations

CITIES_ALL: list[dict] = [

    # ── Europe: original 30 ───────────────────────────────────────────────────
    {"city": "Wrocław",      "country": "Poland",         "country_code": "PL", "lat": 51.1079, "lon":  17.0385, "water_body": "Odra",              "water_body_type": "river",   "region": "europe"},
    {"city": "Kraków",       "country": "Poland",         "country_code": "PL", "lat": 50.0647, "lon":  19.9450, "water_body": "Wisła",             "water_body_type": "river",   "region": "europe"},
    {"city": "Warsaw",       "country": "Poland",         "country_code": "PL", "lat": 52.2297, "lon":  21.0122, "water_body": "Wisła",             "water_body_type": "river",   "region": "europe"},
    {"city": "Berlin",       "country": "Germany",        "country_code": "DE", "lat": 52.5200, "lon":  13.4050, "water_body": "Spree",             "water_body_type": "river",   "region": "europe"},
    {"city": "Paris",        "country": "France",         "country_code": "FR", "lat": 48.8566, "lon":   2.3522, "water_body": "Seine",             "water_body_type": "river",   "region": "europe"},
    {"city": "Amsterdam",    "country": "Netherlands",    "country_code": "NL", "lat": 52.3676, "lon":   4.9041, "water_body": "Amstel",            "water_body_type": "river",   "region": "europe"},
    {"city": "Brussels",     "country": "Belgium",        "country_code": "BE", "lat": 50.8503, "lon":   4.3517, "water_body": "Senne",             "water_body_type": "river",   "region": "europe"},
    {"city": "Luxembourg",   "country": "Luxembourg",     "country_code": "LU", "lat": 49.6117, "lon":   6.1319, "water_body": "Alzette",           "water_body_type": "river",   "region": "europe"},
    {"city": "Dublin",       "country": "Ireland",        "country_code": "IE", "lat": 53.3498, "lon":  -6.2603, "water_body": "Liffey",            "water_body_type": "river",   "region": "europe"},
    {"city": "Madrid",       "country": "Spain",          "country_code": "ES", "lat": 40.4168, "lon":  -3.7038, "water_body": "Manzanares",        "water_body_type": "river",   "region": "europe"},
    {"city": "Lisbon",       "country": "Portugal",       "country_code": "PT", "lat": 38.7223, "lon":  -9.1393, "water_body": "Tagus",             "water_body_type": "river",   "region": "europe"},
    {"city": "Rome",         "country": "Italy",          "country_code": "IT", "lat": 41.9028, "lon":  12.4964, "water_body": "Tiber",             "water_body_type": "river",   "region": "europe"},
    {"city": "Athens",       "country": "Greece",         "country_code": "GR", "lat": 37.9838, "lon":  23.7275, "water_body": "Saronikos Gulf",    "water_body_type": "sea",     "region": "europe"},
    {"city": "Valletta",     "country": "Malta",          "country_code": "MT", "lat": 35.8997, "lon":  14.5147, "water_body": "Grand Harbour",     "water_body_type": "sea",     "region": "europe"},
    {"city": "Nicosia",      "country": "Cyprus",         "country_code": "CY", "lat": 35.1856, "lon":  33.3823, "water_body": "Pedieos",           "water_body_type": "river",   "region": "europe"},
    {"city": "Vienna",       "country": "Austria",        "country_code": "AT", "lat": 48.2082, "lon":  16.3738, "water_body": "Danube",            "water_body_type": "river",   "region": "europe"},
    {"city": "Prague",       "country": "Czechia",        "country_code": "CZ", "lat": 50.0755, "lon":  14.4378, "water_body": "Vltava",            "water_body_type": "river",   "region": "europe"},
    {"city": "Budapest",     "country": "Hungary",        "country_code": "HU", "lat": 47.4979, "lon":  19.0402, "water_body": "Danube",            "water_body_type": "river",   "region": "europe"},
    {"city": "Bratislava",   "country": "Slovakia",       "country_code": "SK", "lat": 48.1486, "lon":  17.1077, "water_body": "Danube",            "water_body_type": "river",   "region": "europe"},
    {"city": "Ljubljana",    "country": "Slovenia",       "country_code": "SI", "lat": 46.0569, "lon":  14.5058, "water_body": "Ljubljanica",       "water_body_type": "river",   "region": "europe"},
    {"city": "Zagreb",       "country": "Croatia",        "country_code": "HR", "lat": 45.8150, "lon":  15.9819, "water_body": "Sava",              "water_body_type": "river",   "region": "europe"},
    {"city": "Bucharest",    "country": "Romania",        "country_code": "RO", "lat": 44.4268, "lon":  26.1025, "water_body": "Dâmbovița",         "water_body_type": "river",   "region": "europe"},
    {"city": "Sofia",        "country": "Bulgaria",       "country_code": "BG", "lat": 42.6977, "lon":  23.3219, "water_body": "Vladaya",           "water_body_type": "river",   "region": "europe"},
    {"city": "Tallinn",      "country": "Estonia",        "country_code": "EE", "lat": 59.4370, "lon":  24.7536, "water_body": "Gulf of Finland",   "water_body_type": "sea",     "region": "europe"},
    {"city": "Riga",         "country": "Latvia",         "country_code": "LV", "lat": 56.9496, "lon":  24.1052, "water_body": "Daugava",           "water_body_type": "river",   "region": "europe"},
    {"city": "Vilnius",      "country": "Lithuania",      "country_code": "LT", "lat": 54.6872, "lon":  25.2797, "water_body": "Neris",             "water_body_type": "river",   "region": "europe"},
    {"city": "Stockholm",    "country": "Sweden",         "country_code": "SE", "lat": 59.3293, "lon":  18.0686, "water_body": "Mälaren",           "water_body_type": "lake",    "region": "europe"},
    {"city": "Oslo",         "country": "Norway",         "country_code": "NO", "lat": 59.9139, "lon":  10.7522, "water_body": "Oslofjord",         "water_body_type": "fjord",   "region": "europe"},
    {"city": "Helsinki",     "country": "Finland",        "country_code": "FI", "lat": 60.1699, "lon":  24.9384, "water_body": "Gulf of Finland",   "water_body_type": "sea",     "region": "europe"},
    {"city": "Copenhagen",   "country": "Denmark",        "country_code": "DK", "lat": 55.6761, "lon":  12.5683, "water_body": "Øresund",           "water_body_type": "strait",  "region": "europe"},

    # ── Europe: additional cities ─────────────────────────────────────────────
    {"city": "London",       "country": "United Kingdom", "country_code": "GB", "lat": 51.5074, "lon":  -0.1278, "water_body": "Thames",            "water_body_type": "river",   "region": "europe"},
    {"city": "Manchester",   "country": "United Kingdom", "country_code": "GB", "lat": 53.4808, "lon":  -2.2426, "water_body": "Irwell",            "water_body_type": "river",   "region": "europe"},
    {"city": "Edinburgh",    "country": "United Kingdom", "country_code": "GB", "lat": 55.9533, "lon":  -3.1883, "water_body": "Water of Leith",    "water_body_type": "river",   "region": "europe"},
    {"city": "Hamburg",      "country": "Germany",        "country_code": "DE", "lat": 53.5488, "lon":   9.9872, "water_body": "Elbe",              "water_body_type": "river",   "region": "europe"},
    {"city": "Munich",       "country": "Germany",        "country_code": "DE", "lat": 48.1351, "lon":  11.5820, "water_body": "Isar",              "water_body_type": "river",   "region": "europe"},
    {"city": "Cologne",      "country": "Germany",        "country_code": "DE", "lat": 50.9333, "lon":   6.9500, "water_body": "Rhine",             "water_body_type": "river",   "region": "europe"},
    {"city": "Lyon",         "country": "France",         "country_code": "FR", "lat": 45.7640, "lon":   4.8357, "water_body": "Rhône",             "water_body_type": "river",   "region": "europe"},
    {"city": "Marseille",    "country": "France",         "country_code": "FR", "lat": 43.2965, "lon":   5.3698, "water_body": "Mediterranean Sea", "water_body_type": "sea",     "region": "europe"},
    {"city": "Bordeaux",     "country": "France",         "country_code": "FR", "lat": 44.8378, "lon":  -0.5792, "water_body": "Garonne",           "water_body_type": "river",   "region": "europe"},
    {"city": "Milan",        "country": "Italy",          "country_code": "IT", "lat": 45.4654, "lon":   9.1859, "water_body": "Navigli Canal",     "water_body_type": "canal",   "region": "europe"},
    {"city": "Naples",       "country": "Italy",          "country_code": "IT", "lat": 40.8518, "lon":  14.2681, "water_body": "Bay of Naples",     "water_body_type": "sea",     "region": "europe"},
    {"city": "Venice",       "country": "Italy",          "country_code": "IT", "lat": 45.4408, "lon":  12.3155, "water_body": "Venetian Lagoon",   "water_body_type": "lagoon",  "region": "europe"},
    {"city": "Barcelona",    "country": "Spain",          "country_code": "ES", "lat": 41.3851, "lon":   2.1734, "water_body": "Besòs",             "water_body_type": "river",   "region": "europe"},
    {"city": "Seville",      "country": "Spain",          "country_code": "ES", "lat": 37.3891, "lon":  -5.9845, "water_body": "Guadalquivir",      "water_body_type": "river",   "region": "europe"},
    {"city": "Valencia",     "country": "Spain",          "country_code": "ES", "lat": 39.4699, "lon":  -0.3763, "water_body": "Turia",             "water_body_type": "river",   "region": "europe"},
    {"city": "Porto",        "country": "Portugal",       "country_code": "PT", "lat": 41.1579, "lon":  -8.6291, "water_body": "Douro",             "water_body_type": "river",   "region": "europe"},
    {"city": "Rotterdam",    "country": "Netherlands",    "country_code": "NL", "lat": 51.9244, "lon":   4.4777, "water_body": "Rhine-Meuse",       "water_body_type": "river",   "region": "europe"},
    {"city": "Antwerp",      "country": "Belgium",        "country_code": "BE", "lat": 51.2194, "lon":   4.4025, "water_body": "Scheldt",           "water_body_type": "river",   "region": "europe"},
    {"city": "Gdańsk",       "country": "Poland",         "country_code": "PL", "lat": 54.3520, "lon":  18.6466, "water_body": "Motława",           "water_body_type": "river",   "region": "europe"},
    {"city": "Poznań",       "country": "Poland",         "country_code": "PL", "lat": 52.4064, "lon":  16.9252, "water_body": "Warta",             "water_body_type": "river",   "region": "europe"},
    {"city": "Zurich",       "country": "Switzerland",    "country_code": "CH", "lat": 47.3769, "lon":   8.5417, "water_body": "Limmat",            "water_body_type": "river",   "region": "europe"},
    {"city": "Geneva",       "country": "Switzerland",    "country_code": "CH", "lat": 46.2044, "lon":   6.1432, "water_body": "Rhône",             "water_body_type": "river",   "region": "europe"},
    {"city": "Belgrade",     "country": "Serbia",         "country_code": "RS", "lat": 44.7866, "lon":  20.4489, "water_body": "Sava",              "water_body_type": "river",   "region": "europe"},
    {"city": "Kyiv",         "country": "Ukraine",        "country_code": "UA", "lat": 50.4501, "lon":  30.5234, "water_body": "Dnieper",           "water_body_type": "river",   "region": "europe"},
    {"city": "Istanbul",     "country": "Turkey",         "country_code": "TR", "lat": 41.0082, "lon":  28.9784, "water_body": "Bosphorus",         "water_body_type": "strait",  "region": "europe"},
    {"city": "Sarajevo",     "country": "Bosnia",         "country_code": "BA", "lat": 43.8563, "lon":  18.4131, "water_body": "Miljacka",          "water_body_type": "river",   "region": "europe"},

    # ── North America ─────────────────────────────────────────────────────────
    {"city": "New York",     "country": "United States",  "country_code": "US", "lat": 40.7128, "lon": -74.0060, "water_body": "Hudson River",      "water_body_type": "river",   "region": "americas"},
    {"city": "Los Angeles",  "country": "United States",  "country_code": "US", "lat": 34.0522, "lon":-118.2437, "water_body": "Los Angeles River", "water_body_type": "river",   "region": "americas"},
    {"city": "Chicago",      "country": "United States",  "country_code": "US", "lat": 41.8781, "lon": -87.6298, "water_body": "Lake Michigan",     "water_body_type": "lake",    "region": "americas"},
    {"city": "Houston",      "country": "United States",  "country_code": "US", "lat": 29.7604, "lon": -95.3698, "water_body": "Buffalo Bayou",     "water_body_type": "river",   "region": "americas"},
    {"city": "Miami",        "country": "United States",  "country_code": "US", "lat": 25.7617, "lon": -80.1918, "water_body": "Biscayne Bay",      "water_body_type": "bay",     "region": "americas"},
    {"city": "Toronto",      "country": "Canada",         "country_code": "CA", "lat": 43.6532, "lon": -79.3832, "water_body": "Lake Ontario",      "water_body_type": "lake",    "region": "americas"},
    {"city": "Vancouver",    "country": "Canada",         "country_code": "CA", "lat": 49.2827, "lon":-123.1207, "water_body": "Burrard Inlet",     "water_body_type": "inlet",   "region": "americas"},
    {"city": "Montreal",     "country": "Canada",         "country_code": "CA", "lat": 45.5017, "lon": -73.5673, "water_body": "St. Lawrence",      "water_body_type": "river",   "region": "americas"},
    {"city": "Mexico City",  "country": "Mexico",         "country_code": "MX", "lat": 19.4326, "lon": -99.1332, "water_body": "Texcoco Lake",      "water_body_type": "lake",    "region": "americas"},

    # ── Latin America ─────────────────────────────────────────────────────────
    {"city": "São Paulo",    "country": "Brazil",         "country_code": "BR", "lat":-23.5505, "lon": -46.6333, "water_body": "Tietê",             "water_body_type": "river",   "region": "americas"},
    {"city": "Rio de Janeiro","country": "Brazil",        "country_code": "BR", "lat":-22.9068, "lon": -43.1729, "water_body": "Guanabara Bay",     "water_body_type": "bay",     "region": "americas"},
    {"city": "Buenos Aires", "country": "Argentina",      "country_code": "AR", "lat":-34.6037, "lon": -58.3816, "water_body": "Río de la Plata",   "water_body_type": "river",   "region": "americas"},
    {"city": "Bogotá",       "country": "Colombia",       "country_code": "CO", "lat":  4.7110, "lon": -74.0721, "water_body": "Bogotá River",      "water_body_type": "river",   "region": "americas"},
    {"city": "Lima",         "country": "Peru",           "country_code": "PE", "lat":-12.0464, "lon": -77.0428, "water_body": "Rímac",             "water_body_type": "river",   "region": "americas"},
    {"city": "Santiago",     "country": "Chile",          "country_code": "CL", "lat":-33.4489, "lon": -70.6693, "water_body": "Mapocho",           "water_body_type": "river",   "region": "americas"},

    # ── Asia ─────────────────────────────────────────────────────────────────
    {"city": "Tokyo",        "country": "Japan",          "country_code": "JP", "lat": 35.6762, "lon": 139.6503, "water_body": "Sumida",            "water_body_type": "river",   "region": "asia"},
    {"city": "Osaka",        "country": "Japan",          "country_code": "JP", "lat": 34.6937, "lon": 135.5023, "water_body": "Yodo",              "water_body_type": "river",   "region": "asia"},
    {"city": "Seoul",        "country": "South Korea",    "country_code": "KR", "lat": 37.5665, "lon": 126.9780, "water_body": "Han",               "water_body_type": "river",   "region": "asia"},
    {"city": "Beijing",      "country": "China",          "country_code": "CN", "lat": 39.9042, "lon": 116.4074, "water_body": "Yongding",          "water_body_type": "river",   "region": "asia"},
    {"city": "Shanghai",     "country": "China",          "country_code": "CN", "lat": 31.2304, "lon": 121.4737, "water_body": "Huangpu",           "water_body_type": "river",   "region": "asia"},
    {"city": "Mumbai",       "country": "India",          "country_code": "IN", "lat": 19.0760, "lon":  72.8777, "water_body": "Ulhas",             "water_body_type": "river",   "region": "asia"},
    {"city": "Delhi",        "country": "India",          "country_code": "IN", "lat": 28.6139, "lon":  77.2090, "water_body": "Yamuna",            "water_body_type": "river",   "region": "asia"},
    {"city": "Dhaka",        "country": "Bangladesh",     "country_code": "BD", "lat": 23.8103, "lon":  90.4125, "water_body": "Buriganga",         "water_body_type": "river",   "region": "asia"},
    {"city": "Bangkok",      "country": "Thailand",       "country_code": "TH", "lat": 13.7563, "lon": 100.5018, "water_body": "Chao Phraya",       "water_body_type": "river",   "region": "asia"},
    {"city": "Singapore",    "country": "Singapore",      "country_code": "SG", "lat":  1.3521, "lon": 103.8198, "water_body": "Singapore River",   "water_body_type": "river",   "region": "asia"},
    {"city": "Jakarta",      "country": "Indonesia",      "country_code": "ID", "lat": -6.2088, "lon": 106.8456, "water_body": "Ciliwung",          "water_body_type": "river",   "region": "asia"},
    {"city": "Karachi",      "country": "Pakistan",       "country_code": "PK", "lat": 24.8607, "lon":  67.0011, "water_body": "Lyari",             "water_body_type": "river",   "region": "asia"},
    {"city": "Ho Chi Minh",  "country": "Vietnam",        "country_code": "VN", "lat": 10.8231, "lon": 106.6297, "water_body": "Saigon",            "water_body_type": "river",   "region": "asia"},
    {"city": "Kuala Lumpur", "country": "Malaysia",       "country_code": "MY", "lat":  3.1390, "lon": 101.6869, "water_body": "Klang",             "water_body_type": "river",   "region": "asia"},

    # ── Middle East ───────────────────────────────────────────────────────────
    {"city": "Dubai",        "country": "UAE",            "country_code": "AE", "lat": 25.2048, "lon":  55.2708, "water_body": "Dubai Creek",       "water_body_type": "creek",   "region": "middle_east"},
    {"city": "Tehran",       "country": "Iran",           "country_code": "IR", "lat": 35.6892, "lon":  51.3890, "water_body": "Jajrood",           "water_body_type": "river",   "region": "middle_east"},
    {"city": "Riyadh",       "country": "Saudi Arabia",   "country_code": "SA", "lat": 24.6877, "lon":  46.7219, "water_body": "Wadi Hanifah",      "water_body_type": "river",   "region": "middle_east"},
    {"city": "Beirut",       "country": "Lebanon",        "country_code": "LB", "lat": 33.8938, "lon":  35.5018, "water_body": "Mediterranean Sea", "water_body_type": "sea",     "region": "middle_east"},

    # ── Africa ───────────────────────────────────────────────────────────────
    {"city": "Cairo",        "country": "Egypt",          "country_code": "EG", "lat": 30.0444, "lon":  31.2357, "water_body": "Nile",              "water_body_type": "river",   "region": "africa"},
    {"city": "Lagos",        "country": "Nigeria",        "country_code": "NG", "lat":  6.5244, "lon":   3.3792, "water_body": "Lagos Lagoon",      "water_body_type": "lagoon",  "region": "africa"},
    {"city": "Nairobi",      "country": "Kenya",          "country_code": "KE", "lat": -1.2921, "lon":  36.8219, "water_body": "Nairobi River",     "water_body_type": "river",   "region": "africa"},
    {"city": "Kinshasa",     "country": "DR Congo",       "country_code": "CD", "lat": -4.3217, "lon":  15.3222, "water_body": "Congo",             "water_body_type": "river",   "region": "africa"},
    {"city": "Casablanca",   "country": "Morocco",        "country_code": "MA", "lat": 33.5731, "lon":  -7.5898, "water_body": "Atlantic Ocean",    "water_body_type": "sea",     "region": "africa"},
    {"city": "Cape Town",    "country": "South Africa",   "country_code": "ZA", "lat":-33.9249, "lon":  18.4241, "water_body": "Table Bay",         "water_body_type": "bay",     "region": "africa"},
    {"city": "Johannesburg", "country": "South Africa",   "country_code": "ZA", "lat":-26.2041, "lon":  28.0473, "water_body": "Vaal",              "water_body_type": "river",   "region": "africa"},
    {"city": "Accra",        "country": "Ghana",          "country_code": "GH", "lat":  5.6037, "lon":  -0.1870, "water_body": "Gulf of Guinea",    "water_body_type": "sea",     "region": "africa"},

    # ── Oceania ───────────────────────────────────────────────────────────────
    {"city": "Sydney",       "country": "Australia",      "country_code": "AU", "lat":-33.8688, "lon": 151.2093, "water_body": "Parramatta",        "water_body_type": "river",   "region": "oceania"},
    {"city": "Melbourne",    "country": "Australia",      "country_code": "AU", "lat":-37.8136, "lon": 144.9631, "water_body": "Yarra",             "water_body_type": "river",   "region": "oceania"},
    {"city": "Brisbane",     "country": "Australia",      "country_code": "AU", "lat":-27.4698, "lon": 153.0251, "water_body": "Brisbane River",    "water_body_type": "river",   "region": "oceania"},
    {"city": "Auckland",     "country": "New Zealand",    "country_code": "NZ", "lat":-36.8485, "lon": 174.7633, "water_body": "Waitematā Harbour", "water_body_type": "harbour", "region": "oceania"},
    {"city": "Perth",        "country": "Australia",      "country_code": "AU", "lat":-31.9505, "lon": 115.8605, "water_body": "Swan",              "water_body_type": "river",   "region": "oceania"},
]


def as_dataframe():
    import pandas as pd
    return pd.DataFrame(CITIES_ALL)


if __name__ == "__main__":
    df = as_dataframe()
    print(f"{len(df)} cities across {df['country'].nunique()} countries")
    print(df.groupby("region")["city"].count().to_string())
