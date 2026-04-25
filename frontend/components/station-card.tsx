"use client";

import { Activity, AlertTriangle, Gauge, MapPin, Waves } from "lucide-react";

type PollutionEvent = {
  id: string;
  river: string;
  location: string;
  severity: "High" | "Medium" | "Low";
  status: "Active" | "Contained" | "Resolved";
  date: string;
  samplingData: { ph: number; dissolvedOxygen: number; turbidity: number; contaminant: string };
};

const SEVERITY_COLOR: Record<PollutionEvent["severity"], string> = {
  High: "text-red-500 dark:text-red-300",
  Medium: "text-amber-500 dark:text-amber-300",
  Low: "text-emerald-600 dark:text-emerald-300",
};

const SEVERITY_DOT: Record<PollutionEvent["severity"], string> = {
  High: "bg-red-400 shadow-[0_0_8px_#ef4444]",
  Medium: "bg-amber-400 shadow-[0_0_8px_#f59e0b]",
  Low: "bg-emerald-400 shadow-[0_0_8px_#10b981]",
};

const STATUS_TEXT: Record<PollutionEvent["status"], string> = {
  Active: "text-red-500 dark:text-red-300",
  Contained: "text-amber-500 dark:text-amber-300",
  Resolved: "text-muted-foreground",
};

export type StationCardProps = {
  event: PollutionEvent;
  selected?: boolean;
  onClick?: () => void;
};

export default function StationCard({ event, selected, onClick }: StationCardProps) {
  const isHigh = event.severity === "High";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full text-left rounded-xl border border-border bg-card/40 p-3.5 transition-all ${
        selected
          ? "ring-1 ring-cyan-400/40 bg-cyan-400/4"
          : "hover:bg-white/2.5 hover:border-white/10"
      } ${isHigh ? "danger-glow" : ""}`}
    >
      {/* Top row */}
      <div className="flex items-start gap-2 mb-2.5">
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[event.severity]}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium tracking-tight truncate">
            {event.river}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        </div>
        <span
          className={`flex items-center gap-1 text-[10px] tracking-[0.18em] uppercase ${SEVERITY_COLOR[event.severity]}`}
        >
          {event.severity}
          {isHigh && <AlertTriangle className="h-3 w-3 animate-pulse" strokeWidth={1.8} />}
        </span>
      </div>

      {/* Mini metrics */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <Metric
          icon={<Gauge className="h-3 w-3" strokeWidth={1.5} />}
          label="pH"
          value={event.samplingData.ph.toFixed(1)}
        />
        <Metric
          icon={<Activity className="h-3 w-3" strokeWidth={1.5} />}
          label="O₂"
          value={`${event.samplingData.dissolvedOxygen}`}
          unit="mg/L"
        />
        <Metric
          icon={<Waves className="h-3 w-3" strokeWidth={1.5} />}
          label="NTU"
          value={`${event.samplingData.turbidity}`}
        />
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-[10px] tracking-[0.12em] uppercase">
        <span className={STATUS_TEXT[event.status]}>{event.status}</span>
        <span className="text-muted-foreground/70">{event.date}</span>
      </div>

    </button>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-md bg-white/2 ring-1 ring-white/4 p-2">
      <div className="flex items-center gap-1 text-muted-foreground/80 text-[9px] tracking-[0.14em] uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-[13px] font-medium text-foreground/95 tabular-nums">
        {value}
        {unit ? (
          <span className="ml-0.5 text-[9px] font-normal text-muted-foreground/70">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}
