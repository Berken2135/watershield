"use client";

/**
 * GestureAuth — biometric "Neural Scan" login.
 *
 * Uses MediaPipe Tasks Vision (Hands + FaceLandmarker) loaded from CDN
 * via dynamic <script> import. Access is granted only when the model
 * detects:
 *   1) exactly one human face,
 *   2) two hands, AND
 *   3) both wrists raised above the corresponding shoulder line
 *      (we approximate "shoulder" as 0.6 * face-bottom-Y for a single
 *      camera view — robust without a full pose model).
 *
 * The component never sends video frames anywhere. Inference happens
 * 100% client-side. When verified it calls onSuccess() so the host
 * page can transition to the dashboard.
 */

import { Fingerprint, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ------------------------------------------------------------------
// Minimal types describing the slice of the MediaPipe API we use.
// We avoid `@mediapipe/*` npm packages to keep the bundle lean.
// ------------------------------------------------------------------

type Landmark = { x: number; y: number; z?: number; visibility?: number };

type HandsResult = {
  landmarks: Landmark[][];        // one array of 21 landmarks per hand
  handedness: { categoryName: string; score: number }[][];
};

type FaceResult = {
  faceLandmarks: Landmark[][];    // one array of ~478 landmarks per face
};

type VisionTask = {
  detectForVideo: (video: HTMLVideoElement, ts: number) => HandsResult | FaceResult;
  close?: () => void;
};

type MediaPipeVision = {
  FilesetResolver: {
    forVisionTasks: (path: string) => Promise<unknown>;
  };
  HandLandmarker: {
    createFromOptions: (fileset: unknown, opts: Record<string, unknown>) => Promise<VisionTask>;
  };
  FaceLandmarker: {
    createFromOptions: (fileset: unknown, opts: Record<string, unknown>) => Promise<VisionTask>;
  };
};

const VISION_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

// ------------------------------------------------------------------

export type GestureAuthProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** How many consecutive frames must satisfy the gesture (anti-flicker). */
  framesRequired?: number;
};

type Phase = "idle" | "loading" | "scanning" | "verified" | "error";

