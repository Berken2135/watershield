"""105 European river monitoring points.

Geography rule: EU member states + UK + Norway + Switzerland + Iceland +
Balkans (Serbia, Bosnia, N. Macedonia, Kosovo, Albania, Montenegro) +
Ukraine + Moldova.  Nothing east of the Urals, nothing outside Europe.

Each entry exposes a `city` field (= unique key used by the ERA5/ECMWF
fetchers) so no changes are needed to the fetcher logic — they just
iterate the list and use city/lat/lon/country.

Bounding box validation: all points satisfy lat ∈ [35, 71], lon ∈ [-25, 45].
"""

from __future__ import annotations

RIVERS: list[dict] = [

    # ── Poland (8) ────────────────────────────────────────────────────────────
    # Odra at Wrocław is the REAL-DATA river (Waterly buoy).
    {"river_name": "Odra",    "representative_city": "Wrocław",            "country": "Poland",         "country_code": "PL", "lat": 51.1079, "lon": 17.0385, "basin": "Oder",     "city": "Odra (Wrocław)"},
    {"river_name": "Vistula", "representative_city": "Warsaw",             "country": "Poland",         "country_code": "PL", "lat": 52.2297, "lon": 21.0122, "basin": "Vistula",  "city": "Vistula (Warsaw)"},
    {"river_name": "Vistula", "representative_city": "Kraków",             "country": "Poland",         "country_code": "PL", "lat": 50.0647, "lon": 19.9450, "basin": "Vistula",  "city": "Vistula (Kraków)"},
    {"river_name": "Warta",   "representative_city": "Poznań",             "country": "Poland",         "country_code": "PL", "lat": 52.4064, "lon": 16.9252, "basin": "Oder",     "city": "Warta (Poznań)"},
    {"river_name": "Bug",     "representative_city": "Brest",              "country": "Poland",         "country_code": "PL", "lat": 52.0975, "lon": 23.6877, "basin": "Vistula",  "city": "Bug (Brest)"},
    {"river_name": "San",     "representative_city": "Przemyśl",           "country": "Poland",         "country_code": "PL", "lat": 49.7839, "lon": 22.7681, "basin": "Vistula",  "city": "San (Przemyśl)"},
    {"river_name": "Pilica",  "representative_city": "Tomaszów Maz.",      "country": "Poland",         "country_code": "PL", "lat": 51.5274, "lon": 20.0139, "basin": "Vistula",  "city": "Pilica (Tomaszów)"},
    {"river_name": "Narew",   "representative_city": "Łomża",              "country": "Poland",         "country_code": "PL", "lat": 53.1780, "lon": 22.0612, "basin": "Vistula",  "city": "Narew (Łomża)"},

    # ── Germany (10) ──────────────────────────────────────────────────────────
    {"river_name": "Rhine",   "representative_city": "Cologne",            "country": "Germany",        "country_code": "DE", "lat": 50.9380, "lon":  6.9590, "basin": "Rhine",    "city": "Rhine (Cologne)"},
    {"river_name": "Rhine",   "representative_city": "Düsseldorf",         "country": "Germany",        "country_code": "DE", "lat": 51.2217, "lon":  6.7762, "basin": "Rhine",    "city": "Rhine (Düsseldorf)"},
    {"river_name": "Elbe",    "representative_city": "Hamburg",            "country": "Germany",        "country_code": "DE", "lat": 53.5488, "lon":  9.9872, "basin": "Elbe",     "city": "Elbe (Hamburg)"},
    {"river_name": "Elbe",    "representative_city": "Dresden",            "country": "Germany",        "country_code": "DE", "lat": 51.0504, "lon": 13.7373, "basin": "Elbe",     "city": "Elbe (Dresden)"},
    {"river_name": "Danube",  "representative_city": "Regensburg",         "country": "Germany",        "country_code": "DE", "lat": 49.0134, "lon": 12.1016, "basin": "Danube",   "city": "Danube (Regensburg)"},
    {"river_name": "Main",    "representative_city": "Frankfurt",          "country": "Germany",        "country_code": "DE", "lat": 50.1109, "lon":  8.6821, "basin": "Rhine",    "city": "Main (Frankfurt)"},
    {"river_name": "Spree",   "representative_city": "Berlin",             "country": "Germany",        "country_code": "DE", "lat": 52.5200, "lon": 13.4050, "basin": "Elbe",     "city": "Spree (Berlin)"},
    {"river_name": "Weser",   "representative_city": "Bremen",             "country": "Germany",        "country_code": "DE", "lat": 53.0793, "lon":  8.8017, "basin": "Weser",    "city": "Weser (Bremen)"},
    {"river_name": "Neckar",  "representative_city": "Stuttgart",          "country": "Germany",        "country_code": "DE", "lat": 48.7758, "lon":  9.1829, "basin": "Rhine",    "city": "Neckar (Stuttgart)"},
    {"river_name": "Isar",    "representative_city": "Munich",             "country": "Germany",        "country_code": "DE", "lat": 48.1351, "lon": 11.5820, "basin": "Danube",   "city": "Isar (Munich)"},

    # ── France (8) ────────────────────────────────────────────────────────────
    {"river_name": "Seine",   "representative_city": "Paris",              "country": "France",         "country_code": "FR", "lat": 48.8566, "lon":  2.3522, "basin": "Seine",    "city": "Seine (Paris)"},
    {"river_name": "Rhône",   "representative_city": "Lyon",               "country": "France",         "country_code": "FR", "lat": 45.7640, "lon":  4.8357, "basin": "Rhône",    "city": "Rhône (Lyon)"},
    {"river_name": "Rhône",   "representative_city": "Avignon",            "country": "France",         "country_code": "FR", "lat": 43.9493, "lon":  4.8059, "basin": "Rhône",    "city": "Rhône (Avignon)"},
    {"river_name": "Loire",   "representative_city": "Nantes",             "country": "France",         "country_code": "FR", "lat": 47.2184, "lon": -1.5536, "basin": "Loire",    "city": "Loire (Nantes)"},
    {"river_name": "Loire",   "representative_city": "Orléans",            "country": "France",         "country_code": "FR", "lat": 47.9029, "lon":  1.9090, "basin": "Loire",    "city": "Loire (Orléans)"},
    {"river_name": "Garonne", "representative_city": "Bordeaux",           "country": "France",         "country_code": "FR", "lat": 44.8378, "lon": -0.5792, "basin": "Garonne",  "city": "Garonne (Bordeaux)"},
    {"river_name": "Marne",   "representative_city": "Châlons",            "country": "France",         "country_code": "FR", "lat": 48.9573, "lon":  4.3641, "basin": "Seine",    "city": "Marne (Châlons)"},
    {"river_name": "Saône",   "representative_city": "Chalon-sur-Saône",   "country": "France",         "country_code": "FR", "lat": 46.7800, "lon":  4.8530, "basin": "Rhône",    "city": "Saône (Chalon)"},

    # ── United Kingdom (5) ────────────────────────────────────────────────────
    {"river_name": "Thames",  "representative_city": "London",             "country": "United Kingdom", "country_code": "GB", "lat": 51.5074, "lon": -0.1278, "basin": "Thames",   "city": "Thames (London)"},
    {"river_name": "Severn",  "representative_city": "Bristol",            "country": "United Kingdom", "country_code": "GB", "lat": 51.4545, "lon": -2.5960, "basin": "Severn",   "city": "Severn (Bristol)"},
    {"river_name": "Mersey",  "representative_city": "Liverpool",          "country": "United Kingdom", "country_code": "GB", "lat": 53.4084, "lon": -2.9916, "basin": "Mersey",   "city": "Mersey (Liverpool)"},
    {"river_name": "Tyne",    "representative_city": "Newcastle",          "country": "United Kingdom", "country_code": "GB", "lat": 54.9783, "lon": -1.6178, "basin": "Tyne",     "city": "Tyne (Newcastle)"},
    {"river_name": "Clyde",   "representative_city": "Glasgow",            "country": "United Kingdom", "country_code": "GB", "lat": 55.8642, "lon": -4.2518, "basin": "Clyde",    "city": "Clyde (Glasgow)"},

    # ── Italy (6) ─────────────────────────────────────────────────────────────
    {"river_name": "Po",      "representative_city": "Turin",              "country": "Italy",          "country_code": "IT", "lat": 45.0703, "lon":  7.6869, "basin": "Po",       "city": "Po (Turin)"},
    {"river_name": "Po",      "representative_city": "Ferrara",            "country": "Italy",          "country_code": "IT", "lat": 44.8354, "lon": 11.6195, "basin": "Po",       "city": "Po (Ferrara)"},
    {"river_name": "Tiber",   "representative_city": "Rome",               "country": "Italy",          "country_code": "IT", "lat": 41.9028, "lon": 12.4964, "basin": "Tiber",    "city": "Tiber (Rome)"},
    {"river_name": "Arno",    "representative_city": "Florence",           "country": "Italy",          "country_code": "IT", "lat": 43.7696, "lon": 11.2558, "basin": "Arno",     "city": "Arno (Florence)"},
    {"river_name": "Adige",   "representative_city": "Verona",             "country": "Italy",          "country_code": "IT", "lat": 45.4384, "lon": 10.9916, "basin": "Adige",    "city": "Adige (Verona)"},
    {"river_name": "Piave",   "representative_city": "Belluno",            "country": "Italy",          "country_code": "IT", "lat": 46.1383, "lon": 12.2183, "basin": "Piave",    "city": "Piave (Belluno)"},

    # ── Spain (5) ─────────────────────────────────────────────────────────────
    {"river_name": "Ebro",         "representative_city": "Zaragoza",      "country": "Spain",          "country_code": "ES", "lat": 41.6488, "lon": -0.8891, "basin": "Ebro",         "city": "Ebro (Zaragoza)"},
    {"river_name": "Tagus",        "representative_city": "Toledo",        "country": "Spain",          "country_code": "ES", "lat": 39.8628, "lon": -4.0273, "basin": "Tagus",        "city": "Tagus (Toledo)"},
    {"river_name": "Guadalquivir", "representative_city": "Seville",       "country": "Spain",          "country_code": "ES", "lat": 37.3891, "lon": -5.9845, "basin": "Guadalquivir", "city": "Guadalquivir (Seville)"},
    {"river_name": "Duero",        "representative_city": "Valladolid",    "country": "Spain",          "country_code": "ES", "lat": 41.6523, "lon": -4.7245, "basin": "Duero",        "city": "Duero (Valladolid)"},
    {"river_name": "Miño",         "representative_city": "Ourense",       "country": "Spain",          "country_code": "ES", "lat": 42.3400, "lon": -7.8641, "basin": "Miño",         "city": "Miño (Ourense)"},

    # ── Netherlands (3) ───────────────────────────────────────────────────────
    {"river_name": "Rhine",  "representative_city": "Rotterdam",           "country": "Netherlands",    "country_code": "NL", "lat": 51.9244, "lon":  4.4777, "basin": "Rhine",    "city": "Rhine (Rotterdam)"},
    {"river_name": "Maas",   "representative_city": "Maastricht",          "country": "Netherlands",    "country_code": "NL", "lat": 50.8514, "lon":  5.6910, "basin": "Meuse",    "city": "Maas (Maastricht)"},
    {"river_name": "IJssel", "representative_city": "Deventer",            "country": "Netherlands",    "country_code": "NL", "lat": 52.2540, "lon":  6.1606, "basin": "Rhine",    "city": "IJssel (Deventer)"},

    # ── Belgium (2) ───────────────────────────────────────────────────────────
    {"river_name": "Schelde", "representative_city": "Antwerp",            "country": "Belgium",        "country_code": "BE", "lat": 51.2194, "lon":  4.4025, "basin": "Scheldt",  "city": "Schelde (Antwerp)"},
    {"river_name": "Meuse",   "representative_city": "Liège",              "country": "Belgium",        "country_code": "BE", "lat": 50.6333, "lon":  5.5667, "basin": "Meuse",    "city": "Meuse (Liège)"},

    # ── Portugal (2) ──────────────────────────────────────────────────────────
    {"river_name": "Tagus",  "representative_city": "Lisbon",              "country": "Portugal",       "country_code": "PT", "lat": 38.7223, "lon": -9.1393, "basin": "Tagus",    "city": "Tagus (Lisbon)"},
    {"river_name": "Douro",  "representative_city": "Porto",               "country": "Portugal",       "country_code": "PT", "lat": 41.1579, "lon": -8.6291, "basin": "Douro",    "city": "Douro (Porto)"},

    # ── Ireland (2) ───────────────────────────────────────────────────────────
    {"river_name": "Liffey",  "representative_city": "Dublin",             "country": "Ireland",        "country_code": "IE", "lat": 53.3498, "lon": -6.2603, "basin": "Liffey",   "city": "Liffey (Dublin)"},
    {"river_name": "Shannon", "representative_city": "Limerick",           "country": "Ireland",        "country_code": "IE", "lat": 52.6638, "lon": -8.6267, "basin": "Shannon",  "city": "Shannon (Limerick)"},

    # ── Switzerland (3) ───────────────────────────────────────────────────────
    {"river_name": "Rhine",  "representative_city": "Basel",               "country": "Switzerland",    "country_code": "CH", "lat": 47.5596, "lon":  7.5886, "basin": "Rhine",    "city": "Rhine (Basel)"},
    {"river_name": "Aare",   "representative_city": "Bern",                "country": "Switzerland",    "country_code": "CH", "lat": 46.9481, "lon":  7.4474, "basin": "Rhine",    "city": "Aare (Bern)"},
    {"river_name": "Limmat", "representative_city": "Zurich",              "country": "Switzerland",    "country_code": "CH", "lat": 47.3769, "lon":  8.5417, "basin": "Rhine",    "city": "Limmat (Zurich)"},

    # ── Austria (4) ───────────────────────────────────────────────────────────
    {"river_name": "Danube",  "representative_city": "Vienna",             "country": "Austria",        "country_code": "AT", "lat": 48.2082, "lon": 16.3738, "basin": "Danube",   "city": "Danube (Vienna)"},
    {"river_name": "Inn",     "representative_city": "Innsbruck",          "country": "Austria",        "country_code": "AT", "lat": 47.2692, "lon": 11.4041, "basin": "Danube",   "city": "Inn (Innsbruck)"},
    {"river_name": "Salzach", "representative_city": "Salzburg",           "country": "Austria",        "country_code": "AT", "lat": 47.8095, "lon": 13.0550, "basin": "Danube",   "city": "Salzach (Salzburg)"},
    {"river_name": "Mur",     "representative_city": "Graz",               "country": "Austria",        "country_code": "AT", "lat": 47.0707, "lon": 15.4395, "basin": "Danube",   "city": "Mur (Graz)"},

    # ── Czechia (2) ───────────────────────────────────────────────────────────
    {"river_name": "Vltava",  "representative_city": "Prague",             "country": "Czechia",        "country_code": "CZ", "lat": 50.0755, "lon": 14.4378, "basin": "Elbe",     "city": "Vltava (Prague)"},
    {"river_name": "Elbe",    "representative_city": "Ústí nad Labem",     "country": "Czechia",        "country_code": "CZ", "lat": 50.6611, "lon": 14.0428, "basin": "Elbe",     "city": "Elbe (Ústí)"},

    # ── Slovakia (2) ──────────────────────────────────────────────────────────
    {"river_name": "Danube",  "representative_city": "Bratislava",         "country": "Slovakia",       "country_code": "SK", "lat": 48.1486, "lon": 17.1077, "basin": "Danube",   "city": "Danube (Bratislava)"},
    {"river_name": "Váh",     "representative_city": "Trenčín",            "country": "Slovakia",       "country_code": "SK", "lat": 48.8943, "lon": 18.0444, "basin": "Danube",   "city": "Váh (Trenčín)"},

    # ── Hungary (3) ───────────────────────────────────────────────────────────
    {"river_name": "Danube",  "representative_city": "Budapest",           "country": "Hungary",        "country_code": "HU", "lat": 47.4979, "lon": 19.0402, "basin": "Danube",   "city": "Danube (Budapest)"},
    {"river_name": "Tisza",   "representative_city": "Szeged",             "country": "Hungary",        "country_code": "HU", "lat": 46.2530, "lon": 20.1484, "basin": "Danube",   "city": "Tisza (Szeged)"},
    {"river_name": "Rába",    "representative_city": "Győr",               "country": "Hungary",        "country_code": "HU", "lat": 47.6875, "lon": 17.6504, "basin": "Danube",   "city": "Rába (Győr)"},

    # ── Slovenia (2) ──────────────────────────────────────────────────────────
    {"river_name": "Sava",    "representative_city": "Ljubljana",          "country": "Slovenia",       "country_code": "SI", "lat": 46.0569, "lon": 14.5058, "basin": "Danube",   "city": "Sava (Ljubljana)"},
    {"river_name": "Drava",   "representative_city": "Maribor",            "country": "Slovenia",       "country_code": "SI", "lat": 46.5547, "lon": 15.6459, "basin": "Danube",   "city": "Drava (Maribor)"},

    # ── Croatia (2) ───────────────────────────────────────────────────────────
    {"river_name": "Sava",    "representative_city": "Zagreb",             "country": "Croatia",        "country_code": "HR", "lat": 45.8150, "lon": 15.9819, "basin": "Danube",   "city": "Sava (Zagreb)"},
    {"river_name": "Drava",   "representative_city": "Osijek",             "country": "Croatia",        "country_code": "HR", "lat": 45.5511, "lon": 18.6939, "basin": "Danube",   "city": "Drava (Osijek)"},

    # ── Romania (4) ───────────────────────────────────────────────────────────
    {"river_name": "Danube",  "representative_city": "Galați",             "country": "Romania",        "country_code": "RO", "lat": 45.4353, "lon": 28.0500, "basin": "Danube",   "city": "Danube (Galați)"},
    {"river_name": "Mureș",   "representative_city": "Arad",               "country": "Romania",        "country_code": "RO", "lat": 46.1866, "lon": 21.3123, "basin": "Danube",   "city": "Mureș (Arad)"},
    {"river_name": "Olt",     "representative_city": "Slatina",            "country": "Romania",        "country_code": "RO", "lat": 44.4281, "lon": 24.3646, "basin": "Danube",   "city": "Olt (Slatina)"},
    {"river_name": "Prut",    "representative_city": "Iași",               "country": "Romania",        "country_code": "RO", "lat": 47.1585, "lon": 27.5890, "basin": "Danube",   "city": "Prut (Iași)"},

    # ── Bulgaria (2) ──────────────────────────────────────────────────────────
    {"river_name": "Danube",  "representative_city": "Ruse",               "country": "Bulgaria",       "country_code": "BG", "lat": 43.8486, "lon": 25.9532, "basin": "Danube",   "city": "Danube (Ruse)"},
    {"river_name": "Maritsa", "representative_city": "Plovdiv",            "country": "Bulgaria",       "country_code": "BG", "lat": 42.1354, "lon": 24.7453, "basin": "Maritsa",  "city": "Maritsa (Plovdiv)"},

    # ── Serbia (2) ────────────────────────────────────────────────────────────
    {"river_name": "Danube",  "representative_city": "Belgrade",           "country": "Serbia",         "country_code": "RS", "lat": 44.7866, "lon": 20.4489, "basin": "Danube",   "city": "Danube (Belgrade)"},
    {"river_name": "Sava",    "representative_city": "Belgrade",           "country": "Serbia",         "country_code": "RS", "lat": 44.8000, "lon": 20.4667, "basin": "Danube",   "city": "Sava (Belgrade)"},

    # ── Greece (3) ────────────────────────────────────────────────────────────
    {"river_name": "Aliakmonas", "representative_city": "Kozani",          "country": "Greece",         "country_code": "GR", "lat": 40.3006, "lon": 21.7883, "basin": "Aliakmonas", "city": "Aliakmonas (Kozani)"},
    {"river_name": "Pinios",     "representative_city": "Larissa",         "country": "Greece",         "country_code": "GR", "lat": 39.6390, "lon": 22.4191, "basin": "Pinios",     "city": "Pinios (Larissa)"},
    {"river_name": "Axios",      "representative_city": "Thessaloniki",    "country": "Greece",         "country_code": "GR", "lat": 40.6401, "lon": 22.9444, "basin": "Axios",      "city": "Axios (Thessaloniki)"},

    # ── Sweden (3) ────────────────────────────────────────────────────────────
    {"river_name": "Göta älv",   "representative_city": "Gothenburg",      "country": "Sweden",         "country_code": "SE", "lat": 57.7089, "lon": 11.9746, "basin": "Göta älv",  "city": "Göta älv (Gothenburg)"},
    {"river_name": "Klarälven",  "representative_city": "Karlstad",        "country": "Sweden",         "country_code": "SE", "lat": 59.3742, "lon": 13.5115, "basin": "Göta älv",  "city": "Klarälven (Karlstad)"},
    {"river_name": "Dalälven",   "representative_city": "Falun",           "country": "Sweden",         "country_code": "SE", "lat": 60.6065, "lon": 15.6355, "basin": "Dalälven",  "city": "Dalälven (Falun)"},

    # ── Norway (3) ────────────────────────────────────────────────────────────
    {"river_name": "Glomma",         "representative_city": "Sarpsborg",   "country": "Norway",         "country_code": "NO", "lat": 59.2839, "lon": 11.1120, "basin": "Glomma",        "city": "Glomma (Sarpsborg)"},
    {"river_name": "Drammenselva",   "representative_city": "Drammen",     "country": "Norway",         "country_code": "NO", "lat": 59.7440, "lon": 10.2045, "basin": "Drammenselva",  "city": "Drammenselva (Drammen)"},
    {"river_name": "Lågen",          "representative_city": "Lillehammer", "country": "Norway",         "country_code": "NO", "lat": 61.1153, "lon": 10.4662, "basin": "Glomma",        "city": "Lågen (Lillehammer)"},

    # ── Finland (3) ───────────────────────────────────────────────────────────
    {"river_name": "Kymijoki",  "representative_city": "Kouvola",          "country": "Finland",        "country_code": "FI", "lat": 60.8679, "lon": 26.7042, "basin": "Kymijoki",  "city": "Kymijoki (Kouvola)"},
    {"river_name": "Vuoksi",    "representative_city": "Lappeenranta",     "country": "Finland",        "country_code": "FI", "lat": 61.0587, "lon": 28.1887, "basin": "Vuoksi",    "city": "Vuoksi (Lappeenranta)"},
    {"river_name": "Oulujoki",  "representative_city": "Oulu",             "country": "Finland",        "country_code": "FI", "lat": 65.0121, "lon": 25.4651, "basin": "Oulujoki",  "city": "Oulujoki (Oulu)"},

    # ── Denmark (2) ───────────────────────────────────────────────────────────
    {"river_name": "Gudenå",   "representative_city": "Silkeborg",         "country": "Denmark",        "country_code": "DK", "lat": 56.1697, "lon":  9.5440, "basin": "Gudenå",   "city": "Gudenå (Silkeborg)"},
    {"river_name": "Odense Å", "representative_city": "Odense",            "country": "Denmark",        "country_code": "DK", "lat": 55.3959, "lon": 10.3883, "basin": "Odense Å", "city": "Odense Å (Odense)"},

    # ── Lithuania (2) ─────────────────────────────────────────────────────────
    {"river_name": "Neris",    "representative_city": "Vilnius",           "country": "Lithuania",      "country_code": "LT", "lat": 54.6872, "lon": 25.2797, "basin": "Nemunas",  "city": "Neris (Vilnius)"},
    {"river_name": "Nemunas",  "representative_city": "Kaunas",            "country": "Lithuania",      "country_code": "LT", "lat": 54.8985, "lon": 23.9036, "basin": "Nemunas",  "city": "Nemunas (Kaunas)"},

    # ── Latvia (2) ────────────────────────────────────────────────────────────
    {"river_name": "Daugava",  "representative_city": "Riga",              "country": "Latvia",         "country_code": "LV", "lat": 56.9496, "lon": 24.1052, "basin": "Daugava",  "city": "Daugava (Riga)"},
    {"river_name": "Gauja",    "representative_city": "Valmiera",          "country": "Latvia",         "country_code": "LV", "lat": 57.5373, "lon": 25.4248, "basin": "Gauja",    "city": "Gauja (Valmiera)"},

    # ── Estonia (2) ───────────────────────────────────────────────────────────
    {"river_name": "Emajõgi",  "representative_city": "Tartu",             "country": "Estonia",        "country_code": "EE", "lat": 58.3797, "lon": 26.7227, "basin": "Emajõgi",  "city": "Emajõgi (Tartu)"},
    {"river_name": "Pärnu",    "representative_city": "Pärnu",             "country": "Estonia",        "country_code": "EE", "lat": 58.3859, "lon": 24.4971, "basin": "Pärnu",    "city": "Pärnu (Pärnu)"},

    # ── Ukraine (2) ───────────────────────────────────────────────────────────
    {"river_name": "Dnipro",   "representative_city": "Kyiv",              "country": "Ukraine",        "country_code": "UA", "lat": 50.4501, "lon": 30.5234, "basin": "Dnipro",   "city": "Dnipro (Kyiv)"},
    {"river_name": "Dniester", "representative_city": "Odessa",            "country": "Ukraine",        "country_code": "UA", "lat": 46.4825, "lon": 30.7233, "basin": "Dniester", "city": "Dniester (Odessa)"},

    # ── Moldova (1) ───────────────────────────────────────────────────────────
    {"river_name": "Dniester", "representative_city": "Tiraspol",          "country": "Moldova",        "country_code": "MD", "lat": 46.8432, "lon": 29.6300, "basin": "Dniester", "city": "Dniester (Tiraspol)"},

    # ── Luxembourg (1) ────────────────────────────────────────────────────────
    {"river_name": "Alzette",  "representative_city": "Luxembourg City",   "country": "Luxembourg",     "country_code": "LU", "lat": 49.6117, "lon":  6.1319, "basin": "Moselle",  "city": "Alzette (Luxembourg)"},

    # ── Iceland (1) ───────────────────────────────────────────────────────────
    {"river_name": "Ölfusá",   "representative_city": "Selfoss",           "country": "Iceland",        "country_code": "IS", "lat": 63.9330, "lon": -20.9973, "basin": "Ölfusá",  "city": "Ölfusá (Selfoss)"},
]


def as_dataframe():
    import pandas as pd
    return pd.DataFrame(RIVERS)


if __name__ == "__main__":
    df = as_dataframe()
    print(f"{len(df)} rivers across {df['country'].nunique()} countries")
    print("\nPer country:")
    print(df.groupby("country")["river_name"].count().sort_values(ascending=False).to_string())
    print("\nBounding box check:")
    print(f"  lat: {df['lat'].min():.2f} – {df['lat'].max():.2f}  (must be 35–71)")
    print(f"  lon: {df['lon'].min():.2f} – {df['lon'].max():.2f}  (must be -25–45)")
    ok = (df['lat'].between(35, 71) & df['lon'].between(-25, 45)).all()
    print(f"  All in bounding box: {ok}")
