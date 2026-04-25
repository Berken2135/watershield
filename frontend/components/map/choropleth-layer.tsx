"use client";

import { useMap } from "@/components/ui/map";
import { useEffect, useRef, useState } from "react";

// All data from data-science/data/outputs/watershield_summary.json
const WQI_DATA: Record<string, { name: string; wqi: number }> = {
  AT: { name: "Austria", wqi: 212.4 },
  BE: { name: "Belgium", wqi: 195.0 },
  BG: { name: "Bulgaria", wqi: 176.6 },
  HR: { name: "Croatia", wqi: 200.4 },
  CY: { name: "Cyprus", wqi: 248.9 },
  CZ: { name: "Czechia", wqi: 205.6 },
  DK: { name: "Denmark", wqi: 210.5 },
  EE: { name: "Estonia", wqi: 176.4 },
  FI: { name: "Finland", wqi: 194.5 },
  FR: { name: "France", wqi: 203.0 },
  DE: { name: "Germany", wqi: 210.4 },
  GR: { name: "Greece", wqi: 190.7 },
  HU: { name: "Hungary", wqi: 212.4 },
  IE: { name: "Ireland", wqi: 203.2 },
  IT: { name: "Italy", wqi: 191.0 },
  LV: { name: "Latvia", wqi: 199.3 },
  LT: { name: "Lithuania", wqi: 196.7 },
  LU: { name: "Luxembourg", wqi: 181.3 },
  MT: { name: "Malta", wqi: 240.9 },
  NL: { name: "Netherlands", wqi: 171.6 },
  NO: { name: "Norway", wqi: 207.1 },
  PL: { name: "Poland", wqi: 204.6 },
  PT: { name: "Portugal", wqi: 254.4 },
  RO: { name: "Romania", wqi: 183.3 },
  SK: { name: "Slovakia", wqi: 214.9 },
  SI: { name: "Slovenia", wqi: 189.5 },
  ES: { name: "Spain", wqi: 252.9 },
  SE: { name: "Sweden", wqi: 190.5 },
};

// High-resolution sources. jsdelivr reliably serves the Natural Earth GitHub repo.
// ne_50m gives detailed coastlines/borders; ne_10m is more precise but ~14 MB.
const COUNTRIES_URLS = [
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_0_countries.geojson",
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson",
  "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson",
];

const SRC = "wqi-countries";
const FILL_LAYER = "wqi-fill";
const HOVER_LAYER = "wqi-hover";

type Tooltip = { x: number; y: number; name: string; wqi: number };

const WQI_MIN = 171.6; // Netherlands
const WQI_MAX = 254.4; // Portugal

/** Extract ISO-2 code from a feature regardless of property naming convention */
function getIso2(props: Record<string, unknown> | null): string | null {
  if (!props) return null;
  // Try common field names in order of preference
  for (const key of ["ISO_A2", "iso_a2", "ISO_A2_EH", "ISO2", "iso2", "ISO3166-1-Alpha-2"]) {
    const v = props[key];
    if (typeof v === "string" && v !== "-99" && v.length === 2) return v.toUpperCase();
  }
  return null;
}

async function fetchCountriesGeoJSON(): Promise<GeoJSON.FeatureCollection | null> {
  for (const url of COUNTRIES_URLS) {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) continue;
      return (await res.json()) as GeoJSON.FeatureCollection;
    } catch {
      // try next URL
    }
  }
  return null;
}

