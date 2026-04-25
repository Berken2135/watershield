"use client";

import GestureAuth from "@/components/gesture-auth";
import NfcAuth from "@/components/nfc-auth";
import ChoroplethLayer from "@/components/map/choropleth-layer";
import PredictiveTimeline from "@/components/predictive-timeline";
import Sidebar, { MobileTopBar } from "@/components/sidebar";
import StationCard from "@/components/station-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Map, MapMarker, MarkerContent, MarkerTooltip } from "@/components/ui/map";
import { generateReportPdf } from "@/lib/api";
import {
  POLLUTION_EVENTS as MOCK_EVENTS,
  fetchStations,
  type PollutionEvent,
} from "@/lib/pollution-data";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Droplets,
  FileDown,
  Fingerprint,
  Gauge,
  Loader2,
  LocateFixed,
  MapPin,
  Minus,
  Search,
  TrendingDown,
  TrendingUp,
  Waves,
} from "lucide-react";
import type MapLibreGL from "maplibre-gl";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

type WqiFeature = {
  water_body_id: string;
  name: string;
  country: string;
  country_code: string;
  water_body_type: string;
  wqi_current: number;
  wqi_predicted_7d: number;
  wqi_predicted_30d: number;
  wqi_lower_30d: number;
  wqi_upper_30d: number;
  risk_level: "clean" | "moderate" | "high" | "critical";
  risk_color: string;
  trend: "stable" | "worsening" | "improving";
  trend_pct_change: number;
  anomaly_count_30d: number | null;
  data_source: "real" | "synthetic";
  last_updated: string;
  metrics: {
    temperature_c: number | null;
    ph: number | null;
    oxygen_mg_l: number | null;
    turbidity_ntu: number | null;
  };
};

type WqiStation = WqiFeature & { lng: number; lat: number };

// Deterministic noise so timeline shifts are stable per station.
function fnvHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 5000 - 1; // [-1, 1]
}

// Mirror of the choropleth's `shiftWqi` so station markers move in lock-step
// with the country fill as the user scrubs the timeline.
function shiftStationWqi(
  base: number,
  id: string,
  monthOffset: number,
  confidence: number,
): number {
  if (Math.abs(monthOffset) < 0.05) return base;
  const bucket = Math.round(monthOffset * 2) / 2;
  const noise = fnvHash(`${id}:${bucket}`);
  const seasonal = Math.sin((monthOffset * Math.PI) / 6) * 4;
  const trend = monthOffset * 0.6;
  const noiseAmp = monthOffset > 0 ? (1 - confidence / 100) * 22 : 5;
  return Math.max(0, base + seasonal + trend + noise * noiseAmp);
}

function riskFromWqi(wqi: number): {
  level: "clean" | "moderate" | "high" | "critical";
  color: string;
} {
  if (wqi >= 230) return { level: "critical", color: "#DC2626" };
  if (wqi >= 200) return { level: "high",     color: "#EF4444" };
  if (wqi >= 170) return { level: "moderate", color: "#F59E0B" };
  return            { level: "clean",    color: "#10B981" };
}

const NOW_DATE = new Date("2026-04-25T00:00:00Z");
const TIMELINE_START = new Date("2024-01-01T00:00:00Z");
const TIMELINE_END = new Date("2027-12-31T00:00:00Z");
const CLUSTER_MAX_ZOOM = 11;
const PT = "pollution-points";

function buildGeojson(events: PollutionEvent[]): GeoJSON.FeatureCollection<
  GeoJSON.Point,
  { id: string; severity: string }
> {
  return {
    type: "FeatureCollection",
    features: events.map((e) => ({
      type: "Feature",
      properties: { id: e.id, severity: e.severity },
      geometry: { type: "Point", coordinates: e.coordinates },
    })),
  };
}

type RiverInfo = {
  id: string;
  name: string;
  basin: string;
  countries: string[];
  lengthKm: number;
  baseWqi: number;
  riskColor: string;
  pollutants: string[];
  monitoringStations: number;
  highlights: string;
};

const RIVER_INFO: Record<string, RiverInfo> = {
  danube: {
    id: "danube",
    name: "Danube",
    basin: "Black Sea basin",
    countries: ["DE", "AT", "SK", "HU", "HR", "RS", "RO", "BG", "UA"],
    lengthKm: 2860,
    baseWqi: 198.5,
    riskColor: "#f59e0b",
    pollutants: ["Nitrates", "Microplastics", "Industrial discharge"],
    monitoringStations: 78,
    highlights: "Second-longest river in Europe — Sentinel-2 + ICPDR network.",
  },
  rhine: {
    id: "rhine",
    name: "Rhine",
    basin: "North Sea basin",
    countries: ["CH", "DE", "FR", "NL"],
    lengthKm: 1233,
    baseWqi: 207.8,
    riskColor: "#22d3ee",
    pollutants: ["PFAS", "Pharmaceuticals", "Heat-load"],
    monitoringStations: 124,
    highlights: "Densest monitoring network in Europe (Rheingüte).",
  },
  odra: {
    id: "odra",
    name: "Odra",
    basin: "Baltic Sea basin",
    countries: ["CZ", "PL", "DE"],
    lengthKm: 854,
    baseWqi: 184.2,
    riskColor: "#ef4444",
    pollutants: ["Salinity spike", "Algal bloom (Prymnesium parvum)"],
    monitoringStations: 41,
    highlights: "Recovering from the 2022 ecological disaster (DSS Aug 2022).",
  },
  glomma: {
    id: "glomma",
    name: "Glomma",
    basin: "Skagerrak basin",
    countries: ["NO"],
    lengthKm: 621,
    baseWqi: 217.2,
    riskColor: "#22d3ee",
    pollutants: ["Forestry runoff", "Acidification (legacy)"],
    monitoringStations: 18,
    highlights: "Norway's longest river — pristine headwaters in Hedmark.",
  },
  vardar: {
    id: "vardar",
    name: "Vardar",
    basin: "Aegean Sea basin",
    countries: ["MK", "GR"],
    lengthKm: 388,
    baseWqi: 198.0,
    riskColor: "#22d3ee",
    pollutants: ["Heavy metals (Cu/Pb)", "Untreated municipal effluent"],
    monitoringStations: 12,
    highlights: "Main artery of North Macedonia — IWRM hotspot since 2021.",
  },
};

