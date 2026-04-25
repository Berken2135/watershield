"use client";

/**
 * GestureAuth — fullscreen "6·7" biometric gate.
 *
 * Layout:
 *   • Camera fills the viewport (object-cover, mirrored)
 *   • Live MediaPipe skeleton drawn over the feed
 *   • Top: instruction "Покажите жест 6·7 для безопасного входа"
 *   • Bottom: thin progress bar
 *
 * Detection:
 *   • Face visible + 2 hands visible
 *   • Palms below the chin line
 *   • Vertical wrist oscillation (amplitude > MIN_AMPLITUDE) over the
 *     last HISTORY frames with ≥ MIN_REVERSALS direction reversals
 *   • framesRequired consecutive satisfying frames → verified
 *
 * Inference is 100% client-side. Frames are never uploaded.
 */

import { ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────

type Landmark = { x: number; y: number; z?: number; visibility?: number };

type HandsResult = {
  landmarks: Landmark[][];
  handedness: { categoryName: string; score: number }[][];
};

type FaceResult = { faceLandmarks: Landmark[][] };

type VisionTask = {
  detectForVideo: (video: HTMLVideoElement, ts: number) => HandsResult | FaceResult;
  close?: () => void;
};

type MediaPipeVision = {
  FilesetResolver: { forVisionTasks: (path: string) => Promise<unknown> };
  HandLandmarker: { createFromOptions: (fs: unknown, o: Record<string, unknown>) => Promise<VisionTask> };
  FaceLandmarker: { createFromOptions: (fs: unknown, o: Record<string, unknown>) => Promise<VisionTask> };
};

const VISION_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

// MediaPipe hand connections (21-point topology).
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

// ── Component ────────────────────────────────────────────────────────

export type GestureAuthProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  framesRequired?: number;
  dismissible?: boolean;
};

type Phase = "idle" | "loading" | "scanning" | "verified" | "error";

const HISTORY = 40;
const MIN_AMPLITUDE = 0.03;
const MIN_REVERSALS = 1;

