import { describe, expect, it } from "vitest";
import { buildRoutePoint } from "../fixtures/route";
import {
  buildRouteMarkerSourceShape,
  buildDistanceMarkerFeatures,
  buildStartFinishMarkerFeatures,
  deriveRouteMarkerSourceInput,
  selectDistanceMarkerIntervalForZoomBucket,
  selectDistanceMarkerIntervalMeters,
  selectDistanceMarkerIntervalsForZoomBuckets,
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

  it.each([
    [50_000, 5_000],
    [500_000, 50_000],
    [1_000_000, 100_000],
    [2_500_000, 200_000],
  ])("selects a readable nice interval for a %i m route", (routeDistance, expectedInterval) => {
    expect(selectDistanceMarkerIntervalMeters(routeDistance)).toBe(expectedInterval);
  });

  it("selects spec-defined distance marker intervals for each zoom bucket", () => {
    expect(selectDistanceMarkerIntervalsForZoomBuckets(1_000_000)).toEqual([
      { bucket: "overview", intervalMeters: 100_000 },
      { bucket: "mid", intervalMeters: 50_000 },
      { bucket: "detail", intervalMeters: 25_000 },
    ]);
    expect(selectDistanceMarkerIntervalsForZoomBuckets(2_500_000)).toEqual([
      { bucket: "overview", intervalMeters: 200_000 },
      { bucket: "mid", intervalMeters: 100_000 },
      { bucket: "detail", intervalMeters: 50_000 },
    ]);
  });

  it("uses only the active zoom bucket interval", () => {
    expect(selectDistanceMarkerIntervalForZoomBucket(1_000_000, 8)).toBe(100_000);
    expect(selectDistanceMarkerIntervalForZoomBucket(1_000_000, 10)).toBe(50_000);
    expect(selectDistanceMarkerIntervalForZoomBucket(1_000_000, 12)).toBe(25_000);
  });

  it("builds a marker source with start and finish only when distance markers are off", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(100_000, 1, 0, 1)];

    const shape = buildRouteMarkerSourceShape({ points, showDistanceMarkers: false, zoom: 12 });

    expect(shape.features.map((feature) => feature.properties.kind)).toEqual(["start", "finish"]);
  });

  it("changes marker source input only when active context or zoom bucket changes", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(1_000_000, 1, 0, 10)];
    const base = {
      activeContextKey: "route-1",
      points,
      showDistanceMarkers: true,
    };

    const sameBucketA = deriveRouteMarkerSourceInput({ ...base, zoom: 8.1 });
    const sameBucketB = deriveRouteMarkerSourceInput({ ...base, zoom: 8.4 });
    const nextBucket = deriveRouteMarkerSourceInput({ ...base, zoom: 10.1 });
    const nextContext = deriveRouteMarkerSourceInput({
      ...base,
      activeContextKey: "collection-1:r1,r2",
      zoom: 8.1,
    });

    expect(sameBucketB.sourceKey).toBe(sameBucketA.sourceKey);
    expect(nextBucket.sourceKey).not.toBe(sameBucketA.sourceKey);
    expect(nextContext.sourceKey).not.toBe(sameBucketA.sourceKey);
    expect(sameBucketA.intervalMeters).toBe(100_000);
    expect(nextBucket.intervalMeters).toBe(50_000);
  });

  it("returns all distance markers regardless of visible bounds", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(100_000, 1, 0, 1)];

    const features = buildDistanceMarkerFeatures(points, 25_000);

    expect(features.map((feature) => feature.properties.label)).toEqual([
      "25 km",
      "50 km",
      "75 km",
    ]);
    expect(features.map((feature) => feature.geometry.coordinates)).toEqual([
      [0.25, 0],
      [0.5, 0],
      [0.75, 0],
    ]);
  });

  it("generates stitched route kilometer labels without resetting at segment seams", () => {
    const points = [
      routePoint(0, 0, 0, 0),
      routePoint(80_000, 1, 0, 0.8),
      routePoint(160_000, 2, 0, 1.6),
      routePoint(240_000, 3, 0, 2.4),
    ];

    const features = buildDistanceMarkerFeatures(points, 80_000);

    expect(features.map((feature) => feature.properties.label)).toEqual(["80 km", "160 km"]);
    expect(features.map((feature) => feature.properties.distanceMeters)).toEqual([80_000, 160_000]);
    expect(features.map((feature) => feature.geometry.coordinates)).toEqual([
      [0.8, 0],
      [1.6, 0],
    ]);
  });

  it("interpolates marker coordinates between neighboring route points", () => {
    const points = [routePoint(0, 0, 0, 0), routePoint(100_000, 1, 0, 1)];

    const features = buildDistanceMarkerFeatures(points, 50_000);

    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      geometry: { coordinates: [0.5, 0] },
      properties: { kind: "distance", label: "50 km", markerLabel: "50", distanceMeters: 50_000 },
    });
  });
});