const RIVERS_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: "danube", name: "Danube" },
      geometry: {
        type: "LineString",
        coordinates: [
          [10.0, 48.2], [13.0, 48.3], [16.4, 48.2], [18.7, 47.7],
          [20.3, 46.0], [22.5, 45.8], [25.5, 45.5], [28.0, 45.5], [29.7, 45.2],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "rhine", name: "Rhine" },
      geometry: {
        type: "LineString",
        coordinates: [
          [9.5, 47.5], [8.2, 47.9], [7.6, 48.5], [7.8, 49.5],
          [7.5, 50.1], [6.7, 51.2], [6.1, 51.8], [5.9, 51.9], [4.5, 51.9],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "odra", name: "Odra" },
      geometry: {
        type: "LineString",
        coordinates: [
          [18.65, 49.95], [17.9, 50.4], [17.45, 50.95], [17.04, 51.11],
          [16.7, 51.27], [16.42, 51.7], [15.5, 52.1], [14.6, 52.55], [14.27, 53.43],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "glomma", name: "Glomma" },
      geometry: {
        type: "LineString",
        coordinates: [
          [11.40, 62.00], [11.20, 61.30], [11.10, 60.65], [11.10, 60.10],
          [11.13, 59.74], [11.11, 59.28], [10.92, 59.13],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "vardar", name: "Vardar" },
      geometry: {
        type: "LineString",
        coordinates: [
          [20.74, 41.96], [21.20, 42.00], [21.43, 41.99], [21.71, 41.74],
          [21.91, 41.45], [22.10, 41.20], [22.42, 40.83], [22.74, 40.62],
        ],
      },
    },
  ],
};

export default function Home() {
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreGL.Map | null>(null);
  const mapCallbackRef = useCallback((map: MapLibreGL.Map | null) => {
    mapRef.current = map;
    setMapInstance(map);
  }, []);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchAnchor, setSearchAnchor] = useState<[number, number] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedWqiStation, setSelectedWqiStation] = useState<WqiFeature | null>(null);
  const [wqiStations, setWqiStations] = useState<WqiStation[]>([]);
  const baseStationsRef = useRef<WqiStation[]>([]);
  const [selectedPollutionId, setSelectedPollutionId] = useState<string | null>(null);

  const [authOpen, setAuthOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Track viewport so we can swap auth UX (gesture on desktop, NFC on phones).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Persist 6·7 verification across refreshes — the user explicitly asked
  // not to repeat the gesture on every reload.
  useEffect(() => {
    try {
      if (localStorage.getItem("ws_auth_v1") === "1") setAuthed(true);
    } catch {}
    setAuthChecked(true);
  }, []);
  useEffect(() => {
    try {
      if (authed) localStorage.setItem("ws_auth_v1", "1");
      else localStorage.removeItem("ws_auth_v1");
    } catch {}
  }, [authed]);

  const [eventsOpen, setEventsOpen] = useState(true);

  const [timelineDate, setTimelineDate] = useState<Date>(NOW_DATE);
  const monthsSignedFromNow =
    (timelineDate.getTime() - NOW_DATE.getTime()) / (86_400_000 * 30.4375);
  const monthsAfterNow = Math.max(0, monthsSignedFromNow);
  const confidence =
    monthsAfterNow <= 0
      ? 100
      : Math.max(35, Math.round(Math.exp(-0.0476 * monthsAfterNow) * 100));

  const [showWqi, setShowWqi] = useState(true);

  const [events, setEvents] = useState<PollutionEvent[]>(MOCK_EVENTS);
  useEffect(() => {
    let cancelled = false;
    fetchStations()
      .then((real) => { if (!cancelled && real.length) setEvents(real); })
      .catch(() => { /* keep mock fallback */ });
    return () => { cancelled = true; };
  }, []);

  // ---------- map: rivers (interactive) ----------
  const [hoveredRiver, setHoveredRiver] = useState<RiverInfo | null>(null);
  const [hoveredRiverPoint, setHoveredRiverPoint] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!mapInstance) return;
    const setupRivers = () => {
      if (!mapInstance.getSource("rivers")) {
        mapInstance.addSource("rivers", {
          type: "geojson",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: RIVERS_GEOJSON as any,
        });
      }
      // Wide invisible hit-box for easier hovering on thin lines.
      if (!mapInstance.getLayer("rivers-hit")) {
        mapInstance.addLayer({
          id: "rivers-hit",
          type: "line",
          source: "rivers",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#000", "line-width": 18, "line-opacity": 0 },
        });
      }
      // Base river styling.
      if (!mapInstance.getLayer("rivers-line")) {
        mapInstance.addLayer({
          id: "rivers-line",
          type: "line",
          source: "rivers",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#22d3ee",
            "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.4, 8, 3],
            "line-opacity": 0.55,
          },
        });
      }
      // Glow that lights up only the hovered river (whole polyline).
      if (!mapInstance.getLayer("rivers-glow")) {
        mapInstance.addLayer({
          id: "rivers-glow",
          type: "line",
          source: "rivers",
          layout: { "line-join": "round", "line-cap": "round" },
          filter: ["==", ["get", "id"], "__none__"],
          paint: {
            "line-color": "#67e8f9",
            "line-width": ["interpolate", ["linear"], ["zoom"], 3, 6, 8, 10],
            "line-opacity": 0.45,
            "line-blur": 3,
          },
        });
      }
      if (!mapInstance.getLayer("rivers-line-active")) {
        mapInstance.addLayer({
          id: "rivers-line-active",
          type: "line",
          source: "rivers",
          layout: { "line-join": "round", "line-cap": "round" },
          filter: ["==", ["get", "id"], "__none__"],
          paint: {
            "line-color": "#a5f3fc",
            "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2.4, 8, 4.5],
            "line-opacity": 1,
          },
        });
      }
    };

    const onMove = (e: MapLibreGL.MapMouseEvent) => {
      const feats = mapInstance.queryRenderedFeatures(e.point, { layers: ["rivers-hit"] });
      if (!feats.length) return;
      const id = feats[0].properties?.id as string | undefined;
      if (!id || !RIVER_INFO[id]) return;
      mapInstance.setFilter("rivers-glow", ["==", ["get", "id"], id]);
      mapInstance.setFilter("rivers-line-active", ["==", ["get", "id"], id]);
      mapInstance.getCanvas().style.cursor = "pointer";
      setHoveredRiver(RIVER_INFO[id]);
      setHoveredRiverPoint({ x: e.point.x, y: e.point.y });
    };
    const onLeave = () => {
      mapInstance.setFilter("rivers-glow", ["==", ["get", "id"], "__none__"]);
      mapInstance.setFilter("rivers-line-active", ["==", ["get", "id"], "__none__"]);
      mapInstance.getCanvas().style.cursor = "";
      setHoveredRiver(null);
      setHoveredRiverPoint(null);
    };

    const onStyle = () => mapInstance.isStyleLoaded() && setupRivers();
    mapInstance.on("styledata", onStyle);
    mapInstance.on("mousemove", "rivers-hit", onMove);
    mapInstance.on("mouseleave", "rivers-hit", onLeave);
    if (mapInstance.isStyleLoaded()) setupRivers();
    return () => {
      mapInstance.off("styledata", onStyle);
      mapInstance.off("mousemove", "rivers-hit", onMove);
      mapInstance.off("mouseleave", "rivers-hit", onLeave);
    };
  }, [mapInstance]);

  // ---------- map: wqi stations ----------
  useEffect(() => {
    if (!mapInstance) return;
    const SRC = "wqi-stations";
    const HALO = "wqi-halo";

    const setup = () => {
      if (!mapInstance.getSource(SRC)) {
        mapInstance.addSource(SRC, { type: "geojson", data: "http://127.0.0.1:8000/api/data/europe" });
      }
      if (!mapInstance.getLayer(HALO)) {
        mapInstance.addLayer({
          id: HALO, type: "circle", source: SRC,
          paint: {
            "circle-radius": 16,
            "circle-color": ["get", "risk_color"],
            "circle-opacity": 0.2,
            "circle-blur": 0.9,
          },
        });
      }
    };

    const onStyleData = () => mapInstance.isStyleLoaded() && setup();
    mapInstance.on("styledata", onStyleData);
    if (mapInstance.isStyleLoaded()) setup();
    return () => { mapInstance.off("styledata", onStyleData); };
  }, [mapInstance]);

  // ---------- wqi visibility toggle ----------
  useEffect(() => {
    if (!mapInstance) return;
    const vis = showWqi ? "visible" : "none";
    const toggle = () => {
      if (mapInstance.getLayer("wqi-halo")) mapInstance.setLayoutProperty("wqi-halo", "visibility", vis);
    };
    if (mapInstance.isStyleLoaded()) toggle();
    mapInstance.on("styledata", toggle);
    return () => { mapInstance.off("styledata", toggle); };
  }, [mapInstance, showWqi]);

  // ---------- fetch wqi station data ----------
  useEffect(() => {
    if (!mapInstance) return;
    const SRC = "pollution-clusters";
    const CL = "pollution-cluster-circles";
    const CC = "pollution-cluster-count";

    const setup = () => {
      if (!mapInstance.getSource(SRC)) {
        mapInstance.addSource(SRC, {
          type: "geojson",
          data: buildGeojson(events),
          cluster: true,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterRadius: 45,
        });
      } else {
        const src = mapInstance.getSource(SRC) as MapLibreGL.GeoJSONSource;
        src.setData(buildGeojson(events));
      }
      if (!mapInstance.getLayer(CL)) {
        mapInstance.addLayer({
          id: CL, type: "circle", source: SRC, maxzoom: CLUSTER_MAX_ZOOM,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": ["step", ["get", "point_count"],
              "rgba(34,211,238,0.18)", 3, "rgba(245,158,11,0.18)", 6, "rgba(239,68,68,0.22)"],
            "circle-radius": ["step", ["get", "point_count"], 22, 3, 28, 6, 34],
            "circle-stroke-width": 1,
            "circle-stroke-color": ["step", ["get", "point_count"],
              "rgba(34,211,238,0.7)", 3, "rgba(245,158,11,0.8)", 6, "rgba(239,68,68,0.9)"],
          },
        });
      }
      if (!mapInstance.getLayer(CC)) {
        mapInstance.addLayer({
          id: CC, type: "symbol", source: SRC, maxzoom: CLUSTER_MAX_ZOOM,
          filter: ["has", "point_count"],
          layout: { "text-field": "{point_count_abbreviated}", "text-font": ["Open Sans Regular"], "text-size": 12, "text-allow-overlap": true },
          paint: { "text-color": "#e2e8f0" },
        });
      }
    };

    const onStyle = () => mapInstance.isStyleLoaded() && setup();

    const onClusterClick = async (
      e: MapLibreGL.MapMouseEvent & { features?: MapLibreGL.MapGeoJSONFeature[] },
    ) => {
      const features = mapInstance.queryRenderedFeatures(e.point, { layers: [CL] });
      if (!features.length) return;
      const clusterId = features[0].properties?.cluster_id as number;
      const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
      const source = mapInstance.getSource(SRC) as MapLibreGL.GeoJSONSource;
      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        mapInstance.flyTo({ center: coords, zoom: zoom + 0.5, duration: 800 });
      } catch { /* ignore */ }
    };

    const onPointClick = (
      e: MapLibreGL.MapMouseEvent & { features?: MapLibreGL.MapGeoJSONFeature[] },
    ) => {
      const features = mapInstance.queryRenderedFeatures(e.point, { layers: [PT] });
      if (!features.length) return;
      const id = features[0].properties?.id;
      if (!id) return;
      const ev = events.find((p) => p.id === id);
      if (!ev) return;
      setSelectedPollutionId(id);
      mapInstance.flyTo({ center: ev.coordinates, zoom: CLUSTER_MAX_ZOOM + 1, duration: 1200 });
    };

    const cursorOn = () => { mapInstance.getCanvas().style.cursor = "pointer"; };
    const cursorOff = () => { mapInstance.getCanvas().style.cursor = ""; };

    mapInstance.on("styledata", onStyle);
    mapInstance.on("click", CL, onClusterClick);
    mapInstance.on("mouseenter", CL, cursorOn);
    mapInstance.on("mouseleave", CL, cursorOff);
    if (mapInstance.isStyleLoaded()) setup();

    return () => {
      mapInstance.off("styledata", onStyle);
      mapInstance.off("click", CL, onClusterClick);
      mapInstance.off("mouseenter", CL, cursorOn);
      mapInstance.off("mouseleave", CL, cursorOff);
    };
  }, [mapInstance, events]);

  // ---------- fetch wqi station data ----------
  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/data/europe")
      .then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((fc: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = (fc.features as any[]).map((f) => ({
          ...f.properties,
          metrics:
            typeof f.properties.metrics === "string"
              ? JSON.parse(f.properties.metrics)
              : (f.properties.metrics ?? {}),
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
        })) as WqiStation[];
        baseStationsRef.current = list;
        setWqiStations(list);
        // Deep-link support: /?station=<id> auto-opens the detail panel.
        try {
          const sp = new URLSearchParams(window.location.search);
          const sid = sp.get("station");
          if (sid) {
            const hit = list.find((s) => s.water_body_id === sid);
            if (hit) {
              setSelectedWqiStation(hit);
              setEventsOpen(true);
              setTimeout(() => {
                mapRef.current?.flyTo({ center: [hit.lng, hit.lat], zoom: 8, duration: 1200 });
              }, 400);
            }
          }
        } catch {}
      })
      .catch(() => { /* backend offline */ });
  }, []);

  // Re-color station markers as the timeline scrubber moves so the user can
  // see how WQI / risk evolves over time (matches the choropleth shift).
  useEffect(() => {
    const base = baseStationsRef.current;
    if (!base.length) return;
    if (Math.abs(monthsSignedFromNow) < 0.05) {
      setWqiStations(base);
      return;
    }
    const shifted = base.map((s) => {
      const wqi = shiftStationWqi(
        s.wqi_current,
        s.water_body_id,
        monthsSignedFromNow,
        confidence,
      );
      const tier = riskFromWqi(wqi);
      return {
        ...s,
        wqi_current: wqi,
        risk_level: tier.level,
        risk_color: tier.color,
      };
    });
    setWqiStations(shifted);
  }, [monthsSignedFromNow, confidence]);

  // ---------- search (Nominatim) ----------
  const fetchSuggestions = useCallback(async (value: string) => {
    if (value.trim().length < 2) { setSuggestions([]); return; }
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=6&addressdetails=0`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setShowSuggestions(true);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };
  const handleSelect = (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    setQuery(r.display_name);
    setShowSuggestions(false);
    setSuggestions([]);
    setSearchAnchor([lon, lat]);
    mapRef.current?.flyTo({ center: [lon, lat], zoom: 10, duration: 1500 });
  };
  const handleSearch = () => { if (suggestions.length > 0) handleSelect(suggestions[0]); };

  const handleGeolocate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setSearchAnchor(c);
        mapRef.current?.flyTo({ center: c, zoom: 10, duration: 1500 });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Block all UI until 6·7 gesture verification succeeds.
  if (authChecked && !authed) {
    return isMobile ? (
      <NfcAuth
        open
        dismissible={false}
        onClose={() => { /* gated — no-op */ }}
        onSuccess={() => setAuthed(true)}
      />
    ) : (
      <GestureAuth
        open
        dismissible={false}
        onClose={() => { /* gated — no-op */ }}
        onSuccess={() => setAuthed(true)}
      />
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        authed={authed}
        onSignIn={() => setAuthOpen(true)}
        onSignOut={() => setAuthed(false)}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <MobileTopBar
          authed={authed}
          onSignIn={() => setAuthOpen(true)}
          onSignOut={() => setAuthed(false)}
        />
        {/* Top bar — minimalist: only search */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border px-6 bg-background/40 backdrop-blur-md z-20 relative">
          <div className="flex items-center gap-3 w-full max-w-md">
            <div className="relative flex-1" ref={containerRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground z-10" />
              <Input
                className="pl-9 pr-10 h-9 bg-foreground/[0.02] border-foreground/[0.06] focus-visible:ring-primary/30 focus-visible:border-primary/40 placeholder:text-muted-foreground/60 text-sm"
                placeholder="Search location"
                type="text"
                value={query}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                  if (e.key === "Escape") setShowSuggestions(false);
                }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={handleGeolocate}
                className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:text-primary hover:bg-foreground/[0.05] transition-colors"
                aria-label="Find my location"
                title="Find my location"
              >
                <LocateFixed className="h-3.5 w-3.5" />
              </button>
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-2 z-50 rounded-lg overflow-hidden border border-border bg-background shadow-2xl divide-y divide-border/60">
                  {suggestions.map((s) => (
                    <li
                      key={s.place_id}
                      className="px-4 py-2.5 cursor-pointer text-sm hover:bg-foreground/[0.05] truncate text-foreground"
                      onMouseDown={() => handleSelect(s)}
                    >
                      {s.display_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {!authed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAuthOpen(true)}
              className="hidden md:inline-flex ml-auto h-9 gap-2 bg-primary/10 hover:bg-primary/15 border-primary/30 text-primary"
            >
              <Fingerprint className="h-3.5 w-3.5" />
              Sign in
            </Button>
          )}
        </header>

        <main className="relative flex flex-1 min-h-0 gap-2 md:gap-4 px-2 md:px-4 pt-2 md:pt-4 pb-2 md:pb-3">
          <section className="relative flex-1 rounded-2xl overflow-hidden border border-border min-w-0 glass">
            <Map ref={mapCallbackRef} center={[10, 50]} zoom={3.6} maxBounds={[[-25, 33], [45, 72]]}>
              <ChoroplethLayer monthOffset={monthsSignedFromNow} confidence={confidence} />
              {showWqi && wqiStations.map((station) => (
                <MapMarker
                  key={station.water_body_id}
                  longitude={station.lng}
                  latitude={station.lat}
                  onClick={() => {
                    setSelectedWqiStation(station);
                    setEventsOpen(true);
                    mapRef.current?.flyTo({ center: [station.lng, station.lat], zoom: 8, duration: 1000 });
                  }}
                >
                  <MarkerContent>
                    <div className="relative flex items-center justify-center cursor-pointer">
                      <div
                        className="w-3.5 h-3.5 rounded-full border-2 border-white/70 shadow-md transition-transform hover:scale-125"
                        style={{ backgroundColor: station.risk_color }}
                      />
                    </div>
                  </MarkerContent>
                  <MarkerTooltip className="min-w-44 bg-background/90! text-foreground! border border-border backdrop-blur-md">
                    <div className="space-y-1.5">
                      <div className="font-semibold text-[11px] leading-tight">{station.name}</div>
                      <div className="border-t border-border/50 pt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                        <span className="text-muted-foreground">WQI now</span>
                        <span className="font-mono tabular-nums">{Math.round(station.wqi_current)}</span>
                        {station.wqi_predicted_7d != null && (
                          <>
                            <span className="text-muted-foreground">7d</span>
                            <span className="font-mono tabular-nums">{Math.round(station.wqi_predicted_7d)}</span>
                          </>
                        )}
                        {station.wqi_predicted_30d != null && (
                          <>
                            <span className="text-muted-foreground">30d</span>
                            <span className="font-mono tabular-nums">{Math.round(station.wqi_predicted_30d)}</span>
                          </>
                        )}
                        {station.metrics.temperature_c != null && (
                          <>
                            <span className="text-muted-foreground">Temp</span>
                            <span className="font-mono tabular-nums">{station.metrics.temperature_c.toFixed(1)} °C</span>
                          </>
                        )}
                      </div>
                    </div>
                  </MarkerTooltip>
                </MapMarker>
              ))}
            </Map>

            <div className="pointer-events-none absolute left-4 bottom-4 z-20 grid grid-cols-3 gap-2">
              <Stat label="Clean" value={wqiStations.filter((s) => s.risk_level === "clean").length} accent="emerald" />
              <Stat label="Moderate" value={wqiStations.filter((s) => s.risk_level === "moderate").length} accent="amber" />
              <Stat label="High Risk" value={wqiStations.filter((s) => s.risk_level === "high" || s.risk_level === "critical").length} accent="red" />
            </div>

            {/* Hovered river — rich card. Avoids the right-side panel + country tooltip. */}
            {hoveredRiver && hoveredRiverPoint && (
              <RiverHoverCard river={hoveredRiver} point={hoveredRiverPoint} />
            )}
          </section>

          {eventsOpen ? (
            <aside className="absolute md:static inset-x-2 bottom-2 top-2 md:inset-auto z-30 md:z-auto w-auto md:w-[320px] md:shrink-0 rounded-2xl border border-border glass overflow-hidden flex flex-col">
              {selectedWqiStation ? (
                <WqiDetailPanel
                  station={selectedWqiStation}
                  onBack={() => { setSelectedWqiStation(null); }}
                  onClose={() => setEventsOpen(false)}
                />
              ) : (
                <ListPanel
                  events={events}
                  anchor={searchAnchor}
                  selectedId={selectedPollutionId}
                  onSelect={(id) => {
                    setSelectedPollutionId(id);
                    const ev = events.find((p) => p.id === id);
                    if (ev) {
                      mapRef.current?.flyTo({ center: ev.coordinates, zoom: 13, duration: 1200 });
                    }
                  }}
                  wqiStations={wqiStations}
                  onSelectStation={(s) => {
                    setSelectedWqiStation(s);
                    setEventsOpen(true);
                    mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: 8, duration: 1000 });
                  }}
                  onClose={() => setEventsOpen(false)}
                />
              )}
            </aside>
          ) : (
            <button
              onClick={() => setEventsOpen(true)}
              className="flex flex-col items-center justify-center gap-2 w-9 rounded-2xl border border-border glass shrink-0 hover:bg-foreground/[0.04] transition-colors"
              aria-label="Show events panel"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              <Droplets className="h-4 w-4 text-blue-400" />
              <span className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground [writing-mode:vertical-rl] rotate-180 uppercase">
                Stations
              </span>
            </button>
          )}
        </main>

        <div className="px-4 pb-4">
          <PredictiveTimeline
            start={TIMELINE_START}
            end={TIMELINE_END}
            nowDate={NOW_DATE}
            value={timelineDate}
            onChange={setTimelineDate}
          />
        </div>
      </div>

      {isMobile ? (
        <NfcAuth
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onSuccess={() => { setAuthed(true); setAuthOpen(false); }}
        />
      ) : (
        <GestureAuth
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onSuccess={() => { setAuthed(true); setAuthOpen(false); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: "red" | "amber" | "emerald" }) {
  const dot =
    accent === "red"
      ? "bg-red-400 shadow-[0_0_8px_#ef4444]"
      : accent === "amber"
        ? "bg-amber-400 shadow-[0_0_8px_#f59e0b]"
        : "bg-emerald-400 shadow-[0_0_8px_#10b981]";
  return (
    <div className="rounded-md glass-strong px-3 py-2 min-w-22">
      <div className="flex items-center gap-1.5 text-[9px] tracking-[0.18em] uppercase text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function RiverHoverCard({
  river,
  point,
}: {
  river: RiverInfo;
  point: { x: number; y: number };
}) {
  // Snap to upper-left so the card never overlaps the right-side detail panel
  // or the choropleth tooltip docked under the legend.
  const left = Math.min(point.x + 18, 360);
  const top = Math.max(point.y - 80, 12);
  const tier =
    river.baseWqi < 190
      ? { label: "Degraded", color: "text-red-300", dot: "bg-red-400" }
      : river.baseWqi < 215
        ? { label: "At risk", color: "text-amber-300", dot: "bg-amber-400" }
        : { label: "Healthy", color: "text-emerald-300", dot: "bg-emerald-400" };

  return (
    <div
      className="pointer-events-none absolute z-30 w-[280px] rounded-xl glass-strong ring-1 ring-cyan-400/30 px-3.5 py-3 shadow-2xl"
      style={{ left, top }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">River basin</div>
          <div className="mt-0.5 text-[15px] font-semibold tracking-tight">{river.name}</div>
        </div>
        <span className="grid place-items-center h-6 px-2 rounded-full ring-1 ring-cyan-400/30 bg-cyan-400/10 text-[10px] tabular-nums text-cyan-200">
          {river.lengthKm.toLocaleString()} km
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-y-1 text-[10px]">
        <span className="text-muted-foreground">Basin</span>
        <span className="text-foreground/85 truncate">{river.basin}</span>
        <span className="text-muted-foreground">Countries</span>
        <span className="text-foreground/85 truncate">{river.countries.join(" · ")}</span>
        <span className="text-muted-foreground">Stations</span>
        <span className="text-foreground/85 tabular-nums">{river.monitoringStations}</span>
      </div>

      <div className="mt-2 rounded-md bg-foreground/[0.04] px-2.5 py-2 ring-1 ring-foreground/[0.06]">
        <div className="flex items-baseline gap-2">
          <span className="text-[18px] font-semibold tabular-nums text-cyan-300">
            {river.baseWqi.toFixed(1)}
          </span>
          <span className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground">avg WQI</span>
          <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-medium ${tier.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${tier.dot}`} />
            {tier.label}
          </span>
        </div>
        <div className="mt-1 text-[9.5px] leading-snug text-muted-foreground/85">
          Water Quality Index combines pH, dissolved oxygen, turbidity & contaminants.
          Lower is cleaner; values <span className="text-emerald-300">≤190</span> are healthy,
          <span className="text-amber-300"> 190–215</span> at risk,
          <span className="text-red-300"> ≥215</span> degraded.
        </div>
      </div>

      <div className="mt-2 text-[10px]">
        <div className="text-muted-foreground tracking-[0.18em] uppercase text-[9px] mb-1">
          Key pollutants
        </div>
        <div className="flex flex-wrap gap-1">
          {river.pollutants.map((p) => (
            <span
              key={p}
              className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 ring-1 ring-red-500/20"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground italic leading-snug">
        {river.highlights}
      </div>
    </div>
  );
}

function ListPanel({
  events,
  anchor,
  selectedId,
  onSelect,
  onClose,
  wqiStations,
  onSelectStation,
}: {
  events: PollutionEvent[];
  anchor: [number, number] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  wqiStations: WqiStation[];
  onSelectStation: (s: WqiStation) => void;
}) {
  const sorted = useMemo(() => {
    if (!anchor) return events;
    const [ax, ay] = anchor;
    return [...events].sort((a, b) => {
      const da = (a.coordinates[0] - ax) ** 2 + (a.coordinates[1] - ay) ** 2;
      const db = (b.coordinates[0] - ax) ** 2 + (b.coordinates[1] - ay) ** 2;
      return da - db;
    });
  }, [events, anchor]);
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <AlertTriangle className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
        <span className="font-medium text-[13px] tracking-tight">Active Events</span>
        <span className="ml-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 ring-1 ring-red-500/30 text-red-600 dark:text-red-300">
          {events.length}
        </span>
        <Droplets className="h-3.5 w-3.5 text-cyan-400" />
        <span className="font-medium text-[13px] tracking-tight">WQI Stations</span>
        <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/10 ring-1 ring-cyan-500/30 text-cyan-300">
          {wqiStations.length}
        </span>
        <button
          onClick={onClose}
          className="rounded-sm p-1 hover:bg-foreground/[0.04] transition-colors"
          aria-label="Hide panel"
        >
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <ul className="flex flex-col gap-2 p-3 overflow-y-auto flex-1">
        {sorted.map((event) => (
          <li key={event.id}>
            <StationCard
              event={event}
              selected={event.id === selectedId}
              onClick={() => onSelect(event.id)}
            />
          </li>
        ))}
        {wqiStations.length === 0 ? (
          <li className="text-[11px] text-muted-foreground text-center py-8">Loading stations…</li>
        ) : (
          wqiStations.map((s) => (
            <li key={s.water_body_id}>
              <WqiStationCard station={s} onClick={() => onSelectStation(s)} />
            </li>
          ))
        )}
      </ul>
    </>
  );
}

function WqiStationCard({ station, onClick }: { station: WqiStation; onClick: () => void }) {
  const TrendIcon =
    station.trend === "worsening"
      ? TrendingDown
      : station.trend === "improving"
        ? TrendingUp
        : Minus;
  const trendColor =
    station.trend === "worsening"
      ? "text-red-300"
      : station.trend === "improving"
        ? "text-emerald-300"
        : "text-muted-foreground";
  return (
    <button
      onClick={onClick}
      className="group w-full text-left rounded-xl border border-border bg-card/40 p-3.5 transition-all hover:bg-white/2.5 hover:border-white/10"
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium tracking-tight truncate">{station.name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {station.country} · <span className="capitalize">{station.water_body_type}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-bold tabular-nums" style={{ color: station.risk_color }}>
            {Math.round(station.wqi_current)}
          </div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">WQI</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[10px]">
        <span
          className="capitalize px-1.5 py-0.5 rounded-full ring-1"
          style={{
            backgroundColor: station.risk_color + "20",
            color: station.risk_color,
            borderColor: station.risk_color + "50",
          }}
        >
          {station.risk_level}
        </span>
        <span className={`flex items-center gap-0.5 ${trendColor}`}>
          <TrendIcon className="h-3 w-3" />
          <span className="capitalize">{station.trend}</span>
          {station.trend_pct_change !== 0 && (
            <span className="text-muted-foreground ml-0.5">
              ({station.trend_pct_change > 0 ? "+" : ""}{station.trend_pct_change.toFixed(1)}%)
            </span>
          )}
        </span>
        {station.data_source === "real" && (
          <span className="ml-auto text-[9px] tracking-wider text-cyan-400">REAL</span>
        )}
      </div>
    </button>
  );
}

function BigMetric({ icon, label, value, unit, tight }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; tight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-foreground/[0.02] ring-1 ring-foreground/[0.06] p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] tracking-[0.14em] uppercase">{label}</span>
      </div>
      <div className={`mt-1 font-semibold text-foreground tabular-nums ${tight ? "text-xs leading-tight" : "text-base"}`}>
        {value}
        {unit ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  );
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function WqiMetric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 text-center ${accent ? "bg-blue-500/10 ring-1 ring-blue-400/30" : "bg-foreground/[0.02] ring-1 ring-foreground/[0.06]"}`}>
      <div className="text-[9px] tracking-[0.14em] uppercase text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${accent ? "text-blue-600 dark:text-blue-200" : "text-foreground/90"}`}>{value}</div>
    </div>
  );
}

