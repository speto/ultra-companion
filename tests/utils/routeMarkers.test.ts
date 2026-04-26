import { describe, expect, it } from "vitest";
import { buildRoutePoint } from "../fixtures/route";
import { buildStartFinishMarkerFeatures } from "@/utils/routeMarkers";
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

describe("route endpoint marker generation", () => {
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
});
