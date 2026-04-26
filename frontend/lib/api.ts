/**
 * Thin client wrapper around the WaterShield FastAPI backend.
 * The API URL is taken from NEXT_PUBLIC_API_URL or defaults to localhost:8000.
 */

import type { PollutionEvent } from "./pollution-data";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export type AnomalyVerdict = "normal" | "anomaly" | "critical";

export type AnomalyResult = {
  verdict: AnomalyVerdict;
  confidence: number;          // 0–100
  summary: string;
  risks: string[];
  recommendations: string[];
  pollutant_likely?: string;
};

export type ReportRequest = {
  event_id: string;
  river: string;
  location: string;
  severity: "High" | "Medium" | "Low";
  type: string;
  date: string;
  description: string;
  metrics: {
    ph: number;
    dissolved_oxygen: number;
    turbidity: number;
    contaminant: string;
  };
  ai_summary?: string;
  snapshot_date?: string;
  confidence?: number;
  is_predictive?: boolean;
};

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export async function detectAnomaly(event: PollutionEvent): Promise<AnomalyResult> {
  return postJSON<AnomalyResult>("/api/analysis/anomaly", {
    river: event.river,
    location: event.location,
    type: event.type,
    severity: event.severity,
    date: event.date,
    description: event.description,
    metrics: {
      ph: event.samplingData.ph,
      dissolved_oxygen: event.samplingData.dissolvedOxygen,
      turbidity: event.samplingData.turbidity,
      contaminant: event.samplingData.contaminant,
    },
  });
}

export async function generateReportPdf(req: ReportRequest): Promise<Blob> {
  const res = await fetch(`${API_URL}/api/reports/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.blob();
}

export function eventToReportRequest(
  event: PollutionEvent,
  aiSummary?: string,
  opts?: { snapshotDate?: string; confidence?: number; isPredictive?: boolean },
): ReportRequest {
  return {
    event_id: event.id,
    river: event.river,
    location: event.location,
    severity: event.severity,
    type: event.type,
    date: event.date,
    description: event.description,
    metrics: {
      ph: event.samplingData.ph,
      dissolved_oxygen: event.samplingData.dissolvedOxygen,
      turbidity: event.samplingData.turbidity,
      contaminant: event.samplingData.contaminant,
    },
    ai_summary: aiSummary,
    snapshot_date: opts?.snapshotDate,
    confidence: opts?.confidence,
    is_predictive: opts?.isPredictive,
  };
}

// ---------------------------------------------------------------------------
// Sightings API
// ---------------------------------------------------------------------------

export type Sighting = {
  id: string;
  riverId: string;
  displayName: string;
  photoFilename: string;
  timestamp: string; // ISO-8601
  userId?: string | null;
  username?: string | null;
};

export async function getSightings(riverId?: string): Promise<Sighting[]> {
  const qs = riverId ? `?river_id=${encodeURIComponent(riverId)}` : "";
  // Use the Next.js API route (relative URL) which works in both dev (proxies
  // to the Python backend) and production on Vercel (uses Vercel Blob).
  const base = typeof window === "undefined"
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}`
    : "";
  const res = await fetch(`${base}/api/sightings${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function uploadSighting(
  riverId: string,
  photo: File,
  displayName: string,
  token?: string | null,
): Promise<Sighting> {
  const form = new FormData();
  form.append("photo", photo);
  form.append("display_name", displayName);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Use the Next.js API route (relative URL) — dev proxies to Python,
  // production uses Vercel Blob.
  const base = typeof window === "undefined"
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}`
    : "";
  const res = await fetch(
    `${base}/api/sightings/${encodeURIComponent(riverId)}`,
    { method: "POST", body: form, headers },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/**
 * Returns the full URL to a sighting photo.
 * In dev (Python backend) photoFilename is a bare filename.
 * In production (Vercel Blob) photoFilename is already the full CDN URL.
 */
export function getSightingPhotoUrl(photoFilename: string): string {
  if (photoFilename.startsWith("http://") || photoFilename.startsWith("https://")) {
    return photoFilename;
  }
  return `${API_URL}/static/sightings/${photoFilename}`;
}

// ---------------------------------------------------------------------------
// Mobile auth
// ---------------------------------------------------------------------------

export type MobileUser = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  friendIds: string[];
};

export type MobileProfile = {
  username: string;
  badges: string[];
  sightingCount: number;
};

export type MobileMeResponse = {
  user: MobileUser;
  badges: string[];
  sightingCount: number;
};

// -- localStorage helpers (safe for SSR) ------------------------------------

export function getMobileToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ws_mobile_token");
}

export function getMobileUser(): MobileUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("ws_mobile_user");
  if (!raw) return null;
  try { return JSON.parse(raw) as MobileUser; }
  catch { return null; }
}

export function setMobileSession(token: string, user: MobileUser): void {
  localStorage.setItem("ws_mobile_token", token);
  localStorage.setItem("ws_mobile_user", JSON.stringify(user));
}

export function clearMobileSession(): void {
  localStorage.removeItem("ws_mobile_token");
  localStorage.removeItem("ws_mobile_user");
}

// -- Request helpers --------------------------------------------------------

async function mobilePost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : Array.isArray(data?.detail)
          ? (data.detail as { msg: string }[]).map((e) => e.msg).join("; ")
          : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return res.json();
}

// -- Auth endpoints ---------------------------------------------------------

export async function registerMobile(
  username: string,
  email: string,
  password: string,
): Promise<{ token: string; user: MobileUser }> {
  return mobilePost("/api/mobile/register", { username, email, password });
}

export async function loginMobile(
  username: string,
  password: string,
): Promise<{ token: string; user: MobileUser }> {
  return mobilePost("/api/mobile/login", { username, password });
}

export async function getMobileMe(token: string): Promise<MobileMeResponse> {
  const res = await fetch(`${API_URL}/api/mobile/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function getMobileProfile(username: string): Promise<MobileProfile> {
  const res = await fetch(
    `${API_URL}/api/mobile/profile/${encodeURIComponent(username)}`,
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function addFriend(username: string, token: string): Promise<void> {
  await mobilePost(`/api/mobile/friends/${encodeURIComponent(username)}`, {}, token);
}

export async function removeFriend(username: string, token: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/mobile/friends/${encodeURIComponent(username)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
}

export async function getFriends(token: string): Promise<MobileProfile[]> {
  const res = await fetch(`${API_URL}/api/mobile/friends`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
