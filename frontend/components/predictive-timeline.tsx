"use client";

/**
 * PredictiveTimeline — scrubber spanning Past → Present → Predictive.
 *
 * Layout:
 *   2024-01 ─── solid neon ─── NOW (April 2026) ─── dotted neon ─── 2027-12
 *
 * Confidence decay (predictive mode only):
 *   Real-time anchor:        c(now) = 100 %
 *   Linear-ish exponential:  c(t) = clamp( e^(-k * months_after_now) * 100, 35, 100 )
 *   Tuned so:
 *     +1 month  ≈ 98 %
 *     +6 months ≈ 88 %
 *     +9 months ≈ 65 %  (Jan 2027)
 *     +20 months ≈ 35 % (floor)
 *
 *   k = 0.0476  →  c(9) = e^(-0.0476*9)*100 ≈ 65
 *
 * The component is fully controlled: pass `value` (Date) and react to
 * `onChange`. `nowDate` lets you mock "the present" (defaults to today).
 */

import { Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const MS_PER_DAY = 86_400_000;
const DECAY_K = 0.0476;
const CONFIDENCE_FLOOR = 35;

export function predictionConfidence(monthsAfterNow: number): number {
  if (monthsAfterNow <= 0) return 100;
  const c = Math.exp(-DECAY_K * monthsAfterNow) * 100;
  return Math.max(CONFIDENCE_FLOOR, Math.round(c));
}

export type PredictiveTimelineProps = {
  /** Earliest selectable date. Default: 2024-01-01 */
  start?: Date;
  /** Latest selectable date. Default: 2027-12-31 */
  end?: Date;
  /** "Now" — boundary between historical & predictive. */
  nowDate?: Date;
  /** Currently selected date. */
  value: Date;
  /** Fired on scrub. */
  onChange: (d: Date) => void;
  className?: string;
};

const DEFAULT_START = new Date("2024-01-01T00:00:00Z");
const DEFAULT_END = new Date("2027-12-31T00:00:00Z");
const DEFAULT_NOW = new Date("2026-04-26T00:00:00Z");

export default function PredictiveTimeline({
  start = DEFAULT_START,
  end = DEFAULT_END,
  nowDate = DEFAULT_NOW,
  value,
  onChange,
  className = "",
}: PredictiveTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const totalMs = end.getTime() - start.getTime();
  const nowPct = ((nowDate.getTime() - start.getTime()) / totalMs) * 100;
  const valuePct = ((value.getTime() - start.getTime()) / totalMs) * 100;

  const isPredictive = value.getTime() > nowDate.getTime();
  const monthsAfterNow = Math.max(
    0,
    (value.getTime() - nowDate.getTime()) / (MS_PER_DAY * 30.4375),
  );
  const confidence = predictionConfidence(monthsAfterNow);

  // True when the scrubber sits within ±1 day of "now" — used to decide
  const jumpToNow = useCallback(() => {
    onChange(new Date(nowDate.getTime()));
  }, [nowDate, onChange]);

  // ---------- ticks ----------
  const ticks = useMemo(() => {
    const arr: { pct: number; label: string }[] = [];
    const startYear = start.getUTCFullYear();
    const endYear = end.getUTCFullYear();
    for (let y = startYear; y <= endYear; y++) {
      for (let q = 0; q < 4; q++) {
        const d = new Date(Date.UTC(y, q * 3, 1));
        if (d < start || d > end) continue;
        const pct = ((d.getTime() - start.getTime()) / totalMs) * 100;
        arr.push({
          pct,
          label: q === 0 ? String(y) : `Q${q + 1}`,
        });
      }
    }
    return arr;
  }, [start, end, totalMs]);

  // ---------- interaction ----------
  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onChange(new Date(start.getTime() + ratio * totalMs));
    },
    [onChange, start, totalMs],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setFromClientX(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, setFromClientX]);

  // keyboard nudge (1 day per arrow)
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === "ArrowLeft" ? -7 : e.key === "ArrowRight" ? 7 : 0;
    if (!step) return;
    e.preventDefault();
    const next = new Date(value.getTime() + step * MS_PER_DAY);
    if (next < start || next > end) return;
    onChange(next);
  };

  return (
    <div
      className={`glass-strong rounded-2xl p-4 ${className}`}
      role="group"
      aria-label="Predictive timeline"
    >
      {/* Header strip — selected date only. Jump-to-today is the green dot above the NOW marker. */}
      <div className="flex items-center justify-between mb-4 px-1">
        <span className="text-xs text-foreground/80 font-mono">
          {fmtDate(value)}
        </span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          setDragging(true);
          setFromClientX(e.clientX);
        }}
        onKeyDown={onKeyDown}
        className="relative h-12 cursor-pointer select-none rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/40"
      >
        {/* Past segment — solid neon */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-px"
          style={{
            left: 0,
            width: `${nowPct}%`,
            background:
              "linear-gradient(90deg, rgba(34,211,238,0.3), rgba(34,211,238,0.85))",
            boxShadow: "0 0 12px rgba(34,211,238,0.35)",
          }}
        />
        {/* Future segment — dotted uncertainty */}
        <div
          className="dotted-future absolute top-1/2 -translate-y-1/2 h-px"
          style={{
            left: `${nowPct}%`,
            width: `${100 - nowPct}%`,
          }}
        />

        {/* Ticks */}
        {ticks.map((t, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
            style={{ left: `${t.pct}%` }}
          >
            <span className="h-2 w-px bg-foreground/10" />
            {t.label.length === 4 && (
              <span className="absolute top-full mt-1 text-[10px] tracking-wider text-muted-foreground/70">
                {t.label}
              </span>
            )}
          </div>
        ))}

        {/* "NOW" anchor */}
        <div
          className="absolute top-0 bottom-0 -translate-x-1/2"
          style={{ left: `${nowPct}%` }}
        >
          <div className="pointer-events-none h-full w-px bg-gradient-to-b from-transparent via-emerald-400/60 to-transparent" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              jumpToNow();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Jump to today"
            title="Jump to today"
            className="absolute -top-3 left-1/2 -translate-x-1/2 p-1 rounded-full hover:bg-emerald-400/10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
          >
            <span className="block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981] hover:scale-125 transition-transform" />
          </button>
          <span className="pointer-events-none absolute top-full mt-3 left-1/2 -translate-x-1/2 text-[9px] tracking-[0.18em] uppercase text-emerald-600/80 dark:text-emerald-300/80">
            now
          </span>
        </div>

        {/* Scrubber thumb */}
        <button
          type="button"
          aria-label="Scrub timeline"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragging(true);
          }}
          className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2 outline-none"
          style={{ left: `${valuePct}%` }}
        >
          <span
            className={`block h-3.5 w-3.5 rounded-full ring-1 ring-border transition-transform group-hover:scale-110 ${
              isPredictive
                ? "bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.7)]"
                : "bg-foreground shadow-[0_0_12px_rgba(0,0,0,0.2)] dark:shadow-[0_0_12px_rgba(255,255,255,0.35)]"
            }`}
          />
          {dragging && (
            <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md glass px-2 py-1 text-[10px] font-mono text-foreground/90">
              {fmtDate(value)}
            </span>
          )}
        </button>
      </div>

      {/* Confidence gauge — always rendered to keep fixed height; hidden when historical */}
      <div className={`mt-5 grid grid-cols-[auto_1fr_auto] items-center gap-3 px-1 transition-opacity duration-300 ${isPredictive ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <span className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
          AI Confidence
        </span>
        <div className="relative h-1 rounded-full bg-foreground/[0.05] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
            style={{
              width: `${confidence}%`,
              background:
                confidence > 75
                  ? "linear-gradient(90deg,#22d3ee,#67e8f9)"
                  : confidence > 50
                    ? "linear-gradient(90deg,#22d3ee,#f59e0b)"
                    : "linear-gradient(90deg,#f59e0b,#ef4444)",
              boxShadow: "0 0 12px rgba(34,211,238,0.35)",
            }}
          />
        </div>
        <span className="text-xs font-mono text-foreground/90 tabular-nums">
          {confidence}%
        </span>
      </div>
    </div>
  );
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
