"use client";

import Sidebar from "@/components/sidebar";
import { POLLUTION_EVENTS } from "@/lib/pollution-data";
import { eventToReportRequest, generateReportPdf } from "@/lib/api";
import { Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";

export default function ReportsPage() {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const download = async (id: string) => {
    const ev = POLLUTION_EVENTS.find((e) => e.id === id);
    if (!ev) return;
    setPendingId(id);
    try {
      const blob = await generateReportPdf(eventToReportRequest(ev));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `WaterShield-Report-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">
              Reports
            </h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {POLLUTION_EVENTS.map((event) => (
              <article
                key={event.id}
                className="glass rounded-xl p-4 flex items-start gap-3"
              >
                <div className="grid place-items-center h-9 w-9 rounded-md bg-cyan-400/10 ring-1 ring-cyan-400/30 shrink-0">
                  <FileText className="h-4 w-4 text-[var(--color-cyan)]" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium tracking-tight">
                    {event.river} · {event.location}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {event.type} · {event.severity} · {event.date}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => download(event.id)}
                  disabled={pendingId === event.id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-foreground/95 hover:bg-foreground text-background h-8 px-3 text-[11px] font-medium tracking-wider uppercase disabled:opacity-60"
                >
                  {pendingId === event.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  PDF
                </button>
              </article>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
