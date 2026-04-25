"use client";

import Sidebar from "@/components/sidebar";

export default function ReportsPage() {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">
              Reports
            </h1>
            <div className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
              Compliance · EU Water Framework Directive
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reports</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              PDF report generation is available from the WQI station detail panel on the main map.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

