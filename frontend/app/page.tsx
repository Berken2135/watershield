"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Droplets, Search } from "lucide-react";
import { Map } from "../components/ui/map";
import type MapLibreGL from "maplibre-gl";

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

export default function Home() {
  const mapRef = useRef<MapLibreGL.Map>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

        {/* Map Section */}
        <section className="h-[90vh] w-full px-4 pb-4">
          <div className="rounded-xl border overflow-hidden h-full w-full">
            <Map ref={mapRef} />
          </div>
        </section>
      </main>
    </div>
  );
}
