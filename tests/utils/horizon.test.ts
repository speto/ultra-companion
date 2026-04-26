import { describe, expect, it } from "vitest";
import { horizonLabel, horizonToMeters, horizonWindow, zoomToHorizon } from "@/utils/horizon";

describe("horizonLabel", () => {
  it("returns km number as string for numeric horizon choices", () => {
    expect(horizonLabel(10)).toBe("10");
    expect(horizonLabel(20)).toBe("20");
    expect(horizonLabel(50)).toBe("50");
    expect(horizonLabel(100)).toBe("100");
    expect(horizonLabel(200)).toBe("200");
  });

  it('returns "Whole route" for null', () => {
    expect(horizonLabel(null)).toBe("Whole route");
  });
});

describe("horizonToMeters", () => {
  it("converts km to meters", () => {
    expect(horizonToMeters(10)).toBe(10_000);
    expect(horizonToMeters(50)).toBe(50_000);
    expect(horizonToMeters(200)).toBe(200_000);
  });

  it("returns null for whole-route", () => {
    expect(horizonToMeters(null)).toBeNull();
  });
});

describe("horizonWindow", () => {
  it("returns rider-to-end for whole-route (null horizon)", () => {
    const result = horizonWindow(5000, null, 100_000);
    expect(result).toEqual({ startDist: 5000, endDist: 100_000 });
  });

  it("returns rider-to-rider+lookAhead for numeric horizon", () => {
    const result = horizonWindow(5000, 50, 100_000);
    expect(result).toEqual({ startDist: 5000, endDist: 55_000 });
  });

  it("clamps endDist to totalDistance when lookAhead exceeds route length", () => {
    const result = horizonWindow(95_000, 50, 100_000);
    expect(result).toEqual({ startDist: 95_000, endDist: 100_000 });
  });

  it("works at the start of a route (riderDist = 0)", () => {
    const result = horizonWindow(0, 20, 100_000);
    expect(result).toEqual({ startDist: 0, endDist: 20_000 });
  });

  it("handles 10km horizon", () => {
    const result = horizonWindow(30_000, 10, 100_000);
    expect(result).toEqual({ startDist: 30_000, endDist: 40_000 });
  });
});

describe("zoomToHorizon", () => {
  it("maps close zoom levels to shorter horizon buckets", () => {
    expect(zoomToHorizon(15)).toBe(10);
    expect(zoomToHorizon(13)).toBe(20);
    expect(zoomToHorizon(11)).toBe(50);
  });

  it("maps wide zoom levels to longer horizon buckets and whole route", () => {
    expect(zoomToHorizon(9.5)).toBe(100);
    expect(zoomToHorizon(8)).toBe(200);
    expect(zoomToHorizon(7)).toBeNull();
  });
});
