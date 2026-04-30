import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockMMKV, reactNativeMmkvMocks } from "../mocks/reactNativeMmkv";

vi.mock("react-native-mmkv", () => ({
  createMMKV: createMockMMKV,
}));

const { mockIsConnected } = vi.hoisted(() => ({
  mockIsConnected: { value: true },
}));

vi.mock("@/store/offlineStore", () => ({
  useOfflineStore: {
    getState: () => ({ isConnected: mockIsConnected.value }),
  },
}));

const { mockFetchWeatherForecastsForRoute, mockBuildWeatherTimelineFromForecasts } = vi.hoisted(
  () => ({
    mockFetchWeatherForecastsForRoute: vi.fn(),
    mockBuildWeatherTimelineFromForecasts: vi.fn(),
  }),
);

vi.mock("@/services/weatherService", () => ({
  fetchWeatherForecastsForRoute: mockFetchWeatherForecastsForRoute,
  buildWeatherTimelineFromForecasts: mockBuildWeatherTimelineFromForecasts,
}));

async function loadWeatherStore() {
  return (await import("@/store/weatherStore")).useWeatherStore;
}

async function loadWeatherStartResolver() {
  return (await import("@/store/weatherStore")).resolveEffectiveWeatherStart;
}

function makeRoutePoint(distanceFromStartMeters: number, idx: number) {
  return {
    latitude: 48 + idx * 0.1,
    longitude: 17 + idx * 0.1,
    elevationMeters: 100,
    distanceFromStartMeters,
    idx,
  };
}

function makeWeatherTimeline() {
  return [
    {
      hourOffset: 0,
      phase: "route" as const,
      sampleKind: "hourly" as const,
      sampleKinds: ["hourly"] as const,
      time: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      etaTime: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      temperatureC: 20,
      apparentTemperatureC: 18,
      dewPointC: 14,
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
    },
  ];
}

function makeForecasts() {
  return [
    {
      latitude: 48,
      longitude: 17,
      hours: [
        {
          time: new Date("2026-01-01T00:00:00.000Z").toISOString(),
          temperature2m: 20,
          apparentTemperature2m: 18,
          dewPoint2m: 14,
          relativeHumidity2m: 65,
          precipitation: 0,
          precipitationProbability: 0,
          weatherCode: 0,
          windSpeed10m: 10,
          windDirection10m: 180,
          windGusts10m: 15,
          isDay: 1,
        },
      ],
    },
  ];
}

function makeBuildResult(overrides: Record<string, unknown> = {}) {
  return {
    timeline: makeWeatherTimeline(),
    routeCoverageFromMeters: 0,
    routeCoverageUntilMeters: 20_000,
    forecastFromMs: new Date("2026-01-01T00:00:00.000Z").getTime(),
    forecastUntilMs: new Date("2026-01-01T23:00:00.000Z").getTime(),
    ...overrides,
  };
}

function makeCachedWeather(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 8,
    timeline: makeWeatherTimeline(),
    forecasts: makeForecasts(),
    fetchedAt: Date.now() - 1000,
    routeId: "route-1",
    plannedStartMs: null,
    fromIndex: 0,
    forecastFromMs: null,
    forecastUntilMs: null,
    routeCoverageFromMeters: 0,
    routeCoverageUntilMeters: 20_000,
    ...overrides,
  });
}

function makeContext(plannedStartMs: number | null = null) {
  return {
    routeId: "route-1",
    points: [makeRoutePoint(0, 0), makeRoutePoint(20_000, 1)],
    fromIndex: 0,
    cumulativeTime: [0, 3600],
    plannedStartMs,
    refreshMode: "automatic" as const,
  };
}

