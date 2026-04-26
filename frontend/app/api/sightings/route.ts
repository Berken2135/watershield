/**
 * GET /api/sightings[?river_id=odra]
 *
 * Dev  (no BLOB_READ_WRITE_TOKEN): proxies to the Python backend.
 * Prod (BLOB_READ_WRITE_TOKEN set): reads from Vercel Blob.
 */

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
  // Each sighting is stored as a JSON sidecar at sightings/meta/{id}.json
  // alongside its photo at sightings/photos/{id}.{ext}.
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: "sightings/meta/" });

  type Sighting = {
    id: string;
    riverId: string;
    displayName: string;
    photoFilename: string;
    timestamp: string;
    userId: string | null;
    username: string | null;
  };

  const sightings: Sighting[] = (
    await Promise.all(
      blobs.map(async (blob) => {
        try {
          const res = await fetch(blob.url, { next: { revalidate: 30 } });
          if (!res.ok) return null;
          return (await res.json()) as Sighting;
        } catch {
          return null;
        }
      }),
    )
  ).filter((s): s is Sighting => s !== null);

  const filtered = riverId
    ? sightings.filter((s) => s.riverId === riverId)
    : sightings;

  filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return NextResponse.json(filtered);
}