function WqiDetailPanel({
  station,
  onBack,
  onClose,
}: {
  station: WqiFeature;
  onBack: () => void;
  onClose: () => void;
}) {
  const [reporting, setReporting] = useState<"idle" | "loading" | "error">("idle");

  const handleGenerateReport = async () => {
    setReporting("loading");
    try {
      const riskToSeverity: Record<WqiFeature["risk_level"], "High" | "Medium" | "Low"> = {
        critical: "High",
        high: "High",
        moderate: "Medium",
        clean: "Low",
      };
      const blob = await generateReportPdf({
        event_id: station.water_body_id,
        river: station.name,
        location: `${station.name}, ${station.country}`,
        severity: riskToSeverity[station.risk_level],
        type: station.water_body_type,
        date: station.last_updated.slice(0, 10),
        description:
          `${station.name} — WQI ${station.wqi_current}. ` +
          `30-day forecast: ${station.wqi_predicted_30d} (${station.trend}, ` +
          `${station.trend_pct_change > 0 ? "+" : ""}${station.trend_pct_change}%). ` +
          (station.anomaly_count_30d != null
            ? `${station.anomaly_count_30d} anomalies detected in the last 30 days.`
            : "Synthetic estimate from ERA5 climate proxies."),
        metrics: {
          ph: station.metrics.ph ?? 7.0,
          dissolved_oxygen: station.metrics.oxygen_mg_l ?? 6.5,
          turbidity: station.metrics.turbidity_ntu ?? 5.0,
          contaminant: station.risk_level === "critical" ? "Multiple — see report" : "Within EU thresholds",
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `watershield_report_${station.water_body_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setReporting("idle");
    } catch {
      setReporting("error");
      setTimeout(() => setReporting("idle"), 3000);
    }
  };

  const riskColor = {
    clean: "text-emerald-600 dark:text-emerald-300",
    moderate: "text-amber-500 dark:text-amber-300",
    high: "text-red-500 dark:text-red-300",
    critical: "text-red-600 dark:text-red-400",
  }[station.risk_level] ?? "text-foreground";

  type AiVerdict = {
    verdict: "normal" | "anomaly" | "critical";
    confidence: number;
    summary: string;
    risks: string[];
    recommendations: string[];
    pollutant_likely?: string | null;
  };
  const [ai, setAi] = useState<AiVerdict | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Reset AI panel whenever a different station is selected.
  useEffect(() => {
    setAi(null); setAiError(null);
  }, [station.water_body_id]);

  const riverFromName = station.name.split(" - ")[0].replace(/ River$/, "");
  const cityFromName = station.name.split(" - ").slice(1).join(" - ") || station.country;
  const severity =
    station.risk_level === "critical" ? "High"
    : station.risk_level === "high" ? "High"
    : station.risk_level === "moderate" ? "Medium" : "Low";

  const runAi = async () => {
    setAiLoading(true); setAiError(null); setAi(null);
    try {
      const r = await fetch("http://127.0.0.1:8000/api/analysis/anomaly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          river: riverFromName,
          location: cityFromName,
          type: "Chemical",
          severity,
          date: station.last_updated.slice(0, 10),
          description: `WQI ${Math.round(station.wqi_current)} on ${station.water_body_type}, trend ${station.trend}.`,
          metrics: {
            ph: station.metrics.ph ?? 7.2,
            dissolved_oxygen: station.metrics.oxygen_mg_l ?? 8.0,
            turbidity: station.metrics.turbidity_ntu ?? 5.0,
            contaminant: null,
          },
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setAi(await r.json());
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed");
    } finally {
      setAiLoading(false);
    }
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const r = await fetch("http://127.0.0.1:8000/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: station.water_body_id,
          river: riverFromName,
          location: cityFromName,
          severity,
          type: "WQI Monitoring",
          date: station.last_updated.slice(0, 10),
          description:
            `WQI ${Math.round(station.wqi_current)} (7d ${Math.round(station.wqi_predicted_7d)}, ` +
            `30d ${Math.round(station.wqi_predicted_30d)}). Trend: ${station.trend} ` +
            `(${station.trend_pct_change > 0 ? "+" : ""}${station.trend_pct_change.toFixed(1)}%).`,
          metrics: {
            ph: station.metrics.ph ?? 7.2,
            dissolved_oxygen: station.metrics.oxygen_mg_l ?? 8.0,
            turbidity: station.metrics.turbidity_ntu ?? 5.0,
            contaminant: null,
          },
          ai_summary: ai?.summary ?? null,
          snapshot_date: station.last_updated.slice(0, 10),
          confidence: ai?.confidence ?? null,
          is_predictive: false,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `watershield_${station.water_body_id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="rounded-sm p-1 hover:bg-foreground/[0.04] transition-colors" aria-label="Back">
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <Droplets className="h-3.5 w-3.5 text-blue-400" />
        <span className="font-medium text-[13px] tracking-tight truncate">{station.name}</span>
        <button onClick={onClose} className="ml-auto rounded-sm p-1 hover:bg-foreground/[0.04] transition-colors" aria-label="Hide">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">Water Quality Index</div>
          <div className="grid grid-cols-3 gap-2">
            <WqiMetric label="Current" value={Math.round(station.wqi_current)} accent />
            <WqiMetric label="7d forecast" value={Math.round(station.wqi_predicted_7d)} />
            <WqiMetric label="30d forecast" value={Math.round(station.wqi_predicted_30d)} />
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            30d range: {Math.round(station.wqi_lower_30d)} – {Math.round(station.wqi_upper_30d)}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-foreground/[0.02] ring-1 ring-foreground/[0.06] p-3">
          <div>
            <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Risk Level</div>
            <div className={`mt-0.5 text-sm font-semibold capitalize ${riskColor}`}>{station.risk_level}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Trend</div>
            <div className={`mt-0.5 text-sm font-semibold flex items-center gap-1 justify-end ${
              station.trend === "worsening" ? "text-red-500 dark:text-red-300" :
              station.trend === "improving" ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground"
            }`}>
              {station.trend === "worsening" ? <TrendingDown className="h-3.5 w-3.5" /> :
               station.trend === "improving" ? <TrendingUp className="h-3.5 w-3.5" /> :
               <Minus className="h-3.5 w-3.5" />}
              <span className="capitalize">{station.trend}</span>
              {station.trend_pct_change !== 0 && (
                <span className="text-[10px] font-normal text-muted-foreground ml-0.5">
                  ({station.trend_pct_change > 0 ? "+" : ""}{station.trend_pct_change.toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
        </div>

        {(station.metrics.temperature_c != null || station.metrics.ph != null ||
          station.metrics.oxygen_mg_l != null || station.metrics.turbidity_ntu != null) && (
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">Sensor Readings</div>
            <div className="grid grid-cols-2 gap-2">
              {station.metrics.temperature_c != null && (
                <BigMetric icon={<Gauge className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Temp" value={station.metrics.temperature_c.toFixed(1)} unit="°C" />
              )}
              {station.metrics.ph != null && (
                <BigMetric icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.5} />} label="pH" value={station.metrics.ph.toFixed(2)} />
              )}
              {station.metrics.oxygen_mg_l != null && (
                <BigMetric icon={<Waves className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Dissolved O₂" value={station.metrics.oxygen_mg_l.toFixed(1)} unit="mg/L" />
              )}
              {station.metrics.turbidity_ntu != null && (
                <BigMetric icon={<Waves className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Turbidity" value={station.metrics.turbidity_ntu.toFixed(1)} unit="NTU" />
              )}
            </div>
          </div>
        )}

        {station.anomaly_count_30d != null && (
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/3 p-3">
            <div className="text-[10px] tracking-[0.18em] uppercase text-amber-600 dark:text-amber-200 mb-1">Anomaly Count (30d)</div>
            <div className="text-2xl font-bold tabular-nums text-amber-500 dark:text-amber-300">{station.anomaly_count_30d}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Detected by XGBoost model</div>
          </div>
        )}

        {/* ── AI anomaly analysis (OpenAI-backed, EU-WFD framing) ────────── */}
        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.03] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-3.5 w-3.5 text-cyan-400" />
            <div className="text-[10px] tracking-[0.18em] uppercase text-cyan-600 dark:text-cyan-300">
              AI Anomaly Analysis
            </div>
          </div>
          {!ai && !aiLoading && (
            <button
              onClick={runAi}
              className="w-full rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 ring-1 ring-cyan-500/30 px-3 py-2 text-[12px] font-medium text-cyan-700 dark:text-cyan-200 transition-colors"
            >
              Run AI analysis
            </button>
          )}
          {aiLoading && (
            <div className="text-[11px] text-muted-foreground">Analysing measurements with EU-WFD reference thresholds…</div>
          )}
          {aiError && (
            <div className="text-[11px] text-red-400">Failed: {aiError}</div>
          )}
          {ai && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] tracking-wider uppercase ring-1 ${
                    ai.verdict === "critical"
                      ? "bg-red-500/15 ring-red-500/40 text-red-300"
                      : ai.verdict === "anomaly"
                        ? "bg-amber-500/15 ring-amber-500/40 text-amber-300"
                        : "bg-emerald-500/15 ring-emerald-500/40 text-emerald-300"
                  }`}
                >
                  {ai.verdict}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  confidence {ai.confidence}%
                </span>
              </div>
              <div className="text-[11px] text-foreground/85 leading-snug">{ai.summary}</div>
              {ai.risks.length > 0 && (
                <ul className="text-[10.5px] text-foreground/70 list-disc pl-4 space-y-0.5">
                  {ai.risks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
              {ai.recommendations.length > 0 && (
                <div>
                  <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-1">Recommended actions</div>
                  <ul className="text-[10.5px] text-foreground/80 list-decimal pl-4 space-y-0.5">
                    {ai.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── PDF download (EU-WFD compliance report) ────────────────────── */}
        <button
          onClick={downloadPdf}
          disabled={pdfLoading}
          className="w-full rounded-md bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-50 ring-1 ring-blue-500/30 px-3 py-2 text-[12px] font-medium text-blue-700 dark:text-blue-200 inline-flex items-center justify-center gap-2 transition-colors"
        >
          {pdfLoading ? "Preparing PDF…" : "Download PDF report"}
        </button>

        <div className="text-[10px] text-muted-foreground text-right">
          Updated: {new Date(station.last_updated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </div>

        <button
          onClick={handleGenerateReport}
          disabled={reporting === "loading"}
          className="flex items-center justify-center gap-2 w-full rounded-lg px-4 py-2.5 text-[12px] font-medium transition-colors bg-blue-500/10 hover:bg-blue-500/20 ring-1 ring-blue-400/30 text-blue-600 dark:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {reporting === "loading" ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating PDF…</>
          ) : reporting === "error" ? (
            <span className="text-red-400">Failed — try again</span>
          ) : (
            <><FileDown className="h-3.5 w-3.5" /> Generate EU WFD Report</>          )}
        </button>
      </div>
    </>
  );
}
