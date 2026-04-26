export interface UserPosition {
  latitude: number;
  longitude: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export type UnitSystem = "metric" | "imperial";

export const MAP_STYLE_URL = "mapbox://styles/mapbox/outdoors-v12";

// --- Phase 2: Route types ---

export interface RoutePoint {
  latitude: number;
  longitude: number;
  elevationMeters: number | null;
  distanceFromStartMeters: number;
  idx: number;
}

export interface Route {
  id: string;
  name: string;
  fileName: string;
  color: string;
  isActive: boolean;
  isVisible: boolean;
  totalDistanceMeters: number;
  totalAscentMeters: number;
  totalDescentMeters: number;
  pointCount: number;
  createdAt: string; // ISO 8601
}

export interface RouteWithPoints extends Route {
  points: RoutePoint[];
}

export type RouteWaypointOrigin = "gpx";

export interface RouteWaypoint {
  id: string;
  routeId: string;
  sourceIndex: number;
  origin: RouteWaypointOrigin;
  name: string | null;
  type: string | null;
  description: string | null;
  elevationMeters: number | null;
  latitude: number;
  longitude: number;
  distanceFromRouteMeters: number;
  distanceAlongRouteMeters: number;
}

export type StarredEntityType = "downloadedPoi" | "routeWaypoint";

export interface StarredItem {
  entityType: StarredEntityType;
  entityId: string;
  createdAt: string; // ISO 8601
}

export type SurfaceClass = "paved" | "unpaved" | "unknown";

export interface SurfaceWayGeometryPoint {
  latitude: number;
  longitude: number;
}

export interface ClassifiedSurfaceWay {
  sourceId: string;
  surfaceTag: string | null;
  surfaceClass: SurfaceClass;
  tags: Record<string, string>;
  geometry: SurfaceWayGeometryPoint[];
}

export interface RouteSurfaceSegment {
  id: string;
  routeId: string;
  sourceId: string;
  startDistanceMeters: number;
  endDistanceMeters: number;
  surfaceTag: string | null;
  surfaceClass: SurfaceClass;
  tags: Record<string, string>;
}

export interface SnappedPosition {
  routeId: string;
  pointIndex: number;
  distanceAlongRouteMeters: number;
  distanceFromRouteMeters: number;
}

export type PanelTab = "profile" | "weather" | "climbs" | "pois" | "waypoints";

// --- Phase 3: POI types ---

export type POICategory =
  | "water"
  | "groceries"
  | "gas_station"
  | "bakery"
  | "toilet_shower"
  | "shelter"
  | "bus_stop"
  | "sports"
  | "cemetery"
  | "school";

export type FetchablePOISource = "osm" | "google";

export type POISource = FetchablePOISource;

export interface POI {
  id: string;
  sourceId: string;
  source: POISource;
  name: string | null;
  category: POICategory;
  latitude: number;
  longitude: number;
  tags: Record<string, string>;
  distanceFromRouteMeters: number;
  distanceAlongRouteMeters: number;
  routeId: string;
}

export interface POICategoryMeta {
  key: POICategory;
  label: string;
  color: string;
  iconName: string;
}

export type POIFetchStatus = "idle" | "fetching" | "done" | "error";

// --- Phase 4: Opening Hours ---

export interface OpeningHoursStatus {
  isOpen: boolean;
  label: string; // "Open", "Closed"
  detail: string | null; // "closes 20:00", "opens 07:00"
  closingSoon: boolean; // closing within 60 min
}

// --- Phase 4: ETA ---

export interface PowerModelConfig {
  powerWatts: number;
  totalMassKg: number;
  cda: number;
  crr: number;
  airDensity: number;
  maxDescentSpeedKmh: number;
  drivetrainEfficiency: number;
}

export interface ETAResult {
  distanceMeters: number;
  ridingTimeSeconds: number;
  eta: Date;
}

export interface ParsedRoute {
  name: string;
  points: RoutePoint[];
  waypoints: ParsedWaypoint[];
  totalDistanceMeters: number;
  totalAscentMeters: number;
  totalDescentMeters: number;
}

export interface ParsedWaypoint {
  name: string | null;
  type: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  elevationMeters: number | null;
}

// --- Phase 5: Weather ---

export interface WeatherPoint {
  /** Hours from now (0 = current hour) */
  hourOffset: number;
  /** ISO 8601 time string */
  time: string;
  /** Temperature in °C */
  temperatureC: number;
  /** Precipitation in mm/h */
  precipitationMm: number;
  /** Probability of precipitation 0–100 */
  precipitationProbability: number;
  /** Wind speed in km/h */
  windSpeedKmh: number;
  /** Wind direction in degrees (0 = N, 90 = E, 180 = S, 270 = W) */
  windDirectionDeg: number;
  /** Wind gust speed in km/h */
  windGustKmh: number;
  /** WMO weather code (0–99) */
  weatherCode: number;
  /** Latitude of the waypoint this forecast is for */
  latitude: number;
  /** Longitude of the waypoint this forecast is for */
  longitude: number;
  /** Distance along route from current position (meters) */
  distanceAlongRouteM: number;
  /** Bearing of route at this point (degrees, for wind relative direction) */
  routeBearingDeg: number | null;
}

export type WindRelative = "headwind" | "tailwind" | "crosswind-left" | "crosswind-right";

export type WeatherFetchStatus = "idle" | "fetching" | "done" | "error";

// --- Phase 6: Route Collections ---

export interface Collection {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string; // ISO 8601
}

export interface CollectionSegment {
  collectionId: string;
  routeId: string;
  position: number;
  isSelected: boolean;
}

export interface CollectionSegmentWithRoute {
  segment: CollectionSegment;
  route: Route;
}

export interface StitchedSegmentInfo {
  routeId: string;
  routeName: string;
  position: number;
  startPointIndex: number;
  endPointIndex: number;
  distanceOffsetMeters: number;
  segmentDistanceMeters: number;
  segmentAscentMeters: number;
  segmentDescentMeters: number;
}

export interface StitchedCollection {
  collectionId: string;
  points: RoutePoint[];
  segments: StitchedSegmentInfo[];
  totalDistanceMeters: number;
  totalAscentMeters: number;
  totalDescentMeters: number;
  /** Per-segment raw points, keyed by routeId */
  pointsByRouteId: Record<string, RoutePoint[]>;
}

export interface ActiveRouteData {
  type: "route" | "collection";
  id: string;
  name: string;
  points: RoutePoint[];
  totalDistanceMeters: number;
  totalAscentMeters: number;
  totalDescentMeters: number;
  segments: StitchedSegmentInfo[] | null;
  routeIds: string[];
}

// --- Climb Detection ---

export interface Climb {
  id: string;
  routeId: string;
  name: string | null;
  startDistanceMeters: number;
  endDistanceMeters: number;
  lengthMeters: number;
  totalAscentMeters: number;
  startElevationMeters: number;
  endElevationMeters: number;
  averageGradientPercent: number;
  maxGradientPercent: number;
  difficultyScore: number;
}

export type ClimbDifficulty = "low" | "medium" | "hard";

// --- Phase 4b: Offline ---

export type OfflinePackStatus = "idle" | "downloading" | "complete" | "error";

export interface OfflineRouteInfo {
  status: OfflinePackStatus;
  percentage: number;
  downloadedBytes: number;
  estimatedBytes: number;
  downloadedAt: string | null;
  error: string | null;
}

// --- Place view model (unified display layer for POIs + route waypoints) ---

export type PlaceEntityType = "downloadedPoi" | "routeWaypoint";

export interface PlaceViewModel {
  /** Discriminated identity */
  entityType: PlaceEntityType;
  /** ID of the underlying entity (POI id or RouteWaypoint id) */
  entityId: string;
  /** Stable composite key: `"downloadedPoi:<id>" | "routeWaypoint:<id>"` */
  placeId: string;
  /** Route that owns this place */
  routeId: string;
  /** For downloaded POIs, the POI category. For route waypoints, derived from waypoint type or `"waypoint"`. */
  category: POICategory | "waypoint";
  name: string | null;
  latitude: number;
  longitude: number;
  tags: Record<string, string>;
  /** Raw distance from route in meters (from the underlying entity) */
  distanceFromRouteMeters: number;
  /** Raw distance along route in meters (from the underlying entity) */
  rawDistanceAlongRouteMeters: number;
  /** Effective stitched distance — equals raw for single routes, offset for collections */
  effectiveDistanceAlongRouteMeters: number;
  /** Elevation in meters (available for route waypoints, null for most downloaded POIs) */
  elevationMeters: number | null;
  /** Opening hours string (from POI tags) */
  openingHours: string | null;
  /** Waypoint type string (from route waypoints, e.g. "control", "water") */
  waypointType: string | null;
  /** Description (from route waypoints) */
  description: string | null;
  /** Reference to the raw underlying entity if needed for detail views */
  raw?: POI | RouteWaypoint;
}
