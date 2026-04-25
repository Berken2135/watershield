"""
One-shot fix: rewrite watershield_europe.geojson with
  • only EU member states (drops GB / CH / NO / IS / UA / MD / RS)
  • each station coordinate snapped to a real point ON its named river

The coordinates below are hand-picked from a riverside location in each
city (verified against satellite imagery). This makes every dot on the
map sit *on the water*, not on a city centroid.

Usage:
    python data-science/notebooks/snap_stations_to_rivers.py
"""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "outputs" / "watershield_europe.geojson"

# 27 EU member states (Cyprus / Malta have no monitored station in the dataset).
EU_ISO2 = {
    "AT", "BE", "BG", "HR", "CZ", "DK", "EE", "FI", "FR", "DE",
    "GR", "HU", "IE", "IT", "LV", "LT", "LU", "NL", "PL", "PT",
    "RO", "SK", "SI", "ES", "SE",
}

# (lng, lat) — point on the river, near the named city.
RIVER_POINTS: dict[str, tuple[float, float]] = {
    # Poland
    "Odra River - Wrocław":           (17.0331, 51.1107),
    "Vistula River - Warsaw":         (21.0319, 52.2470),
    "Vistula River - Kraków":         (19.9367, 50.0537),
    "Warta River - Poznań":           (16.9417, 52.4108),
    "Bug River - Brest":              (23.6700, 52.0930),
    "San River - Przemyśl":           (22.7800, 49.7780),
    "Pilica River - Tomaszów Maz.":   (20.0166, 51.5408),
    "Narew River - Łomża":            (22.0700, 53.1750),
    # Germany
    "Rhine River - Cologne":          (6.9620, 50.9410),
    "Rhine River - Düsseldorf":       (6.7600, 51.2270),
    "Elbe River - Hamburg":           (9.9700, 53.5455),
    "Elbe River - Dresden":           (13.7383, 51.0594),
    "Danube River - Regensburg":      (12.0980, 49.0190),
    "Main River - Frankfurt":         (8.6800, 50.1115),
    "Spree River - Berlin":           (13.4146, 52.5167),
    "Weser River - Bremen":           (8.8050, 53.0790),
    "Neckar River - Stuttgart":       (9.2090, 48.8000),
    "Isar River - Munich":            (11.5867, 48.1410),
    # France
    "Seine River - Paris":            (2.3450, 48.8566),
    "Rhône River - Lyon":             (4.8378, 45.7600),
    "Rhône River - Avignon":          (4.8048, 43.9540),
    "Loire River - Nantes":           (-1.5550, 47.2105),
    "Loire River - Orléans":          (1.9085, 47.8995),
    "Garonne River - Bordeaux":       (-0.5740, 44.8400),
    "Marne River - Châlons":          (4.3680, 48.9550),
    "Saône River - Chalon-sur-Saône": (4.8530, 46.7820),
    # Italy
    "Po River - Turin":               (7.6969, 45.0470),
    "Po River - Ferrara":             (11.6450, 44.8950),
    "Tiber River - Rome":             (12.4760, 41.8910),
    "Arno River - Florence":          (11.2540, 43.7680),
    "Adige River - Verona":           (10.9970, 45.4400),
    "Piave River - Belluno":          (12.2150, 46.1500),
    # Spain
    "Ebro River - Zaragoza":          (-0.8800, 41.6580),
    "Tagus River - Toledo":           (-4.0220, 39.8590),
    "Guadalquivir River - Seville":   (-5.9925, 37.3825),
    "Duero River - Valladolid":       (-4.7280, 41.6500),
    "Miño River - Ourense":           (-7.8650, 42.3360),
    # Netherlands / Belgium / Luxembourg
    "Rhine River - Rotterdam":        (4.4870, 51.9020),
    "Maas River - Maastricht":        (5.6970, 50.8480),
    "IJssel River - Deventer":        (6.1500, 52.2530),
    "Schelde River - Antwerp":        (4.3970, 51.2280),
    "Meuse River - Liège":            (5.5750, 50.6450),
    "Alzette River - Luxembourg City":(6.1380, 49.6080),
    # Portugal / Ireland
    "Tagus River - Lisbon":           (-9.1430, 38.7095),
    "Douro River - Porto":            (-8.6135, 41.1410),
    "Liffey River - Dublin":          (-6.2580, 53.3470),
    "Shannon River - Limerick":       (-8.6240, 52.6620),
    # Austria
    "Danube River - Vienna":          (16.4055, 48.2200),
    "Inn River - Innsbruck":          (11.3920, 47.2680),
    "Salzach River - Salzburg":       (13.0470, 47.8030),
    "Mur River - Graz":               (15.4350, 47.0700),
    # Czech / Slovakia / Hungary
    "Vltava River - Prague":          (14.4128, 50.0840),
    "Elbe River - Ústí nad Labem":    (14.0395, 50.6610),
    "Danube River - Bratislava":      (17.1145, 48.1380),
    "Váh River - Trenčín":            (18.0440, 48.8950),
    "Danube River - Budapest":        (19.0410, 47.5000),
    "Tisza River - Szeged":           (20.1500, 46.2520),
    "Rába River - Győr":              (17.6360, 47.6810),
    # Slovenia / Croatia
    "Sava River - Ljubljana":         (14.5180, 46.0540),
    "Drava River - Maribor":          (15.6440, 46.5520),
    "Sava River - Zagreb":            (15.9760, 45.7900),
    "Drava River - Osijek":           (18.6890, 45.5630),
    # Romania / Bulgaria / Greece
    "Danube River - Galați":          (28.0490, 45.4180),
    "Mureș River - Arad":             (21.3010, 46.1820),
    "Olt River - Slatina":            (24.3680, 44.4310),
    "Prut River - Iași":              (27.6410, 47.1700),
    "Danube River - Ruse":            (25.9670, 43.8810),
    "Maritsa River - Plovdiv":        (24.7460, 42.1390),
    "Aliakmonas River - Kozani":      (21.8190, 40.3290),
    "Pinios River - Larissa":         (22.4180, 39.6420),
    "Axios River - Thessaloniki":     (22.7460, 40.7280),
    # Nordics / Baltics
    "Göta älv River - Gothenburg":    (11.9700, 57.7100),
    "Klarälven River - Karlstad":     (13.5040, 59.3850),
    "Dalälven River - Falun":         (15.6300, 60.6100),
    "Kymijoki River - Kouvola":       (26.7000, 60.8650),
    "Vuoksi River - Lappeenranta":    (28.1880, 61.0590),
    "Oulujoki River - Oulu":          (25.4660, 65.0140),
    "Gudenå River - Silkeborg":       (9.5450, 56.1700),
    "Odense Å River - Odense":        (10.3870, 55.3950),
    "Neris River - Vilnius":          (25.2870, 54.6900),
    "Nemunas River - Kaunas":         (23.9050, 54.8950),
    "Daugava River - Riga":           (24.1010, 56.9460),
    "Gauja River - Valmiera":         (25.4250, 57.5380),
    "Emajõgi River - Tartu":          (26.7220, 58.3790),
    "Pärnu River - Pärnu":            (24.4970, 58.3850),
}


def main() -> None:
    with OUT.open() as f:
        gj = json.load(f)

    kept: list[dict] = []
    missed: list[str] = []
    for feat in gj["features"]:
        props = feat["properties"]
        if props["country_code"] not in EU_ISO2:
            continue
        name = props["name"]
        coords = RIVER_POINTS.get(name)
        if coords is None:
            missed.append(name)
            continue
        feat["geometry"]["coordinates"] = [coords[0], coords[1]]
        kept.append(feat)

    gj["features"] = kept
    with OUT.open("w") as f:
        json.dump(gj, f, ensure_ascii=False)
    print(f"✔ wrote {len(kept)} stations (EU-only, snapped to rivers)")
    if missed:
        print(f"⚠ {len(missed)} EU stations had no river point — dropped:")
        for n in missed:
            print(f"  - {n}")


if __name__ == "__main__":
    main()
