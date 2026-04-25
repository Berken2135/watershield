"use client";

import Sidebar from "@/components/sidebar";
import Link from "next/link";
import { useEffect, useState } from "react";

type WqiStation = {
  water_body_id: string;
  name: string;
  country: string;
  risk_level: string;
  risk_color: string;
  wqi_current: number;
  water_body_type: string;
  trend: string;
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
        setStations(
          all
            .filter((s) => s.risk_level === "high" || s.risk_level === "critical")
            .sort((a, b) => b.wqi_current - a.wqi_current),
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-10">
        <div className="max-w-5xl mx-auto">
          <h1 className="mb-8 text-2xl font-semibold tracking-tight">Alerts</h1>

          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && stations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No stations with elevated risk levels detected.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stations.map((s) => (
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
                    <div className="text-lg font-bold tabular-nums" style={{ color: s.risk_color }}>
                      {Math.round(s.wqi_current)}
                    </div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">WQI</div>
                  </div>
                </div>
                <span
                  className="mt-2 inline-block capitalize px-2 py-0.5 rounded-full text-[11px] ring-1"
                  style={{
                    backgroundColor: s.risk_color + "20",
                    color: s.risk_color,
                    borderColor: s.risk_color + "50",
                  }}
                >
                  {s.risk_level}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
