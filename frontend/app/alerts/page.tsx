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
            <h1 className="text-2xl font-semibold tracking-tight">
              Alerts
            </h1>
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
