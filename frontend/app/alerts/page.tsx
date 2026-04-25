"use client";

import Sidebar from "@/components/sidebar";
import StationCard from "@/components/station-card";
import { POLLUTION_EVENTS } from "@/lib/pollution-data";

export default function AlertsPage() {
  const active = POLLUTION_EVENTS.filter((e) => e.status === "Active");

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <div className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
              Real-time · Tier 1 alerts
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Alerts
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Active pollution events requiring immediate operator attention.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map((event) => (
              <StationCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
