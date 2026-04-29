import { describe, expect, it } from "vitest";
import {
  endpointsLookSame,
  getNextFocusTarget,
  isCenteredOn,
  metersPerPixel,
} from "@/utils/mapFocus";

const gps = { latitude: 48.2, longitude: 16.37 };
const distantGps = { latitude: 48.0, longitude: 16.0 };
const start = { latitude: 48.21, longitude: 16.39 };
const finish = { latitude: 48.5, longitude: 16.8 };

describe("map focus helpers", () => {
  it("converts meters per pixel from latitude and zoom", () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(156543.03, 1);
    expect(metersPerPixel(48, 12)).toBeCloseTo(25.55, 1);
  });

  it("detects camera centering with pixel tolerance", () => {
    expect(isCenteredOn([16.3701, 48.2], gps, 14, 24)).toBe(true);
    expect(isCenteredOn([16.5, 48.2], gps, 14, 24)).toBe(false);
  });

  it("collapses endpoints when they visually overlap at the current zoom", () => {
    const nearbyFinish = { latitude: 48.2102, longitude: 16.3902 };

    expect(endpointsLookSame(start, nearbyFinish, 10, 40)).toBe(true);
    expect(endpointsLookSame(start, nearbyFinish, 18, 40)).toBe(false);
  });

  it("cycles gps to start to finish to gps for distinct endpoints", () => {
    expect(
      getNextFocusTarget({
        cameraCenter: [16.37, 48.2],
        zoom: 13,
        gpsPosition: gps,
        start,
        finish,
      }),
    ).toBe("start");
    expect(
      getNextFocusTarget({
        cameraCenter: [16.39, 48.21],
        zoom: 13,
        gpsPosition: gps,
        start,
        finish,
      }),
    ).toBe("finish");
    expect(
      getNextFocusTarget({ cameraCenter: [16.8, 48.5], zoom: 13, gpsPosition: gps, start, finish }),
    ).toBe("gps");
  });

  it("cycles gps to combined to gps when endpoints visually overlap", () => {
    const loopFinish = { latitude: 48.2102, longitude: 16.3902 };

    expect(
      getNextFocusTarget({
        cameraCenter: [16.37, 48.2],
        zoom: 10,
        gpsPosition: gps,
        start,
        finish: loopFinish,
      }),
    ).toBe("combined");
    expect(
      getNextFocusTarget({
        cameraCenter: [16.3901, 48.2101],
        zoom: 10,
        gpsPosition: distantGps,
        start,
        finish: loopFinish,
      }),
    ).toBe("gps");
  });

  it("returns GPS-only behavior when there is no route target", () => {
    expect(getNextFocusTarget({ cameraCenter: [0, 0], zoom: 12, gpsPosition: gps })).toBe("gps");
  });

  it("falls through to route focus after GPS cannot be attempted", () => {
    expect(
      getNextFocusTarget({
        cameraCenter: [0, 0],
        zoom: 13,
        gpsPosition: null,
        start,
        finish,
        canAttemptGps: false,
      }),
    ).toBe("start");
  });
});
