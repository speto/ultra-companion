import { haversineDistance } from "./geo";
import type { RoutePoint } from "@/types";

export type RouteMarkerKind = "start" | "finish" | "distance";
export type DistanceMarkerZoomBucket = "overview" | "mid" | "detail";

export interface DistanceMarkerBucketInterval {
  bucket: DistanceMarkerZoomBucket;
  intervalMeters: number;
}

export interface RouteMarkerSourceInput {
  activeContextKey: string | null;
  points: RoutePoint[];
  showDistanceMarkers: boolean;
  zoom: number;
}

export interface RouteMarkerSourceResult {
  sourceKey: string;
  zoomBucket: DistanceMarkerZoomBucket;
  intervalMeters: number | null;
  shape: GeoJSON.FeatureCollection<GeoJSON.Point, RouteMarkerProperties>;
}

export interface RouteMarkerProperties {
  kind: RouteMarkerKind;
  label: string;
  markerLabel: string;
  iconName?: string;
  distanceMeters: number;
  sortKey: number;
}
export type RouteMarkerFeature = GeoJSON.Feature<GeoJSON.Point, RouteMarkerProperties>;

const NEAR_OVERLAP_THRESHOLD_M = 100;

const DISTANCE_INTERVAL_CANDIDATES_M = [5_000, 10_000, 25_000, 50_000, 100_000, 200_000, 500_000];

const OVERVIEW_TARGET_DISTANCE_MARKERS = 12;
const DETAIL_TARGET_DISTANCE_MARKERS = 40;
const MID_TARGET_DISTANCE_MARKERS = Math.round(
  (OVERVIEW_TARGET_DISTANCE_MARKERS + DETAIL_TARGET_DISTANCE_MARKERS) / 2,
);

function markerFeature(
  id: string,
  point: Pick<RoutePoint, "latitude" | "longitude" | "distanceFromStartMeters">,
  properties: Omit<RouteMarkerProperties, "distanceMeters">,
): RouteMarkerFeature {
  return {
    type: "Feature",
    id,
    geometry: {
      type: "Point",
      coordinates: [point.longitude, point.latitude],
    },
    properties: {
      ...properties,
      distanceMeters: point.distanceFromStartMeters,
    },
  };
}

function endpointsOverlap(start: RoutePoint, finish: RoutePoint): boolean {
  return (
    haversineDistance(start.latitude, start.longitude, finish.latitude, finish.longitude) <=
    NEAR_OVERLAP_THRESHOLD_M
  );
}

export function buildStartFinishMarkerFeatures(points: RoutePoint[]): RouteMarkerFeature[] {
  if (points.length < 2) return [];

  const start = points[0];
  const finish = points[points.length - 1];
  const overlapping = endpointsOverlap(start, finish);

  return [
    markerFeature("route-start", start, {
      kind: "start",
      label: "START",
      markerLabel: "",
      sortKey: 0,
    }),
    markerFeature("route-finish", finish, {
      kind: "finish",
      label: overlapping ? "START / FINISH" : "FINISH",
      markerLabel: "",
      sortKey: 1,
    }),
  ];
}

function selectNiceDistanceMarkerIntervalMeters(
  totalDistanceMeters: number,
  targetMarkerCount: number,
): number {
  let selected = DISTANCE_INTERVAL_CANDIDATES_M[0];
  let bestDelta = Infinity;

  for (const candidate of DISTANCE_INTERVAL_CANDIDATES_M) {
    const markerCount = totalDistanceMeters / candidate;
    const delta = Math.abs(markerCount - targetMarkerCount);
    if (delta < bestDelta) {
      selected = candidate;
      bestDelta = delta;
    }
  }

  return selected;
}

export function selectDistanceMarkerIntervalMeters(totalDistanceMeters: number): number {
  return selectNiceDistanceMarkerIntervalMeters(
    totalDistanceMeters,
    OVERVIEW_TARGET_DISTANCE_MARKERS,
  );
}

export function selectDistanceMarkerIntervalsForZoomBuckets(
  totalDistanceMeters: number,
): DistanceMarkerBucketInterval[] {
  const overview = selectNiceDistanceMarkerIntervalMeters(
    totalDistanceMeters,
    OVERVIEW_TARGET_DISTANCE_MARKERS,
  );
  const mid = selectNiceDistanceMarkerIntervalMeters(
    totalDistanceMeters,
    MID_TARGET_DISTANCE_MARKERS,
  );
  const detail = selectNiceDistanceMarkerIntervalMeters(
    totalDistanceMeters,
    DETAIL_TARGET_DISTANCE_MARKERS,
  );

  return [
    { bucket: "overview", intervalMeters: overview },
    { bucket: "mid", intervalMeters: mid },
    { bucket: "detail", intervalMeters: detail },
  ];
}

