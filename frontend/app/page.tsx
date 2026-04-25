"use client";

import GestureAuth from "@/components/gesture-auth";
import PredictiveTimeline from "@/components/predictive-timeline";
import Sidebar from "@/components/sidebar";
import StationCard from "@/components/station-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Map, MapMarker, MarkerContent, MarkerTooltip } from "@/components/ui/map";
import {
  detectAnomaly,
  eventToReportRequest,
  generateReportPdf,
  type AnomalyResult,
} from "@/lib/api";
import { POLLUTION_EVENTS, type PollutionEvent } from "@/lib/pollution-data";
import ChoroplethLayer from "@/components/map/choropleth-layer";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Droplets,
  Fingerprint,
  Gauge,
  Loader2,
  MapPin,
  Minus,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Waves,
} from "lucide-react";
import type MapLibreGL from "maplibre-gl";
import Link from "next/link";
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

const NOW_DATE = new Date("2026-04-25T00:00:00Z");
const TIMELINE_START = new Date("2024-01-01T00:00:00Z");
const TIMELINE_END = new Date("2027-12-31T00:00:00Z");
const CLUSTER_MAX_ZOOM = 11;

const POLLUTION_GEOJSON: GeoJSON.FeatureCollection<
  GeoJSON.Point,
  { id: string; severity: string }
