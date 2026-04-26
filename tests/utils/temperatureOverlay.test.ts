import { describe, expect, it } from "vitest";
import {
  TEMPERATURE_COMFORT_STOPS,
  classifyTemperatureComfort,
  temperatureColor,
} from "@/utils/temperatureOverlay";

describe("temperatureOverlay", () => {
  it.each([
    [-8, "cold-risk", "#2563EB"],
    [0, "cold-risk", "#2563EB"],
    [4.9, "cold-risk", "#2563EB"],
    [5, "cool", "#38BDF8"],
    [11.9, "cool", "#38BDF8"],
    [12, "comfortable", "#22C55E"],
    [21.9, "comfortable", "#22C55E"],
    [22, "warm", "#F59E0B"],
    [29.9, "warm", "#F59E0B"],
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
