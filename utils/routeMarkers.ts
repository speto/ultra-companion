import { haversineDistance } from "./geo";
import type { RoutePoint } from "@/types";

export type RouteMarkerKind = "start" | "finish";

export interface RouteMarkerProperties {
  kind: RouteMarkerKind;
  label: string;
  markerLabel: string;
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

export function buildRouteMarkerFeatureCollection(
  features: RouteMarkerFeature[],
): GeoJSON.FeatureCollection<GeoJSON.Point, RouteMarkerProperties> {
  return {
    type: "FeatureCollection",
    features,
  };
}

export function buildRouteMarkerSourceShape(
  points: RoutePoint[],
): GeoJSON.FeatureCollection<GeoJSON.Point, RouteMarkerProperties> {
  return buildRouteMarkerFeatureCollection(buildStartFinishMarkerFeatures(points));
}