> = {
  type: "FeatureCollection",
  features: POLLUTION_EVENTS.map((e) => ({
    type: "Feature",
    properties: { id: e.id, severity: e.severity },
    geometry: { type: "Point", coordinates: e.coordinates },
  })),
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedPollutionId, setSelectedPollutionId] = useState<string | null>(null);
  const [eventsOpen, setEventsOpen] = useState(true);

  const [timelineDate, setTimelineDate] = useState<Date>(NOW_DATE);
  const isPredictive = timelineDate.getTime() > NOW_DATE.getTime();
  const monthsAfterNow = Math.max(
    0,
    (timelineDate.getTime() - NOW_DATE.getTime()) / (86_400_000 * 30.4375),
  );
  const confidence =
    monthsAfterNow <= 0
      ? 100
      : Math.max(35, Math.round(Math.exp(-0.0476 * monthsAfterNow) * 100));

  const [showWqi, setShowWqi] = useState(true);
  const [selectedWqiStation, setSelectedWqiStation] = useState<WqiFeature | null>(null);

  const [authOpen, setAuthOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  const [anomaly, setAnomaly] = useState<AnomalyResult | null>(null);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyError, setAnomalyError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const selectedEvent = useMemo(
    () => POLLUTION_EVENTS.find((e) => e.id === selectedPollutionId) ?? null,
    [selectedPollutionId],
  );

  useEffect(() => {
    // Intentional reset on selection change — value is independent of state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnomaly(null);
     
    setAnomalyError(null);
  }, [selectedPollutionId]);

  // ---------- map: rivers ----------
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
      if (!mapInstance.getLayer("rivers-line")) {
        mapInstance.addLayer({
          id: "rivers-line",
          type: "line",
          source: "rivers",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#22d3ee", "line-width": 1.5, "line-opacity": 0.55 },
        });
      }
    };
    const onStyle = () => mapInstance.isStyleLoaded() && setupRivers();
    mapInstance.on("styledata", onStyle);
    if (mapInstance.isStyleLoaded()) setupRivers();
    return () => { mapInstance.off("styledata", onStyle); };
  }, [mapInstance]);

  // ---------- map: wqi stations ----------
  useEffect(() => {
    if (!mapInstance) return;
    const SRC = "wqi-stations";
    const LYR = "wqi-circles";
    const HALO = "wqi-halo";

    const setup = () => {
      if (!mapInstance.getSource(SRC)) {
        mapInstance.addSource(SRC, { type: "geojson", data: "/data/watershield_europe.geojson" });
      }
      if (!mapInstance.getLayer(HALO)) {
        mapInstance.addLayer({
          id: HALO, type: "circle", source: SRC,
          paint: {
            "circle-radius": 14,
            "circle-color": ["get", "risk_color"],
            "circle-opacity": 0.18,
            "circle-blur": 0.7,
          },
        });
      }
      if (!mapInstance.getLayer(LYR)) {
        mapInstance.addLayer({
          id: LYR, type: "circle", source: SRC,
          paint: {
            "circle-radius": 7,
            "circle-color": ["get", "risk_color"],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "rgba(255,255,255,0.85)",
          },
        });
      }
    };

    const onStyleData = () => mapInstance.isStyleLoaded() && setup();

    const onWqiClick = (e: MapLibreGL.MapMouseEvent & { features?: MapLibreGL.MapGeoJSONFeature[] }) => {
      const features = mapInstance.queryRenderedFeatures(e.point, { layers: [LYR] });
      if (!features.length) return;
      const raw = features[0].properties ?? {};
      const metrics = typeof raw.metrics === "string" ? JSON.parse(raw.metrics) : (raw.metrics ?? {});
      const station: WqiFeature = {
        water_body_id: raw.water_body_id,
        name: raw.name,
        country: raw.country,
        country_code: raw.country_code,
        water_body_type: raw.water_body_type,
        wqi_current: raw.wqi_current,
        wqi_predicted_7d: raw.wqi_predicted_7d,
        wqi_predicted_30d: raw.wqi_predicted_30d,
        wqi_lower_30d: raw.wqi_lower_30d,
        wqi_upper_30d: raw.wqi_upper_30d,
        risk_level: raw.risk_level,
        risk_color: raw.risk_color,
        trend: raw.trend,
        trend_pct_change: raw.trend_pct_change,
        anomaly_count_30d: raw.anomaly_count_30d ?? null,
        data_source: raw.data_source,
        last_updated: raw.last_updated,
        metrics,
      };
      setSelectedWqiStation(station);
      setEventsOpen(true);
      setSelectedPollutionId(null);
      const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
      mapInstance.flyTo({ center: coords, zoom: 8, duration: 1000 });
    };

    const cursorOn = () => { mapInstance.getCanvas().style.cursor = "pointer"; };
    const cursorOff = () => { mapInstance.getCanvas().style.cursor = ""; };

    mapInstance.on("styledata", onStyleData);
    mapInstance.on("click", LYR, onWqiClick);
    mapInstance.on("mouseenter", LYR, cursorOn);
    mapInstance.on("mouseleave", LYR, cursorOff);
    if (mapInstance.isStyleLoaded()) setup();

    return () => {
      mapInstance.off("styledata", onStyleData);
      mapInstance.off("click", LYR, onWqiClick);
      mapInstance.off("mouseenter", LYR, cursorOn);
      mapInstance.off("mouseleave", LYR, cursorOff);
    };
  }, [mapInstance]);

  // ---------- wqi visibility toggle ----------
  useEffect(() => {
    if (!mapInstance) return;
    const vis = showWqi ? "visible" : "none";
    const toggle = () => {
      if (mapInstance.getLayer("wqi-circles")) mapInstance.setLayoutProperty("wqi-circles", "visibility", vis);
      if (mapInstance.getLayer("wqi-halo")) mapInstance.setLayoutProperty("wqi-halo", "visibility", vis);
    };
    if (mapInstance.isStyleLoaded()) toggle();
    mapInstance.on("styledata", toggle);
    return () => { mapInstance.off("styledata", toggle); };
  }, [mapInstance, showWqi]);

  // ---------- map: pollution clusters ----------
  useEffect(() => {
    if (!mapInstance) return;
    const SRC = "pollution-clusters";
    const CL = "pollution-cluster-circles";
    const CC = "pollution-cluster-count";

    const setup = () => {
      if (!mapInstance.getSource(SRC)) {
        mapInstance.addSource(SRC, {
          type: "geojson",
          data: POLLUTION_GEOJSON,
          cluster: true,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterRadius: 45,
        });
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
  }, [mapInstance]);

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
    setQuery(r.display_name);
    setShowSuggestions(false);
    setSuggestions([]);
    mapRef.current?.flyTo({ center: [parseFloat(r.lon), parseFloat(r.lat)], zoom: 10, duration: 1500 });
  };
  const handleSearch = () => { if (suggestions.length > 0) handleSelect(suggestions[0]); };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ---------- AI ----------
  const runAnomalyDetection = async () => {
    if (!selectedEvent) return;
    setAnomalyLoading(true);
    setAnomalyError(null);
    try {
      setAnomaly(await detectAnomaly(selectedEvent));
    } catch (err) {
      setAnomalyError(err instanceof Error ? err.message : "Anomaly detection failed");
    } finally {
      setAnomalyLoading(false);
    }
  };

  const downloadReport = async () => {
    if (!selectedEvent) return;
    setReportLoading(true);
    try {
      const blob = await generateReportPdf(eventToReportRequest(selectedEvent, anomaly?.summary));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `WaterShield-Report-${selectedEvent.id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setAnomalyError(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar
        authed={authed}
        onSignIn={() => setAuthOpen(true)}
        onSignOut={() => setAuthed(false)}
      />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border px-6 bg-background/40 backdrop-blur-md">
          <div className="hidden md:block">
            <div className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
              Live · Europe · Sentinel-2
            </div>
            <div className="text-[13px] font-medium text-foreground/90">
              Pollution Intelligence Console
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3 w-full max-w-md">
            <div className="relative flex-1" ref={containerRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground z-10" />
              <Input
                className="pl-9 h-9 bg-white/2 border-white/6 focus-visible:ring-cyan-400/30 focus-visible:border-cyan-400/40 placeholder:text-muted-foreground/60 text-sm"
                placeholder="Search city, region or coordinates"
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
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-2 z-50 rounded-lg glass-strong overflow-hidden divide-y divide-white/4">
                  {suggestions.map((s) => (
                    <li
                      key={s.place_id}
                      className="px-4 py-2.5 cursor-pointer text-sm hover:bg-white/4 truncate text-foreground/85"
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
              className="hidden md:inline-flex h-9 gap-2 bg-cyan-400/10 hover:bg-cyan-400/15 border-cyan-400/30 text-cyan-200 hover:text-cyan-100"
            >
              <Fingerprint className="h-3.5 w-3.5" />
              Sign In
            </Button>
          )}
        </header>

        <main className="relative flex flex-1 min-h-0 gap-4 px-4 pt-4 pb-3">
          <section className="relative flex-1 rounded-2xl overflow-hidden border border-border min-w-0 glass">
            <Map ref={mapCallbackRef}>
              <ChoroplethLayer />
              {POLLUTION_EVENTS.map((event) => (
                <MapMarker
                  key={event.id}
                  longitude={event.coordinates[0]}
                  latitude={event.coordinates[1]}
                  onClick={() => {
                    setSelectedPollutionId(event.id);
                    setSelectedWqiStation(null);
                    setEventsOpen(true);
                    mapRef.current?.flyTo({ center: event.coordinates, zoom: CLUSTER_MAX_ZOOM + 1, duration: 1200 });
                  }}
                >
                  <MarkerContent>
                    <div className="relative flex items-center justify-center">
                      <div
                        className={`w-5 h-5 rounded-full border-2 border-white shadow-lg ${
                          event.severity === "High"
                            ? "bg-red-500"
                            : event.severity === "Medium"
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        } ${
                          event.id === selectedPollutionId
                            ? "ring-2 ring-white ring-offset-1 ring-offset-transparent scale-125"
                            : ""
                        } transition-transform cursor-pointer`}
                      />
                      {event.status === "Active" && (
                        <span
                          className={`absolute w-5 h-5 rounded-full animate-ping opacity-60 ${
                            event.severity === "High" ? "bg-red-500" : "bg-amber-500"
                          }`}
                        />
                      )}
                    </div>
                  </MarkerContent>
                  <MarkerTooltip className="min-w-45 bg-background/90! text-foreground! border border-border backdrop-blur-md">
                    <div className="space-y-1.5">
                      <div className="font-semibold text-[11px] leading-tight">{event.river} · {event.location}</div>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          event.severity === "High" ? "bg-red-400" : event.severity === "Medium" ? "bg-amber-400" : "bg-emerald-400"
                        }`} />
                        <span className="text-[10px] text-muted-foreground">{event.severity} · {event.status}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{event.type}</span>
                      </div>
                      <div className="border-t border-border/50 pt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                        <span className="text-muted-foreground">pH</span>
                        <span className="font-mono tabular-nums">{event.samplingData.ph}</span>
                        <span className="text-muted-foreground">DO</span>
                        <span className="font-mono tabular-nums">{event.samplingData.dissolvedOxygen} mg/L</span>
                        <span className="text-muted-foreground col-span-2 truncate">{event.samplingData.contaminant}</span>
                      </div>
                    </div>
                  </MarkerTooltip>
                </MapMarker>
              ))}
            </Map>

            {isPredictive && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-full glass-strong px-4 py-2 ring-1 ring-cyan-400/40">
                <Sparkles className="h-3.5 w-3.5 text-(--color-cyan)" />
                <span className="text-[11px] tracking-[0.2em] uppercase text-cyan-200">
                  AI Forecast
                </span>
                <span className="h-3 w-px bg-white/10" />
                <span className="text-[11px] font-mono text-foreground/80">
                  {fmtMonth(timelineDate)} · {confidence}%
                </span>
              </div>
            )}

            <button
              onClick={() => setShowWqi((v) => !v)}
              className={`absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                showWqi
                  ? "bg-blue-500/20 ring-1 ring-blue-400/50 text-blue-200 hover:bg-blue-500/30"
                  : "bg-white/4 ring-1 ring-white/8 text-muted-foreground hover:bg-white/8"
              }`}
            >
              <Droplets className="h-3 w-3" />
              WQI Stations
            </button>

            <div className="pointer-events-none absolute left-4 bottom-4 z-20 grid grid-cols-3 gap-2">
              <Stat label="Active" value={POLLUTION_EVENTS.filter((e) => e.status === "Active").length} accent="red" />
              <Stat label="Contained" value={POLLUTION_EVENTS.filter((e) => e.status === "Contained").length} accent="amber" />
              <Stat label="Resolved" value={POLLUTION_EVENTS.filter((e) => e.status === "Resolved").length} accent="emerald" />
            </div>
          </section>

          {eventsOpen ? (
            <aside className="w-[320px] shrink-0 rounded-2xl border border-border glass overflow-hidden flex flex-col">
              {selectedWqiStation ? (
                <WqiDetailPanel
                  station={selectedWqiStation}
                  onBack={() => setSelectedWqiStation(null)}
                  onClose={() => setEventsOpen(false)}
                />
              ) : selectedEvent ? (
                <DetailPanel
                  event={selectedEvent}
                  onBack={() => setSelectedPollutionId(null)}
                  onClose={() => setEventsOpen(false)}
                  anomaly={anomaly}
                  anomalyLoading={anomalyLoading}
                  anomalyError={anomalyError}
                  onAnalyze={runAnomalyDetection}
                  onReport={downloadReport}
                  reportLoading={reportLoading}
                />
              ) : (
                <ListPanel
                  selectedId={selectedPollutionId}
                  onSelect={(id) => {
                    setSelectedPollutionId(id);
                    const ev = POLLUTION_EVENTS.find((p) => p.id === id);
                    if (ev) {
                      mapRef.current?.flyTo({ center: ev.coordinates, zoom: 13, duration: 1200 });
                    }
                  }}
                  onClose={() => setEventsOpen(false)}
                />
              )}
            </aside>
          ) : (
            <button
              onClick={() => setEventsOpen(true)}
              className="flex flex-col items-center justify-center gap-2 w-9 rounded-2xl border border-border glass shrink-0 hover:bg-white/4 transition-colors"
              aria-label="Show events panel"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground [writing-mode:vertical-rl] rotate-180 uppercase">
                Events
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

      <GestureAuth
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => { setAuthed(true); setAuthOpen(false); }}
      />
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

function ListPanel({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
        <span className="font-medium text-[13px] tracking-tight">Active Events</span>
        <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 ring-1 ring-red-500/30 text-red-300">
          {POLLUTION_EVENTS.length}
        </span>
        <button
          onClick={onClose}
          className="rounded-sm p-1 hover:bg-white/4 transition-colors"
          aria-label="Hide panel"
        >
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <ul className="flex flex-col gap-2 p-3 overflow-y-auto flex-1">
        {POLLUTION_EVENTS.map((event) => (
          <li key={event.id}>
            <StationCard
              event={event}
              selected={event.id === selectedId}
              onClick={() => onSelect(event.id)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function DetailPanel({
  event, onBack, onClose,
  anomaly, anomalyLoading, anomalyError,
  onAnalyze, onReport, reportLoading,
}: {
  event: PollutionEvent;
  onBack: () => void;
  onClose: () => void;
  anomaly: AnomalyResult | null;
  anomalyLoading: boolean;
  anomalyError: string | null;
  onAnalyze: () => void;
  onReport: () => void;
  reportLoading: boolean;
}) {
  const isHigh = event.severity === "High";
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="rounded-sm p-1 hover:bg-white/4 transition-colors" aria-label="Back">
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <span className="font-medium text-[13px] tracking-tight truncate">{event.river}</span>
        <span className={`ml-auto text-[10px] tracking-[0.16em] uppercase ${
          isHigh ? "text-red-300" : event.severity === "Medium" ? "text-amber-300" : "text-emerald-300"
        }`}>
          {event.severity}
        </span>
        <button onClick={onClose} className="rounded-sm p-1 hover:bg-white/4 transition-colors" aria-label="Hide">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <div className="flex items-center gap-2 text-[11px]">
          <MapPin className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground truncate">{event.location}</span>
          <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] tracking-wider uppercase ring-1 ${
            event.status === "Active"
              ? "bg-red-500/10 ring-red-500/30 text-red-300"
              : event.status === "Contained"
                ? "bg-amber-500/10 ring-amber-500/30 text-amber-300"
                : "bg-emerald-500/10 ring-emerald-500/30 text-emerald-300"
          }`}>
            {event.status}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-foreground/75">{event.description}</p>

        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">Water Profile</div>
          <div className="grid grid-cols-2 gap-2">
            <BigMetric icon={<Gauge className="h-3.5 w-3.5" strokeWidth={1.5} />} label="pH" value={event.samplingData.ph.toFixed(1)} />
            <BigMetric icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Dissolved O₂" value={`${event.samplingData.dissolvedOxygen}`} unit="mg/L" />
            <BigMetric icon={<Waves className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Turbidity" value={`${event.samplingData.turbidity}`} unit="NTU" />
            <BigMetric icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Contaminant" value={event.samplingData.contaminant} tight />
          </div>
        </div>

        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/3 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-(--color-cyan)" />
            <span className="text-[11px] tracking-[0.18em] uppercase text-cyan-200">
              Neural Anomaly Detection
            </span>
          </div>

          {!anomaly && !anomalyLoading && !anomalyError && (
            <Button size="sm" onClick={onAnalyze} className="w-full h-8 bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-100 border border-cyan-400/30">
              Run AI Analysis
            </Button>
          )}
          {anomalyLoading && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Querying neural model…
            </div>
          )}
          {anomalyError && <div className="text-[11px] text-red-300">{anomalyError}</div>}
          {anomaly && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] tracking-[0.18em] uppercase">
                <span className={
                  anomaly.verdict === "critical" ? "text-red-300" :
                  anomaly.verdict === "anomaly" ? "text-amber-300" : "text-emerald-300"
                }>
                  {anomaly.verdict}
                </span>
                <span className="text-muted-foreground">{anomaly.confidence}% conf</span>
              </div>
              <p className="text-[11px] leading-relaxed text-foreground/80">{anomaly.summary}</p>
              {anomaly.risks?.length ? (
                <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                  {anomaly.risks.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        <Button
          size="sm"
          onClick={onReport}
          disabled={reportLoading}
          className="w-full h-9 gap-2 bg-foreground/95 text-background hover:bg-foreground"
        >
          {reportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Generate EU Report (PDF)
        </Button>

        <Link
          href={`/pollution/${event.id}`}
          className="text-[11px] text-muted-foreground hover:text-cyan-200 transition-colors text-center"
        >
          Full case file →
        </Link>
      </div>
    </>
  );
}

function BigMetric({ icon, label, value, unit, tight }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; tight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-white/2 ring-1 ring-white/4 p-2.5">
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
    <div className={`rounded-lg p-2.5 text-center ${accent ? "bg-blue-500/10 ring-1 ring-blue-400/30" : "bg-white/2 ring-1 ring-white/4"}`}>
      <div className="text-[9px] tracking-[0.14em] uppercase text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${accent ? "text-blue-200" : "text-foreground/90"}`}>{value}</div>
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
  const riskColor = {
    clean: "text-emerald-300",
    moderate: "text-amber-300",
    high: "text-red-300",
    critical: "text-red-400",
  }[station.risk_level] ?? "text-foreground";

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="rounded-sm p-1 hover:bg-white/4 transition-colors" aria-label="Back">
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <Droplets className="h-3.5 w-3.5 text-blue-400" />
        <span className="font-medium text-[13px] tracking-tight truncate">{station.name}</span>
        <button onClick={onClose} className="ml-auto rounded-sm p-1 hover:bg-white/4 transition-colors" aria-label="Hide">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <MapPin className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">{station.country}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground capitalize">{station.water_body_type}</span>
          {station.data_source === "real" && (
            <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] tracking-wider uppercase ring-1 bg-cyan-500/10 ring-cyan-500/30 text-cyan-300">
              Real data
            </span>
          )}
        </div>

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

        <div className="flex items-center justify-between rounded-lg bg-white/2 ring-1 ring-white/4 p-3">
          <div>
            <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Risk Level</div>
            <div className={`mt-0.5 text-sm font-semibold capitalize ${riskColor}`}>{station.risk_level}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Trend</div>
            <div className={`mt-0.5 text-sm font-semibold flex items-center gap-1 justify-end ${
              station.trend === "worsening" ? "text-red-300" :
              station.trend === "improving" ? "text-emerald-300" : "text-muted-foreground"
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
                <BigMetric icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />} label="Turbidity" value={station.metrics.turbidity_ntu.toFixed(1)} unit="NTU" />
              )}
            </div>
          </div>
        )}

        {station.anomaly_count_30d != null && (
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/3 p-3">
            <div className="text-[10px] tracking-[0.18em] uppercase text-amber-200 mb-1">Anomaly Count (30d)</div>
            <div className="text-2xl font-bold tabular-nums text-amber-300">{station.anomaly_count_30d}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Detected by XGBoost model</div>
          </div>
        )}

        <div className="text-[10px] text-muted-foreground text-right">
          Updated: {new Date(station.last_updated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>
    </>
  );
}
