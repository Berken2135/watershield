/**
 * GET  /api/sightings/[riverId] — sightings for one river
 * POST /api/sightings/[riverId] — upload a new sighting photo
 *
 * Dev  (no BLOB_READ_WRITE_TOKEN): proxies to the Python backend.
 * Prod (BLOB_READ_WRITE_TOKEN set): stores photo + metadata in Vercel Blob.
 */

import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

const IS_VERCEL = !!process.env.BLOB_READ_WRITE_TOKEN;

const VALID_RIVER_IDS = new Set(["odra", "danube", "rhine", "glomma", "vardar"]);
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ riverId: string }> },
) {
  const { riverId } = await params;

  if (!IS_VERCEL) {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/sightings/${encodeURIComponent(riverId)}`,
        { next: { revalidate: 0 } },
      );
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json([], { status: 200 });
    }
  }

  // Delegate to the base route with ?river_id= filter
  const url = new URL(request.url);
  url.pathname = "/api/sightings";
  url.searchParams.set("river_id", riverId);
  return fetch(url.toString());
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ riverId: string }> },
) {
  const { riverId } = await params;

  if (!VALID_RIVER_IDS.has(riverId)) {
    return NextResponse.json({ error: `Unknown river '${riverId}'` }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");

  if (!IS_VERCEL) {
    // ── Dev: proxy multipart to Python backend ─────────────────────────────
    const formData = await request.formData();
    const headers: Record<string, string> = {};
    if (authHeader) headers["Authorization"] = authHeader;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/sightings/${encodeURIComponent(riverId)}`,
        { method: "POST", body: formData, headers },
      );
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Upstream error" },
        { status: 502 },
      );
    }
  }

  // ── Production: upload to Vercel Blob ─────────────────────────────────────
  const formData = await request.formData();
  const photo = formData.get("photo") as File | null;
  const displayName = (formData.get("display_name") as string | null)?.trim();

  if (!photo) {
    return NextResponse.json({ error: "photo is required" }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ error: "display_name is required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(photo.type)) {
    return NextResponse.json(
      { error: "Photo must be JPEG, PNG, WebP, or GIF" },
      { status: 415 },
    );
  }
  if (photo.size > MAX_SIZE) {
    return NextResponse.json({ error: "File exceeds 5 MB limit" }, { status: 413 });
  }

  // Resolve the user from the JWT by asking the Python backend (auth source
  // of truth). Failure is non-fatal — we fall back to the submitted displayName.
  let userId: string | null = null;
  let username: string | null = null;
  if (authHeader) {
    try {
      const meRes = await fetch(`${BACKEND_URL}/api/mobile/me`, {
        headers: { Authorization: authHeader },
      });
      if (meRes.ok) {
        const me = await meRes.json() as { user?: { id?: string; username?: string } };
        userId = me.user?.id ?? null;
        username = me.user?.username ?? null;
      }
    } catch {
      // non-fatal — fall back below
    }
  }

  const id = crypto.randomUUID();
  const ext = photo.type === "image/jpeg" ? "jpg" : photo.type.split("/")[1];
  const timestamp = new Date().toISOString();
  const safeDisplayName = displayName.slice(0, 80);

  // If backend was unreachable, the display_name submitted by the client IS
  // the username (the scan page always sends user.username as display_name).
  if (!username) username = safeDisplayName;

  // Upload the photo to Vercel Blob
  const photoBlob = await put(`sightings/photos/${id}.${ext}`, photo, {
    access: "public",
    addRandomSuffix: false,
    contentType: photo.type,
  });

  // Store sighting metadata as a JSON sidecar blob so GET /api/sightings can
  // reconstruct the full record from list() + fetch() without needing a database.
  const sightingRecord = {
    id,
    riverId,
    displayName: safeDisplayName,
    photoFilename: photoBlob.url,
    timestamp,
    userId,
    username,
  };

  await put(`sightings/meta/${id}.json`, JSON.stringify(sightingRecord), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });

  return NextResponse.json(sightingRecord, { status: 201 });
}
