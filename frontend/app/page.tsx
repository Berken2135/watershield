"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Droplets, Search, X, Thermometer, Waves, Activity, Gauge } from "lucide-react";
import { Map } from "../components/ui/map";
import type MapLibreGL from "maplibre-gl";

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

type RiverData = {
  id: string;
  name: string;
  country: string;
  temperature: number;
  waterLevel: number;
  flowRate: number;
  pH: number;
  quality: "Good" | "Moderate" | "Poor";
};

const RIVERS: RiverData[] = [
  { id: "amazon",      name: "Amazon",      country: "South America",  temperature: 28, waterLevel: 8.3, flowRate: 209000, pH: 6.5, quality: "Good" },
  { id: "nile",        name: "Nile",        country: "Africa",         temperature: 22, waterLevel: 4.1, flowRate: 2830,   pH: 7.8, quality: "Moderate" },
  { id: "mississippi", name: "Mississippi", country: "United States",  temperature: 16, waterLevel: 5.2, flowRate: 16800,  pH: 7.3, quality: "Moderate" },
  { id: "danube",      name: "Danube",      country: "Central Europe", temperature: 14, waterLevel: 3.2, flowRate: 6500,   pH: 7.4, quality: "Good" },
  { id: "rhine",       name: "Rhine",       country: "Western Europe", temperature: 12, waterLevel: 2.8, flowRate: 2200,   pH: 7.2, quality: "Good" },
  { id: "thames",      name: "Thames",      country: "United Kingdom", temperature: 11, waterLevel: 1.5, flowRate: 65,     pH: 7.6, quality: "Moderate" },
  { id: "seine",       name: "Seine",       country: "France",         temperature: 13, waterLevel: 1.8, flowRate: 480,    pH: 7.5, quality: "Good" },
];

const RIVERS_MAP: Record<string, RiverData> = Object.fromEntries(RIVERS.map((r) => [r.id, r]));

const RIVERS_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: "amazon", name: "Amazon" },
      geometry: { type: "LineString", coordinates: [[-49.9,-0.1],[-52.5,-1.5],[-55.5,-2.2],[-58.5,-3.1],[-60.6,-3.1],[-63.1,-3.2],[-67.0,-2.5],[-70.0,-3.5],[-74.5,-7.0]] },
    },
    {
      type: "Feature",
      properties: { id: "nile", name: "Nile" },
      geometry: { type: "LineString", coordinates: [[31.1,31.4],[31.3,30.1],[32.5,25.7],[32.9,22.3],[33.6,18.5],[35.6,11.8],[37.4,8.6],[37.3,5.5]] },
    },
    {
      type: "Feature",
      properties: { id: "mississippi", name: "Mississippi" },
      geometry: { type: "LineString", coordinates: [[-89.3,29.1],[-90.1,30.0],[-91.2,31.0],[-91.5,32.3],[-90.8,34.2],[-89.6,35.5],[-88.8,37.0],[-90.5,38.6],[-90.2,40.5],[-91.5,43.5],[-92.7,45.5],[-93.3,47.2]] },
    },
    {
      type: "Feature",
      properties: { id: "danube", name: "Danube" },
      geometry: { type: "LineString", coordinates: [[10.0,48.2],[13.0,48.3],[16.4,48.2],[18.7,47.7],[20.3,46.0],[22.5,45.8],[25.5,45.5],[28.0,45.5],[29.7,45.2]] },
    },
    {
      type: "Feature",
      properties: { id: "rhine", name: "Rhine" },
      geometry: { type: "LineString", coordinates: [[9.5,47.5],[8.2,47.9],[7.6,48.5],[7.8,49.5],[7.5,50.1],[6.7,51.2],[6.1,51.8],[5.9,51.9],[4.5,51.9]] },
    },
    {
      type: "Feature",
      properties: { id: "thames", name: "Thames" },
      geometry: { type: "LineString", coordinates: [[-1.8,51.7],[-1.1,51.6],[-0.5,51.5],[0.0,51.5],[0.5,51.4],[0.7,51.4]] },
    },
    {
      type: "Feature",
      properties: { id: "seine", name: "Seine" },
      geometry: { type: "LineString", coordinates: [[2.3,48.9],[1.5,48.8],[0.7,49.0],[0.1,49.4],[-0.5,49.4],[-1.1,49.4]] },
    },
  ],
};