export default function GestureAuth({
  open,
  onClose,
  onSuccess,
  framesRequired = 8,
  dismissible = true,
}: GestureAuthProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const handTaskRef = useRef<VisionTask | null>(null);
  const faceTaskRef = useRef<VisionTask | null>(null);
  const stableCountRef = useRef(0);
  const wristHistoryRef = useRef<number[]>([]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

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
    wristHistoryRef.current = [];
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("idle");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrMsg(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(0);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setPhase("loading");
        const vision = (await import(/* webpackIgnore: true */ VISION_CDN)) as MediaPipeVision;
        if (cancelled) return;
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
        if (cancelled) return;

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

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play().catch(() => undefined);

        setPhase("scanning");

        const loop = () => {
          rafRef.current = requestAnimationFrame(loop);
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const handTask = handTaskRef.current;
          const faceTask = faceTaskRef.current;
          if (!video || !canvas || !handTask || !faceTask || video.readyState < 2) return;

          const ts = performance.now();
          const handRes = handTask.detectForVideo(video, ts) as HandsResult;
          const faceRes = faceTask.detectForVideo(video, ts) as FaceResult;

          const faceLm = faceRes.faceLandmarks?.[0];
          const handsLm = handRes.landmarks ?? [];

          // ── Skeleton overlay ──
          const W = (canvas.width = video.videoWidth || 1280);
          const H = (canvas.height = video.videoHeight || 720);
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, W, H);
            ctx.save();
            ctx.translate(W, 0);
            ctx.scale(-1, 1);

            if (faceLm) {
              ctx.fillStyle = "rgba(34, 211, 238, 0.6)";
              for (let i = 0; i < faceLm.length; i += 4) {
                const p = faceLm[i];
                ctx.beginPath();
                ctx.arc(p.x * W, p.y * H, 1.4, 0, Math.PI * 2);
                ctx.fill();
              }
            }

            for (const hand of handsLm) {
              ctx.lineWidth = 4;
              ctx.strokeStyle = "rgba(34, 211, 238, 0.95)";
              ctx.shadowColor = "rgba(34, 211, 238, 0.5)";
              ctx.shadowBlur = 8;
              for (const [a, b] of HAND_CONNECTIONS) {
                const p = hand[a];
                const q = hand[b];
                if (!p || !q) continue;
                ctx.beginPath();
                ctx.moveTo(p.x * W, p.y * H);
                ctx.lineTo(q.x * W, q.y * H);
                ctx.stroke();
              }
              ctx.shadowBlur = 0;
              ctx.fillStyle = "rgba(255, 255, 255, 1)";
              for (const p of hand) {
                ctx.beginPath();
                ctx.arc(p.x * W, p.y * H, 5, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            ctx.restore();
          }

          // ── Detection ──
          let satisfied = false;
          if (faceLm && handsLm.length >= 2) {
            const ys = faceLm.map((p) => p.y);
            const chinY = Math.max(...ys);
            const w0 = handsLm[0][0];
            const w1 = handsLm[1][0];
            const palmsBelowChin = w0.y > chinY && w1.y > chinY;

            const avgY = (w0.y + w1.y) / 2;
            const hist = wristHistoryRef.current;
            hist.push(avgY);
            if (hist.length > HISTORY) hist.shift();

            const { amplitude, reversals } = analyzeOscillation(hist);
            const oscillating = amplitude > MIN_AMPLITUDE && reversals >= MIN_REVERSALS;
            satisfied = palmsBelowChin && oscillating;
          } else {
            wristHistoryRef.current = [];
          }

          stableCountRef.current = satisfied
            ? stableCountRef.current + 1
            : Math.max(0, stableCountRef.current - 1);
          setProgress(Math.min(1, stableCountRef.current / framesRequired));

          if (stableCountRef.current >= framesRequired) {
            stableCountRef.current = 0;
            cancelAnimationFrame(rafRef.current!);
            rafRef.current = null;
            setPhase("verified");
            setProgress(1);
            setTimeout(() => {
              cleanup();
              onSuccess();
            }, 700);
          }
        };
        loop();
      } catch (err) {
        console.error("[GestureAuth]", err);
        if (cancelled) return;
        setPhase("error");
        setErrMsg(err instanceof Error ? err.message : "Camera unavailable");
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black overflow-hidden">
      {/* Video — fullscreen */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)]"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full pointer-events-none"
      />

      {/* Top vignette for close button legibility */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />
      {/* Bottom vignette for progress bar */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />

      {/* Close */}
      {dismissible && (
        <button
          type="button"
          onClick={() => { cleanup(); onClose(); }}
          className="absolute right-6 top-6 z-10 rounded-full p-2.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors backdrop-blur-md"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Loading state overlay */}
      {phase === "loading" && (
        <div className="absolute inset-0 z-10 grid place-items-center">
          <div className="h-8 w-8 rounded-full border-2 border-white/30 border-t-cyan-300 animate-spin" />
        </div>
      )}

      {/* Verified flash */}
      {phase === "verified" && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-emerald-500/15 backdrop-blur-sm">
          <div className="rounded-full bg-white/15 backdrop-blur-xl p-6 ring-2 ring-emerald-300/70">
            <ShieldCheck className="h-14 w-14 text-emerald-300" />
          </div>
        </div>
      )}

      {/* Error toast */}
      {phase === "error" && errMsg && (
        <div className="absolute inset-x-0 bottom-16 z-10 flex justify-center px-6">
          <div className="rounded-full bg-red-500/20 backdrop-blur-xl px-4 py-2 text-xs text-red-100 ring-1 ring-red-300/40">
            {errMsg}
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="absolute left-0 right-0 bottom-0 z-10 h-1 bg-white/10">
        <div
          className="h-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.7)] transition-all duration-150 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function analyzeOscillation(values: number[]): { amplitude: number; reversals: number } {
  if (values.length < 6) return { amplitude: 0, reversals: 0 };
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const amplitude = max - min;

  let reversals = 0;
  let prevDir: 1 | -1 | 0 = 0;
  for (let i = 2; i < values.length; i++) {
    const a = (values[i - 2] + values[i - 1]) / 2;
    const b = (values[i - 1] + values[i]) / 2;
    const dir: 1 | -1 | 0 = b > a + 0.003 ? 1 : b < a - 0.003 ? -1 : 0;
    if (dir !== 0 && prevDir !== 0 && dir !== prevDir) reversals++;
    if (dir !== 0) prevDir = dir;
  }
  return { amplitude, reversals };
}
