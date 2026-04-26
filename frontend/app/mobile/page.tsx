"use client";

import RiverBadge, { RIVER_BADGES, RiverIcon } from "@/components/river-badge";
import {
  clearMobileSession,
  getMobileMe,
  getMobileToken,
  getMobileUser,
  getSightingPhotoUrl,
  getSightings,
  loginMobile,
  registerMobile,
  setMobileSession,
  type MobileMeResponse,
  type MobileUser,
  type Sighting,
} from "@/lib/api";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const RIVER_IDS = ["odra", "danube", "rhine", "glomma", "vardar"] as const;
const RARITY_LABEL = { legendary: "Legendary", rare: "Rare", common: "Common" } as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MobilePage() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MobileMeResponse | null>(null);
  const [userSightings, setUserSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);

  const applyData = (meData: MobileMeResponse, sightingsData: Sighting[]) => {
    setMe(meData);
    // Match by userId when available; fall back to username in case the
    // backend URL was unreachable during upload and userId was stored as null.
    setUserSightings(
      sightingsData.filter(
        (s) =>
          s.userId === meData.user.id ||
          (s.username != null && s.username === meData.user.username) ||
          s.displayName === meData.user.username,
      ),
    );
  };

  useEffect(() => {
    const t = getMobileToken();
    setToken(t);
    if (!t) {
      setLoading(false);
      return;
    }

    // Run both requests independently so a backend outage never logs the user out.
    // getMobileMe hitting the Python backend can fail on mobile networks — in that
    // case we fall back to the locally-stored user object and still show the profile.
    const localUser = getMobileUser();

    Promise.allSettled([getMobileMe(t), getSightings()]).then(([meResult, sightingsResult]) => {
      const sightingsData = sightingsResult.status === "fulfilled" ? sightingsResult.value : [];

      if (meResult.status === "fulfilled") {
        applyData(meResult.value, sightingsData);
      } else if (localUser) {
        // Backend unreachable but we have a cached user — build a minimal MobileMeResponse
        // so the profile renders. Counts come from blob sightings anyway.
        const fallbackMe: MobileMeResponse = { user: localUser, badges: [], sightingCount: 0 };
        applyData(fallbackMe, sightingsData);
      } else {
        // No local data at all — token is invalid, clear and show login.
        clearMobileSession();
        setToken(null);
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    clearMobileSession();
    setToken(null);
    setMe(null);
    setUserSightings([]);
  };

  const handleAuthSuccess = async (user: MobileUser, newToken: string) => {
    setToken(newToken);
    setLoading(true);
    try {
      const [meData, sightingsData] = await Promise.all([
        getMobileMe(newToken),
        getSightings(),
      ]);
      applyData(meData, sightingsData);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Shell onLogout={null}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", gap: 16 }}>
          <span className="rc-float" style={{ fontSize: 48 }}>🌊</span>
          <p style={{ fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 14, color: "#5a8ab0" }}>Loading...</p>
        </div>
      </Shell>
    );
  }

  // Not logged in — show inline auth form
  if (!token || !me) {
    return (
      <Shell onLogout={null}>
        <InlineAuth onSuccess={handleAuthSuccess} />
      </Shell>
    );
  }

  const { user } = me;
  // Derive counts from blob sightings so uploads are reflected immediately
  // without needing the Python backend to track them.
  const collectedRivers = [...new Set(userSightings.map((s) => s.riverId))] as string[];
  const badges = collectedRivers.length > 0 ? collectedRivers : me.badges;
  const sightingCount = userSightings.length > 0 ? userSightings.length : me.sightingCount;
  const recentSightings = userSightings.slice(0, 3);
  const avatarColor = badges.length > 0 ? (RIVER_BADGES[badges[0]]?.color ?? "#3b9ede") : "#3b9ede";

  return (
    <Shell onLogout={handleLogout}>
      <div style={{ padding: "4px 20px 40px" }}>

        {/* ── Hero ── */}
        <div className="rc-slide-up-1" style={{ textAlign: "center", paddingTop: 20, paddingBottom: 28 }}>
          <div style={{ display: "inline-block", position: "relative", marginBottom: 16 }}>
            <div
              className="rc-float"
              style={{
                width: 84, height: 84, borderRadius: "50%",
                background: `linear-gradient(135deg, ${avatarColor}cc, ${avatarColor})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 30, color: "#fff",
                boxShadow: `0 8px 28px ${avatarColor}50`,
              }}
            >
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ position: "absolute", inset: -7, borderRadius: "50%", border: `2.5px solid ${avatarColor}45`, animation: "rc-pulse-ring 2.8s ease-out 0.6s infinite" }} />
          </div>
          <h1 style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 28, color: "#1a3a5c", margin: "0 0 6px" }}>
            {user.username}
          </h1>
          <p style={{ fontFamily: "var(--font-nunito)", fontSize: 13, color: "#5a8ab0", margin: 0, fontWeight: 600 }}>
            {sightingCount} sighting{sightingCount !== 1 ? "s" : ""} &middot; {badges.length}/5 rivers
          </p>
        </div>

        {/* ── Collection progress ── */}
        <div className="rc-card rc-slide-up-2" style={{ padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontFamily: "var(--font-nunito)", fontWeight: 800, fontSize: 13, color: "#1a3a5c" }}>🗺️ Collection Progress</span>
            <span style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 13, color: "#3b9ede" }}>
              {badges.length} <span style={{ color: "#9abdd8" }}>/ 5</span>
            </span>
          </div>
          <div className="rc-progress-track">
            <div className="rc-progress-fill" style={{ width: `${(badges.length / 5) * 100}%` }} />
          </div>
          {badges.length === 5 && (
            <p style={{ fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: 900, color: "#6bcf7f", textAlign: "center", marginTop: 10, letterSpacing: "0.06em" }}>
              🏆 MASTER COLLECTOR!
            </p>
          )}
        </div>

        {/* ── Badge grid ── */}
        <span className="rc-section-label" style={{ marginBottom: 12 }}>Your Rivers</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12, marginBottom: 28 }}>
          {RIVER_IDS.map((id, i) => {
            const collected = badges.includes(id);
            const info = RIVER_BADGES[id];
            const rarity = info.rarity;
            return (
              <div
                key={id}
                className={`rc-card rc-slide-up-${Math.min(i + 3, 7)}`}
                style={{
                  padding: "20px 14px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                  background: collected ? `linear-gradient(145deg, ${info.color}14 0%, white 55%)` : "#f8fcff",
                  borderColor: collected ? `${info.color}50` : "var(--rc-card-border)",
                  transition: "transform 0.2s ease",
                }}
              >
                <div style={{ position: "relative", padding: 8 }}>
                  {collected && (
                    <div style={{ position: "absolute", inset: -10, background: `radial-gradient(circle at center, ${info.color}28 0%, transparent 70%)`, borderRadius: "50%" }} />
                  )}
                  {collected ? (
                    <RiverBadge riverId={id} revealed size={76} />
                  ) : (
                    <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#eaf4fc", border: "2px dashed #bde0f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <RiverIcon riverId={id} size={38} muted />
                    </div>
                  )}
                </div>
                <p style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 15, color: collected ? "#1a3a5c" : "#8ab5d4", margin: 0, textAlign: "center" }}>
                  {info.name}
                </p>
                <p style={{ fontFamily: "var(--font-nunito)", fontSize: 10, fontWeight: 600, color: "#9abdd8", margin: 0, textAlign: "center", lineHeight: 1.3 }}>
                  {info.country}
                </p>
                <span className={`rc-rarity rc-rarity-${rarity}`} style={{ opacity: collected ? 1 : 0.5 }}>
                  {RARITY_LABEL[rarity]}
                </span>
                {collected ? (
                  <span style={{ fontFamily: "var(--font-nunito)", fontSize: 10, fontWeight: 900, color: "#6bcf7f", letterSpacing: "0.1em" }}>✓ COLLECTED</span>
                ) : (
                  <a
                    href={`/scan/${id}`}
                    style={{ fontFamily: "var(--font-nunito)", fontWeight: 800, fontSize: 11, color: "#3b9ede", background: "rgba(59,158,222,0.1)", borderRadius: 50, padding: "5px 14px", textDecoration: "none" }}
                  >
                    Scan to collect →
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Friends strip ── */}
        <div className="rc-card rc-slide-up-7" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 30 }}>👥</span>
            <div>
              <p style={{ fontFamily: "var(--font-nunito)", fontWeight: 800, fontSize: 14, color: "#1a3a5c", margin: 0 }}>Friends</p>
              <p style={{ fontFamily: "var(--font-nunito)", fontSize: 12, color: "#5a8ab0", margin: 0, fontWeight: 600 }}>{user.friendIds?.length ?? 0} connected</p>
            </div>
          </div>
          <a href="/mobile/friends" style={{ fontFamily: "var(--font-nunito)", fontWeight: 800, fontSize: 12, color: "white", background: "#3b9ede", borderRadius: 50, padding: "8px 18px", textDecoration: "none", boxShadow: "0 2px 12px rgba(59,158,222,0.3)" }}>
            Manage →
          </a>
        </div>

        {/* ── Recent sightings ── */}
        {recentSightings.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <span className="rc-section-label" style={{ marginBottom: 12 }}>Recent Photos</span>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, marginTop: 12 }}>
              {recentSightings.map((s) => (
                <div key={s.id} style={{ flexShrink: 0, width: 96, height: 96, borderRadius: 16, overflow: "hidden", border: "1.5px solid #bde0f5", boxShadow: "0 2px 10px rgba(59,158,222,0.12)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getSightingPhotoUrl(s.photoFilename)} alt={s.riverId} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Scan CTA ── */}
        <a href="/scan/odra" className="rc-btn" style={{ width: "100%", padding: "18px 24px", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, textDecoration: "none" }}>
          <span style={{ fontSize: 22 }}>📷</span> Scan a River
        </a>

      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Inline auth form (shown when not logged in)
// ---------------------------------------------------------------------------

function InlineAuth({
  onSuccess,
}: {
  onSuccess: (user: MobileUser, token: string) => void;
}) {
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
      onSuccess(result.user, result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "28px 20px 48px" }}>
      {/* Logo hero */}
      <div className="rc-slide-up-1" style={{ textAlign: "center", marginBottom: 32 }}>
        <div className="rc-float" style={{ fontSize: 56, lineHeight: 1, marginBottom: 14 }}>🌊</div>
        <h1 style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 30, color: "#1a3a5c", margin: "0 0 8px" }}>
          River Collector
        </h1>
        <p style={{ fontFamily: "var(--font-nunito)", fontSize: 14, color: "#5a8ab0", margin: 0, fontWeight: 600 }}>
          Log in to collect badges &amp; compare with friends
        </p>
      </div>

      {/* Tab switcher */}
      <div className="rc-slide-up-2" style={{ display: "flex", background: "rgba(59,158,222,0.1)", borderRadius: 14, padding: 4, marginBottom: 20 }}>
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

      <form onSubmit={handleSubmit} className="rc-slide-up-3" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

      <p style={{ fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: 600, color: "#9abdd8", textAlign: "center", marginTop: 24 }}>
        Scan a river QR code to start collecting badges
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { href: "/mobile", label: "Profile", icon: "👤" },
  { href: "/mobile/friends", label: "Friends", icon: "👥" },
  { href: "/scan/odra", label: "Scan", icon: "📷" },
] as const;

function Shell({
  children,
  onLogout,
}: {
  children: React.ReactNode;
  onLogout: (() => void) | null;
}) {
  const pathname = usePathname();
  return (
    <div className="rc-app rc-wave-bg" style={{ minHeight: "100svh", display: "flex", flexDirection: "column" }}>
      {/* Decorative floating blobs */}
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-8%", right: "-6%", width: 260, height: 260, borderRadius: "60% 40% 70% 30% / 50% 60% 40% 50%", background: "rgba(59,158,222,0.09)", animation: "rc-blob-drift 14s ease-in-out infinite, rc-float 7s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "9%", left: "-5%", width: 180, height: 180, borderRadius: "40% 60% 30% 70% / 60% 30% 70% 40%", background: "rgba(107,207,127,0.08)", animation: "rc-blob-drift 18s ease-in-out 3s infinite, rc-float 9s ease-in-out 1.5s infinite" }} />
        <div style={{ position: "absolute", top: "42%", right: "-7%", width: 120, height: 120, borderRadius: "50%", background: "rgba(245,200,66,0.06)", animation: "rc-float 11s ease-in-out 2s infinite" }} />
      </div>

      {/* Header */}
      <header style={{ position: "relative", zIndex: 10, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-black.png" alt="WaterShield River Collector" style={{ height: 44, width: "auto", display: "block" }} />
        </div>
        {onLogout && (
          <button type="button" onClick={onLogout} style={{ marginLeft: "auto", fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: 700, color: "#5a8ab0", background: "rgba(59,158,222,0.1)", border: "none", borderRadius: 50, padding: "6px 16px", cursor: "pointer" }}>
            Log out
          </button>
        )}
      </header>

      {/* Main */}
      <main style={{ flex: 1, position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: onLogout ? "calc(110px + env(safe-area-inset-bottom, 0px))" : "40px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>{children}</div>
      </main>

      {/* Bottom pill nav — hidden on the auth screen */}
      {onLogout && (
      <nav style={{ position: "fixed", bottom: "max(20px, calc(env(safe-area-inset-bottom, 0px) + 8px))", left: "50%", transform: "translateX(-50%)", background: "white", borderRadius: 50, display: "flex", gap: 4, padding: "6px 8px", boxShadow: "0 4px 28px rgba(59,158,222,0.22), 0 1px 4px rgba(0,0,0,0.07)", border: "1.5px solid #bde0f5", zIndex: 50, whiteSpace: "nowrap" }}>
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = pathname === href || (href.startsWith("/scan") && pathname.startsWith("/scan"));
          return (
            <a key={href} href={href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 22px", borderRadius: 44, background: active ? "#3b9ede" : "transparent", textDecoration: "none", transition: "background 0.2s ease" }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
              <span style={{ fontFamily: "var(--font-nunito)", fontSize: 10, fontWeight: 800, color: active ? "#fff" : "#5a8ab0", letterSpacing: "0.02em" }}>{label}</span>
            </a>
          );
        })}
      </nav>
      )}
    </div>
  );
}
