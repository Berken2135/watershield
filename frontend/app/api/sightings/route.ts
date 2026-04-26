/**
 * GET /api/sightings[?river_id=odra]
 *
 * Dev  (no BLOB_READ_WRITE_TOKEN): proxies to the Python backend.
 * Prod (BLOB_READ_WRITE_TOKEN set): reads from Vercel Blob.
 */

import { list } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

const IS_VERCEL = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function GET(request: NextRequest) {
  const riverId = request.nextUrl.searchParams.get("river_id");

  if (!IS_VERCEL) {
    // ── Dev: proxy to Python backend ──────────────────────────────────────
    const qs = riverId ? `?river_id=${encodeURIComponent(riverId)}` : "";
    try {
      const res = await fetch(`${BACKEND_URL}/api/sightings${qs}`, {
        next: { revalidate: 0 },
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json([], { status: 200 });
    }
  }

  // ── Production: list from Vercel Blob ────────────────────────────────────
  const { blobs } = await list({ prefix: "sightings/photos/" });

  type Sighting = {
    id: string;
    riverId: string;
    displayName: string;
    photoFilename: string;
    timestamp: string;
    userId: string | null;
    username: string | null;
  };

  let sightings: Sighting[] = blobs.map((blob) => {
    const meta = (blob as { metadata?: Record<string, string> }).metadata ?? {};
    const id = blob.pathname
      .replace("sightings/photos/", "")
      .replace(/\.[^.]+$/, "");
    return {
      id,
      riverId: meta.riverId ?? "unknown",
      displayName: meta.displayName ?? "Anonymous",
      // Store the full Vercel Blob URL as photoFilename so getSightingPhotoUrl
      // can detect and return it directly (no prefix needed).
      photoFilename: blob.url,
      timestamp: meta.timestamp ?? blob.uploadedAt.toISOString(),
      userId: meta.userId || null,
      username: meta.username || null,
    };
  });

  if (riverId) {
    sightings = sightings.filter((s) => s.riverId === riverId);
  }

  sightings.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return NextResponse.json(sightings);
}
