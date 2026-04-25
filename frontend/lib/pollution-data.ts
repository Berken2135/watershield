export type PollutionEvent = {
  id: string;
  river: string;
  location: string;
  type: "Chemical" | "Oil Spill" | "Biological" | "Industrial";
  severity: "High" | "Medium" | "Low";
  status: "Active" | "Contained" | "Resolved";
  date: string;
  description: string;
  coordinates: [number, number];
  affectedLengthKm: number;
  reportedBy: string;
  responseTeam: string;
  estimatedCleanup: string;
  samplingData: {
    ph: number;
    dissolvedOxygen: number;
    turbidity: number;
    contaminant: string;
  };
  /** Real WQI from data-science pipeline (when available). */
  wqi?: number;
  /** 30-day forecast & confidence band (when available). */
  forecast?: {
    wqi7d: number;
    wqi30d: number;
    lower30d: number;
    upper30d: number;
    trend: "improving" | "stable" | "worsening";
    trendPct: number;
  };
  dataSource?: "real" | "synthetic";
};

// ---------------------------------------------------------------
// Backend integration — fetches real GeoJSON published by the
// data-science pipeline and maps it to the PollutionEvent shape.
// ---------------------------------------------------------------

const API_URL = "/api";

type EuropeFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    water_body_id: string;
    name: string;
    country: string;
    country_code: string;
    water_body_type: string;
    wqi_current: number;
    wqi_predicted_7d: number;
    wqi_predicted_30d: number;
    wqi_lower_30d: number;
    wqi_upper_30d: number;
    risk_level: "clean" | "moderate" | "high" | "critical";
    risk_color: string;
    trend: "improving" | "stable" | "worsening";
    trend_pct_change: number;
    anomaly_count_30d: number | null;
    data_source: "real" | "synthetic";
    last_updated: string;
    metrics: {
      temperature_c: number | null;
      ph: number | null;
      oxygen_mg_l: number | null;
      turbidity_ntu: number | null;
    };
  };
};

type EuropeFeatureCollection = {
  type: "FeatureCollection";
  features: EuropeFeature[];
};

const RISK_TO_SEVERITY: Record<EuropeFeature["properties"]["risk_level"], PollutionEvent["severity"]> = {
  critical: "High",
  high:     "High",
  moderate: "Medium",
  clean:    "Low",
};

const RISK_TO_STATUS: Record<EuropeFeature["properties"]["risk_level"], PollutionEvent["status"]> = {
  critical: "Active",
  high:     "Active",
  moderate: "Contained",
  clean:    "Resolved",
};

function inferType(props: EuropeFeature["properties"]): PollutionEvent["type"] {
  const ph = props.metrics.ph;
  const turb = props.metrics.turbidity_ntu;
  if (ph != null && (ph < 6 || ph > 9)) return "Chemical";
  if (turb != null && turb > 50)        return "Industrial";
  if (props.water_body_type === "sea")  return "Biological";
  return "Industrial";
}

function inferContaminant(props: EuropeFeature["properties"]): string {
  if (props.risk_level === "critical") return "Multiple — see report";
  if (props.risk_level === "high")     return "Anomalous WQI";
  if (props.metrics.ph != null && props.metrics.ph > 8.8) return "Alkaline anomaly";
  if (props.metrics.ph != null && props.metrics.ph < 6.5) return "Acidic discharge";
  if (props.metrics.turbidity_ntu != null && props.metrics.turbidity_ntu > 25) return "Suspended solids";
  return "Within EU thresholds";
}

export function featureToEvent(f: EuropeFeature): PollutionEvent {
  const p = f.properties;
  const [city, country] = p.name.includes(" - ")
    ? p.name.split(" - ").slice(-2)
    : [p.name, p.country];
  const river = p.name.includes(" - ") ? p.name.split(" - ")[0] : p.name;

  const ph    = p.metrics.ph        ?? 7.2;
  const oxy   = p.metrics.oxygen_mg_l ?? 6.5;
  const turb  = p.metrics.turbidity_ntu ?? 5.0;
  const severity = RISK_TO_SEVERITY[p.risk_level];

  return {
    id: p.water_body_id,
    river,
    location: city ?? p.country,
    type: inferType(p),
    severity,
    status: RISK_TO_STATUS[p.risk_level],
    date: p.last_updated.slice(0, 10),
    description:
      `${p.name} — current WQI ${p.wqi_current}. ` +
      `30-day forecast: ${p.wqi_predicted_30d} (${p.trend}, ${p.trend_pct_change > 0 ? "+" : ""}${p.trend_pct_change}%). ` +
      (p.anomaly_count_30d != null
        ? `${p.anomaly_count_30d} anomalies detected in the last 30 days.`
        : "Synthetic estimate from ERA5 climate proxies."),
    coordinates: f.geometry.coordinates,
    affectedLengthKm: severity === "High" ? 4.0 : severity === "Medium" ? 1.5 : 0.5,
    reportedBy: p.data_source === "real" ? "WIOŚ Wrocław" : "ERA5 / Copernicus",
    responseTeam: country ?? p.country,
    estimatedCleanup: p.last_updated.slice(0, 10),
    samplingData: {
      ph: Math.round(ph * 100) / 100,
      dissolvedOxygen: Math.round(oxy * 100) / 100,
      turbidity: Math.round(turb * 10) / 10,
      contaminant: inferContaminant(p),
    },
    wqi: p.wqi_current,
    forecast: {
      wqi7d: p.wqi_predicted_7d,
      wqi30d: p.wqi_predicted_30d,
      lower30d: p.wqi_lower_30d,
      upper30d: p.wqi_upper_30d,
      trend: p.trend,
      trendPct: p.trend_pct_change,
    },
    dataSource: p.data_source,
  };
}

export async function fetchStations(): Promise<PollutionEvent[]> {
  const res = await fetch(`${API_URL}/api/data/europe`, { cache: "no-store" });
  if (!res.ok) throw new Error(`stations fetch failed: ${res.status}`);
  const fc = (await res.json()) as EuropeFeatureCollection;
  return fc.features.map(featureToEvent);
}

// ---------------------------------------------------------------
// Mock data (used only when the backend is unreachable).
// ---------------------------------------------------------------

export const POLLUTION_EVENTS: PollutionEvent[] = [];

export const SEVERITY_BADGE: Record<PollutionEvent["severity"], string> = {
  High:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Low:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export const STATUS_BADGE: Record<PollutionEvent["status"], string> = {
  Active:    "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  Contained: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  Resolved:  "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
};
