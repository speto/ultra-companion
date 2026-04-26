import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockMMKV, reactNativeMmkvMocks } from "../mocks/reactNativeMmkv";

vi.mock("react-native-mmkv", () => ({
  createMMKV: createMockMMKV,
}));

vi.mock("@/store/offlineStore", () => ({
  useOfflineStore: {
    getState: () => ({ isConnected: true }),
  },
}));

const { mockBuildWeatherTimeline } = vi.hoisted(() => ({
  mockBuildWeatherTimeline: vi.fn(),
}));

vi.mock("@/services/weatherService", () => ({
  buildWeatherTimeline: mockBuildWeatherTimeline,
}));

async function loadWeatherStore() {
  return (await import("@/store/weatherStore")).useWeatherStore;
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
      time: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      temperatureC: 20,
      precipitationMm: 0,
      precipitationProbability: 0,
      windSpeedKmh: 10,
      windDirectionDeg: 180,
      windGustKmh: 15,
      weatherCode: 0,
      latitude: 48,
      longitude: 17,
      distanceAlongRouteM: 0,
      routeBearingDeg: null,
    },
  ];
}

describe("weatherStore planned start", () => {
  beforeEach(() => {
    vi.resetModules();
    reactNativeMmkvMocks.getString.mockReset();
    reactNativeMmkvMocks.set.mockReset();
    // Default: no persisted data
    reactNativeMmkvMocks.getString.mockReturnValue(null);
    mockBuildWeatherTimeline.mockReset();
    mockBuildWeatherTimeline.mockResolvedValue(makeWeatherTimeline());
  });

  it("defaults plannedStart to null when nothing persisted", async () => {
    const useWeatherStore = await loadWeatherStore();
    expect(useWeatherStore.getState().plannedStart).toBeNull();
  });

  it("hydrates plannedStart from MMKV on store init", async () => {
    const ts = 1745500000000;
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "plannedStart") return ts.toString();
      return null;
    });

    const useWeatherStore = await loadWeatherStore();
    expect(useWeatherStore.getState().plannedStart).toBe(ts);
  });

  it("persists plannedStart via setPlannedStart", async () => {
    const useWeatherStore = await loadWeatherStore();
    const ts = Date.now() + 6 * 3600_000;

    useWeatherStore.getState().setPlannedStart(ts);

    expect(useWeatherStore.getState().plannedStart).toBe(ts);
    expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("plannedStart", ts.toString());
  });

  it("clears plannedStart via setPlannedStart(null)", async () => {
    const ts = Date.now() + 6 * 3600_000;
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "plannedStart") return ts.toString();
      return null;
    });

    const useWeatherStore = await loadWeatherStore();
    expect(useWeatherStore.getState().plannedStart).toBe(ts);

    useWeatherStore.getState().setPlannedStart(null);

    expect(useWeatherStore.getState().plannedStart).toBeNull();
    // Clearing sets the key to empty string (MMKV pattern for deletion)
    expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("plannedStart", "");
  });

  it("passes projectionStartTime to buildWeatherTimeline when plannedStart is set", async () => {
    const points = [makeRoutePoint(0, 0), makeRoutePoint(20_000, 1)];
    const cumulativeTime = [0, 3600];
    const ts = 1745500000000;

    const useWeatherStore = await loadWeatherStore();
    useWeatherStore.getState().setPlannedStart(ts);

    await useWeatherStore.getState().fetchWeather("route-1", points, 0, cumulativeTime);

    expect(mockBuildWeatherTimeline).toHaveBeenCalledWith(points, 0, cumulativeTime, {
      projectionStartTime: new Date(ts),
    });
    expect(useWeatherStore.getState().fetchStatus).toBe("done");
    // Verify the cache includes plannedStart
    expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("cache", expect.any(String));
    const cacheCall = reactNativeMmkvMocks.set.mock.calls.find((call) => call[0] === "cache");
    expect(cacheCall).toBeDefined();
    const cached = JSON.parse(cacheCall?.[1] ?? "{}");
    expect(cached.plannedStart).toBe(ts);
  });

  it("clearing plannedStart fetches with current-time semantics", async () => {
    const points = [makeRoutePoint(0, 0), makeRoutePoint(20_000, 1)];
    const cumulativeTime = [0, 3600];
    const ts = 1745500000000;

    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "plannedStart") return ts.toString();
      return null;
    });

    const useWeatherStore = await loadWeatherStore();
    useWeatherStore.getState().setPlannedStart(null);

    await useWeatherStore.getState().fetchWeather("route-1", points, 0, cumulativeTime);

    expect(mockBuildWeatherTimeline).toHaveBeenCalledWith(points, 0, cumulativeTime, {});
  });

  it("refetches when fresh cached weather was computed for a different plannedStart", async () => {
    const points = [makeRoutePoint(0, 0), makeRoutePoint(20_000, 1)];
    const cumulativeTime = [0, 3600];
    const oldTs = 1745500000000;
    const newTs = 1745510000000;

    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "plannedStart") return newTs.toString();
      if (key === "cache") {
        return JSON.stringify({
          timeline: makeWeatherTimeline(),
          fetchedAt: Date.now() - 1000,
          routeId: "route-1",
          plannedStart: oldTs,
        });
      }
      return null;
    });

    const useWeatherStore = await loadWeatherStore();

    await useWeatherStore.getState().fetchWeather("route-1", points, 0, cumulativeTime);

    expect(mockBuildWeatherTimeline).toHaveBeenCalledWith(points, 0, cumulativeTime, {
      projectionStartTime: new Date(newTs),
    });
  });

  it("cache is stale when plannedStart differs from persisted value", async () => {
    // Persist plannedStart = X, but store has plannedStart = Y
    const oldTs = 1745500000000;
    const newTs = 1745510000000;

    // Simulate: cache has plannedStart = oldTs, but user changed to newTs
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "plannedStart") return newTs.toString();
      if (key === "cache") {
        return JSON.stringify({
          timeline: [],
          fetchedAt: Date.now() - 1000, // fresh by time
          routeId: "route-1",
          plannedStart: oldTs, // different from current plannedStart
        });
      }
      return null;
    });

    const useWeatherStore = await loadWeatherStore();

    // Store should treat cache as stale because plannedStart differs
    expect(useWeatherStore.getState().fetchStatus).toBe("idle");
    expect(useWeatherStore.getState().timeline).toEqual([]);
  });
  it("cache is fresh when plannedStart matches persisted value", async () => {
    const ts = 1745500000000;
    const timeline = [
      {
        hourOffset: 0,
        time: new Date().toISOString(),
        temperatureC: 20,
        precipitationMm: 0,
        precipitationProbability: 0,
        windSpeedKmh: 10,
        windDirectionDeg: 180,
        windGustKmh: 15,
        weatherCode: 0,
        latitude: 48,
        longitude: 17,
        distanceAlongRouteM: 0,
        routeBearingDeg: null,
      },
    ];

    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "plannedStart") return ts.toString();
      if (key === "cache") {
        return JSON.stringify({
          timeline,
          fetchedAt: Date.now() - 1000,
          routeId: "route-1",
          plannedStart: ts,
        });
      }
      return null;
    });

    const useWeatherStore = await loadWeatherStore();

    expect(useWeatherStore.getState().fetchStatus).toBe("done");
    expect(useWeatherStore.getState().timeline).toEqual(timeline);
  });
});
