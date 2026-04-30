import { describe, expect, it } from "vitest";
import { buildRoutePoint } from "../fixtures/route";
import {
  buildRouteMarkerSourceShape,
  buildAllDistanceMarkerFeatures,
  buildDistanceMarkerDistances,
  buildStartFinishMarkerFeatures,
  deriveRouteMarkerSourceInput,
  DISTANCE_MARKER_BUCKETS,
  getDistanceMarkerIntervalForZoom,
} from "@/utils/routeMarkers";

import type { RoutePoint } from "@/types";

function routePoint(
  distanceFromStartMeters: number,
  idx: number,
  latitude: number,
  longitude: number,
): RoutePoint {
  return {
    ...buildRoutePoint(distanceFromStartMeters, idx),
    latitude,
    longitude,
  };
}

function distanceLabelsForInterval(
  features: ReturnType<typeof buildAllDistanceMarkerFeatures>,
  intervalKm: number,
) {
  return features
    .filter((feature) => feature.properties.distanceKm !== undefined)
    .filter((feature) => feature.properties.distanceKm! % intervalKm === 0)
    .map((feature) => Number(feature.properties.markerLabel));
}

describe("route marker generation", () => {
  it("uses the first and last stitched route points for start and finish markers", () => {
    const points = [
      routePoint(0, 0, 48.1, 17.1),
      routePoint(120_000, 1, 48.5, 17.7),
      routePoint(240_000, 2, 49.2, 18.4),
    ];

    const features = buildStartFinishMarkerFeatures(points);

    expect(features).toHaveLength(2);
    expect(features[0]).toMatchObject({
      geometry: { coordinates: [17.1, 48.1] },
      properties: { kind: "start", label: "START", markerLabel: "", distanceMeters: 0 },
    });
    expect(features[1]).toMatchObject({
      geometry: { coordinates: [18.4, 49.2] },
      properties: { kind: "finish", label: "FINISH", markerLabel: "", distanceMeters: 240_000 },
    });
  });

  it("emits distinct start and finish markers for near-overlapping loop endpoints", () => {
    const points = [
      routePoint(0, 0, 48.148, 17.107),
      routePoint(80_000, 1, 48.6, 17.8),
      routePoint(160_000, 2, 48.1484, 17.1073),
    ];

    const features = buildStartFinishMarkerFeatures(points);

    expect(features).toHaveLength(2);
    expect(features[0]).toMatchObject({
      geometry: { coordinates: [17.107, 48.148] },
      properties: { kind: "start", label: "START", markerLabel: "", distanceMeters: 0 },
    });
    expect(features[1]).toMatchObject({
      geometry: { coordinates: [17.1073, 48.1484] },
      properties: {
        kind: "finish",
        label: "START / FINISH",
        markerLabel: "",
        distanceMeters: 160_000,
      },
    });
  });

  it("builds a marker source with start and finish only when distance markers are off", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(100_000, 1, 0, 1)];

    const shape = buildRouteMarkerSourceShape({ points, showDistanceMarkers: false });

    expect(shape.features.map((feature) => feature.properties.kind)).toEqual(["start", "finish"]);
  });

  it("derives marker source without camera zoom", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(100_000, 1, 0, 1)];
    const input = {
      activeContextKey: "route-1",
      points,
      showDistanceMarkers: true,
    };

    const result = deriveRouteMarkerSourceInput(input);
    expect(result.shape.features).toHaveLength(101);
  });

  it("generates markers at every 1km with numeric distance", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(100_000, 1, 0, 1)];
    const features = buildAllDistanceMarkerFeatures(points);

    expect(features).toHaveLength(99);
    // km 100 is NOT included
    expect(features.find((f) => f.properties.markerLabel === "100")).toBeUndefined();

    expect(features.find((f) => f.properties.markerLabel === "1")?.properties.distanceKm).toBe(1);
    expect(features.find((f) => f.properties.markerLabel === "2")?.properties.distanceKm).toBe(2);
    expect(features.find((f) => f.properties.markerLabel === "5")?.properties.distanceKm).toBe(5);
    expect(features.find((f) => f.properties.markerLabel === "10")?.properties.distanceKm).toBe(10);
    expect(features.find((f) => f.properties.markerLabel === "25")?.properties.distanceKm).toBe(25);
    expect(features.find((f) => f.properties.markerLabel === "50")?.properties.distanceKm).toBe(50);
    expect(features.find((f) => f.properties.markerLabel === "99")?.properties.distanceKm).toBe(99);
  });

  it("exposes absolute kilometer distances for graph/map marker alignment", () => {
    expect(buildDistanceMarkerDistances(500)).toEqual([]);
    expect(buildDistanceMarkerDistances(3_500)).toEqual([1000, 2000, 3000]);
    expect(buildDistanceMarkerDistances(3_000)).toEqual([1000, 2000]);
  });

  it("filters absolute kilometer distances by requested interval", () => {
    expect(buildDistanceMarkerDistances(121_000, 50)).toEqual([50_000, 100_000]);
    expect(buildDistanceMarkerDistances(121_000, 25)).toEqual([25_000, 50_000, 75_000, 100_000]);
    expect(buildDistanceMarkerDistances(10_000, 5)).toEqual([5_000]);
  });

  it("marks the strongest available distance marker as an overview marker for short routes", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(15_000, 1, 0, 0.15)];
    const features = buildAllDistanceMarkerFeatures(points);

    const km10 = features.find((f) => f.properties.markerLabel === "10");
    expect(km10?.properties.distanceKm).toBe(10);
    expect(km10?.properties.isOverviewMarker).toBe(true);
    expect(features.filter((feature) => feature.properties.isOverviewMarker)).toHaveLength(1);
  });

  it("returns empty array for routes under 1km", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(500, 1, 0, 0.005)];
    const features = buildAllDistanceMarkerFeatures(points);
    expect(features).toEqual([]);
  });

  it("filters distance markers by active interval instead of assigned level", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(120_000, 1, 0, 1.2)];
    const features = buildAllDistanceMarkerFeatures(points);

    expect(distanceLabelsForInterval(features, 25)).toEqual([25, 50, 75, 100]);
    expect(distanceLabelsForInterval(features, 10)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110,
    ]);
    expect(distanceLabelsForInterval(features, 10)).not.toContain(25);
    expect(distanceLabelsForInterval(features, 10)).not.toContain(75);
  });

  it("interpolates marker coordinates between route points", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(100_000, 1, 0, 1)];
    const features = buildAllDistanceMarkerFeatures(points);

    const km50 = features.find((f) => f.properties.markerLabel === "50");
    expect(km50?.geometry.coordinates).toEqual([0.5, 0]);
  });

  it("builds full source shape with interval-ready distance markers", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(100_000, 1, 0, 1)];
    const shape = buildRouteMarkerSourceShape({ points, showDistanceMarkers: true });

    expect(shape.features).toHaveLength(101); // 99 distance + 2 start/finish
    const firstDistance = shape.features.find((f) => f.properties.kind === "distance");
    expect(firstDistance?.properties).toMatchObject({
      kind: "distance",
      markerLabel: "1",
      distanceKm: 1,
    });
  });

  it("keeps distance marker bucket zoom ranges contiguous and ordered", () => {
    for (let i = 1; i < DISTANCE_MARKER_BUCKETS.length; i++) {
      const previousBucket = DISTANCE_MARKER_BUCKETS[i - 1];
      const bucket = DISTANCE_MARKER_BUCKETS[i];

      expect(bucket.minZoom).toBeGreaterThanOrEqual(previousBucket.minZoom);
      expect(previousBucket.maxZoom).toBe(bucket.minZoom);
    }

    expect(DISTANCE_MARKER_BUCKETS).toEqual([
      { intervalKm: 100, minZoom: 0, maxZoom: 6.9 },
      { intervalKm: 50, minZoom: 6.9, maxZoom: 7.9 },
      { intervalKm: 25, minZoom: 7.9, maxZoom: 9 },
      { intervalKm: 10, minZoom: 9, maxZoom: 10.5 },
      { intervalKm: 5, minZoom: 10.5, maxZoom: 11.5 },
      { intervalKm: 2, minZoom: 11.5, maxZoom: 12.5 },
      { intervalKm: 1, minZoom: 12.5 },
    ]);
  });

  it("derives marker intervals from zoom buckets with inclusive min and exclusive max", () => {
    expect(getDistanceMarkerIntervalForZoom(-1)).toBe(100);
    expect(getDistanceMarkerIntervalForZoom(0)).toBe(100);
    expect(getDistanceMarkerIntervalForZoom(6.899)).toBe(100);
    expect(getDistanceMarkerIntervalForZoom(6.9)).toBe(50);
    expect(getDistanceMarkerIntervalForZoom(7.899)).toBe(50);
    expect(getDistanceMarkerIntervalForZoom(7.9)).toBe(25);
    expect(getDistanceMarkerIntervalForZoom(8.999)).toBe(25);
    expect(getDistanceMarkerIntervalForZoom(9)).toBe(10);
    expect(getDistanceMarkerIntervalForZoom(10.499)).toBe(10);
    expect(getDistanceMarkerIntervalForZoom(10.5)).toBe(5);
    expect(getDistanceMarkerIntervalForZoom(11.499)).toBe(5);
    expect(getDistanceMarkerIntervalForZoom(11.5)).toBe(2);
    expect(getDistanceMarkerIntervalForZoom(12.499)).toBe(2);
    expect(getDistanceMarkerIntervalForZoom(12.5)).toBe(1);
    expect(getDistanceMarkerIntervalForZoom(18)).toBe(1);
  });
});