const qualityColor: Record<RiverData["quality"], string> = {
  Good:     "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Moderate: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Poor:     "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
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
  const [selectedRiverId, setSelectedRiverId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Set up river layers when map instance is ready
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
          paint: { "line-color": "#3b82f6", "line-width": 3, "line-opacity": 0.85 },
        });
      }
      if (!mapInstance.getLayer("rivers-highlight")) {
        mapInstance.addLayer({
          id: "rivers-highlight",
          type: "line",
          source: "rivers",
          layout: { "line-join": "round", "line-cap": "round" },
          filter: ["==", ["get", "id"], ""],
          paint: { "line-color": "#93c5fd", "line-width": 8, "line-opacity": 1, "line-blur": 3 },
        });
      }
    };

    const handleStyleData = () => {
      if (mapInstance.isStyleLoaded()) setupRivers();
    };

    const handleRiverClick = (e: { features?: { properties?: { id?: string } }[] }) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) setSelectedRiverId(id);
    };

    mapInstance.on("styledata", handleStyleData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mapInstance.on("click", "rivers-line", handleRiverClick as any);
    mapInstance.on("mouseenter", "rivers-line", () => {
      mapInstance.getCanvas().style.cursor = "pointer";
    });
    mapInstance.on("mouseleave", "rivers-line", () => {
      mapInstance.getCanvas().style.cursor = "";
    });

    if (mapInstance.isStyleLoaded()) setupRivers();

    return () => {
      mapInstance.off("styledata", handleStyleData);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapInstance.off("click", "rivers-line", handleRiverClick as any);
    };
  }, [mapInstance]);

  // Update highlight layer when selected river changes
  useEffect(() => {
    if (!mapInstance || !mapInstance.getLayer("rivers-highlight")) return;
    mapInstance.setFilter("rivers-highlight", ["==", ["get", "id"], selectedRiverId ?? ""]);
  }, [mapInstance, selectedRiverId]);

  const fetchSuggestions = useCallback(async (value: string) => {
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=6&addressdetails=0`;
      const res = await fetch(url, {
        headers: { "Accept-Language": "en" },
      });
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

  const handleSelect = (result: NominatimResult) => {
    setQuery(result.display_name);
    setShowSuggestions(false);
    setSuggestions([]);
    const lng = parseFloat(result.lon);
    const lat = parseFloat(result.lat);
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 10, duration: 1500 });
  };

  const handleSearch = () => {
    if (suggestions.length > 0) handleSelect(suggestions[0]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") setShowSuggestions(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplets className="h-6 w-6 text-blue-500" />
            <span className="text-xl font-semibold tracking-tight">WaterShield</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Dashboard</a>
            <a href="#" className="hover:text-foreground transition-colors">Reports</a>
            <a href="#" className="hover:text-foreground transition-colors">Alerts</a>
          </nav>
          <Button variant="outline" size="sm">Sign In</Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col flex-1">
        {/* Search Section */}
        <section className="h-[10vh] flex items-center justify-center px-4">
          <div className="flex gap-2 w-full max-w-xl">
            <div className="relative flex-1" ref={containerRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Input
                className="pl-9"
                placeholder="Search by city, region, or coordinates..."
                type="text"
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border bg-background shadow-lg overflow-hidden">
                  {suggestions.map((s) => (
                    <li
                      key={s.place_id}
                      className="px-4 py-2.5 cursor-pointer text-sm hover:bg-muted truncate"
                      onMouseDown={() => handleSelect(s)}
                    >
                      {s.display_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button onClick={handleSearch}>Search</Button>
          </div>
        </section>

        {/* Map + Side Panel Section */}
        <section className="h-[90vh] w-full px-4 pb-4">
          <div className="flex gap-3 h-full">
            <div className="flex-1 rounded-xl border overflow-hidden min-w-0">
              <Map ref={mapCallbackRef} />
            </div>

            {/* Side Panel */}
            {selectedRiverId && (() => {
              const river = RIVERS_MAP[selectedRiverId];
              if (!river) return null;
              return (
                <div className="w-72 rounded-xl border bg-background flex flex-col overflow-hidden shrink-0">
                  {/* Panel Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <div className="flex items-center gap-2">
                      <Waves className="h-4 w-4 text-blue-500" />
                      <span className="font-semibold text-sm">{river.name}</span>
                    </div>
                    <button
                      onClick={() => setSelectedRiverId(null)}
                      className="rounded-sm p-0.5 hover:bg-muted transition-colors"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
                    {/* Country & Quality */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{river.country}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${qualityColor[river.quality]}`}>
                        {river.quality}
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Thermometer className="h-3.5 w-3.5" />
                          <span className="text-xs">Temperature</span>
                        </div>
                        <span className="text-lg font-semibold">{river.temperature}°C</span>
                      </div>

                      <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Waves className="h-3.5 w-3.5" />
                          <span className="text-xs">Water Level</span>
                        </div>
                        <span className="text-lg font-semibold">{river.waterLevel} m</span>
                      </div>

                      <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Activity className="h-3.5 w-3.5" />
                          <span className="text-xs">Flow Rate</span>
                        </div>
                        <span className="text-lg font-semibold">
                          {river.flowRate.toLocaleString()}
                          <span className="text-xs font-normal text-muted-foreground ml-1">m³/s</span>
                        </span>
                      </div>

                      <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Gauge className="h-3.5 w-3.5" />
                          <span className="text-xs">pH Level</span>
                        </div>
                        <span className="text-lg font-semibold">{river.pH}</span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Data is mocked for demonstration purposes.
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        </section>
      </main>
    </div>
  );
}