export default function GestureAuth({
  open,
  onClose,
  onSuccess,
  framesRequired = 18, // ~0.7s at 25fps
}: GestureAuthProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const handTaskRef = useRef<VisionTask | null>(null);
  const faceTaskRef = useRef<VisionTask | null>(null);
  const stableCountRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [statusMsg, setStatusMsg] = useState("Initializing neural model…");
  const [signals, setSignals] = useState({
    face: false,
    hands: 0,
    wristsRaised: false,
  });

  // ---------- cleanup ----------
  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    handTaskRef.current?.close?.();
    faceTaskRef.current?.close?.();
    handTaskRef.current = null;
    faceTaskRef.current = null;
    stableCountRef.current = 0;
  }, []);

  // ---------- init ----------
  useEffect(() => {
    if (!open) {
      cleanup();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("idle");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSignals({ face: false, hands: 0, wristsRaised: false });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setPhase("loading");
        setStatusMsg("Loading MediaPipe vision bundle…");

        // 1) load the CDN ESM bundle
        const vision = (await import(/* webpackIgnore: true */ VISION_CDN)) as MediaPipeVision;
        if (cancelled) return;

        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
        if (cancelled) return;

        setStatusMsg("Initializing biometric model…");

        const [hands, face] = await Promise.all([
          vision.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
            numHands: 2,
            runningMode: "VIDEO",
          }),
          vision.FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
            numFaces: 1,
            runningMode: "VIDEO",
          }),
        ]);
        if (cancelled) return;
        handTaskRef.current = hands;
        faceTaskRef.current = face;

        // 2) request camera
        setStatusMsg("Requesting camera access…");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        setPhase("scanning");
        setStatusMsg("Show your face. Raise both hands.");

        // 3) per-frame inference loop
        const loop = () => {
          rafRef.current = requestAnimationFrame(loop);
          const v = videoRef.current;
          const c = canvasRef.current;
          const handTask = handTaskRef.current;
          const faceTask = faceTaskRef.current;
          if (!v || !c || !handTask || !faceTask || v.readyState < 2) return;

          const ts = performance.now();
          const handRes = handTask.detectForVideo(v, ts) as HandsResult;
          const faceRes = faceTask.detectForVideo(v, ts) as FaceResult;

          const faceLm = faceRes.faceLandmarks?.[0];
          const handsLm = handRes.landmarks ?? [];

          // wrist landmark = index 0 in MediaPipe Hands
          // shoulder approximated from face bbox bottom (chin) extrapolated down
          let wristsRaised = false;
          if (faceLm && handsLm.length >= 2) {
            const ys = faceLm.map((p) => p.y);
            const chinY = Math.max(...ys);
            // Shoulders sit roughly one face-height below the chin in
            // a typical webcam framing. Larger Y = lower in the image.
            const shoulderY = Math.min(0.95, chinY + 0.18);
            wristsRaised = handsLm.every((hand) => hand[0] && hand[0].y < shoulderY);
          }

          setSignals({ face: !!faceLm, hands: handsLm.length, wristsRaised });

          // draw skeleton overlay
          drawOverlay(c, v, faceLm, handsLm);

          const ok = !!faceLm && handsLm.length >= 2 && wristsRaised;
          stableCountRef.current = ok ? stableCountRef.current + 1 : 0;

          if (stableCountRef.current >= framesRequired) {
            stableCountRef.current = 0;
            cancelAnimationFrame(rafRef.current!);
            rafRef.current = null;
            setPhase("verified");
            setStatusMsg("Identity verified. Welcome.");
            // small delay so the success state is visible
            setTimeout(() => {
              cleanup();
              onSuccess();
            }, 900);
          }
        };
        loop();
      } catch (err) {
        console.error("[GestureAuth]", err);
        if (cancelled) return;
        setPhase("error");
        setStatusMsg(
          err instanceof Error
            ? err.message
            : "Could not initialize biometric scan",
        );
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const allOk = signals.face && signals.hands >= 2 && signals.wristsRaised;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 backdrop-blur-2xl">
      {/* Top-right close */}
      <button
        type="button"
        onClick={() => {
          cleanup();
          onClose();
        }}
        className="absolute right-6 top-6 rounded-full p-2 text-muted-foreground/80 hover:bg-white/5 hover:text-foreground transition-colors"
        aria-label="Cancel"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="relative w-full max-w-2xl px-6">
        <div className="text-center mb-6 select-none">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 mb-4">
            <Fingerprint className="h-3.5 w-3.5 text-[var(--color-cyan)]" />
            <span className="text-[11px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
              Neural Scan · Biometric Auth
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-balance">
            {phase === "verified" ? "Identity Verified" : "Show your face. Raise both hands."}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{statusMsg}</p>
        </div>

        {/* Camera frame */}
        <div className="relative mx-auto aspect-[4/3] max-w-xl overflow-hidden rounded-2xl glass-strong">
          {/* corner brackets */}
          <CornerBrackets ok={allOk} />

          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover [transform:scaleX(-1)]"
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full [transform:scaleX(-1)]"
          />

          {/* scan line overlay */}
          {phase === "scanning" && (
            <div className="scan-line absolute inset-0" />
          )}
          {/* success flash */}
          {phase === "verified" && (
            <div className="absolute inset-0 grid place-items-center bg-emerald-500/10">
              <div className="rounded-full glass p-4 ring-1 ring-emerald-400/40">
                <ShieldCheck className="h-10 w-10 text-emerald-400" />
              </div>
            </div>
          )}
        </div>

        {/* Signal chips */}
        <div className="mt-5 flex items-center justify-center gap-2 text-[11px] tracking-wide uppercase">
          <Chip ok={signals.face} label="Face" />
          <Chip ok={signals.hands >= 2} label={`Hands ${signals.hands}/2`} />
          <Chip ok={signals.wristsRaised} label="Wrists ↑" />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors ${
        ok
          ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30"
          : "bg-white/[0.03] text-muted-foreground ring-1 ring-white/[0.06]"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400 shadow-[0_0_6px_#10b981]" : "bg-muted-foreground/40"}`}
      />
      {label}
    </span>
  );
}

function CornerBrackets({ ok }: { ok: boolean }) {
  const color = ok ? "border-emerald-400" : "border-[var(--color-cyan)]";
  return (
    <>
      <div className={`absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 ${color}`} />
      <div className={`absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 ${color}`} />
      <div className={`absolute left-3 bottom-3 h-6 w-6 border-l-2 border-b-2 ${color}`} />
      <div className={`absolute right-3 bottom-3 h-6 w-6 border-r-2 border-b-2 ${color}`} />
    </>
  );
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  face: Landmark[] | undefined,
  hands: Landmark[][],
) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  // face landmarks — sparse dots
  if (face) {
    ctx.fillStyle = "rgba(34, 211, 238, 0.55)";
    for (let i = 0; i < face.length; i += 6) {
      const p = face[i];
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // hand landmarks — connected lines
  ctx.strokeStyle = "rgba(34, 211, 238, 0.85)";
  ctx.lineWidth = 1.5;
  for (const hand of hands) {
    ctx.beginPath();
    hand.forEach((p, idx) => {
      const x = p.x * w;
      const y = p.y * h;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#22d3ee";
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
