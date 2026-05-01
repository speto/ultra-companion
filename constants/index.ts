export const DEFAULT_MAP_CENTER = {
  latitude: 48.2082, // Vienna — sensible default
  longitude: 16.3738,
};

export const DEFAULT_ZOOM = 12;
// Fatigue-friendly: minimum 48dp touch targets
export const MIN_TOUCH_TARGET = 48;

// Route colors: active stands out, inactive fades back
export const ACTIVE_ROUTE_COLOR = "#E63946";
export const INACTIVE_ROUTE_COLOR = "#94A3B8";

// Per-segment muted palette for collection route rendering
export const SEGMENT_COLORS_LIGHT = [
  "#C65A4A",
  "#4F7D9A",
  "#5E8C6A",
  "#C9A24A",
  "#B17458",
  "#7A669B",
  "#4E6E7D",
  "#8A7A3D",
] as const;

export const SEGMENT_COLORS_DARK = [
  "#D97868",
  "#6EA0BC",
  "#78A982",
  "#D8B75D",
  "#C98B6E",
  "#9A86BD",
  "#6F95A4",
  "#A99850",
] as const;

// Active route color for single-route direction arrows
export const ACTIVE_ROUTE_POLISHED = "#C65A4A";
export const ACTIVE_ROUTE_POLISHED_DARK = "#D97868";

// Max points before downsampling elevation chart
export const ELEVATION_CHART_MAX_POINTS = 500;

// --- Phase 2b: Bottom panel ---

/** Draggable sheet snap points as fraction of screen height */
export const SHEET_COMPACT_RATIO = 0.3;
export const SHEET_EXPANDED_RATIO = 0.75;

/** Fraction of chart width to show behind current position */
export const LOOK_BACK_RATIO = 0.25;

// --- Phase 3: POI constants ---

import type { POICategory, POICategoryMeta } from "@/types";

export const POI_CATEGORIES: POICategoryMeta[] = [
  { key: "water", label: "Water", group: "water", color: "#3B82F6", iconName: "Droplets" },
  {
    key: "groceries",
    label: "Groceries",
    group: "food",
    color: "#22C55E",
    iconName: "ShoppingCart",
  },
  { key: "gas_station", label: "Gas Station", group: "food", color: "#F97316", iconName: "Fuel" },
  { key: "bakery", label: "Bakery", group: "food", color: "#EAB308", iconName: "Croissant" },
  { key: "coffee", label: "Coffee", group: "eat_drink", color: "#A16207", iconName: "Coffee" },
  {
    key: "restaurant",
    label: "Restaurant",
    group: "eat_drink",
    color: "#F59E0B",
    iconName: "Utensils",
  },
  { key: "bar_pub", label: "Bar / Pub", group: "eat_drink", color: "#D97706", iconName: "Beer" },
  { key: "toilet_shower", label: "WC", group: "wc", color: "#6366F1", iconName: "Toilet" },
  { key: "shelter", label: "Shelter", group: "rest", color: "#8B5CF6", iconName: "Tent" },
  { key: "bus_stop", label: "Bus Shelter", group: "rest", color: "#0EA5E9", iconName: "Bus" },
  { key: "camp_site", label: "Camp Site", group: "rest", color: "#7C3AED", iconName: "Tent" },
  { key: "pharmacy", label: "Pharmacy", group: "help", color: "#10B981", iconName: "Pill" },
  {
    key: "hospital_er",
    label: "Hospital / ER",
    group: "help",
    color: "#DC2626",
    iconName: "Hospital",
  },
  {
    key: "defibrillator",
    label: "Defibrillator",
    group: "help",
    color: "#EF4444",
    iconName: "HeartPulse",
  },
  {
    key: "emergency_phone",
    label: "Emergency Phone",
    group: "help",
    color: "#7C2D12",
    iconName: "Phone",
  },
  {
    key: "ambulance_station",
    label: "Ambulance",
    group: "help",
    color: "#B91C1C",
    iconName: "Ambulance",
  },
  { key: "bike_shop", label: "Bike Shop", group: "repair", color: "#2563EB", iconName: "Bike" },
  {
    key: "repair_station",
    label: "Repair Station",
    group: "repair",
    color: "#0F766E",
    iconName: "Wrench",
  },
  {
    key: "pump_air",
    label: "Pump / Air",
    group: "repair",
    color: "#0891B2",
    iconName: "CircleDot",
  },
  {
    key: "train_station",
    label: "Train Station",
    group: "escape",
    color: "#475569",
    iconName: "TrainFront",
  },
  { key: "sports", label: "Sports", group: "other", color: "#84CC16", iconName: "Dumbbell" },
  { key: "cemetery", label: "Cemetery", group: "other", color: "#64748B", iconName: "Landmark" },
  { key: "school", label: "School", group: "other", color: "#14B8A6", iconName: "School" },
];

