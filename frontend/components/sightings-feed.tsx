"use client";

/**
 * SightingsFeed — shows community river sightings in the events panel.
 *
 * Compact mode (default): rows of [badge chip] + [thumbnail] + [name + river + time]
 * Expanded mode: full photo grid triggered by "View all photos" button.
 */

import { getSightingPhotoUrl, type Sighting } from "@/lib/api";
import { RIVER_BADGES } from "@/components/river-badge";
import { Camera, X } from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

// ---------------------------------------------------------------------------
// Single compact row
// ---------------------------------------------------------------------------

function SightingRow({
  sighting,
  onClick,
}: {
  sighting: Sighting;
  onClick: () => void;
}) {
  const river = RIVER_BADGES[sighting.riverId];
  const photoUrl = getSightingPhotoUrl(sighting.photoFilename);
  const initials = sighting.displayName
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left flex items-center gap-3 rounded-xl border border-border bg-card/40 p-2.5 hover:bg-white/[0.025] hover:border-white/10 transition-all"
    >
      {/* User avatar */}
      <div
        className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white ring-1 ring-white/10"
        style={{ backgroundColor: river?.color ?? "#22d3ee" }}
      >
        {initials || "?"}
      </div>

      {/* Photo thumbnail */}
      <div className="h-10 w-14 shrink-0 rounded-lg overflow-hidden bg-foreground/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={`${sighting.displayName}'s photo of ${river?.name ?? sighting.riverId}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-bold tracking-[0.1em] px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: (river?.color ?? "#22d3ee") + "22",
              color: river?.color ?? "#22d3ee",
            }}
          >
            {river?.emoji} {river?.name ?? sighting.riverId}
          </span>
        </div>
        <div className="mt-0.5 text-[12px] font-medium text-foreground truncate">
          {sighting.displayName}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {relativeTime(sighting.timestamp)}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Expanded photo grid modal
// ---------------------------------------------------------------------------

function PhotoGrid({
  sightings,
  onClose,
}: {
  sightings: Sighting[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
        <Camera className="h-4 w-4 text-cyan-400" />
        <span className="font-semibold text-[14px] tracking-tight">Community Sightings</span>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/10 ring-1 ring-cyan-500/30 text-cyan-300">
          {sightings.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-sm p-1 hover:bg-foreground/[0.06] transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {sightings.map((s) => {
            const river = RIVER_BADGES[s.riverId];
            return (
              <div
                key={s.id}
                className="rounded-xl overflow-hidden border border-border bg-card/40 flex flex-col"
              >
                <div className="aspect-video bg-foreground/10 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getSightingPhotoUrl(s.photoFilename)}
                    alt={`${s.displayName} at ${river?.name}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* River badge chip overlay */}
                  <span
                    className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: (river?.color ?? "#22d3ee") + "cc",
                      color: "#fff",
                    }}
                  >
                    {river?.emoji} {river?.name ?? s.riverId}
                  </span>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[12px] font-semibold text-foreground truncate">
                    {s.displayName}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {relativeTime(s.timestamp)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

type Props = {
  sightings: Sighting[];
  /** Loading state from parent */
  loading?: boolean;
};

export default function SightingsFeed({ sightings, loading = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [focusedSighting, setFocusedSighting] = useState<Sighting | null>(null);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-3 w-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
          Loading sightings…
        </div>
      </div>
    );
  }

  if (sightings.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <span className="text-3xl">🌊</span>
        <p className="text-[13px] font-medium text-foreground">No sightings yet</p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Scan a QR code next to a river to add your first sighting and collect a badge!
        </p>
        <a
          href="/scan/odra"
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Try the Odra demo →
        </a>
      </div>
    );
  }

  return (
    <>
      {/* Compact list */}
      <ul className="flex flex-col gap-2 p-3 overflow-y-auto flex-1">
        {sightings.slice(0, 20).map((s) => (
          <li key={s.id}>
            <SightingRow
              sighting={s}
              onClick={() => setFocusedSighting(s)}
            />
          </li>
        ))}
      </ul>

      {/* "View all photos" footer */}
      {sightings.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-t border-border">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/5 transition-colors"
          >
            <Camera className="h-3 w-3" />
            View all {sightings.length} photos
          </button>
        </div>
      )}

      {/* Expanded grid */}
      {expanded && (
        <PhotoGrid sightings={sightings} onClose={() => setExpanded(false)} />
      )}

      {/* Single photo focus overlay */}
      {focusedSighting && (
        <SinglePhotoOverlay
          sighting={focusedSighting}
          onClose={() => setFocusedSighting(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Single photo detail overlay (tap a row → fullscreen)
// ---------------------------------------------------------------------------

function SinglePhotoOverlay({
  sighting,
  onClose,
}: {
  sighting: Sighting;
  onClose: () => void;
}) {
  const river = RIVER_BADGES[sighting.riverId];
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 hover:bg-white/20 transition-colors"
        aria-label="Close"
      >
        <X className="h-4 w-4 text-white" />
      </button>

      <div className="w-full max-w-lg rounded-2xl overflow-hidden border border-border shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getSightingPhotoUrl(sighting.photoFilename)}
          alt={`${sighting.displayName} at ${river?.name}`}
          className="w-full object-contain max-h-[70vh]"
        />
        <div className="bg-background px-4 py-3 flex items-center gap-3">
          <div
            className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
            style={{ backgroundColor: river?.color ?? "#22d3ee" }}
          >
            {sighting.displayName[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <div className="text-[13px] font-semibold text-foreground">
              {sighting.displayName}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {river?.emoji} {river?.name ?? sighting.riverId} ·{" "}
              {relativeTime(sighting.timestamp)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
