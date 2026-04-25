"use client";

import { useState } from "react";
import { Loader2, Sparkles, ShieldAlert, FileDown } from "lucide-react";
import { detectAnomaly, generateReportPdf, eventToReportRequest, type AnomalyResult } from "@/lib/api";
import type { PollutionEvent } from "@/lib/pollution-data";

export default function AlertActions({ event }: { event: PollutionEvent }) {
  const [anomaly, setAnomaly] = useState<AnomalyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const runAi = async () => {
    setLoading(true);
    setError(null);
    try {
      setAnomaly(await detectAnomaly(event));
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    setReportLoading(true);
    try {
      const blob = await generateReportPdf(
        eventToReportRequest(event, anomaly?.summary),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `WaterShield-${event.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setReportLoading(false);
    }
  };

  const verdictColor =
    anomaly?.verdict === "critical"
      ? "text-red-500"
      : anomaly?.verdict === "anomaly"
        ? "text-amber-500"
        : "text-emerald-500";

  return (
    <section className="rounded-xl border p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">AI Action Plan</h2>
      </div>

      {!anomaly && !loading && (
        <button
          onClick={runAi}
          className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-sm font-medium transition-colors w-fit"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Analyze with AI
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Querying neural model…
        </div>
      )}

      {error && (
        <div className="text-sm text-red-500">{error}</div>
      )}

      {anomaly && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className={`h-5 w-5 ${verdictColor}`} />
            <span className={`text-sm font-semibold uppercase tracking-wider ${verdictColor}`}>
              {anomaly.verdict}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {anomaly.confidence}% confidence
            </span>
          </div>

          <p className="text-sm leading-relaxed text-foreground/85">
            {anomaly.summary}
          </p>

          {anomaly.risks.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Risks
              </div>
              <ul className="text-sm space-y-1.5 list-disc list-inside text-foreground/80">
                {anomaly.risks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {anomaly.recommendations.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Recommendations
              </div>
              <ul className="text-sm space-y-1.5 list-disc list-inside text-foreground/80">
                {anomaly.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          <button
            onClick={downloadPdf}
            disabled={reportLoading}
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-foreground/[0.05] hover:bg-foreground/[0.08] border border-border text-foreground text-sm font-medium transition-colors w-fit disabled:opacity-50"
          >
            {reportLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            Download PDF report
          </button>
        </div>
      )}
    </section>
  );
}
