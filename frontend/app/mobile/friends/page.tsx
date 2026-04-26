"use client";

import RiverBadge, { RIVER_BADGES, RiverIcon } from "@/components/river-badge";
import {
  addFriend,
  clearMobileSession,
  getFriends,
  getMobileMe,
  getMobileToken,
  removeFriend,
  type MobileMeResponse,
  type MobileProfile,
} from "@/lib/api";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const RIVER_IDS = ["odra", "danube", "rhine", "glomma", "vardar"] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FriendsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MobileMeResponse | null>(null);
  const [friends, setFriends] = useState<MobileProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFriend, setExpandedFriend] = useState<string | null>(null);

  // Add friend form state
  const [addUsername, setAddUsername] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  useEffect(() => {
    const t = getMobileToken();
    if (!t) {
      window.location.href = "/scan/odra";
      return;
    }
    setToken(t);
    Promise.all([getMobileMe(t), getFriends(t)])
      .then(([meData, friendsData]) => {
        setMe(meData);
        setFriends(friendsData);
      })
      .catch(() => {
        clearMobileSession();
        window.location.href = "/scan/odra";
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !addUsername.trim()) return;
    setAddLoading(true);
    setAddError(null);
    setAddSuccess(null);
    try {
      await addFriend(addUsername.trim(), token);
      const [updated, meData] = await Promise.all([
        getFriends(token),
        getMobileMe(token),
      ]);
      setFriends(updated);
      setMe(meData);
      setAddSuccess(`${addUsername.trim()} added!`);
      setAddUsername("");
    } catch (err) {
      setAddError(
        err instanceof Error
          ? err.message.replace(/^API \d+: /, "")
          : "Failed to add friend",
      );
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveFriend = async (username: string) => {
    if (!token) return;
    try {
      await removeFriend(username, token);
      setFriends((prev) => prev.filter((f) => f.username !== username));
      if (expandedFriend === username) setExpandedFriend(null);
    } catch {
      // ignore UI errors for remove
    }
  };

  if (loading) {
    return (
      <Shell>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", gap: 16 }}>
          <span className="rc-float" style={{ fontSize: 48 }}>🌊</span>
          <p style={{ fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 14, color: "#5a8ab0" }}>Loading...</p>
        </div>
      </Shell>
    );
  }

  const myBadges = me?.badges ?? [];

  return (
    <Shell>
      <div style={{ padding: "4px 20px 40px" }}>

        {/* Back */}
        <a href="/mobile" style={{ fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 12, color: "#9abdd8", textDecoration: "none", display: "inline-block", marginBottom: 20 }}>
          ← Back to Profile
        </a>

        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 26, color: "#1a3a5c", margin: "0 0 4px" }}>Friends</h1>
          <p style={{ fontFamily: "var(--font-nunito)", fontSize: 13, color: "#5a8ab0", margin: 0, fontWeight: 600 }}>Compare river achievements</p>
        </div>

        {/* Add friend */}
        <form onSubmit={handleAddFriend} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <input
            className="rc-input"
            type="text"
            value={addUsername}
            onChange={(e) => setAddUsername(e.target.value)}
            placeholder="Enter username"
            autoCapitalize="none"
            autoCorrect="off"
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            disabled={addLoading || !addUsername.trim()}
            className="rc-btn"
            style={{ flexShrink: 0, padding: "0 22px", fontSize: 14 }}
          >
            Add
          </button>
        </form>

        {addError && (
          <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 14, padding: "10px 14px", marginBottom: 12 }}>
            <p style={{ fontFamily: "var(--font-nunito)", fontSize: 13, fontWeight: 700, color: "#dc2626", margin: 0 }}>{addError}</p>
          </div>
        )}
        {addSuccess && (
          <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 14, padding: "10px 14px", marginBottom: 12 }}>
            <p style={{ fontFamily: "var(--font-nunito)", fontSize: 13, fontWeight: 700, color: "#16a34a", margin: 0 }}>✓ {addSuccess}</p>
          </div>
        )}

        {/* Friends list */}
        {friends.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <span style={{ fontSize: 48, display: "block", marginBottom: 12 }}>👥</span>
            <p style={{ fontFamily: "var(--font-nunito)", fontWeight: 800, fontSize: 16, color: "#1a3a5c", margin: "0 0 6px" }}>No friends yet</p>
            <p style={{ fontFamily: "var(--font-nunito)", fontSize: 13, color: "#5a8ab0", margin: 0, fontWeight: 600 }}>Add friends by their username above</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {friends.map((friend) => {
              const friendAvatarColor = friend.badges.length > 0 ? (RIVER_BADGES[friend.badges[0]]?.color ?? "#3b9ede") : "#3b9ede";
              return (
                <div key={friend.username}>
                  {/* Friend row */}
                  <button
                    type="button"
                    onClick={() => setExpandedFriend(expandedFriend === friend.username ? null : friend.username)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 18, border: "1.5px solid", borderColor: expandedFriend === friend.username ? "#bde0f5" : "#e8f4fd", background: "white", cursor: "pointer", textAlign: "left", transition: "border-color 0.2s ease" }}
                  >
                    {/* Avatar */}
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg, ${friendAvatarColor}cc, ${friendAvatarColor})`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 16, color: "#fff", flexShrink: 0, boxShadow: `0 3px 10px ${friendAvatarColor}40` }}>
                      {friend.username.slice(0, 2).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: "var(--font-nunito)", fontWeight: 800, fontSize: 15, color: "#1a3a5c", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{friend.username}</p>
                      <p style={{ fontFamily: "var(--font-nunito)", fontSize: 12, color: "#5a8ab0", margin: 0, fontWeight: 600 }}>
                        {friend.badges.length}/5 rivers · {friend.sightingCount} sighting{friend.sightingCount !== 1 ? "s" : ""}
                      </p>
                    </div>

                    {/* Badge pips */}
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {RIVER_IDS.map((id) => (
                        <div key={id} style={{ width: 12, height: 12, borderRadius: "50%", background: friend.badges.includes(id) ? RIVER_BADGES[id].color : "#dbeafe" }} />
                      ))}
                    </div>

                    <span style={{ color: "#9abdd8", fontSize: 10, fontFamily: "var(--font-nunito)", fontWeight: 800, marginLeft: 4 }}>{expandedFriend === friend.username ? "▲" : "▼"}</span>
                  </button>

                  {/* Side-by-side comparison panel */}
                  {expandedFriend === friend.username && (
                    <div className="rc-card" style={{ marginTop: 6, borderRadius: 18, overflow: "hidden", padding: 0, border: "1.5px solid #bde0f5" }}>
                      {/* Header */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", textAlign: "center", padding: "12px 20px", borderBottom: "1px solid #e8f4fd" }}>
                        <span style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 13, color: "#3b9ede" }}>You</span>
                        <span style={{ fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 12, color: "#9abdd8" }}>River</span>
                        <span style={{ fontFamily: "var(--font-nunito)", fontWeight: 900, fontSize: 13, color: "#1a3a5c" }}>{friend.username}</span>
                      </div>

                      {RIVER_IDS.map((id) => {
                        const info = RIVER_BADGES[id];
                        const iHave = myBadges.includes(id);
                        const theyHave = friend.badges.includes(id);
                        return (
                          <div key={id} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", textAlign: "center", padding: "10px 20px", borderBottom: "1px solid #f0f9ff" }}>
                            <div style={{ display: "flex", justifyContent: "center" }}>
                              {iHave ? (
                                <RiverBadge riverId={id} revealed size={40} />
                              ) : (
                                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#eaf4fc", border: "2px dashed #bde0f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <RiverIcon riverId={id} size={22} muted />
                                </div>
                              )}
                            </div>
                            <span style={{ fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 11, color: "#5a8ab0", padding: "0 12px" }}>{info.name}</span>
                            <div style={{ display: "flex", justifyContent: "center" }}>
                              {theyHave ? (
                                <RiverBadge riverId={id} revealed size={40} />
                              ) : (
                                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#eaf4fc", border: "2px dashed #bde0f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <RiverIcon riverId={id} size={22} muted />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      <div style={{ display: "flex", justifyContent: "center", padding: "12px", borderTop: "1px solid #f0f9ff" }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveFriend(friend.username)}
                          style={{ fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 12, color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "none", borderRadius: 50, padding: "6px 18px", cursor: "pointer" }}
                        >
                          Remove friend
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Shell (with shared bottom nav)
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { href: "/mobile", label: "Profile", icon: "👤" },
  { href: "/mobile/friends", label: "Friends", icon: "👥" },
  { href: "/scan/odra", label: "Scan", icon: "📷" },
] as const;

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="rc-app rc-wave-bg" style={{ minHeight: "100svh", display: "flex", flexDirection: "column" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-8%", right: "-6%", width: 240, height: 240, borderRadius: "60% 40% 70% 30% / 50% 60% 40% 50%", background: "rgba(59,158,222,0.08)", animation: "rc-blob-drift 15s ease-in-out infinite, rc-float 8s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "10%", left: "-5%", width: 160, height: 160, borderRadius: "40% 60% 30% 70% / 60% 30% 70% 40%", background: "rgba(107,207,127,0.07)", animation: "rc-blob-drift 19s ease-in-out 4s infinite" }} />
      </div>

      <header style={{ position: "relative", zIndex: 10, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-black.png" alt="WaterShield River Collector" style={{ height: 44, width: "auto", display: "block" }} />
        </div>
      </header>

      <main style={{ flex: 1, position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: "calc(110px + env(safe-area-inset-bottom, 0px))" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>{children}</div>
      </main>

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
    </div>
  );
}
