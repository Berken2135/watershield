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

type Tooltip = { name: string; wqi: number; iso: string };

const WQI_MIN = 171.6; // Netherlands
const WQI_MAX = 254.4; // Portugal

// Layers we should *not* hijack the cursor for — if any of these are under
// the pointer, suppress the country tooltip so it does not collide with the
// station / river card.
const SUPPRESS_LAYERS = [
  "wqi-halo",
  "rivers-line",
  "rivers-hit",
  "pollution-cluster-circles",
];

function wqiTier(wqi: number): { label: string; tone: string } {
  if (wqi < 190) return { label: "Low", tone: "text-cyan-200" };
  if (wqi < 215) return { label: "Moderate", tone: "text-cyan-300" };
  if (wqi < 240) return { label: "Good", tone: "text-cyan-400" };
  return { label: "High", tone: "text-cyan-500" };
}

// Deterministic noise in [-1, 1] (FNV-1a) so timeline shifts are stable.
function seedNoise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 5000 - 1;
}

function shiftWqi(
  base: number,
  iso: string,
  monthOffset: number,
  confidence: number,
): number {
  if (Math.abs(monthOffset) < 0.05) return base;
  const bucket = Math.round(monthOffset * 2) / 2;
  const noise = seedNoise(`${iso}:${bucket}`);
  const seasonal = Math.sin((monthOffset * Math.PI) / 6) * 4;
  const trend = monthOffset * 0.55;
  const noiseAmp = monthOffset > 0 ? (1 - confidence / 100) * 18 : 4;
  return base + seasonal + trend + noise * noiseAmp;
}

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

const CHOROPLETH_MAX_ZOOM = 6;

export type ChoroplethLayerProps = {
  /** Signed months relative to “now” — negative = past, positive = future. */
  monthOffset?: number;
  /** 0–100 confidence; lower confidence widens the noise envelope (future only). */
  confidence?: number;
};

export default function ChoroplethLayer({
  monthOffset = 0,
  confidence = 100,
}: ChoroplethLayerProps = {}) {
  const { map, isLoaded } = useMap();
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [legendVisible, setLegendVisible] = useState(true);
  // Track whether our layers exist so we can re-add after style change
  const layersReady = useRef(false);
  // Cache pristine country features so we can re-shift WQI on every timeline tick
  // without re-fetching the GeoJSON (~3 MB).
  const baseFeaturesRef = useRef<GeoJSON.Feature[] | null>(null);
  // Live refs so the mousemove handler always reads the latest props.
  const offsetRef = useRef(monthOffset);
  const confidenceRef = useRef(confidence);
  offsetRef.current = monthOffset;
  confidenceRef.current = confidence;

  // Recompute fill data whenever the timeline scrubber moves.
  useEffect(() => {
    if (!map) return;
    const base = baseFeaturesRef.current;
    if (!base) return;
    const shifted = base.map((f) => {
      const props = f.properties as { iso_a2: string; name: string; wqi: number };
      return {
        ...f,
        properties: {
          ...props,
          wqi: shiftWqi(props.wqi, props.iso_a2, monthOffset, confidence),
        },
      };
    });
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: "FeatureCollection", features: shifted } as GeoJSON.FeatureCollection);
  }, [map, monthOffset, confidence]);

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

      // Cache pristine features for the time-shift effect above.
      baseFeaturesRef.current = features as GeoJSON.Feature[];

      const initialFeatures = features.map((f) => {
        const p = f.properties as { iso_a2: string; name: string; wqi: number };
        return {
          ...f,
          properties: {
            ...p,
            wqi: shiftWqi(p.wqi, p.iso_a2, offsetRef.current, confidenceRef.current),
          },
        };
      });

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
        data: { type: "FeatureCollection", features: initialFeatures } as GeoJSON.FeatureCollection,
      });

      // Fill layer – inserted BELOW admin border lines so the basemap's own
      // crisp border lines always render on top.
      map.addLayer(
        {
          id: FILL_LAYER,
          type: "fill",
          source: SRC,
          maxzoom: 6,
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
          maxzoom: 6,
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

      // Suppress when hovering a station marker / river so tooltips don't stack.
      const suppressLayers = SUPPRESS_LAYERS.filter((id) => map.getLayer(id));
      if (suppressLayers.length) {
        const blockers = map.queryRenderedFeatures(pt, { layers: suppressLayers });
        if (blockers.length) {
          setTooltip(null);
          map.setFilter(HOVER_LAYER, ["==", ["get", "iso_a2"], "__none__"]);
          return;
        }
      }

      const features = map.queryRenderedFeatures(pt, { layers: [FILL_LAYER] });
      if (features.length) {
        const iso = features[0].properties?.iso_a2 as string;
        if (iso && iso in WQI_DATA) {
          const { name, wqi: baseWqi } = WQI_DATA[iso];
          const wqi = shiftWqi(baseWqi, iso, offsetRef.current, confidenceRef.current);
          setTooltip({ name, wqi, iso });
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

    const onZoom = () => {
      setLegendVisible(map.getZoom() < CHOROPLETH_MAX_ZOOM);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on("mousemove", onMouseMove as any);
    map.getCanvas().addEventListener("mouseleave", onCanvasLeave);
    map.on("zoom", onZoom);

    return () => {
      cancelled = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.off("mousemove", onMouseMove as any);
      map.getCanvas().removeEventListener("mouseleave", onCanvasLeave);
      map.off("zoom", onZoom);
    };
  }, [map, isLoaded]);

  return (
    <>
      {/* WQI colour legend – top-right corner of the map */}
      <div
        className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg glass-strong px-3 py-2.5 ring-1 ring-cyan-400/20 select-none transition-opacity duration-500"
        style={{ opacity: legendVisible ? 1 : 0 }}
      >
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

      {/* Country WQI — docked under the legend so it never overlaps station cards. */}
      <div
        className={`pointer-events-none absolute right-4 top-[120px] z-20 rounded-lg glass-strong px-3 py-2 ring-1 ring-cyan-400/20 select-none transition-opacity duration-150 ${
          tooltip ? "opacity-100" : "opacity-0"
        }`}
        style={{ minWidth: 140 }}
      >
        {tooltip && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium text-foreground truncate">
                {tooltip.name}
              </div>
              <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
                {tooltip.iso}
              </div>
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-[15px] font-semibold tabular-nums text-cyan-300">
                {tooltip.wqi.toFixed(1)}
              </span>
              <span className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
                WQI
              </span>
              <span className={`ml-auto text-[10px] font-medium ${wqiTier(tooltip.wqi).tone}`}>
                {wqiTier(tooltip.wqi).label}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
