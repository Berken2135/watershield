"""Single source of truth: 30 European cities used across all data fetchers.

Each entry carries lat/lon as floats, country, the nearest significant
water body, and water body type — used by downstream GeoJSON builders.
"""

from __future__ import annotations

CITIES: list[dict] = [
    # Poland (anchored to partner data region)
    {"city": "Wrocław",    "country": "Poland",      "lat": 51.1079, "lon": 17.0385, "water_body": "Odra",             "water_body_type": "river"},
    {"city": "Kraków",     "country": "Poland",      "lat": 50.0647, "lon": 19.9450, "water_body": "Wisła",            "water_body_type": "river"},
    {"city": "Warsaw",     "country": "Poland",      "lat": 52.2297, "lon": 21.0122, "water_body": "Wisła",            "water_body_type": "river"},
    # Western Europe
    {"city": "Berlin",     "country": "Germany",     "lat": 52.5200, "lon": 13.4050, "water_body": "Spree",            "water_body_type": "river"},
    {"city": "Paris",      "country": "France",      "lat": 48.8566, "lon":  2.3522, "water_body": "Seine",            "water_body_type": "river"},
    {"city": "Amsterdam",  "country": "Netherlands", "lat": 52.3676, "lon":  4.9041, "water_body": "Amstel",           "water_body_type": "river"},
    {"city": "Brussels",   "country": "Belgium",     "lat": 50.8503, "lon":  4.3517, "water_body": "Senne",            "water_body_type": "river"},
    {"city": "Luxembourg", "country": "Luxembourg",  "lat": 49.6117, "lon":  6.1319, "water_body": "Alzette",          "water_body_type": "river"},
    {"city": "Dublin",     "country": "Ireland",     "lat": 53.3498, "lon": -6.2603, "water_body": "Liffey",           "water_body_type": "river"},
    # Southern Europe
    {"city": "Madrid",     "country": "Spain",       "lat": 40.4168, "lon": -3.7038, "water_body": "Manzanares",       "water_body_type": "river"},
    {"city": "Lisbon",     "country": "Portugal",    "lat": 38.7223, "lon": -9.1393, "water_body": "Tagus",            "water_body_type": "river"},
    {"city": "Rome",       "country": "Italy",       "lat": 41.9028, "lon": 12.4964, "water_body": "Tiber",            "water_body_type": "river"},
    {"city": "Athens",     "country": "Greece",      "lat": 37.9838, "lon": 23.7275, "water_body": "Saronikos Gulf",   "water_body_type": "sea"},
    {"city": "Valletta",   "country": "Malta",       "lat": 35.8997, "lon": 14.5147, "water_body": "Grand Harbour",    "water_body_type": "sea"},
    {"city": "Nicosia",    "country": "Cyprus",      "lat": 35.1856, "lon": 33.3823, "water_body": "Pedieos",          "water_body_type": "river"},
    # Central Europe
    {"city": "Vienna",     "country": "Austria",     "lat": 48.2082, "lon": 16.3738, "water_body": "Danube",           "water_body_type": "river"},
    {"city": "Prague",     "country": "Czechia",     "lat": 50.0755, "lon": 14.4378, "water_body": "Vltava",           "water_body_type": "river"},
    {"city": "Budapest",   "country": "Hungary",     "lat": 47.4979, "lon": 19.0402, "water_body": "Danube",           "water_body_type": "river"},
    {"city": "Bratislava", "country": "Slovakia",    "lat": 48.1486, "lon": 17.1077, "water_body": "Danube",           "water_body_type": "river"},
    {"city": "Ljubljana",  "country": "Slovenia",    "lat": 46.0569, "lon": 14.5058, "water_body": "Ljubljanica",      "water_body_type": "river"},
    {"city": "Zagreb",     "country": "Croatia",     "lat": 45.8150, "lon": 15.9819, "water_body": "Sava",             "water_body_type": "river"},
    # Eastern Europe
    {"city": "Bucharest",  "country": "Romania",     "lat": 44.4268, "lon": 26.1025, "water_body": "Dâmbovița",        "water_body_type": "river"},
    {"city": "Sofia",      "country": "Bulgaria",    "lat": 42.6977, "lon": 23.3219, "water_body": "Vladaya",          "water_body_type": "river"},
    # Baltic states
    {"city": "Tallinn",    "country": "Estonia",     "lat": 59.4370, "lon": 24.7536, "water_body": "Gulf of Finland",  "water_body_type": "sea"},
    {"city": "Riga",       "country": "Latvia",      "lat": 56.9496, "lon": 24.1052, "water_body": "Daugava",          "water_body_type": "river"},
    {"city": "Vilnius",    "country": "Lithuania",   "lat": 54.6872, "lon": 25.2797, "water_body": "Neris",            "water_body_type": "river"},
    # Nordic
    {"city": "Stockholm",  "country": "Sweden",      "lat": 59.3293, "lon": 18.0686, "water_body": "Mälaren",          "water_body_type": "lake"},
    {"city": "Oslo",       "country": "Norway",      "lat": 59.9139, "lon": 10.7522, "water_body": "Oslofjord",        "water_body_type": "fjord"},
    {"city": "Helsinki",   "country": "Finland",     "lat": 60.1699, "lon": 24.9384, "water_body": "Gulf of Finland",  "water_body_type": "sea"},
    {"city": "Copenhagen", "country": "Denmark",     "lat": 55.6761, "lon": 12.5683, "water_body": "Øresund",          "water_body_type": "strait"},
]


def as_dataframe():
    """Return CITIES as a pandas DataFrame."""
    import pandas as pd
    return pd.DataFrame(CITIES)


if __name__ == "__main__":
    df = as_dataframe()
    print(f"{len(df)} cities")
    print(df.to_string(index=False))