export default function ChoroplethLayer() {
  const { map, isLoaded } = useMap();
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  // Track whether our layers exist so we can re-add after style change
  const layersReady = useRef(false);

  useEffect(() => {
    if (!map || !isLoaded) return;

    let cancelled = false;

    (async () => {
      // Clean up stale layers if present (e.g. after a theme/style change)
      for (const id of [HOVER_LAYER, FILL_LAYER]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SRC)) map.removeSource(SRC);
      layersReady.current = false;

      const geojson = await fetchCountriesGeoJSON();
      if (cancelled || !geojson) return;

      const features = geojson.features.flatMap((f) => {
        const iso = getIso2(f.properties as Record<string, unknown>);
        if (!iso || !(iso in WQI_DATA)) return [];
        const { name, wqi } = WQI_DATA[iso];
        return [{ ...f, properties: { iso_a2: iso, name, wqi } }];
      });

      if (cancelled || features.length === 0) return;

      // Find the first basemap admin/boundary LINE layer so we insert the fill
      // BELOW it. This means the basemap's own pixel-perfect country border lines
      // will render on top of our fill, hiding any geometry imprecision.
      // CartoDB dark-matter (OpenMapTiles) names these layers with 'admin' or
      // 'boundary' in the source-layer or layer id.
      const styleLayers = map.getStyle().layers;
      const adminLineLayer = styleLayers.find(
        (l) =>
          l.type === "line" &&
          (/(admin|boundary|border)/i.test(l.id) ||
            (typeof (l as { "source-layer"?: string })["source-layer"] === "string" &&
              /(admin|boundary)/i.test(
                (l as { "source-layer": string })["source-layer"],
              ))),
      );
      // Fall back to first line layer, then first symbol layer
      const insertBefore =
        adminLineLayer?.id ??
        styleLayers.find((l) => l.type === "line")?.id ??
        styleLayers.find((l) => l.type === "symbol")?.id;

      map.addSource(SRC, {
        type: "geojson",
        data: { type: "FeatureCollection", features } as GeoJSON.FeatureCollection,
      });

      // Fill layer – inserted BELOW admin border lines so the basemap's own
      // crisp border lines always render on top.
      map.addLayer(
        {
          id: FILL_LAYER,
          type: "fill",
          source: SRC,
          paint: {
            "fill-color": [
              "interpolate", ["linear"], ["get", "wqi"],
              171, "#cffafe",
              190, "#a5f3fc",
              205, "#67e8f9",
              215, "#22d3ee",
              230, "#06b6d4",
              245, "#0891b2",
              255, "#155e75",
            ],
            "fill-opacity": [
              "interpolate", ["linear"], ["get", "wqi"],
              171, 0.55,
              255, 0.82,
            ],
          },
        } as Parameters<typeof map.addLayer>[0],
        insertBefore,
      );

      // Hover highlight – also below admin lines so the basemap draws on top.
      // We intentionally skip a separate BORDER_LAYER: the basemap's own lines
      // are pixel-perfect and render above our fill automatically.
      map.addLayer(
        {
          id: HOVER_LAYER,
          type: "line",
          source: SRC,
          filter: ["==", ["get", "iso_a2"], "__none__"],
          paint: {
            "line-color": "#67e8f9",
            "line-width": 3,
            "line-opacity": 0.9,
          },
        } as Parameters<typeof map.addLayer>[0],
        insertBefore,
      );

      layersReady.current = true;
    })();

    const onMouseMove = (e: { point: { x: number; y: number } }) => {
      if (!layersReady.current) return;
      const pt = e.point as maplibregl.Point;
      const features = map.queryRenderedFeatures(pt, { layers: [FILL_LAYER] });
      if (features.length) {
        const iso = features[0].properties?.iso_a2 as string;
        if (iso && iso in WQI_DATA) {
          const { name, wqi } = WQI_DATA[iso];
          setTooltip({ x: pt.x, y: pt.y, name, wqi });
          map.setFilter(HOVER_LAYER, ["==", ["get", "iso_a2"], iso]);
          return;
        }
      }
      setTooltip(null);
      map.setFilter(HOVER_LAYER, ["==", ["get", "iso_a2"], "__none__"]);
    };

    const onCanvasLeave = () => {
      setTooltip(null);
      if (layersReady.current) {
        map.setFilter(HOVER_LAYER, ["==", ["get", "iso_a2"], "__none__"]);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on("mousemove", onMouseMove as any);
    map.getCanvas().addEventListener("mouseleave", onCanvasLeave);

    return () => {
      cancelled = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.off("mousemove", onMouseMove as any);
      map.getCanvas().removeEventListener("mouseleave", onCanvasLeave);
    };
  }, [map, isLoaded]);

  return (
    <>
      {/* WQI colour legend – top-right corner of the map */}
      <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg glass-strong px-3 py-2.5 ring-1 ring-cyan-400/20 select-none">
        <div className="text-[9px] tracking-[0.22em] uppercase text-muted-foreground mb-2">
          Water Quality Index · Europe
        </div>
        <div
          className="h-2 w-28 rounded-full"
          style={{
            background:
              "linear-gradient(to right,#cffafe,#a5f3fc,#67e8f9,#22d3ee,#06b6d4,#0891b2,#155e75)",
          }}
        />
        <div className="mt-1 flex justify-between text-[9px] font-mono text-foreground/55">
          <span>{WQI_MIN}</span>
          <span>{WQI_MAX}</span>
        </div>
        <div className="mt-0.5 flex justify-between text-[8px] text-muted-foreground/50">
          <span>NL (low)</span>
          <span>PT (high)</span>
        </div>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-30 rounded-md glass-strong px-3 py-2 ring-1 ring-cyan-400/30"
          style={{ left: tooltip.x + 14, top: tooltip.y - 56 }}
        >
          <div className="text-xs font-medium text-foreground">{tooltip.name}</div>
          <div className="text-[11px] font-mono text-cyan-300">
            WQI {tooltip.wqi.toFixed(1)}
          </div>
        </div>
      )}
    </>
  );
}
