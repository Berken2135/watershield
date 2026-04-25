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
