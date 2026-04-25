"use client";

/**
 * NfcAuth — minimalist phone auth.
 *
 * On open we kick off a fake 5-second "scan" with a progress ring.
 * If real Web NFC (`NDEFReader`) is available we also start it in
 * parallel so a real tap will short-circuit the timer. Otherwise the
 * timer alone signs the user in. A "Simulate" button is exposed for
 * desktop sanity checks.
 */

import { ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type NDEFReadingEvent = Event & { serialNumber?: string };
type NDEFReaderLike = {
  scan: () => Promise<void>;
  addEventListener: (
    event: "reading" | "readingerror",
    handler: (e: NDEFReadingEvent) => void,
  ) => void;
};

declare global {
  interface Window {
    NDEFReader?: { new (): NDEFReaderLike };
  }
}

export type NfcAuthProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  dismissible?: boolean;
};

const SCAN_MS = 5000;

export default function NfcAuth({ open, onClose, onSuccess, dismissible = true }: NfcAuthProps) {
  const [verified, setVerified] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const successRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  const finish = useCallback(() => {
    if (successRef.current) return;
    successRef.current = true;
    setProgress(1);
    setVerified(true);
    setTimeout(onSuccess, 600);
  }, [onSuccess]);

  // Drive the progress ring + auto-complete after SCAN_MS.
  useEffect(() => {
    if (!open) return;
    successRef.current = false;
    setVerified(false);
    setProgress(0);
    startRef.current = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - (startRef.current ?? now)) / SCAN_MS);
      setProgress(t);
      if (t >= 1) {
        finish();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Best-effort real NFC — short-circuits the timer if a tag arrives.
    let cancelled = false;
    (async () => {
      try {
        if (typeof window !== "undefined" && window.NDEFReader) {
          const reader = new window.NDEFReader();
          await reader.scan();
          reader.addEventListener("reading", () => {
            if (!cancelled) finish();
          });
        }
      } catch {
        /* permission denied / unsupported — fall back to timer */
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open, finish]);

  if (!open) return null;

  // Geometry for the progress ring.
  const r = 88;
  const c = 2 * Math.PI * r;
  const dash = c * progress;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-slate-950 via-[#04111e] to-black overflow-hidden grid place-items-center px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.18),transparent_60%)]" />

      {dismissible && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 z-10 rounded-full p-2.5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      <div className="relative w-full max-w-xs flex flex-col items-center text-center text-white">
        <div className="text-[10px] tracking-[0.32em] uppercase text-cyan-300/80">
          WaterShield
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {verified ? "Verified" : "Tap NFC chip to phone"}
        </h1>
        <p className="mt-2 text-[12px] text-white/55 max-w-[18rem]">
          {verified ? "Welcome back." : "Hold your access chip to the back of your phone."}
        </p>

        {/* Progress ring + chip glyph */}
        <div className="relative mt-10 mb-8 grid place-items-center h-56 w-56">
          <span className="absolute inset-0 rounded-full border border-cyan-400/15" />
          <span
            className="absolute inset-0 rounded-full border border-cyan-400/30 animate-[nfc-ring_2.4s_ease-out_infinite]"
            style={{ opacity: verified ? 0 : 1 }}
          />
          <span
            className="absolute inset-6 rounded-full border border-cyan-400/40 animate-[nfc-ring_2.4s_ease-out_infinite_0.8s]"
            style={{ opacity: verified ? 0 : 1 }}
          />

          <svg
            viewBox="0 0 200 200"
            className="absolute inset-0 -rotate-90"
            aria-hidden
          >
            <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
            <circle
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke={verified ? "#34d399" : "#22d3ee"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`}
              style={{ transition: "stroke 240ms ease-out" }}
            />
          </svg>

          <div className="relative h-24 w-24 rounded-2xl bg-gradient-to-br from-slate-700/90 to-slate-900 ring-1 ring-white/10 grid place-items-center shadow-[0_14px_38px_rgba(0,0,0,0.55)]">
            {verified ? (
              <ShieldCheck className="h-9 w-9 text-emerald-300" strokeWidth={1.6} />
            ) : (
              <NfcGlyph />
            )}
          </div>
        </div>

        <div className="text-[11px] tracking-[0.18em] uppercase text-white/40">
          {verified ? "Access granted" : `Scanning ${(progress * 100).toFixed(0)}%`}
        </div>

        {/* Quiet desktop fallback. */}
        <button
          type="button"
          onClick={finish}
          disabled={verified}
          className="mt-6 text-[11px] text-white/35 hover:text-white/70 transition-colors disabled:opacity-30"
        >
          Skip / simulate
        </button>
      </div>

      <style jsx>{`
        @keyframes nfc-ring {
          0%   { transform: scale(0.7); opacity: 0.85; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function NfcGlyph() {
  // Simple stylised "N" + signal arcs.
  return (
    <svg viewBox="0 0 48 48" className="h-9 w-9 text-cyan-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M14 32V16l20 16V16" />
      <path d="M40 18a14 14 0 0 1 0 12" opacity="0.55" />
      <path d="M44 14a20 20 0 0 1 0 20" opacity="0.3" />
    </svg>
  );
}
