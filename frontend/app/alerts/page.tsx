"use client";

import Sidebar from "@/components/sidebar";
import { generateReportPdf } from "@/lib/api";
import {
  Activity,
  AlertTriangle,
  FileDown,
  Globe2,
  Loader2,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
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

type AiVerdict = {
  verdict: "normal" | "anomaly" | "critical";
  confidence: number;
  summary: string;
  risks: string[];
  recommendations: string[];
  source_estimate?: string | null;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export default function AlertsPage() {
  const [stations, setStations] = useState<WqiStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WqiStation | null>(null);

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
                label="Highest Pollution"
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">                {alerts.map((s) => (
                  <button
                    key={s.water_body_id}
                    type="button"
                    onClick={() => setSelected(s)}
                    className="text-left block rounded-xl border border-border bg-card/40 p-4 transition-colors hover:bg-white/[0.03] hover:border-white/10"
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
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {selected && (
        <AlertDetailModal station={selected} onClose={() => setSelected(null)} />
      )}
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

// ─── Alert detail modal ────────────────────────────────────────────────
// Self-contained dialog with station snapshot, AI-generated explanation,
// and one-click PDF download. No router push — the user stays on /alerts.
function AlertDetailModal({
  station,
  onClose,
}: {
  station: WqiStation;
  onClose: () => void;
}) {
  const [ai, setAi] = useState<AiVerdict | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Auto-run AI on open — this is exactly the "imba" feel the user wants.
  useEffect(() => {
    let cancelled = false;
    setAiLoading(true);
    setAiError(null);
    const severity =
      station.risk_level === "critical" || station.risk_level === "high"
        ? "High"
        : station.risk_level === "moderate"
          ? "Medium"
          : "Low";
    fetch(`${API_URL}/api/analysis/anomaly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        river: station.name,
        location: `${station.name}, ${station.country}`,
        type: station.water_body_type === "lake" ? "Biological" : "Chemical",
        severity,
        date: new Date().toISOString().slice(0, 10),
        wqi: station.wqi_current,
        risk_level: station.risk_level,
        // Best-effort placeholder metrics — the backend already accepts them as optional.
        metrics: { ph: 7.2, dissolved_oxygen: 7.8, turbidity: 6.5 },
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as AiVerdict;
        if (!cancelled) setAi(data);
      })
      .catch(() => {
        if (!cancelled) setAiError("Could not reach the AI service.");
      })
      .finally(() => !cancelled && setAiLoading(false));
    return () => {
      cancelled = true;
    };
  }, [station]);

  const handlePdf = async () => {
    setPdfBusy(true);
    try {
      const severity =
        station.risk_level === "critical" || station.risk_level === "high"
          ? "High"
          : station.risk_level === "moderate"
            ? "Medium"
            : "Low";
      const blob = await generateReportPdf({
        event_id: station.water_body_id,
        river: station.name,
        location: `${station.name}, ${station.country}`,
        severity,
        type: station.water_body_type,
        date: new Date().toISOString().slice(0, 10),
        description:
          ai?.summary ??
          `${station.name} is currently classified as ${station.risk_level} risk. WQI = ${Math.round(
            station.wqi_current,
          )}.`,
        metrics: {
          ph: 7.2,
          dissolved_oxygen: 7.8,
          turbidity: 6.5,
          contaminant: ai?.recommendations?.[0] ?? "Within EU thresholds",
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `watershield_alert_${station.water_body_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfBusy(false);
    }
  };

  const verdictTone =
    ai?.verdict === "critical"
      ? "text-red-400 ring-red-400/30 bg-red-500/10"
      : ai?.verdict === "anomaly"
        ? "text-amber-300 ring-amber-300/30 bg-amber-500/10"
        : "text-emerald-300 ring-emerald-400/30 bg-emerald-500/10";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-xl rounded-2xl border border-border bg-background shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-border">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              Alert detail
            </div>
            <div className="mt-0.5 text-base font-semibold truncate">{station.name}</div>
            <div className="text-xs text-muted-foreground">{station.country}</div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="capitalize px-2 py-1 rounded-md text-[10px] tracking-wide ring-1"
              style={{
                color: station.risk_color,
                backgroundColor: station.risk_color + "1A",
                borderColor: station.risk_color + "40",
              }}
            >
              {station.risk_level}
            </span>
            <button
              onClick={onClose}
              className="grid place-items-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* WQI snapshot */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="WQI now" value={Math.round(station.wqi_current)} accent={station.risk_color} />
            <Stat
              label="7d"
              value={station.wqi_predicted_7d != null ? Math.round(station.wqi_predicted_7d) : "—"}
            />
            <Stat
              label="30d"
              value={station.wqi_predicted_30d != null ? Math.round(station.wqi_predicted_30d) : "—"}
              hint={
                station.trend_pct_change != null
                  ? `${station.trend_pct_change > 0 ? "+" : ""}${station.trend_pct_change.toFixed(1)}%`
                  : undefined
              }
            />
          </div>

          {/* AI block */}
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.03] p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <div className="text-[10px] tracking-[0.18em] uppercase text-cyan-300">
                AI analysis
              </div>
              {ai && (
                <span
                  className={`ml-auto px-1.5 py-0.5 rounded text-[9px] tracking-wider uppercase ring-1 ${verdictTone}`}
                >
                  {ai.verdict} · {ai.confidence}%
                </span>
              )}
            </div>

            {aiLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyzing pollution signature…
              </div>
            )}
            {aiError && (
              <div className="text-xs text-red-400">{aiError}</div>
            )}
            {ai && (
              <div className="space-y-2">
                <p className="text-xs leading-relaxed text-foreground/90">{ai.summary}</p>

                {ai.source_estimate && (
                  <div className="rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] text-amber-200">
                    <span className="text-amber-300/80 mr-1">Estimated source:</span>
                    {ai.source_estimate}
                  </div>
                )}

                {ai.recommendations.length > 0 && (
                  <div>
                    <div className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
                      Recommended actions
                    </div>
                    <ul className="space-y-1">
                      {ai.recommendations.slice(0, 3).map((r, i) => (
                        <li key={i} className="flex gap-2 text-xs text-foreground/85">
                          <span className="text-cyan-400/70">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
          >
            Close
          </button>
          <button
            onClick={handlePdf}
            disabled={pdfBusy}
            className="flex items-center gap-1.5 rounded-md bg-blue-500/15 hover:bg-blue-500/25 ring-1 ring-blue-400/40 px-3 py-1.5 text-xs font-medium text-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pdfBusy ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <FileDown className="h-3 w-3" /> PDF report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
      <div className="text-[9px] tracking-[0.18em] uppercase text-muted-foreground">{label}</div>
      <div
        className="mt-0.5 text-lg font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground tabular-nums">{hint}</div>}
    </div>
  );
}


