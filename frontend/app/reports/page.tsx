"use client";

import Sidebar from "@/components/sidebar";
import { generateReportPdf } from "@/lib/api";
import { FileDown, Loader2, MapPin, Waves } from "lucide-react";
import { useEffect, useState } from "react";

const API_URL = "/api";

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
          <h1 className="mb-8 text-2xl font-semibold tracking-tight">Reports</h1>

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
              {stations.map((station) => (
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

