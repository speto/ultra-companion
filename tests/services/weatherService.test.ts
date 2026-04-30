import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWeatherTimeline } from "@/services/weatherService";
import type { HourlyForecast } from "@/services/weatherClient";
import type { RoutePoint } from "@/types";

const { mockFetchForecasts } = vi.hoisted(() => ({
  mockFetchForecasts: vi.fn(),
}));

vi.mock("@/services/weatherClient", () => ({
  fetchForecasts: mockFetchForecasts,
}));

function routePoint(distanceFromStartMeters: number, idx: number): RoutePoint {
  return {
    latitude: 48 + idx * 0.1,
    longitude: 17 + idx * 0.1,
    elevationMeters: 100,
    distanceFromStartMeters,
    idx,
  };
}

function forecast(latitude: number, longitude: number): HourlyForecast {
  return {
    latitude,
    longitude,
    hours: Array.from({ length: 24 }, (_, hour) => ({
      time: `2026-01-01T${String(hour).padStart(2, "0")}:00:00.000Z`,
      temperature2m: hour,
      apparentTemperature2m: hour - 2,
      dewPoint2m: hour - 4,
      relativeHumidity2m: 65,
      precipitation: 0,
      precipitationProbability: 0,
      weatherCode: 0,
      windSpeed10m: 10,
      windDirection10m: 180,
      windGusts10m: 15,
      isDay: 1,
    })),
  };
}

describe("weatherService", () => {
  afterEach(() => {
    vi.useRealTimers();
    mockFetchForecasts.mockReset();
  });

  it("uses planned projection start time to shift weather timeline alignment", async () => {
    const points = [routePoint(0, 0), routePoint(20_000, 1), routePoint(40_000, 2)];
    const cumulativeTime = [0, 3600, 7200];
    mockFetchForecasts.mockResolvedValue(
      points.map((point) => forecast(point.latitude, point.longitude)),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:30:00.000Z"));

    const currentTimeline = await buildWeatherTimeline(points, 0, cumulativeTime);
    const plannedTimeline = await buildWeatherTimeline(points, 0, cumulativeTime, {
      projectionStartTime: new Date("2026-01-01T12:30:00.000Z"),
    });

    expect(currentTimeline[0]).toMatchObject({
      time: "2026-01-01T10:00:00.000Z",
      temperatureC: 10,
      apparentTemperatureC: 8,
      dewPointC: 6,
      relativeHumidityPercent: 65,
    });
    expect(plannedTimeline[0]).toMatchObject({
      phase: "route",
      sampleKind: "hourly",
      sampleKinds: ["hourly"],
      time: "2026-01-01T12:00:00.000Z",
      etaTime: "2026-01-01T12:30:00.000Z",
      temperatureC: 12,
      apparentTemperatureC: 10,
      dewPointC: 8,
      relativeHumidityPercent: 65,
    });
    expect(plannedTimeline).toHaveLength(10);
    expect(plannedTimeline.map((point) => point.sampleKind)).toEqual([
      "hourly",
      "distance",
      "hourly",
      "distance",
      "hourly",
      "post-finish",
      "post-finish",
      "post-finish",
      "post-finish",
      "post-finish",
    ]);
    expect(plannedTimeline.map((point) => point.sampleKinds)).toEqual([
      ["hourly"],
      ["distance"],
      ["hourly", "distance"],
      ["distance"],
      ["hourly", "finish"],
      ["post-finish"],
      ["post-finish"],
      ["post-finish"],
      ["post-finish"],
      ["post-finish"],
    ]);
    expect(plannedTimeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sampleKind: "hourly",
          sampleKinds: ["hourly", "finish"],
          routeDistanceMeters: 40_000,
        }),
      ]),
    );
    expect(plannedTimeline.some((point) => point.sampleKind === "finish")).toBe(false);
    expect(plannedTimeline[0].apparentTemperatureC).toBe(10);
    expect(plannedTimeline.slice(3)).toEqual(
      expect.arrayContaining([expect.objectContaining({ phase: "post-finish" })]),
    );
    expect(mockFetchForecasts).toHaveBeenLastCalledWith(expect.any(Array), 24);
  });

  it("samples the full remaining route for all-route weather coverage", async () => {
    const points = Array.from({ length: 14 }, (_, index) => routePoint(index * 20_000, index));
    const cumulativeTime = points.map((_, index) => index * 3600);
    mockFetchForecasts.mockResolvedValue(
      points.map((point) => forecast(point.latitude, point.longitude)),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:30:00.000Z"));

    const timeline = await buildWeatherTimeline(points, 0, cumulativeTime);

    expect(timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: "route", routeDistanceMeters: 260_000 }),
      ]),
    );
    expect(timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sampleKind: "hourly", routeDistanceMeters: 0 }),
        expect.objectContaining({ sampleKind: "distance", routeDistanceMeters: 10_000 }),
      ]),
    );
    expect(mockFetchForecasts).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ latitude: points[points.length - 1].latitude }),
      ]),
      expect.any(Number),
    );
  });

  it("marks the final guard row as finish when no prior sample already covers finish", async () => {
    const points = [routePoint(0, 0), routePoint(10_000, 1), routePoint(25_000, 2)];
    const cumulativeTime = [0, 1800, 5400];
    mockFetchForecasts.mockResolvedValue(
      points.map((point) => forecast(point.latitude, point.longitude)),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:30:00.000Z"));

    const timeline = await buildWeatherTimeline(points, 0, cumulativeTime);

    expect(timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sampleKind: "finish",
          sampleKinds: ["finish"],
          routeDistanceMeters: 25_000,
        }),
      ]),
    );
  });
});
