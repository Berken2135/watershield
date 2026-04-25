"use client";

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

const SCAN_MS = 3000;

export default function NfcAuth({ open, onSuccess, dismissible = true, onClose }: NfcAuthProps) {
  const [verified, setVerified] = useState(false);
  const successRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    if (successRef.current) return;
    successRef.current = true;
    setVerified(true);
    setTimeout(onSuccess, 800);
  }, [onSuccess]);

  useEffect(() => {
    if (!open) return;
    successRef.current = false;
    setVerified(false);

    timerRef.current = setTimeout(finish, SCAN_MS);

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
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, finish]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#020d16] grid place-items-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.10),transparent_55%)]" />

      <div className="relative flex flex-col items-center gap-10 text-white">
        {/* Pulsing / expanding rings + icon */}
        <div className="relative grid place-items-center">
          <span
            className={`absolute h-44 w-44 rounded-full border border-cyan-400/20 ${
              verified ? "" : "animate-[nfc-ring_1.8s_ease-out_infinite]"
            }`}
          />
          <span
            className={`absolute h-44 w-44 rounded-full border border-cyan-400/10 ${
              verified ? "" : "animate-[nfc-ring_1.8s_ease-out_infinite_0.9s]"
            }`}
          />

          <div
            className={`h-28 w-28 rounded-3xl grid place-items-center transition-all duration-500 ${
              verified
                ? "bg-emerald-500/20 ring-1 ring-emerald-400/40"
                : "bg-white/[0.04] ring-1 ring-cyan-400/20 animate-[nfc-pulse_1.5s_ease-in-out_infinite]"
            }`}
          >
            {verified ? (
              <svg
                viewBox="0 0 48 48"
                className="h-12 w-12 text-emerald-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="10 26 20 36 38 14" />
              </svg>
            ) : (
              <NfcGlyph />
            )}
          </div>
        </div>

        {/* Single line */}
        <p className="text-[15px] font-light tracking-wide text-white/75">
          {verified ? "Access granted" : "Scan NFC to enter"}
        </p>
      </div>

      {!verified && dismissible && (
        <button
          type="button"
          onClick={() => {
            finish();
            onClose();
          }}
          className="absolute bottom-8 text-[11px] text-white/20 hover:text-white/50 transition-colors"
        >
          skip
        </button>
      )}

      <style jsx>{`
        @keyframes nfc-ring {
          0% {
            transform: scale(0.55);
            opacity: 0.8;
          }
          100% {
            transform: scale(1.7);
            opacity: 0;
          }
        }
        @keyframes nfc-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }
      `}</style>
    </div>
  );
}

function NfcGlyph() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="h-12 w-12 text-cyan-300"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M14 32V16l20 16V16" />
      <path d="M38 17a13 13 0 0 1 0 14" opacity="0.6" />
      <path d="M42 13a19 19 0 0 1 0 22" opacity="0.3" />
    </svg>
  );
}
