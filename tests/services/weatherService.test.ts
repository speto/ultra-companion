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
      precipitation: 0,
      precipitationProbability: 0,
      weatherCode: 0,
      windSpeed10m: 10,
      windDirection10m: 180,
      windGusts10m: 15,
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
    });
    expect(plannedTimeline[0]).toMatchObject({
      time: "2026-01-01T12:00:00.000Z",
      temperatureC: 12,
    });
  });
});