/** How far behind the rider a POI remains visible in the list */
export const POI_BEHIND_THRESHOLD_M = 1000;

export const DEFAULT_CORRIDOR_WIDTH_M = 1000;
export const MAX_CORRIDOR_WIDTH_M = 10000;
export const MIN_CORRIDOR_WIDTH_M = 500;

export const DEFAULT_POI_CATEGORY_CORRIDOR_WIDTH_M: Record<POICategory, number> = {
  water: 1000,
  groceries: 1000,
  gas_station: 1500,
  bakery: 1000,
  coffee: 1000,
  restaurant: 1500,
  bar_pub: 1500,
  toilet_shower: 1000,
  shelter: 300,
  bus_stop: 30,
  camp_site: 5000,
  pharmacy: 3000,
  hospital_er: 10000,
  defibrillator: 1000,
  emergency_phone: 1000,
  ambulance_station: 5000,
  bike_shop: 5000,
  repair_station: 500,
  pump_air: 500,
  train_station: 10000,
  sports: 1000,
  cemetery: 1000,
  school: 1000,
};

export function getPoiCategoryCorridorWidthM(
  category: POICategory,
  fallbackWidthM = DEFAULT_CORRIDOR_WIDTH_M,
): number {
  return DEFAULT_POI_CATEGORY_CORRIDOR_WIDTH_M[category] ?? fallbackWidthM;
}

export function getMaxPoiCorridorWidthM(fallbackWidthM = DEFAULT_CORRIDOR_WIDTH_M): number {
  return Math.max(fallbackWidthM, ...Object.values(DEFAULT_POI_CATEGORY_CORRIDOR_WIDTH_M));
}
export const OVERPASS_API_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
export const OVERPASS_SEGMENT_LENGTH_M = 50_000;
export const OVERPASS_RETRY_DELAYS = [2000, 5000, 15000];

/** Max elevation difference between POI and route at nearest point (meters) */
export const POI_MAX_ELEVATION_DIFF_M = 25;

// --- Phase 4: GPS & ETA ---

/** Position older than this triggers auto-refresh on app focus */
export const GPS_STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/** Position age label becomes visible after this threshold */
export const POSITION_AGE_VISIBLE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/** Gravitational acceleration m/s² */
export const G = 9.80665;

import type { PowerModelConfig } from "@/types";

export const DEFAULT_POWER_CONFIG: PowerModelConfig = {
  powerWatts: 200,
  totalMassKg: 120,
  cda: 0.4,
  crr: 0.005,
  airDensity: 1.225,
  maxDescentSpeedKmh: 50,
  drivetrainEfficiency: 0.97,
};

// --- Phase 5: Weather ---

/** Sample weather waypoints every N meters along route */
export const WEATHER_WAYPOINT_INTERVAL_M = 20_000;

/** Weather cache becomes stale after this (1 hour) */
export const WEATHER_STALE_MS = 60 * 60 * 1000;

/** Manual refresh no-ops within this window when the same forecast coverage is already fresh */
export const WEATHER_MANUAL_REFRESH_THROTTLE_MS = 10 * 60 * 1000;

/** Open-Meteo API base URL */
export const OPEN_METEO_API_URL = "https://api.open-meteo.com/v1/forecast";

/** Open-Meteo forecast_hours upper bound */
export const OPEN_METEO_MAX_FORECAST_HOURS = 384;

/** Upper bound used for weather forecast/cache horizon calculations */
export const WEATHER_TIMELINE_HOURS = 24;

// --- Phase 4b: Offline ---

/** Offline tile download: zoom range */
export const OFFLINE_MIN_ZOOM = 10;
export const OFFLINE_MAX_ZOOM = 14;

/** Pack name prefix for Mapbox offline tile regions */
export const OFFLINE_PACK_PREFIX = "ultra-route-";

/** Cancel tile download if no progress for this long */
export const TILE_DOWNLOAD_STALL_MS = 2 * 60 * 1000;
