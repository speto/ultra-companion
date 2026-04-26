import { create } from "zustand";
import { createMMKV, type MMKV } from "react-native-mmkv";
import type { WeatherPoint, WeatherFetchStatus, RoutePoint } from "@/types";
import { WEATHER_STALE_MS } from "@/constants";
import { buildWeatherTimeline } from "@/services/weatherService";
import { useOfflineStore } from "./offlineStore";

let storage: MMKV | null = null;

function getStorage(): MMKV {
  if (!storage) {
    storage = createMMKV({ id: "weather" });
  }
  return storage;
}

interface CachedWeather {
  timeline: WeatherPoint[];
  fetchedAt: number;
  routeId: string;
  plannedStart: number | null;
}

function loadCache(): CachedWeather | null {
  try {
    const raw = getStorage().getString("cache");
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function persistCache(cache: CachedWeather): void {
  try {
    getStorage().set("cache", JSON.stringify(cache));
  } catch {}
}

function clearCache(): void {
  try {
    getStorage().set("cache", "");
  } catch {}
}

function loadPlannedStart(): number | null {
  try {
    const raw = getStorage().getString("plannedStart");
    if (raw) return parseInt(raw, 10);
  } catch {}
  return null;
}

function persistPlannedStart(time: number | null): void {
  try {
    if (time === null) {
      getStorage().set("plannedStart", "");
    } else {
      getStorage().set("plannedStart", time.toString());
    }
  } catch {}
}

interface WeatherState {
  timeline: WeatherPoint[];
  fetchedAt: number | null;
  routeId: string | null;
  fetchStatus: WeatherFetchStatus;
  error: string | null;
  plannedStart: number | null;

  fetchWeather: (
    routeId: string,
    points: RoutePoint[],
    fromIndex: number,
    cumulativeTime: number[],
  ) => Promise<void>;
  clearWeather: () => void;
  setPlannedStart: (time: number | null) => void;
}

export const useWeatherStore = create<WeatherState>((set, get) => {
  const cached = loadCache();
  const initialPlannedStart = loadPlannedStart();
  // Mark cached data as stale if older than threshold or if plannedStart differs
  const cacheIsFresh =
    cached?.fetchedAt &&
    Date.now() - cached.fetchedAt < WEATHER_STALE_MS &&
    cached.plannedStart === initialPlannedStart;

  return {
    timeline: cacheIsFresh ? (cached?.timeline ?? []) : [],
    fetchedAt: cacheIsFresh ? (cached?.fetchedAt ?? null) : null,
    routeId: cacheIsFresh ? (cached?.routeId ?? null) : null,
    fetchStatus: cacheIsFresh && cached?.timeline?.length ? "done" : "idle",
    error: null,
    plannedStart: initialPlannedStart,

    fetchWeather: async (routeId, points, fromIndex, cumulativeTime) => {
      const state = get();

      // Skip if already fetching
      if (state.fetchStatus === "fetching") return;

      const isConnected = useOfflineStore.getState().isConnected;
      if (!isConnected) return;

      const cachedData = loadCache();

      // Don't refetch if we have fresh data for the same route and same plannedStart
      if (
        state.routeId === routeId &&
        state.fetchedAt &&
        Date.now() - state.fetchedAt < WEATHER_STALE_MS &&
        state.timeline.length > 0 &&
        cachedData?.plannedStart === state.plannedStart
      ) {
        return;
      }

      set({ fetchStatus: "fetching", error: null });

      try {
        const options = state.plannedStart
          ? { projectionStartTime: new Date(state.plannedStart) }
          : {};
        const timeline = await buildWeatherTimeline(points, fromIndex, cumulativeTime, options);

        const cache: CachedWeather = {
          timeline,
          fetchedAt: Date.now(),
          routeId,
          plannedStart: state.plannedStart,
        };
        persistCache(cache);

        set({
          timeline,
          fetchedAt: cache.fetchedAt,
          routeId,
          fetchStatus: "done",
          error: null,
        });
      } catch (e) {
        set({
          fetchStatus: "error",
          error: e instanceof Error ? e.message : "Failed to fetch weather",
        });
      }
    },

    clearWeather: () => {
      clearCache();
      set({
        timeline: [],
        fetchedAt: null,
        routeId: null,
        fetchStatus: "idle",
        error: null,
      });
    },

    setPlannedStart: (time) => {
      persistPlannedStart(time);
      set({ plannedStart: time });
    },
  };
});
