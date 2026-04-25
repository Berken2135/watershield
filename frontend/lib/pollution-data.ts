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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

export const POLLUTION_EVENTS: PollutionEvent[] = [
  {
    id: "p1",
    river: "Odra",
    location: "Wrocław – Śródmieście",
    type: "Chemical",
    severity: "High",
    status: "Active",
    date: "2026-04-23",
    description: "Elevated heavy-metal concentrations detected near the city-centre bridge. Sampling confirmed lead and cadmium levels exceeding EU Water Framework Directive limits by 8×.",
    coordinates: [17.035, 51.107],
    affectedLengthKm: 3.2,
    reportedBy: "WIOŚ Wrocław",
    responseTeam: "Jednostka Ratownictwa Chemicznego WP + WIOŚ",
    estimatedCleanup: "2026-05-10",
    samplingData: { ph: 4.1, dissolvedOxygen: 3.2, turbidity: 120, contaminant: "Lead, Cadmium" },
  },
  {
    id: "p2",
    river: "Ślęza",
    location: "Siechnice",
    type: "Industrial",
    severity: "Medium",
    status: "Contained",
    date: "2026-04-22",
    description: "Discharge from an industrial plant upstream caused pH to drop to 5.2. The source has been identified and the outflow valve shut; monitoring continues.",
    coordinates: [17.115, 51.035],
    affectedLengthKm: 1.5,
    reportedBy: "Zakład Przemysłowy Siechnice",
    responseTeam: "Straż Pożarna PSP Wrocław",
    estimatedCleanup: "2026-04-30",
    samplingData: { ph: 5.2, dissolvedOxygen: 5.1, turbidity: 85, contaminant: "Sulfuric acid traces" },
  },
  {
    id: "p3",
    river: "Bystrzyca",
    location: "Kąty Wrocławskie",
    type: "Oil Spill",
    severity: "High",
    status: "Active",
    date: "2026-04-21",
    description: "Oil slick ~400 m in length after a reported truck accident on the adjacent road. Petroleum hydrocarbons have been detected in water samples downstream.",
    coordinates: [16.777, 51.036],
    affectedLengthKm: 2.8,
    reportedBy: "Policja Kąty Wrocławskie",
    responseTeam: "Specjalistyczna Jednostka ds. Wycieków WIOŚ",
    estimatedCleanup: "2026-05-03",
    samplingData: { ph: 7.1, dissolvedOxygen: 4.8, turbidity: 95, contaminant: "Petroleum hydrocarbons" },
  },
  {
    id: "p4",
    river: "Widawa",
    location: "Wrocław – Psie Pole",
    type: "Biological",
    severity: "Low",
    status: "Contained",
    date: "2026-04-20",
    description: "Blue-green algae bloom covering approximately 800 m of riverbank. Dissolved oxygen dropped below the safety threshold for aquatic life.",
    coordinates: [17.058, 51.175],
    affectedLengthKm: 0.8,
    reportedBy: "Mieszkaniec Wrocławia",
    responseTeam: "PIORIN Dolny Śląsk",
    estimatedCleanup: "2026-05-15",
    samplingData: { ph: 9.2, dissolvedOxygen: 2.1, turbidity: 45, contaminant: "Cyanobacteria (Microcystis)" },
  },
  {
    id: "p5",
    river: "Odra",
    location: "Brzeg Dolny",
    type: "Chemical",
    severity: "Medium",
    status: "Active",
    date: "2026-04-19",
    description: "Ammonia spike following overflow from sewage treatment plant. Elevated NH₃ concentrations recorded 5 km downstream.",
    coordinates: [16.698, 51.270],
    affectedLengthKm: 5.1,
    reportedBy: "WIOŚ Wrocław",
    responseTeam: "Specjalistyczna Jednostka ds. Oczyszczalni",
    estimatedCleanup: "2026-04-28",
    samplingData: { ph: 8.9, dissolvedOxygen: 4.5, turbidity: 30, contaminant: "Ammonia (NH₃)" },
  },
  {
    id: "p6",
    river: "Oława",
    location: "Oława",
    type: "Industrial",
    severity: "Low",
    status: "Resolved",
    date: "2026-04-18",
    description: "Turbidity increase caused by suspended solids washed in from a nearby construction site. No toxic compounds detected; situation resolved after site barriers installed.",
    coordinates: [17.302, 50.943],
    affectedLengthKm: 0.4,
    reportedBy: "Inspekcja Budowlana Oława",
    responseTeam: "Lokalny Oddział Straży Pożarnej",
    estimatedCleanup: "2026-04-20",
    samplingData: { ph: 7.4, dissolvedOxygen: 7.2, turbidity: 280, contaminant: "Suspended solids" },
  },
  {
    id: "p7",
    river: "Odra",
    location: "Ścinawa",
    type: "Oil Spill",
    severity: "Medium",
    status: "Contained",
    date: "2026-04-17",
    description: "Diesel fuel leak from a barge moored near Ścinawa. Clean-up booms deployed; approximately 1.8 km of the river bank affected.",
    coordinates: [16.419, 51.700],
    affectedLengthKm: 1.8,
    reportedBy: "RZGW Wrocław",
    responseTeam: "Brygada Ratownictwa Rzecznego",
    estimatedCleanup: "2026-04-25",
    samplingData: { ph: 7.0, dissolvedOxygen: 5.8, turbidity: 60, contaminant: "Diesel fuel" },
  },
  {
    id: "p8",
    river: "Nysa Kłodzka",
    location: "Brzeg",
    type: "Biological",
    severity: "High",
    status: "Active",
    date: "2026-04-16",
    description: "E. coli levels 10× above the safe limit; swimming ban imposed along a 4.5 km stretch. Source traced to a ruptured sewer collector following recent flooding.",
    coordinates: [17.462, 50.862],
    affectedLengthKm: 4.5,
    reportedBy: "Sanepid Brzeg",
    responseTeam: "Powiatowy Inspektor Sanitarny + PSP Brzeg",
    estimatedCleanup: "2026-05-08",
    samplingData: { ph: 7.6, dissolvedOxygen: 2.8, turbidity: 35, contaminant: "E. coli, Coliform bacteria" },
  },
];

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
