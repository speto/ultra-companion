import { describe, expect, it } from "vitest";
import {
  TEMPERATURE_COMFORT_STOPS,
  classifyTemperatureComfort,
  displayTemperatureC,
  temperatureColor,
} from "@/utils/temperatureOverlay";
import type { WeatherPoint } from "@/types";

describe("temperatureOverlay", () => {
  const point: WeatherPoint = {
    hourOffset: 0,
    phase: "route",
    sampleKind: "hourly",
    sampleKinds: ["hourly"],
    time: "2026-01-01T00:00:00.000Z",
    etaTime: "2026-01-01T00:00:00.000Z",
    temperatureC: 20,
    apparentTemperatureC: 16,
    dewPointC: 12,
    relativeHumidityPercent: 65,
    precipitationMm: 0,
    precipitationProbability: 0,
    windSpeedKmh: 10,
    windDirectionDeg: 180,
    windGustKmh: 15,
    weatherCode: 0,
    isDay: true,
    latitude: 48,
    longitude: 17,
    distanceAlongRouteM: 0,
    routeDistanceMeters: 0,
    routeBearingDeg: null,
  };

  it.each([
    [-8, "cold-risk", "#2563EB"],
    [0, "cold-risk", "#2563EB"],
    [4.9, "cold-risk", "#2563EB"],
    [5, "cool", "#0284C7"],
    [11.9, "cool", "#0284C7"],
    [12, "comfortable", "#0D9488"],
    [21.9, "comfortable", "#0D9488"],
    [22, "warm", "#D97706"],
    [29.9, "warm", "#D97706"],
    [30, "hot-risk", "#DC2626"],
    [38, "hot-risk", "#DC2626"],
  ] as const)("maps %s°C to %s with readable color %s", (temperatureC, bucket, color) => {
    expect(classifyTemperatureComfort(temperatureC)).toBe(bucket);
    expect(temperatureColor(temperatureC)).toBe(color);
  });

  it("treats non-finite temperatures as unknown instead of a misleading risk color", () => {
    expect(classifyTemperatureComfort(Number.NaN)).toBe("unknown");
    expect(classifyTemperatureComfort(Infinity)).toBe("unknown");
    expect(temperatureColor(Number.NaN)).toBe("#9C958E");
  });

  it("selects actual or feels-like display temperature with actual fallback", () => {
    expect(displayTemperatureC(point, "actual")).toBe(20);
    expect(displayTemperatureC(point, "feels-like")).toBe(16);
    expect(displayTemperatureC({ ...point, apparentTemperatureC: Number.NaN }, "feels-like")).toBe(
      20,
    );
  });

  it("keeps the legend stops in cold-to-hot display order", () => {
    expect(TEMPERATURE_COMFORT_STOPS.map((stop) => stop.bucket)).toEqual([
      "cold-risk",
      "cool",
      "comfortable",
      "warm",
      "hot-risk",
    ]);
  });
});
