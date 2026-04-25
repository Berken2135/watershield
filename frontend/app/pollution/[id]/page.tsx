import { Activity, AlertTriangle, ArrowLeft, CalendarDays, Gauge, MapPin, ShieldAlert, Users, Waves } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POLLUTION_EVENTS, SEVERITY_BADGE, STATUS_BADGE } from "../../../lib/pollution-data";
import AlertActions from "../../../components/alert-actions";

export function generateStaticParams() {
  return POLLUTION_EVENTS.map((e) => ({ id: e.id }));
}

type Props = { params: Promise<{ id: string }> };

export default async function PollutionDetailPage({ params }: Props) {
  const { id } = await params;
  const event = POLLUTION_EVENTS.find((e) => e.id === id);
  if (!event) notFound();

  const severityFill =
    event.severity === "High" ? "#ef4444" : event.severity === "Medium" ? "#f59e0b" : "#22c55e";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to map
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium truncate">
            {event.river} — {event.location}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-8">
        {/* Title block */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_BADGE[event.severity]}`}>
              {event.severity} severity
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[event.status]}`}>
              {event.status}
            </span>
            <span className="text-xs text-muted-foreground">{event.type}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {event.river} pollution — {event.location}
          </h1>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>
              {event.location} &nbsp;·&nbsp; {event.coordinates[1].toFixed(4)}°N,{" "}
              {event.coordinates[0].toFixed(4)}°E
            </span>
          </div>
        </div>

        {/* Description */}
        <section className="rounded-xl border bg-muted/20 p-5">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Incident summary
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>
        </section>

        {/* Key details */}
        <section>
          <h2 className="text-sm font-semibold mb-3">Key details</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="text-xs">Date reported</span>
              </div>
              <span className="text-base font-semibold">{event.date}</span>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Waves className="h-3.5 w-3.5" />
                <span className="text-xs">Affected length</span>
              </div>
              <span className="text-base font-semibold">{event.affectedLengthKm} km</span>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="text-xs">Est. cleanup</span>
              </div>
              <span className="text-base font-semibold">{event.estimatedCleanup}</span>
            </div>
            <div className="col-span-2 sm:col-span-3 rounded-lg border bg-muted/30 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span className="text-xs">Reported by</span>
              </div>
              <span className="text-base font-semibold">{event.reportedBy}</span>
            </div>
            <div className="col-span-2 sm:col-span-3 rounded-lg border bg-muted/30 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Users className="h-3.5 w-3.5" />
                <span className="text-xs">Response team</span>
              </div>
              <span className="text-base font-semibold">{event.responseTeam}</span>
            </div>
          </div>
        </section>

        {/* Sampling data */}
        <section>
          <h2 className="text-sm font-semibold mb-3">Water sampling results</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Gauge className="h-3.5 w-3.5" />
                <span className="text-xs">pH</span>
              </div>
              <span className="text-2xl font-bold">{event.samplingData.ph}</span>
              <span className="text-xs text-muted-foreground">
                {event.samplingData.ph < 6 ? "⚠ Acidic" : event.samplingData.ph > 8.5 ? "⚠ Alkaline" : "Normal range 6–8.5"}
              </span>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                <span className="text-xs">Dissolved O₂</span>
              </div>
              <span className="text-2xl font-bold">
                {event.samplingData.dissolvedOxygen}
                <span className="text-sm font-normal text-muted-foreground ml-1">mg/L</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {event.samplingData.dissolvedOxygen < 4 ? "⚠ Below safe threshold" : "Safe ≥ 4 mg/L"}
              </span>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Waves className="h-3.5 w-3.5" />
                <span className="text-xs">Turbidity</span>
              </div>
              <span className="text-2xl font-bold">
                {event.samplingData.turbidity}
                <span className="text-sm font-normal text-muted-foreground ml-1">NTU</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {event.samplingData.turbidity > 100 ? "⚠ High turbidity" : "Normal < 100 NTU"}
              </span>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-xs">Primary contaminant</span>
              </div>
              <span className="text-base font-bold leading-snug">{event.samplingData.contaminant}</span>
            </div>
          </div>
        </section>

        {/* Severity indicator bar */}
        <section className="rounded-xl border p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Risk level</h2>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: event.severity === "High" ? "90%" : event.severity === "Medium" ? "55%" : "20%",
                  backgroundColor: severityFill,
                }}
              />
            </div>
            <span className="text-sm font-semibold" style={{ color: severityFill }}>
              {event.severity}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {event.severity === "High"
              ? "Immediate action required. Risk to human health and aquatic ecosystems."
              : event.severity === "Medium"
              ? "Monitoring in progress. Localised impact; containment measures in place."
              : "Low environmental impact. Situation under observation."}
          </p>
        </section>

        <AlertActions event={event} />

        <p className="text-xs text-muted-foreground text-center pb-4">
          Data is mocked for demonstration purposes.
        </p>
      </main>
    </div>
  );
}
