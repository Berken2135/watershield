"use client";

/**
 * SatelliteOrbit — decorative animation in the sidebar empty space.
 * Pure CSS/SVG, no external assets. Shows Earth at the centre with a
 * satellite orbiting along an inclined path while gently pulsing.
 */

import { Satellite } from "lucide-react";

export default function SatelliteOrbit() {
  return (
    <div className="relative mx-3 mt-2 mb-3 rounded-xl border border-border bg-foreground/[0.015] overflow-hidden">
      <div className="px-3 pt-3 pb-1">
        <div className="text-[9px] tracking-[0.22em] uppercase text-muted-foreground">
          Live link
        </div>
        <div className="mt-0.5 text-[11px] text-foreground/80">
          Sentinel-2 · downlink
        </div>
      </div>

      <div className="relative h-44">
        {/* faint stars */}
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.5)_0.5px,transparent_1px),radial-gradient(circle_at_70%_60%,rgba(255,255,255,0.4)_0.5px,transparent_1px),radial-gradient(circle_at_40%_80%,rgba(255,255,255,0.3)_0.5px,transparent_1px),radial-gradient(circle_at_85%_25%,rgba(255,255,255,0.4)_0.5px,transparent_1px),radial-gradient(circle_at_15%_65%,rgba(255,255,255,0.3)_0.5px,transparent_1px)] dark:opacity-100" />

        {/* Earth */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-700 shadow-[0_0_24px_rgba(34,211,238,0.45)] earth-spin" />
          <div className="absolute inset-0 rounded-full ring-1 ring-cyan-200/30 pointer-events-none" />
        </div>

        {/* Orbit ring (inclined) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-32 w-44 rounded-[50%] border border-cyan-300/25 [transform:translate(-50%,-50%)_rotateX(62deg)] pointer-events-none" />

        {/* Satellite traveling along the orbit */}
        <div className="absolute left-1/2 top-1/2 h-32 w-44 -translate-x-1/2 -translate-y-1/2 [transform-style:preserve-3d] [transform:translate(-50%,-50%)_rotateX(62deg)] pointer-events-none">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-full w-full sat-orbit">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 [transform-style:preserve-3d]">
              {/* counter-rotate to keep the icon upright */}
              <div className="sat-counter">
                <div className="grid place-items-center h-6 w-6 rounded-md bg-background/90 ring-1 ring-cyan-300/50 shadow-[0_0_10px_rgba(34,211,238,0.5)]">
                  <Satellite className="h-3.5 w-3.5 text-cyan-300" strokeWidth={1.6} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* downlink beam */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-px w-24 bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent beam-pulse pointer-events-none" />
      </div>

      <div className="px-3 pb-2.5 flex items-center justify-between text-[10px]">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981] animate-pulse" />
          Telemetry stable
        </span>
        <span className="tabular-nums text-muted-foreground">2.4 GB/s</span>
      </div>

      <style jsx>{`
        .sat-orbit {
          animation: sat-spin 9s linear infinite;
          transform-origin: 50% 50%;
        }
        .sat-counter {
          animation: sat-counter 9s linear infinite;
          transform-origin: 50% 50%;
        }
        .earth-spin {
          background-size: 180% 180%;
          animation: earth-pan 14s linear infinite;
        }
        .beam-pulse {
          animation: beam 2.4s ease-in-out infinite;
        }
        @keyframes sat-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes sat-counter {
          from { transform: rotate(0deg) rotateX(-62deg); }
          to   { transform: rotate(-360deg) rotateX(-62deg); }
        }
        @keyframes earth-pan {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes beam {
          0%, 100% { opacity: 0.25; transform: translate(-50%, -50%) scaleX(0.6); }
          50%      { opacity: 0.9;  transform: translate(-50%, -50%) scaleX(1.0); }
        }
      `}</style>
    </div>
  );
}
