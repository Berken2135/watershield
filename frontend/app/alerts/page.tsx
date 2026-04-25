"use client";

import Sidebar from "@/components/sidebar";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, TrendingDown, TrendingUp, Minus, Activity, Globe2 } from "lucide-react";

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

const RISK_COLORS: Record<WqiStation["risk_level"], string> = {
  clean: "#10b981",
  moderate: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

export default function AlertsPage() {
  const [stations, setStations] = useState<WqiStation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/data/europe")
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
            <>
              {/* KPI strip */}
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

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
                <Card title="Risk distribution" subtitle="All monitored stations">
                  <RiskDonut counts={stats.counts} total={total} />
                </Card>

                <Card title="Top regions by alerts" subtitle="High & critical risk count">
                  <CountryBars rows={stats.countryRows} />
                </Card>

                <Card title="30-day WQI forecast" subtitle="Network average · model output">
                  <ForecastSpark stations={stations} />
                </Card>
              </div>
            </>
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

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <div className="text-sm font-medium tracking-tight">{title}</div>
      {subtitle && (
        <div className="text-[10px] tracking-[0.16em] uppercase text-muted-foreground mt-0.5">
          {subtitle}
        </div>
      )}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function RiskDonut({
  counts,
  total,
}: {
  counts: Record<WqiStation["risk_level"], number>;
  total: number;
}) {
  const order: WqiStation["risk_level"][] = ["clean", "moderate", "high", "critical"];
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
        <circle cx="70" cy="70" r={r} fill="none" stroke="currentColor" className="text-border" strokeWidth="14" />
        {order.map((k) => {
          const v = counts[k] ?? 0;
          if (!v) return null;
          const len = (v / total) * c;
          const dash = `${len} ${c - len}`;
          const el = (
            <circle
              key={k}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={RISK_COLORS[k]}
              strokeWidth="14"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" className="fill-foreground" fontSize="22" fontWeight="600">
          {total}
        </text>
        <text x="70" y="88" textAnchor="middle" className="fill-muted-foreground" fontSize="9" letterSpacing="2">
          STATIONS
        </text>
      </svg>
      <div className="flex-1 flex flex-col gap-1.5 text-[12px]">
        {order.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: RISK_COLORS[k] }} />
            <span className="capitalize text-muted-foreground flex-1">{k}</span>
            <span className="font-mono tabular-nums">{counts[k] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CountryBars({
  rows,
}: {
  rows: { country: string; avg: number; n: number; risk: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.risk));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.country} className="text-[12px]">
          <div className="flex items-center justify-between mb-1">
            <span className="truncate">{r.country}</span>
            <span className="text-muted-foreground tabular-nums">
              {r.risk}/{r.n}
            </span>
          </div>
          <div className="h-2 rounded-full bg-foreground/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(r.risk / max) * 100}%`,
                backgroundColor: r.risk > 0 ? "#f97316" : "#10b981",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ForecastSpark({ stations }: { stations: WqiStation[] }) {
  // Build a 30-step line: linear blend from current → predicted_30d, network average.
  const points = useMemo(() => {
    if (!stations.length) return [];
    const steps = 30;
    const arr: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let sum = 0;
      let n = 0;
      for (const s of stations) {
        const a = s.wqi_current;
        const b = s.wqi_predicted_30d ?? a;
        sum += a + (b - a) * t;
        n += 1;
      }
      arr.push(sum / n);
    }
    return arr;
  }, [stations]);

  if (!points.length) return <div className="h-32" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const w = 280;
  const h = 110;
  const pad = 6;
  const xs = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const ys = (v: number) => {
    const span = max - min || 1;
    return h - pad - ((v - min) / span) * (h - pad * 2);
  };
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`)
    .join(" ");
  const areaPath = `${path} L${xs(points.length - 1).toFixed(1)},${(h - pad).toFixed(1)} L${xs(0).toFixed(1)},${(h - pad).toFixed(1)} Z`;
  const last = points[points.length - 1];
  const first = points[0];
  const delta = ((last - first) / first) * 100;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28">
        <defs>
          <linearGradient id="fx" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#fx)" />
        <path d={path} fill="none" stroke="#22d3ee" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx={xs(points.length - 1)} cy={ys(last)} r="3" fill="#22d3ee" />
      </svg>
      <div className="flex items-center justify-between text-[11px] mt-1">
        <span className="text-muted-foreground">now {first.toFixed(1)}</span>
        <span
          className="font-medium tabular-nums"
          style={{ color: delta > 0 ? "#10b981" : delta < 0 ? "#ef4444" : "#94a3b8" }}
        >
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)}%
        </span>
        <span className="text-muted-foreground">+30d {last.toFixed(1)}</span>
      </div>
    </div>
  );
}
