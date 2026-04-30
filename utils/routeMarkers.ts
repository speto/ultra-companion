import { haversineDistance } from "./geo";
import type { RoutePoint } from "@/types";

export type RouteMarkerKind = "start" | "finish" | "distance";

export const DISTANCE_MARKER_INTERVALS = [100, 50, 25, 10, 5, 2, 1] as const;
export type DistanceMarkerInterval = (typeof DISTANCE_MARKER_INTERVALS)[number];

export interface DistanceMarkerBucket {
  intervalKm: DistanceMarkerInterval;
  minZoom: number;
  maxZoom?: number;
}

export const DISTANCE_MARKER_BUCKETS: readonly DistanceMarkerBucket[] = [
  { intervalKm: 100, minZoom: 0, maxZoom: 6.9 },
  { intervalKm: 50, minZoom: 6.9, maxZoom: 7.9 },
  { intervalKm: 25, minZoom: 7.9, maxZoom: 9 },
  { intervalKm: 10, minZoom: 9, maxZoom: 10.5 },
  { intervalKm: 5, minZoom: 10.5, maxZoom: 11.5 },
  { intervalKm: 2, minZoom: 11.5, maxZoom: 12.5 },
  { intervalKm: 1, minZoom: 12.5 },
];

export function getDistanceMarkerIntervalForZoom(zoom: number): DistanceMarkerInterval {
  for (const bucket of DISTANCE_MARKER_BUCKETS) {
    if (zoom >= bucket.minZoom && (bucket.maxZoom == null || zoom < bucket.maxZoom)) {
      return bucket.intervalKm;
    }
  }
  return DISTANCE_MARKER_BUCKETS[0].intervalKm;
}

export interface RouteMarkerSourceInput {
  activeContextKey: string | null;
  points: RoutePoint[];
  showDistanceMarkers: boolean;
}

export interface RouteMarkerSourceResult {
  shape: GeoJSON.FeatureCollection<GeoJSON.Point, RouteMarkerProperties>;
}

export interface RouteMarkerProperties {
  kind: RouteMarkerKind;
  label: string;
  markerLabel: string;
  distanceKm?: number;
  isOverviewMarker?: boolean;
  distanceMeters: number;
  sortKey: number;
}
export type RouteMarkerFeature = GeoJSON.Feature<GeoJSON.Point, RouteMarkerProperties>;

const NEAR_OVERLAP_THRESHOLD_M = 100;

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

function strongestIntervalForDistance(km: number): DistanceMarkerInterval {
  for (const bucket of DISTANCE_MARKER_BUCKETS) {
    if (km % bucket.intervalKm === 0) return bucket.intervalKm;
  }
  return 1;
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

export function buildAllDistanceMarkerFeatures(points: RoutePoint[]): RouteMarkerFeature[] {
  if (points.length < 2) return [];

  const totalDistanceMeters = points[points.length - 1].distanceFromStartMeters;
  const totalKm = totalDistanceMeters / 1000;
  if (totalKm < 1) return [];

  const features: RouteMarkerFeature[] = [];

  for (const distanceMeters of buildDistanceMarkerDistances(totalDistanceMeters)) {
    const km = distanceMeters / 1000;
    const point = interpolateAtDistance(points, distanceMeters);
    if (!point) continue;

    const markerLabel = String(km);

    features.push(
      markerFeature(`route-distance-${km}`, point, {
        kind: "distance",
        label: `${markerLabel} km`,
        markerLabel,
        distanceKm: km,
        sortKey: 10 + km,
      }),
    );
  }

  const hasOverviewIntervalMarker = features.some(
    (feature) => (feature.properties.distanceKm ?? 0) % 100 === 0,
  );

  if (features.length > 0 && !hasOverviewIntervalMarker) {
    let bestIdx = 0;
    let bestInterval = strongestIntervalForDistance(features[0].properties.distanceKm ?? 1);
    for (let i = 1; i < features.length; i++) {
      const interval = strongestIntervalForDistance(features[i].properties.distanceKm ?? 1);
      if (interval > bestInterval) {
        bestInterval = interval;
        bestIdx = i;
      }
    }
    features[bestIdx] = {
      ...features[bestIdx],
      properties: { ...features[bestIdx].properties, isOverviewMarker: true },
    };
  }

  return features;
}

export function buildDistanceMarkerDistances(
  totalDistanceMeters: number,
  intervalKm: DistanceMarkerInterval = 1,
): number[] {
  const totalKm = totalDistanceMeters / 1000;
  if (totalKm < 1) return [];

  const distances: number[] = [];
  for (let km = intervalKm; km < totalKm; km += intervalKm) {
    distances.push(km * 1000);
  }
  return distances;
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
}): GeoJSON.FeatureCollection<GeoJSON.Point, RouteMarkerProperties> {
  const startFinish = buildStartFinishMarkerFeatures(input.points);
  const distance = input.showDistanceMarkers ? buildAllDistanceMarkerFeatures(input.points) : [];
  return buildRouteMarkerFeatureCollection([...startFinish, ...distance]);
}

export function deriveRouteMarkerSourceInput(
  input: RouteMarkerSourceInput,
): RouteMarkerSourceResult {
  return {
    shape: buildRouteMarkerSourceShape(input),
  };
}