describe("weatherStore explicit refresh APIs", () => {
  beforeEach(() => {
    vi.resetModules();
    reactNativeMmkvMocks.getString.mockReset();
    reactNativeMmkvMocks.set.mockReset();
    reactNativeMmkvMocks.getString.mockReturnValue(null);
    mockFetchWeatherForecastsForRoute.mockReset();
    mockFetchWeatherForecastsForRoute.mockResolvedValue(makeForecasts());
    mockBuildWeatherTimelineFromForecasts.mockReset();
    mockBuildWeatherTimelineFromForecasts.mockReturnValue(makeBuildResult());
    mockIsConnected.value = true;
  });

  it("starts with weather-specific state only", async () => {
    const useWeatherStore = await loadWeatherStore();

    expect(useWeatherStore.getState().timeline).toEqual([]);
    expect(useWeatherStore.getState().plannedStartMs).toBeNull();
    expect(useWeatherStore.getState().fromIndex).toBeNull();
    expect(useWeatherStore.getState().fetchStatus).toBe("idle");
    expect(useWeatherStore.getState().lastRefreshOutcome).toBe("idle");
    expect(useWeatherStore.getState().lastRefreshMessage).toBeNull();
    expect(useWeatherStore.getState().lastManualRefreshFeedbackAtMs).toBeNull();
  });

  it("resolves future weather override before collection planned start", async () => {
    const resolveEffectiveWeatherStart = await loadWeatherStartResolver();
    const nowMs = 1_000;

    expect(
      resolveEffectiveWeatherStart({
        hasOverride: true,
        overrideStartMs: 3_000,
        collectionPlannedStartMs: 2_000,
        nowMs,
      }),
    ).toBe(3_000);
  });

  it("ignores past collection planned starts for weather", async () => {
    const resolveEffectiveWeatherStart = await loadWeatherStartResolver();

    expect(
      resolveEffectiveWeatherStart({
        hasOverride: false,
        overrideStartMs: null,
        collectionPlannedStartMs: 500,
        nowMs: 1_000,
      }),
    ).toBeNull();
  });

  it("treats a now override as current-time weather even with a future collection start", async () => {
    const resolveEffectiveWeatherStart = await loadWeatherStartResolver();

    expect(
      resolveEffectiveWeatherStart({
        hasOverride: true,
        overrideStartMs: null,
        collectionPlannedStartMs: 3_000,
        nowMs: 1_000,
      }),
    ).toBeNull();
  });

  it("passes projectionStartTime from context to fetch and rebuild timeline", async () => {
    const ts = 1745500000000;
    const context = makeContext(ts);
    const useWeatherStore = await loadWeatherStore();

    await useWeatherStore.getState().ensureWeatherFresh(context);

    expect(mockFetchWeatherForecastsForRoute).toHaveBeenCalledWith(
      context.points,
      0,
      context.cumulativeTime,
      {
        projectionStartTime: new Date(ts),
      },
    );
    expect(mockBuildWeatherTimelineFromForecasts).toHaveBeenCalledWith(
      context.points,
      0,
      context.cumulativeTime,
      makeForecasts(),
      {
        projectionStartTime: new Date(ts),
      },
    );
    expect(useWeatherStore.getState().fetchStatus).toBe("done");
  });

  it("stores route coverage with absolute route distances", async () => {
    const timeline = [
      { ...makeWeatherTimeline()[0], distanceAlongRouteM: 0, routeDistanceMeters: 42_000 },
    ];
    mockBuildWeatherTimelineFromForecasts.mockReturnValue(
      makeBuildResult({
        timeline,
        routeCoverageFromMeters: 42_000,
        routeCoverageUntilMeters: 42_000,
      }),
    );
    const useWeatherStore = await loadWeatherStore();

    await useWeatherStore.getState().ensureWeatherFresh(makeContext());

    expect(useWeatherStore.getState().routeCoverageFromMeters).toBe(42_000);
    expect(useWeatherStore.getState().routeCoverageUntilMeters).toBe(42_000);
  });

  it("restores stale cached data so manual/offline use can still show it", async () => {
    const timeline = makeWeatherTimeline();
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "cache") {
        return JSON.stringify({
          version: 8,
          timeline,
          forecasts: makeForecasts(),
          fetchedAt: Date.now() - 2 * 3600_000,
          routeId: "route-1",
          plannedStartMs: null,
          fromIndex: 0,
          forecastFromMs: null,
          forecastUntilMs: null,
          routeCoverageFromMeters: null,
          routeCoverageUntilMeters: null,
        });
      }
      return null;
    });
    const useWeatherStore = await loadWeatherStore();

    expect(useWeatherStore.getState().timeline).toEqual(timeline);
    expect(useWeatherStore.getState().lastSuccessfulFetchAtMs).not.toBeNull();

    await useWeatherStore
      .getState()
      .ensureWeatherFresh({ ...makeContext(), refreshMode: "manual" });

    expect(mockFetchWeatherForecastsForRoute).not.toHaveBeenCalled();
  });

  it("refreshWeatherNow bypasses manual freshness semantics", async () => {
    const context = { ...makeContext(), refreshMode: "manual" as const };
    const useWeatherStore = await loadWeatherStore();

    await useWeatherStore.getState().refreshWeatherNow(context);

    expect(mockFetchWeatherForecastsForRoute).toHaveBeenCalledTimes(1);
  });

  it("skips duplicate manual refresh when the same coverage is already fresh", async () => {
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "cache") return makeCachedWeather();
      return null;
    });
    const useWeatherStore = await loadWeatherStore();

    await useWeatherStore.getState().refreshWeatherNow({ ...makeContext(), refreshMode: "manual" });

    expect(mockFetchWeatherForecastsForRoute).not.toHaveBeenCalled();
    expect(useWeatherStore.getState().lastAttemptedAtMs).not.toBeNull();
    expect(useWeatherStore.getState().lastRefreshOutcome).toBe("skipped-fresh");
    expect(useWeatherStore.getState().lastRefreshMessage).toBe("Already up to date");
    expect(useWeatherStore.getState().lastManualRefreshFeedbackAtMs).not.toBeNull();
  });

  it("records manual context-unavailable feedback without clearing timeline", async () => {
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "cache") return makeCachedWeather();
      return null;
    });
    const useWeatherStore = await loadWeatherStore();
    const timeline = useWeatherStore.getState().timeline;

    useWeatherStore.getState().recordManualRefreshUnavailable("Select a route to refresh weather");

    expect(useWeatherStore.getState().lastRefreshOutcome).toBe("unavailable");
    expect(useWeatherStore.getState().lastRefreshMessage).toBe("Select a route to refresh weather");
    expect(useWeatherStore.getState().lastManualRefreshFeedbackAtMs).not.toBeNull();
    expect(useWeatherStore.getState().timeline).toEqual(timeline);
  });

  it("manual refresh rebuilds from fresh raw cache when start context changes", async () => {
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "cache") return makeCachedWeather();
      return null;
    });
    const useWeatherStore = await loadWeatherStore();

    await useWeatherStore.getState().refreshWeatherNow(makeContext(1745500000000));

    expect(mockFetchWeatherForecastsForRoute).not.toHaveBeenCalled();
    expect(mockBuildWeatherTimelineFromForecasts).toHaveBeenCalled();
    expect(useWeatherStore.getState().plannedStartMs).toBe(1745500000000);
  });

  it("manual refresh rebuilds from fresh raw cache when old timeline coverage was incomplete", async () => {
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "cache") return makeCachedWeather({ routeCoverageUntilMeters: 10_000 });
      return null;
    });
    const useWeatherStore = await loadWeatherStore();

    await useWeatherStore.getState().refreshWeatherNow(makeContext(1745500000000));

    expect(mockFetchWeatherForecastsForRoute).not.toHaveBeenCalled();
    expect(mockBuildWeatherTimelineFromForecasts).toHaveBeenCalled();
    expect(useWeatherStore.getState().routeCoverageUntilMeters).toBe(20_000);
    expect(useWeatherStore.getState().plannedStartMs).toBe(1745500000000);
  });

  it("manual refresh fetches when cached route coverage is incomplete", async () => {
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "cache") return makeCachedWeather({ routeCoverageUntilMeters: 10_000 });
      return null;
    });
    const useWeatherStore = await loadWeatherStore();

    await useWeatherStore.getState().refreshWeatherNow({ ...makeContext(), refreshMode: "manual" });

    expect(mockFetchWeatherForecastsForRoute).toHaveBeenCalledTimes(1);
  });

  it("automatic ensure retries after a previous failure even with fresh cached data", async () => {
    const timeline = makeWeatherTimeline();
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "cache") {
        return JSON.stringify({
          version: 8,
          timeline,
          forecasts: makeForecasts(),
          fetchedAt: Date.now() - 1000,
          routeId: "route-1",
          plannedStartMs: null,
          fromIndex: 0,
          forecastFromMs: null,
          forecastUntilMs: null,
          routeCoverageFromMeters: null,
          routeCoverageUntilMeters: null,
        });
      }
      return null;
    });
    const useWeatherStore = await loadWeatherStore();

    mockIsConnected.value = false;
    await useWeatherStore.getState().refreshWeatherNow(makeContext());
    mockIsConnected.value = true;
    await useWeatherStore.getState().ensureWeatherFresh(makeContext());

    expect(mockFetchWeatherForecastsForRoute).toHaveBeenCalledTimes(1);
  });

  it("records offline failures without clearing cached timeline", async () => {
    const timeline = makeWeatherTimeline();
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "cache") {
        return JSON.stringify({
          version: 8,
          timeline,
          forecasts: makeForecasts(),
          fetchedAt: Date.now() - 1000,
          routeId: "route-1",
          plannedStartMs: null,
          fromIndex: 0,
          forecastFromMs: null,
          forecastUntilMs: null,
          routeCoverageFromMeters: null,
          routeCoverageUntilMeters: null,
        });
      }
      return null;
    });
    mockIsConnected.value = false;
    const useWeatherStore = await loadWeatherStore();

    await useWeatherStore.getState().refreshWeatherNow({ ...makeContext(), refreshMode: "manual" });

    expect(useWeatherStore.getState().fetchStatus).toBe("error");
    expect(useWeatherStore.getState().lastError).toBe("Offline");
    expect(useWeatherStore.getState().lastRefreshOutcome).toBe("error");
    expect(useWeatherStore.getState().lastRefreshMessage).toBe("Offline");
    expect(useWeatherStore.getState().timeline).toEqual(timeline);
  });

  it("records automatic offline failures for status display", async () => {
    mockIsConnected.value = false;
    const useWeatherStore = await loadWeatherStore();

    await useWeatherStore.getState().ensureWeatherFresh(makeContext());

    expect(useWeatherStore.getState().fetchStatus).toBe("error");
    expect(useWeatherStore.getState().lastError).toBe("Offline");
    expect(useWeatherStore.getState().lastFailedFetchAtMs).not.toBeNull();
    expect(useWeatherStore.getState().lastRefreshOutcome).toBe("error");
    expect(useWeatherStore.getState().lastRefreshMessage).toBe("Offline");
    expect(useWeatherStore.getState().lastManualRefreshFeedbackAtMs).toBeNull();
  });

  it("records automatic fetch failures for status display", async () => {
    mockFetchWeatherForecastsForRoute.mockRejectedValue(new Error("Network request failed"));
    const useWeatherStore = await loadWeatherStore();

    await useWeatherStore.getState().ensureWeatherFresh(makeContext());

    expect(useWeatherStore.getState().fetchStatus).toBe("error");
    expect(useWeatherStore.getState().lastError).toBe("Network request failed");
    expect(useWeatherStore.getState().lastFailedFetchAtMs).not.toBeNull();
    expect(useWeatherStore.getState().lastRefreshOutcome).toBe("error");
    expect(useWeatherStore.getState().lastRefreshMessage).toBe("Network request failed");
    expect(useWeatherStore.getState().lastManualRefreshFeedbackAtMs).toBeNull();
  });

  it("treats zero fetched forecasts as failure and preserves cached timeline", async () => {
    const timeline = makeWeatherTimeline();
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "cache") {
        return makeCachedWeather({
          fetchedAt: Date.now() - 2 * 3600_000,
          routeCoverageUntilMeters: 10_000,
          timeline,
        });
      }
      return null;
    });
    mockFetchWeatherForecastsForRoute.mockResolvedValue([]);
    const useWeatherStore = await loadWeatherStore();
    mockBuildWeatherTimelineFromForecasts.mockClear();

    await useWeatherStore.getState().refreshWeatherNow({ ...makeContext(), refreshMode: "manual" });

    expect(mockFetchWeatherForecastsForRoute).toHaveBeenCalledTimes(1);
    expect(mockBuildWeatherTimelineFromForecasts).not.toHaveBeenCalled();
    expect(reactNativeMmkvMocks.set).not.toHaveBeenCalledWith("cache", expect.any(String));
    expect(useWeatherStore.getState().fetchStatus).toBe("error");
    expect(useWeatherStore.getState().lastFailedFetchAtMs).not.toBeNull();
    expect(useWeatherStore.getState().lastError).toBe("No weather forecasts returned");
    expect(useWeatherStore.getState().lastRefreshOutcome).toBe("error");
    expect(useWeatherStore.getState().lastRefreshMessage).toBe("No weather forecasts returned");
    expect(useWeatherStore.getState().timeline).toEqual(timeline);
  });

  it("ignores old weather cache versions so timelines can refresh with new fields", async () => {
    const timeline = makeWeatherTimeline();
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "cache") {
        return JSON.stringify({
          version: 7,
          timeline,
          fetchedAt: Date.now() - 1000,
          routeId: "route-1",
          plannedStartMs: null,
          fromIndex: 0,
          forecastFromMs: null,
          forecastUntilMs: null,
          routeCoverageFromMeters: null,
          routeCoverageUntilMeters: null,
        });
      }
      return null;
    });

    const useWeatherStore = await loadWeatherStore();

    expect(useWeatherStore.getState().timeline).toEqual([]);
  });
});
