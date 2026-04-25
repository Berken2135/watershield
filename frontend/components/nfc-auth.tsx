"use client";

/**
 * NfcAuth — phone-friendly auth modal.
 *
 * Two paths:
 *  1. Real Web NFC (Chrome on Android) via `NDEFReader`. The reader is
 *     started on user gesture; first tag detected verifies the user.
 *  2. "Simulate NFC" button — for desks without a card or non-Android
 *     devices. Plays the same success animation and signs the user in.
 *
 * Renders a fullscreen overlay with a pulsing card target and
 * instruction copy. iOS / unsupported browsers automatically fall back
 * to the simulate path with an explanatory note.
 */

import { CreditCard, Smartphone, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal Web NFC typing — TS lib doesn't ship it yet.
type NDEFReadingEvent = Event & { serialNumber?: string };
type NDEFReaderLike = {
  scan: () => Promise<void>;
  addEventListener: (
    event: "reading" | "readingerror",
    handler: (e: NDEFReadingEvent) => void
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

type Phase = "idle" | "scanning" | "verified" | "error";

export default function NfcAuth({ open, onClose, onSuccess, dismissible = true }: NfcAuthProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "NDEFReader" in window);
  }, []);

  const stopScan = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const completeSuccess = useCallback(() => {
    setPhase("verified");
    setTimeout(() => {
      onSuccess();
      stopScan();
    }, 800);
  }, [onSuccess, stopScan]);

  const startScan = useCallback(async () => {
    setErrMsg(null);
    if (!supported || !window.NDEFReader) {
      setPhase("error");
      setErrMsg("Web NFC is not available on this device. Use the simulate button below.");
      return;
    }
    try {
      const reader = new window.NDEFReader();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setPhase("scanning");
      await reader.scan();
      reader.addEventListener("reading", () => completeSuccess());
      reader.addEventListener("readingerror", () => {
        setPhase("error");
        setErrMsg("Couldn't read that card. Try again.");
      });
      // Auto-stop scanning after 60s.
      setTimeout(() => {
        if (!ctrl.signal.aborted && phase === "scanning") {
          stopScan();
          setPhase("idle");
        }
      }, 60_000);
    } catch (err) {
      setPhase("error");
      setErrMsg(err instanceof Error ? err.message : "NFC permission denied");
    }
  }, [supported, completeSuccess, stopScan, phase]);

  useEffect(() => {
    if (!open) {
      stopScan();
      setPhase("idle");
      setErrMsg(null);
      return;
    }
  }, [open, stopScan]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-slate-950 via-[#04111e] to-black overflow-hidden grid place-items-center px-6">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.15),transparent_60%)]" />

      {dismissible && (
        <button
          type="button"
          onClick={() => { stopScan(); onClose(); }}
          className="absolute right-5 top-5 z-10 rounded-full p-2.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors backdrop-blur-md"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      <div className="relative w-full max-w-sm flex flex-col items-center text-center text-white">
        <h1 className="text-2xl font-semibold tracking-tight">
          Tap card
        </h1>

        {/* Animation target */}
        <div className="relative mt-10 mb-8 grid place-items-center h-56 w-56">
          {/* expanding rings */}
          <span className="absolute inset-0 rounded-full border border-cyan-400/30 animate-[nfc-ring_2.2s_ease-out_infinite]" />
          <span className="absolute inset-4 rounded-full border border-cyan-400/40 animate-[nfc-ring_2.2s_ease-out_infinite_0.6s]" />
          <span className="absolute inset-10 rounded-full border border-cyan-400/50 animate-[nfc-ring_2.2s_ease-out_infinite_1.1s]" />

          {/* phone + card stack */}
          <div className="relative h-32 w-24">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 ring-1 ring-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.6)] grid place-items-center">
              <Smartphone className="h-10 w-10 text-white/70" strokeWidth={1.4} />
            </div>
            <div className="absolute -top-3 -right-6 h-10 w-16 rounded-md bg-gradient-to-br from-cyan-300/90 to-sky-500/90 ring-1 ring-cyan-200/50 shadow-[0_8px_24px_rgba(34,211,238,0.5)] grid place-items-center nfc-card-float">
              <CreditCard className="h-5 w-5 text-white" strokeWidth={1.6} />
            </div>
          </div>
        </div>

        {phase === "verified" && (
          <div className="mb-3 flex items-center gap-2 text-emerald-300 text-sm">
            <ShieldCheck className="h-4 w-4" />
            Identity verified
          </div>
        )}

        {phase === "error" && errMsg && (
          <div className="mb-3 rounded-full bg-red-500/15 px-4 py-1.5 text-xs text-red-200 ring-1 ring-red-300/30">
            {errMsg}
          </div>
        )}

        <div className="w-full flex flex-col gap-2.5">
          <button
            type="button"
            onClick={startScan}
            disabled={phase === "scanning" || phase === "verified"}
            className="w-full rounded-xl bg-cyan-400/90 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-medium py-3 text-sm transition-colors shadow-[0_8px_24px_rgba(34,211,238,0.35)]"
          >
            {phase === "scanning" ? "Scanning…" : supported ? "Start NFC scan" : "NFC unavailable"}
          </button>
          <button
            type="button"
            onClick={completeSuccess}
            disabled={phase === "verified"}
            className="w-full rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/90 py-3 text-sm ring-1 ring-white/15 transition-colors"
          >
            Simulate
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes nfc-ring {
          0%   { transform: scale(0.65); opacity: 0.9; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        .nfc-card-float {
          animation: nfc-card-float 2s ease-in-out infinite;
        }
        @keyframes nfc-card-float {
          0%, 100% { transform: translate(0, 0) rotate(-6deg); }
          50%      { transform: translate(-6px, 4px) rotate(-2deg); }
        }
      `}</style>
    </div>
  );
}
