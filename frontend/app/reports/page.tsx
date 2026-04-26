"use client";

import Sidebar from "@/components/sidebar";
import { generateReportPdf } from "@/lib/api";
import { FileDown, Loader2, MapPin, Search, Waves } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

type WqiStation = {
  water_body_id: string;
  name: string;
  country: string;
  water_body_type: string;
  wqi_current: number;
  wqi_predicted_30d: number;
  risk_level: "clean" | "moderate" | "high" | "critical";
  risk_color: string;
  trend: "stable" | "worsening" | "improving";
  trend_pct_change: number;
  anomaly_count_30d: number | null;
  data_source: "real" | "synthetic";
  last_updated: string;
  metrics: {
    ph: number | null;
    oxygen_mg_l: number | null;
    turbidity_ntu: number | null;
  };
};

const RISK_LABEL: Record<WqiStation["risk_level"], string> = {
  clean: "Clean",
  moderate: "Moderate",
  high: "High Risk",
  critical: "Critical",
};

const RISK_BADGE: Record<WqiStation["risk_level"], string> = {
  clean: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 ring-emerald-500/30",
  moderate: "bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-amber-500/30",
  high: "bg-red-500/10 text-red-600 dark:text-red-300 ring-red-500/30",
  critical: "bg-red-600/15 text-red-600 dark:text-red-400 ring-red-600/40",
};

export default function ReportsPage() {
  const [stations, setStations] = useState<WqiStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filteredStations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter((s) =>
      [s.name, s.country, s.water_body_type, RISK_LABEL[s.risk_level]]
        .filter(Boolean)
        .some((field) => field!.toString().toLowerCase().includes(q)),
    );
  }, [stations, query]);

  useEffect(() => {
    fetch(`${API_URL}/api/data/europe`, { cache: "no-store" })
      .then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((fc: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped: WqiStation[] = (fc.features as any[]).map((f) => ({
          ...f.properties,
          metrics:
            typeof f.properties.metrics === "string"
              ? JSON.parse(f.properties.metrics)
              : (f.properties.metrics ?? {}),
        }));
        setStations(mapped);
      })
      .catch(() => setError("Could not load stations — is the backend running?"))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async (station: WqiStation) => {
    setGenerating(station.water_body_id);
    try {
      const riskToSeverity: Record<WqiStation["risk_level"], "High" | "Medium" | "Low"> = {
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
          contaminant:
            station.risk_level === "critical" ? "Multiple — see report" : "Within EU thresholds",
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `watershield_report_${station.water_body_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — user can retry
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-10">
        <div className="max-w-5xl mx-auto">
          <h1 className="mb-4 text-2xl font-semibold tracking-tight">Reports</h1>

          <div className="relative mb-6 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by river, country, or risk level"
              className="w-full rounded-lg border border-border bg-foreground/[0.02] pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-[10px] tracking-wide uppercase text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading stations…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-400/20 bg-red-500/5 px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="grid gap-3">
              {filteredStations.length === 0 && (
                <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-4 py-6 text-center text-sm text-muted-foreground">
                  No stations match “{query}”.
                </div>
              )}
              {filteredStations.map((station) => (
                <div
                  key={station.water_body_id}
                  className="flex items-center gap-4 rounded-xl border border-border bg-card/40 px-4 py-3 hover:bg-card/70 transition-colors"
                >
                  <div className="shrink-0">
                    <Waves className="h-4 w-4 text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {station.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span>{station.country}</span>
                      <span>·</span>
                      <span>WQI {Math.round(station.wqi_current)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleGenerate(station)}
                    disabled={generating === station.water_body_id}
                    className="flex items-center gap-1.5 shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors bg-blue-500/10 hover:bg-blue-500/20 ring-1 ring-blue-400/30 text-blue-600 dark:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generating === station.water_body_id ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
                    ) : (
                      <><FileDown className="h-3 w-3" /> PDF Report</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

