import { describe, expect, it } from "vitest";
import { downsampleElevationM4 } from "@/utils/elevationLod";
import { buildRoutePoint } from "../fixtures/route";
import type { RoutePoint } from "@/types";

function point(distance: number, elevation: number | null, idx: number): RoutePoint {
  return { ...buildRoutePoint(distance, idx), elevationMeters: elevation };
}

describe("downsampleElevationM4", () => {
  it("returns original points when already under budget", () => {
    const points = [point(0, 100, 0), point(100, 110, 1)];
    expect(downsampleElevationM4(points, { maxPoints: 4 })).toBe(points);
  });

  it("preserves first and last points", () => {
    const points = Array.from({ length: 20 }, (_, idx) => point(idx * 100, 100 + idx, idx));
    const result = downsampleElevationM4(points, { maxPoints: 8 });
    expect(result[0]).toBe(points[0]);
    expect(result[result.length - 1]).toBe(points[points.length - 1]);
  });

  it("preserves bucket peaks and troughs", () => {
    const elevations = [100, 500, 110, 90, 120, 80, 450, 130, 140, 150];
    const points = elevations.map((elevation, idx) => point(idx * 100, elevation, idx));
    const result = downsampleElevationM4(points, { maxPoints: 8 });
    const keptElevations = result.map((p) => p.elevationMeters);

    expect(keptElevations).toContain(500);
    expect(keptElevations).toContain(80);
  });

  it("keeps nearest points for forced distance anchors including duplicate-distance seams", () => {
    const points = [
      point(0, 100, 0),
      point(100, 110, 1),
      point(200, 120, 2),
      point(200, 130, 3),
      point(300, 140, 4),
      point(400, 150, 5),
    ];
    const result = downsampleElevationM4(points, {
      maxPoints: 5,
      forcedDistancesMeters: [205],
    });

    expect(result.some((p) => p.idx === 2 || p.idx === 3)).toBe(true);
  });

  it("keeps forced anchors even when they exceed the nominal output budget", () => {
    const points = Array.from({ length: 20 }, (_, idx) => point(idx * 100, 100 + idx, idx));
    const result = downsampleElevationM4(points, {
      maxPoints: 4,
      forcedDistancesMeters: [300, 700, 1100, 1500],
    });
    const keptDistances = result.map((p) => p.distanceFromStartMeters);

    expect(keptDistances).toEqual(expect.arrayContaining([0, 300, 700, 1100, 1500, 1900]));
  });

  it("keeps output capped and ordered by route order", () => {
    const points = Array.from({ length: 60 }, (_, idx) => point(idx * 50, 100 + (idx % 7), idx));
    const result = downsampleElevationM4(points, { maxPoints: 12, forcedDistancesMeters: [500] });
    const resultIndices = result.map((p) => p.idx);

    expect(result.length).toBeLessThanOrEqual(12);
    expect(resultIndices).toEqual(resultIndices.toSorted((a, b) => a - b));
  });

  it("does not mutate input points", () => {
    const points = Array.from({ length: 20 }, (_, idx) => point(idx * 100, 100 + idx, idx));
    const before = points.map((p) => ({ ...p }));
    downsampleElevationM4(points, { maxPoints: 8, forcedDistancesMeters: [450] });
    expect(points).toEqual(before);
  });
});
