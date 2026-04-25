"use client";

import Sidebar from "@/components/sidebar";
import { Activity, AlertTriangle, Globe2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WqiStation = {
  water_body_id: string;
  name: string;
  country: string;
  risk_level: "clean" | "moderate" | "high" | "critical";
  risk_color: string;
  wqi_current: number;
  wqi_predicted_7d?: number;
  wqi_predicted_30d?: number;
  water_body_type: string;
  trend?: "stable" | "improving" | "worsening";
  trend_pct_change?: number;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export default function AlertsPage() {
  const [stations, setStations] = useState<WqiStation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/data/europe`)
      .then((r) => r.json())
      .then((geojson) => {
        const all: WqiStation[] = (geojson.features ?? []).map(
          (f: { properties: WqiStation }) => f.properties,
        );
        setStations(all);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const alerts = useMemo(
    () =>
      stations
        .filter((s) => s.risk_level === "high" || s.risk_level === "critical")
        .sort((a, b) => a.wqi_current - b.wqi_current),
    [stations],
  );

  const stats = useMemo(() => {
    if (!stations.length) return null;
    const counts = { clean: 0, moderate: 0, high: 0, critical: 0 };
    let sumNow = 0;
    let sum30 = 0;
    let count30 = 0;
    const byCountry: Record<string, { sum: number; n: number; risk: number }> = {};
    for (const s of stations) {
      counts[s.risk_level] = (counts[s.risk_level] ?? 0) + 1;
      sumNow += s.wqi_current;
      if (s.wqi_predicted_30d != null) {
        sum30 += s.wqi_predicted_30d;
        count30 += 1;
      }
      const c = byCountry[s.country] ?? { sum: 0, n: 0, risk: 0 };
      c.sum += s.wqi_current;
      c.n += 1;
      if (s.risk_level === "high" || s.risk_level === "critical") c.risk += 1;
      byCountry[s.country] = c;
    }
    const avgNow = sumNow / stations.length;
    const avg30 = count30 ? sum30 / count30 : avgNow;
    const trendPct = ((avg30 - avgNow) / avgNow) * 100;
    const countryRows = Object.entries(byCountry)
      .map(([country, v]) => ({ country, avg: v.sum / v.n, n: v.n, risk: v.risk }))
      .sort((a, b) => b.risk - a.risk || a.avg - b.avg)
      .slice(0, 8);
    return { counts, avgNow, avg30, trendPct, countryRows };
  }, [stations]);

  const total = stations.length;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-10">
        <div className="max-w-6xl mx-auto">
          <h1 className="mb-6 md:mb-8 text-2xl font-semibold tracking-tight">Alerts</h1>

          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!loading && stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Kpi
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Active alerts"
                value={alerts.length}
                hint={`of ${total} stations`}
                accent="#ef4444"
              />
              <Kpi
                icon={<Activity className="h-4 w-4" />}
                label="Avg WQI"
                value={Math.round(stats.avgNow)}
                hint={`30d → ${Math.round(stats.avg30)}`}
                accent="#22d3ee"
              />
              <Kpi
                icon={
                  stats.trendPct > 0.2 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : stats.trendPct < -0.2 ? (
                    <TrendingDown className="h-4 w-4" />
                  ) : (
                    <Minus className="h-4 w-4" />
                  )
                }
                label="30d trend"
                value={`${stats.trendPct > 0 ? "+" : ""}${stats.trendPct.toFixed(1)}%`}
                hint={
                  stats.trendPct > 0.2
                    ? "improving"
                    : stats.trendPct < -0.2
                      ? "worsening"
                      : "stable"
                }
                accent={
                  stats.trendPct > 0.2
                    ? "#10b981"
                    : stats.trendPct < -0.2
                      ? "#ef4444"
                      : "#94a3b8"
                }
              />
              <Kpi
                icon={<Globe2 className="h-4 w-4" />}
                label="Worst region"
                value={stats.countryRows[0]?.country ?? "—"}
                hint={`${stats.countryRows[0]?.risk ?? 0} alerts`}
                accent="#f59e0b"
              />
            </div>
          )}

          {/* Alert list */}
          {!loading && alerts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No stations with elevated risk levels detected.
            </p>
          )}

          {alerts.length > 0 && (
            <>
              <div className="mb-3 text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
                Stations needing attention
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {alerts.map((s) => (
                  <Link
                    key={s.water_body_id}
                    href={`/?station=${encodeURIComponent(s.water_body_id)}`}
                    className="block rounded-xl border border-border bg-card/40 p-4 transition-colors hover:bg-white/[0.03] hover:border-white/10"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{s.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {s.country}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="text-lg font-bold tabular-nums"
                          style={{ color: s.risk_color }}
                        >
                          {Math.round(s.wqi_current)}
                        </div>
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                          WQI
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className="capitalize px-2 py-0.5 rounded-full text-[11px] ring-1"
                        style={{
                          backgroundColor: s.risk_color + "20",
                          color: s.risk_color,
                          borderColor: s.risk_color + "50",
                        }}
                      >
                        {s.risk_level}
                      </span>
                      {s.trend_pct_change != null && s.trend_pct_change !== 0 && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {s.trend_pct_change > 0 ? "+" : ""}
                          {s.trend_pct_change.toFixed(1)}% / 30d
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-card/40 p-3 md:p-4"
      style={{ borderColor: accent + "30" }}
    >
      <div className="flex items-center gap-2">
        <span className="grid place-items-center h-6 w-6 rounded-md" style={{ color: accent, backgroundColor: accent + "18" }}>
          {icon}
        </span>
        <span className="text-[10px] tracking-[0.16em] uppercase text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 text-xl md:text-2xl font-semibold tabular-nums" style={{ color: accent }}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}


