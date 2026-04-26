"use client";

import RiverBadge, { RIVER_BADGES } from "@/components/river-badge";
import {
  getMobileToken,
  loginMobile,
  registerMobile,
  setMobileSession,
  type MobileUser,
} from "@/lib/api";
import { use, useCallback, useEffect, useRef, useState } from "react";

// Use relative URL so uploads route through Next.js API in production (Vercel)
const SIGHTINGS_URL = "/api/sightings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "auth" | "reveal" | "capture" | "share" | "success";
// Progress dots only shown for the post-auth steps
const DOT_STEPS = ["reveal", "capture", "share"] as const;

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = ["#22d3ee", "#10b981", "#f59e0b", "#a78bfa", "#f43f5e"];

function Confetti() {
  const particles = Array.from({ length: 22 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {particles.map((i) => {
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const size = 5 + (i % 4) * 2;
        const left = 8 + (i * 4) % 84;
        const delay = (i * 0.06) % 0.9;
        const dur = 1.0 + (i % 3) * 0.25;
        return (
          <span
            key={i}
            className="absolute top-0 rounded-sm"
            style={{
              left: `${left}%`,
              width: size,
              height: size,
              backgroundColor: color,
              opacity: 0,
              animation: `confettiFall ${dur}s ${delay}s ease-in forwards`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confettiFall {
          0%   { opacity: 1; transform: translateY(-8px) rotate(0deg); }
          100% { opacity: 0; transform: translateY(55vh) rotate(480deg) scale(0.3); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step dots (only shown during reveal / capture / share)
// ---------------------------------------------------------------------------

function StepDots({ current }: { current: Step }) {
  const idx = DOT_STEPS.indexOf(current as (typeof DOT_STEPS)[number]);
  if (idx === -1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24, padding: "0 20px" }}>
      {DOT_STEPS.map((_, i) => (
        <span
          key={i}
          style={{
            height: 8,
            width: i === idx ? 28 : i < idx ? 18 : 8,
            borderRadius: 50,
            background: i <= idx ? "#3b9ede" : "#bde0f5",
            transition: "all 0.35s cubic-bezier(0.34,1.4,0.64,1)",
            display: "block",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth step (login / register)
// ---------------------------------------------------------------------------

type AuthStepProps = {
  onSuccess: (user: MobileUser) => void;
  onGuest: () => void;
  riverName: string;
};

function AuthStep({ onSuccess, onGuest, riverName }: AuthStepProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result =
        tab === "login"
          ? await loginMobile(username, password)
          : await registerMobile(username, email, password);
      setMobileSession(result.token, result.user);
      onSuccess(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "0 20px 40px" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <span className="rc-section-label" style={{ marginBottom: 8 }}>River discovered</span>
        <h1 style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 26, color: "#1a3a5c", margin: "8px 0 4px" }}>{riverName} River</h1>
        <p style={{ fontFamily: "var(--font-nunito)", fontSize: 13, color: "#5a8ab0", margin: 0, fontWeight: 600 }}>Log in to collect your badge</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", background: "rgba(59,158,222,0.1)", borderRadius: 14, padding: 4, marginBottom: 20 }}>
        {(["login", "register"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setError(null); }}
            style={{
              flex: 1, fontFamily: "var(--font-nunito)", fontWeight: 800, fontSize: 14,
              padding: "10px", borderRadius: 10, border: "none", cursor: "pointer",
              background: tab === t ? "white" : "transparent",
              color: tab === t ? "#1a3a5c" : "#5a8ab0",
              boxShadow: tab === t ? "0 1px 8px rgba(59,158,222,0.18)" : "none",
              transition: "all 0.2s ease",
            }}
          >
            {t === "login" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontFamily: "var(--font-nunito)", fontSize: 11, fontWeight: 800, color: "#5a8ab0", letterSpacing: "0.12em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Username</label>
          <input className="rc-input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your_username" autoCapitalize="none" autoCorrect="off" required />
        </div>
        {tab === "register" && (
          <div>
            <label style={{ fontFamily: "var(--font-nunito)", fontSize: 11, fontWeight: 800, color: "#5a8ab0", letterSpacing: "0.12em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Email</label>
            <input className="rc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
        )}
        <div>
          <label style={{ fontFamily: "var(--font-nunito)", fontSize: 11, fontWeight: 800, color: "#5a8ab0", letterSpacing: "0.12em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Password</label>
          <input className="rc-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </div>
        {error && (
          <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 14, padding: "10px 14px" }}>
            <p style={{ fontFamily: "var(--font-nunito)", fontSize: 13, fontWeight: 700, color: "#dc2626", margin: 0, textAlign: "center" }}>{error}</p>
          </div>
        )}
        <button type="submit" disabled={loading} className="rc-btn" style={{ width: "100%", padding: "18px", fontSize: 15, marginTop: 4 }}>
          {loading ? "Loading…" : tab === "login" ? "Log in 🌊" : "Create Account 🌿"}
        </button>
      </form>

      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button type="button" onClick={onGuest} style={{ fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: 700, color: "#9abdd8", background: "none", border: "none", cursor: "pointer" }}>
          Continue as guest (badge won&apos;t be saved)
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScanPage({
  params,
}: {
  params: Promise<{ riverId: string }>;
}) {
  const { riverId } = use(params);
  const river = RIVER_BADGES[riverId];

  // Initialise synchronously from localStorage to avoid a flash of the auth screen
  // for already-logged-in users.
  const [step, setStep] = useState<Step>(() => {
    if (typeof window === "undefined") return "auth";
    return localStorage.getItem("ws_mobile_token") ? "reveal" : "auth";
  });
  const [displayName, setDisplayName] = useState(() => {
    if (typeof window === "undefined") return "";
    const raw = localStorage.getItem("ws_mobile_user");
    if (!raw) return "";
    try { return (JSON.parse(raw) as MobileUser).username ?? ""; }
    catch { return ""; }
  });
  const [badgeRevealed, setBadgeRevealed] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Reset badge animation each time the reveal step is entered
  useEffect(() => {
    if (step !== "reveal") return;
    setBadgeRevealed(false);
    const t = setTimeout(() => setBadgeRevealed(true), 350);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setStep("share");
  }, []);

  const handleUpload = async () => {
    if (!photo || !displayName.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      const token = getMobileToken();
      const form = new FormData();
      form.append("photo", photo);
      form.append("display_name", displayName.trim());
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${SIGHTINGS_URL}/${riverId}`, {
        method: "POST",
        body: form,
        headers,
      });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
      setStep("success");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  // Unknown river
  if (!river) {
    return (
      <Shell>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "60px 24px", textAlign: "center" }}>
          <span style={{ fontSize: 56 }}>❓</span>
          <p style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 20, color: "#1a3a5c", margin: 0 }}>River not found</p>
          <p style={{ fontFamily: "var(--font-nunito)", fontSize: 14, color: "#5a8ab0", margin: 0 }}>Unknown ID: <code style={{ color: "#3b9ede" }}>{riverId}</code></p>
          <a href="/mobile" className="rc-btn" style={{ padding: "14px 32px", textDecoration: "none", marginTop: 8 }}>Back to Profile</a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {step !== "success" && step !== "auth" && <StepDots current={step} />}

      {/* ── STEP 0: Auth gate ── */}
      {step === "auth" && (
        <AuthStep
          riverName={river.name}
          onSuccess={(user) => {
            setDisplayName(user.username);
            setStep("reveal");
          }}
          onGuest={() => setStep("reveal")}
        />
      )}

      {/* ── STEP 1: Badge reveal ── */}
      {step === "reveal" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, padding: "0 20px 40px", textAlign: "center" }}>
          <div>
            <span className="rc-section-label" style={{ marginBottom: 6 }}>River discovered</span>
            <h1 style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 28, color: "#1a3a5c", margin: "8px 0 0" }}>{river.name}</h1>
          </div>

          <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center", padding: "24px 0" }}>
            {badgeRevealed && <Confetti />}
            <RiverBadge riverId={riverId} revealed={badgeRevealed} size={140} />
          </div>

          <p style={{ fontFamily: "var(--font-nunito)", fontSize: 14, color: "#5a8ab0", maxWidth: 260, lineHeight: 1.6, margin: 0, fontWeight: 600 }}>
            Take a photo to add <strong style={{ color: "#1a3a5c" }}>{river.name}</strong> to your collection.
          </p>

          <Btn onClick={() => setStep("capture")} color={river.color}>
            📷 Take a Photo
          </Btn>

          <a href="/mobile" style={{ fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: 700, color: "#9abdd8", textDecoration: "none" }}>
            View my profile
          </a>
        </div>
      )}

      {/* ── STEP 2: Camera ── */}
      {step === "capture" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "0 20px 40px" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 24, color: "#1a3a5c", margin: "0 0 6px" }}>Take a photo</h1>
            <p style={{ fontFamily: "var(--font-nunito)", fontSize: 14, color: "#5a8ab0", margin: 0, fontWeight: 600 }}>
              Point at the <strong style={{ color: "#1a3a5c" }}>{river.name}</strong>
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", width: "100%", maxWidth: 320, gap: 12 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, width: "100%", borderRadius: 20, border: `2px solid ${river.color}55`, background: `${river.color}0d`, padding: "22px 16px", cursor: "pointer", transition: "transform 0.15s ease" }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <span style={{ fontSize: 28 }}>📷</span>
              <span style={{ fontFamily: "var(--font-nunito)", fontWeight: 800, fontSize: 15, color: river.color }}>Take a photo</span>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, width: "100%", borderRadius: 20, border: "2px solid #bde0f5", background: "white", padding: "22px 16px", cursor: "pointer", transition: "transform 0.15s ease" }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <span style={{ fontSize: 28 }}>🖼️</span>
              <span style={{ fontFamily: "var(--font-nunito)", fontWeight: 800, fontSize: 15, color: "#5a8ab0" }}>Upload from gallery</span>
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhotoChange} />
          <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />

          <BackLink onClick={() => setStep("reveal")} />
        </div>
      )}

      {/* ── STEP 3: Share ── */}
      {step === "share" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "0 20px 40px" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 24, color: "#1a3a5c", margin: "0 0 6px" }}>Share your sighting</h1>
            <p style={{ fontFamily: "var(--font-nunito)", fontSize: 14, color: "#5a8ab0", margin: 0, fontWeight: 600 }}>Add your name to the community map</p>
          </div>

          {photoPreview && (
            <div style={{ position: "relative", width: "100%", maxWidth: 320, borderRadius: 20, overflow: "hidden", border: "1.5px solid #bde0f5", boxShadow: "0 4px 20px rgba(59,158,222,0.14)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="Preview" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
              <button
                type="button"
                onClick={() => setStep("capture")}
                style={{ position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.92)", fontFamily: "var(--font-nunito)", fontSize: 11, fontWeight: 800, color: "#1a3a5c", border: "none", borderRadius: 50, padding: "5px 12px", cursor: "pointer" }}
              >
                Retake
              </button>
              <div style={{ position: "absolute", bottom: 10, left: 10 }}>
                <RiverBadge riverId={riverId} revealed size={48} />
              </div>
            </div>
          )}

          <div style={{ width: "100%", maxWidth: 320 }}>
            <label htmlFor="display-name" style={{ fontFamily: "var(--font-nunito)", fontSize: 11, fontWeight: 800, color: "#5a8ab0", letterSpacing: "0.12em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Your name</label>
            <input
              id="display-name"
              className="rc-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Anna K."
              maxLength={80}
            />
          </div>

          {uploadError && (
            <div style={{ width: "100%", maxWidth: 320, background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 14, padding: "10px 14px" }}>
              <p style={{ fontFamily: "var(--font-nunito)", fontSize: 13, fontWeight: 700, color: "#dc2626", margin: 0, textAlign: "center" }}>{uploadError}</p>
            </div>
          )}

          <Btn onClick={handleUpload} color={river.color} disabled={!displayName.trim() || uploading}>
            {uploading ? "Uploading…" : "Share Sighting 🌊"}
          </Btn>

          <BackLink onClick={() => setStep("capture")} label="← Retake photo" />
        </div>
      )}

      {/* ── STEP 4: Success ── */}
      {step === "success" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, padding: "20px 20px 40px", textAlign: "center" }}>
          <div style={{ position: "relative", display: "flex", justifyContent: "center", padding: "24px 0" }}>
            <RiverBadge riverId={riverId} revealed size={130} />
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", animation: "rc-pulse-ring 2s ease-out 0s 3" }} />
          </div>

          <div>
            <h1 style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 28, color: "#1a3a5c", margin: "0 0 8px" }}>Nice catch! 🎉</h1>
            <p style={{ fontFamily: "var(--font-nunito)", fontSize: 14, color: "#5a8ab0", maxWidth: 260, lineHeight: 1.6, margin: "0 auto", fontWeight: 600 }}>
              <strong style={{ color: "#1a3a5c" }}>{river.name}</strong> added to the community feed.
            </p>
          </div>

          {photoPreview && (
            <div style={{ width: "100%", maxWidth: 320, borderRadius: 20, overflow: "hidden", border: "1.5px solid #bde0f5", boxShadow: "0 4px 20px rgba(59,158,222,0.14)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="Shared photo" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
            </div>
          )}

          <Btn onClick={() => { window.location.href = "/mobile"; }} color={river.color}>
            View Profile →
          </Btn>

          <a href={`/scan/${riverId}`} style={{ fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: 700, color: "#9abdd8", textDecoration: "none" }}>
            Share another sighting
          </a>
        </div>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rc-app rc-wave-bg" style={{ minHeight: "100svh", display: "flex", flexDirection: "column" }}>
      {/* Decorative blobs */}
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-10%", right: "-8%", width: 220, height: 220, borderRadius: "60% 40% 70% 30% / 50% 60% 40% 50%", background: "rgba(59,158,222,0.09)", animation: "rc-blob-drift 16s ease-in-out infinite, rc-float 8s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "12%", left: "-6%", width: 160, height: 160, borderRadius: "40% 60% 30% 70% / 60% 30% 70% 40%", background: "rgba(107,207,127,0.07)", animation: "rc-blob-drift 20s ease-in-out 4s infinite" }} />
      </div>

      <header style={{ position: "relative", zIndex: 10, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <a href="/mobile" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", textDecoration: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-black.png" alt="WaterShield River Collector" style={{ height: 44, width: "auto", display: "block" }} />
        </a>
      </header>

      <main style={{ flex: 1, position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16 }}>
        <div style={{ width: "100%", maxWidth: 420 }}>{children}</div>
      </main>
    </div>
  );
}

function Btn({
  children,
  onClick,
  color,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", maxWidth: 320,
        fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 15,
        color: "#fff", background: color,
        borderRadius: 50, border: "none", padding: "18px 24px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        boxShadow: `0 4px 20px ${color}55`,
        transition: "transform 0.15s cubic-bezier(0.34,1.4,0.64,1), opacity 0.2s",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.93)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onTouchStart={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.93)"; }}
      onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {children}
    </button>
  );
}

function BackLink({
  onClick,
  label = "← Back",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: 700, color: "#9abdd8", background: "none", border: "none", cursor: "pointer" }}
    >
      {label}
    </button>
  );
}
