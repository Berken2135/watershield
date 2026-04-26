"use client";

import { useEffect, useState } from "react";

// ── Types & Data ─────────────────────────────────────────────────────────────

export type RiverBadgeInfo = {
  id: string;
  name: string;
  emoji: string;      // kept for text labels in feeds / timeline
  country: string;    // country / region label
  baseWqi: number;    // kept for historical compat
  color: string;      // primary hex
  colorLight: string; // lighter tint for gradient top
  rarity: "common" | "rare" | "legendary";
};

export const RIVER_BADGES: Record<string, RiverBadgeInfo> = {
  odra:   { id: "odra",   name: "Odra",   emoji: "🌊", country: "Poland / Germany",     baseWqi: 184.2, color: "#ef4444", colorLight: "#fca5a5", rarity: "legendary" },
  danube: { id: "danube", name: "Danube", emoji: "🏞️", country: "10 countries, SE Europe", baseWqi: 198.5, color: "#f59e0b", colorLight: "#fde68a", rarity: "rare" },
  rhine:  { id: "rhine",  name: "Rhine",  emoji: "🐟", country: "Switzerland / Germany",  baseWqi: 207.8, color: "#10b981", colorLight: "#6ee7b7", rarity: "rare" },
  glomma: { id: "glomma", name: "Glomma", emoji: "🌲", country: "Norway",               baseWqi: 217.2, color: "#22d3ee", colorLight: "#a5f3fc", rarity: "common" },
  vardar: { id: "vardar", name: "Vardar", emoji: "⛰️", country: "N. Macedonia / Greece", baseWqi: 198.0, color: "#a78bfa", colorLight: "#ddd6fe", rarity: "rare" },
};

// ── River SVG Icons ──────────────────────────────────────────────────────────
// White stroke icons for use on colored badge backgrounds.

function OdraIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
      <path d="M2 9C4.5 6 7.5 6 10 9C12.5 12 15.5 12 18 9C20.5 6 22.5 6 22.5 9" />
      <path d="M2 15C4.5 12 7.5 12 10 15C12.5 18 15.5 18 18 15C20.5 12 22.5 12 22.5 15" />
    </svg>
  );
}

function DanubeIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20L8 8L12 14L16 8L22 20" />
    </svg>
  );
}

function RhineIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12C3 7.5 6.5 5 12 5C17.5 5 21 7.5 21 12C21 16.5 17.5 19 12 19C6.5 19 3 16.5 3 12Z" />
      <path d="M21 12L24 8.5M21 12L24 15.5" />
      <circle cx="9" cy="11" r="1.5" fill="white" stroke="none" />
    </svg>
  );
}

function GlommaIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3L6 13H18L12 3Z" />
      <path d="M12 9L4.5 21H19.5L12 9Z" />
      <line x1="12" y1="21" x2="12" y2="23" />
    </svg>
  );
}

function VardarIcon({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 21L12 4L22 21" />
      <path d="M8.5 15L12 9L15.5 15" strokeWidth="1.8" strokeOpacity="0.65" />
    </svg>
  );
}

const ICON_MAP: Record<string, React.FC<{ s: number }>> = {
  odra: OdraIcon,
  danube: DanubeIcon,
  rhine: RhineIcon,
  glomma: GlommaIcon,
  vardar: VardarIcon,
};

/** Renders the river's SVG icon at any size. White by default (for colored backgrounds). */
export function RiverIcon({ riverId, size, muted = false }: { riverId: string; size: number; muted?: boolean }) {
  const Icon = ICON_MAP[riverId];
  if (!Icon) return null;
  if (!muted) return <Icon s={size} />;
  // Muted = grey icon for uncollected state
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      {riverId === "odra" && <>
        <path d="M2 9C4.5 6 7.5 6 10 9C12.5 12 15.5 12 18 9C20.5 6 22.5 6 22.5 9" />
        <path d="M2 15C4.5 12 7.5 12 10 15C12.5 18 15.5 18 18 15C20.5 12 22.5 12 22.5 15" />
      </>}
      {riverId === "danube" && <path d="M2 20L8 8L12 14L16 8L22 20" />}
      {riverId === "rhine" && <>
        <path d="M3 12C3 7.5 6.5 5 12 5C17.5 5 21 7.5 21 12C21 16.5 17.5 19 12 19C6.5 19 3 16.5 3 12Z" />
        <path d="M21 12L24 8.5M21 12L24 15.5" />
        <circle cx="9" cy="11" r="1.5" fill="#94a3b8" stroke="none" />
      </>}
      {riverId === "glomma" && <>
        <path d="M12 3L6 13H18L12 3Z" />
        <path d="M12 9L4.5 21H19.5L12 9Z" />
        <line x1="12" y1="21" x2="12" y2="23" />
      </>}
      {riverId === "vardar" && <>
        <path d="M2 21L12 4L22 21" />
        <path d="M8.5 15L12 9L15.5 15" strokeWidth="1.8" strokeOpacity="0.65" />
      </>}
    </svg>
  );
}

// ── Badge Component ──────────────────────────────────────────────────────────

type Props = {
  riverId: string;
  /** When true the badge plays its reveal animation. */
  revealed?: boolean;
  /** Size in pixels. Default 120. */
  size?: number;
  /** Extra Tailwind classes for the outer wrapper. */
  className?: string;
};

export default function RiverBadge({
  riverId,
  revealed = false,
  size = 120,
  className = "",
}: Props) {
  const info = RIVER_BADGES[riverId];
  const [animating, setAnimating] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!revealed || done) return;
    setAnimating(true);
    const t = setTimeout(() => {
      setAnimating(false);
      setDone(true);
    }, 800);
    return () => clearTimeout(t);
  }, [revealed, done]);

  if (!info) {
    return (
      <div
        className={`rounded-full bg-slate-200 grid place-items-center ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const isActive = revealed || done;
  const iconSize = Math.round(size * 0.44);

  return (
    <div
      className={`relative grid place-items-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Badge circle */}
      <div
        className="relative rounded-full flex flex-col items-center justify-center overflow-hidden"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(145deg, ${info.colorLight} 0%, ${info.color} 100%)`,
          boxShadow: isActive
            ? `0 0 0 3px white, 0 0 0 5px ${info.color}, 0 8px 28px ${info.color}55`
            : `0 4px 16px ${info.color}35`,
          transform: animating ? "scale(1.12) rotate(360deg)" : "scale(1) rotate(0deg)",
          transition: animating
            ? "transform 0.75s cubic-bezier(0.34,1.56,0.64,1)"
            : "transform 0.3s ease, box-shadow 0.4s ease",
        }}
      >
        {/* Glossy top-left highlight */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.42) 0%, transparent 58%)",
          }}
        />

        {/* SVG icon */}
        <div className="relative z-10">
          <RiverIcon riverId={riverId} size={iconSize} />
        </div>

        {/* River name — only at sizes where it fits cleanly */}
        {size >= 72 && (
          <span
            className="relative z-10 font-bold text-white/90 tracking-widest text-center leading-none mt-1.5"
            style={{ fontSize: Math.max(8, Math.round(size * 0.095)) }}
          >
            {info.name.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