export function selectDistanceMarkerZoomBucket(zoom: number): DistanceMarkerZoomBucket {
  if (zoom >= 12) return "detail";
  if (zoom >= 10) return "mid";
  return "overview";
}

export function selectDistanceMarkerIntervalForZoomBucket(
  totalDistanceMeters: number,
  zoom: number,
): number {
  const zoomBucket = selectDistanceMarkerZoomBucket(zoom);
  const intervals = selectDistanceMarkerIntervalsForZoomBuckets(totalDistanceMeters);
  return (
    intervals.find((interval) => interval.bucket === zoomBucket)?.intervalMeters ??
    intervals[0].intervalMeters
  );
}

function formatDistanceLabel(distanceMeters: number): string {
  const kilometers = distanceMeters / 1000;
  const label = Number.isInteger(kilometers)
    ? String(kilometers)
    : kilometers.toFixed(1).replace(/\.0$/, "");
  return `${label} km`;
}

function formatDistanceMarkerLabel(distanceMeters: number): string {
  const kilometers = distanceMeters / 1000;
  return Number.isInteger(kilometers)
    ? String(kilometers)
    : kilometers.toFixed(1).replace(/\.0$/, "");
}

function interpolateAtDistance(points: RoutePoint[], distanceMeters: number): RoutePoint | null {
  if (points.length === 0) return null;
  if (distanceMeters <= points[0].distanceFromStartMeters) return points[0];

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    const previousDistance = previous.distanceFromStartMeters;
    const currentDistance = current.distanceFromStartMeters;

    if (distanceMeters > currentDistance) continue;

    if (currentDistance === previousDistance) {
      return {
        ...current,
        distanceFromStartMeters: distanceMeters,
      };
    }

    const fraction = (distanceMeters - previousDistance) / (currentDistance - previousDistance);
    return {
      latitude: previous.latitude + (current.latitude - previous.latitude) * fraction,
      longitude: previous.longitude + (current.longitude - previous.longitude) * fraction,
      elevationMeters: null,
      distanceFromStartMeters: distanceMeters,
      idx: previous.idx,
    };
  }

  return null;
}

export function buildDistanceMarkerFeatures(
  points: RoutePoint[],
  intervalMeters = selectDistanceMarkerIntervalMeters(
    points[points.length - 1]?.distanceFromStartMeters ?? 0,
  ),
): RouteMarkerFeature[] {
  if (points.length < 2 || intervalMeters <= 0) return [];

  const totalDistanceMeters = points[points.length - 1].distanceFromStartMeters;
  const features: RouteMarkerFeature[] = [];

  for (
    let distanceMeters = intervalMeters;
    distanceMeters < totalDistanceMeters;
    distanceMeters += intervalMeters
  ) {
    const point = interpolateAtDistance(points, distanceMeters);
    if (!point) continue;

    features.push(
      markerFeature(`route-distance-${distanceMeters}`, point, {
        kind: "distance",
        label: formatDistanceLabel(distanceMeters),
        markerLabel: formatDistanceMarkerLabel(distanceMeters),
        iconName: `distance-${formatDistanceMarkerLabel(distanceMeters)}`,
        sortKey: 10 + distanceMeters / intervalMeters,
      }),
    );
  }

  return features;
}

export function buildRouteMarkerFeatureCollection(
  features: RouteMarkerFeature[],
): GeoJSON.FeatureCollection<GeoJSON.Point, RouteMarkerProperties> {
  return {
    type: "FeatureCollection",
    features,
  };
}

export function buildRouteMarkerSourceShape(input: {
  points: RoutePoint[];
  showDistanceMarkers: boolean;
  zoom: number;
}): GeoJSON.FeatureCollection<GeoJSON.Point, RouteMarkerProperties> {
  const startFinish = buildStartFinishMarkerFeatures(input.points);
  const intervalMeters = input.showDistanceMarkers
    ? selectDistanceMarkerIntervalForZoomBucket(
        input.points[input.points.length - 1]?.distanceFromStartMeters ?? 0,
        input.zoom,
      )
    : null;
  const distance = intervalMeters ? buildDistanceMarkerFeatures(input.points, intervalMeters) : [];
  return buildRouteMarkerFeatureCollection([...startFinish, ...distance]);
}

export function deriveRouteMarkerSourceInput(
  input: RouteMarkerSourceInput,
): RouteMarkerSourceResult {
  const zoomBucket = selectDistanceMarkerZoomBucket(input.zoom);
  const intervalMeters = input.showDistanceMarkers
    ? selectDistanceMarkerIntervalForZoomBucket(
        input.points[input.points.length - 1]?.distanceFromStartMeters ?? 0,
        input.zoom,
      )
    : null;
  const sourceKey = [
    input.activeContextKey ?? "none",
    zoomBucket,
    intervalMeters ?? "markers-off",
  ].join(":");

  return {
    sourceKey,
    zoomBucket,
    intervalMeters,
    shape: buildRouteMarkerSourceShape(input),
  };
}
