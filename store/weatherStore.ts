import { create } from "zustand";
import { createMMKV, type MMKV } from "react-native-mmkv";
import type { RoutePoint, WeatherFetchStatus, WeatherPoint, WeatherRefreshMode } from "@/types";
import { WEATHER_MANUAL_REFRESH_THROTTLE_MS, WEATHER_STALE_MS } from "@/constants";
import {
  buildWeatherTimelineFromForecasts,
  fetchWeatherForecastsForRoute,
} from "@/services/weatherService";
import { logWeatherDebug, startWeatherDebug } from "@/services/weatherDebug";
import type { HourlyForecast } from "@/services/weatherClient";
import { useOfflineStore } from "./offlineStore";

let storage: MMKV | null = null;
const WEATHER_CACHE_VERSION = 8;

function getStorage(): MMKV {
  if (!storage) storage = createMMKV({ id: "weather" });
  return storage;
}

export interface WeatherFetchContext {
  routeId: string;
  points: RoutePoint[];
  fromIndex: number;
  cumulativeTime: number[];
  plannedStartMs: number | null;
  refreshMode: WeatherRefreshMode;
}

export type WeatherManualRefreshOutcome =
  | "idle"
  | "unavailable"
  | "skipped-fresh"
  | "success"
  | "error";

export function resolveEffectiveWeatherStart(input: {
  hasOverride: boolean;
  overrideStartMs: number | null;
  collectionPlannedStartMs: number | null;
  nowMs?: number;
}): number | null {
  const nowMs = input.nowMs ?? Date.now();
  if (input.hasOverride) {
    return input.overrideStartMs != null && input.overrideStartMs > nowMs
      ? input.overrideStartMs
      : null;
  }
  return input.collectionPlannedStartMs != null && input.collectionPlannedStartMs > nowMs
    ? input.collectionPlannedStartMs
    : null;
}

interface CachedWeather {
  version: number;
  timeline: WeatherPoint[];
  forecasts: HourlyForecast[];
  fetchedAt: number;
  routeId: string;
  plannedStartMs: number | null;
  fromIndex: number;
  forecastFromMs: number | null;
  forecastUntilMs: number | null;
  routeCoverageFromMeters: number | null;
  routeCoverageUntilMeters: number | null;
}

function loadCache(): CachedWeather | null {
  try {
    const raw = getStorage().getString("cache");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedWeather>;
    if (parsed.version !== WEATHER_CACHE_VERSION) return null;
    if (!Array.isArray(parsed.timeline)) return null;
    if (!Array.isArray(parsed.forecasts)) return null;
    return parsed as CachedWeather;
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

function isFresh(fetchAt: number | null): boolean {
  return fetchAt != null && Date.now() - fetchAt < WEATHER_STALE_MS;
}

function cacheMatchesContext(cache: CachedWeather | null, context: WeatherFetchContext): boolean {
  return (
    cache?.routeId === context.routeId &&
    cache.plannedStartMs === context.plannedStartMs &&
    cache.fromIndex === context.fromIndex
  );
}

function stateMatchesContext(
  state: Pick<WeatherState, "routeId" | "plannedStartMs" | "fromIndex">,
  context: WeatherFetchContext,
): boolean {
  return (
    state.routeId === context.routeId &&
    state.plannedStartMs === context.plannedStartMs &&
    state.fromIndex === context.fromIndex
  );
}

function contextCoverageUntilMeters(context: WeatherFetchContext): number | null {
  const startPoint = context.points[context.fromIndex];
  const finishPoint = context.points[context.points.length - 1];
  if (!startPoint || !finishPoint) return null;
  return finishPoint.distanceFromStartMeters;
}

function hasSufficientRouteCoverage(
  cache: CachedWeather | null,
  context: WeatherFetchContext,
): boolean {
  const requiredUntilMeters = contextCoverageUntilMeters(context);
  if (requiredUntilMeters == null || cache?.routeCoverageUntilMeters == null) return false;
  return cache.routeCoverageUntilMeters >= requiredUntilMeters - 100;
}

function canSkipManualRefresh(
  cache: CachedWeather | null,
  context: WeatherFetchContext,
  lastSuccessfulFetchAtMs: number | null,
  lastFailedFetchAtMs: number | null,
): boolean {
  if (lastSuccessfulFetchAtMs == null || lastFailedFetchAtMs != null) return false;
  return (
    cacheMatchesContext(cache, context) &&
    hasSufficientRouteCoverage(cache, context) &&
    Date.now() - lastSuccessfulFetchAtMs < WEATHER_MANUAL_REFRESH_THROTTLE_MS
  );
}

function hydrateCachedTimeline(cache: CachedWeather) {
  return {
    timeline: cache.timeline,
    fetchStatus: "done" as const,
    lastSuccessfulFetchAtMs: cache.fetchedAt,
    lastFailedFetchAtMs: null,
    lastError: null,
    forecastFromMs: cache.forecastFromMs,
    forecastUntilMs: cache.forecastUntilMs,
    routeCoverageFromMeters: cache.routeCoverageFromMeters,
    routeCoverageUntilMeters: cache.routeCoverageUntilMeters,
    routeId: cache.routeId,
    plannedStartMs: cache.plannedStartMs,
    fromIndex: cache.fromIndex,
  };
}

function rebuildCacheForContext(
  cache: CachedWeather | null,
  context: WeatherFetchContext,
): CachedWeather | null {
  if (!cache) return null;
  if (cache.routeId !== context.routeId || cache.fromIndex !== context.fromIndex) return null;
  if (!isFresh(cache.fetchedAt)) return null;

  const options = context.plannedStartMs
    ? { projectionStartTime: new Date(context.plannedStartMs) }
    : {};
  const result = buildWeatherTimelineFromForecasts(
    context.points,
    context.fromIndex,
    context.cumulativeTime,
    cache.forecasts,
    options,
  );
  if (result.timeline.length === 0) return null;
  if (result.routeCoverageUntilMeters == null) return null;
  const requiredUntilMeters = contextCoverageUntilMeters(context);
  if (requiredUntilMeters != null && result.routeCoverageUntilMeters < requiredUntilMeters - 100) {
    return null;
  }

  return {
    ...cache,
    timeline: result.timeline,
    plannedStartMs: context.plannedStartMs,
    forecastFromMs: result.forecastFromMs,
    forecastUntilMs: result.forecastUntilMs,
    routeCoverageFromMeters: result.routeCoverageFromMeters,
    routeCoverageUntilMeters: result.routeCoverageUntilMeters,
  };
}

function minTimeMs(timeline: WeatherPoint[]): number | null {
  if (timeline.length === 0) return null;
  return Math.min(...timeline.map((point) => new Date(point.time).getTime()));
}

function maxTimeMs(timeline: WeatherPoint[]): number | null {
  if (timeline.length === 0) return null;
  return Math.max(...timeline.map((point) => new Date(point.time).getTime()));
}

function minDistance(timeline: WeatherPoint[]): number | null {
  if (timeline.length === 0) return null;
  return Math.min(...timeline.map((point) => point.routeDistanceMeters));
}

function maxDistance(timeline: WeatherPoint[]): number | null {
  if (timeline.length === 0) return null;
  return Math.max(...timeline.map((point) => point.routeDistanceMeters));
}

interface WeatherState {
  timeline: WeatherPoint[];
  fetchStatus: WeatherFetchStatus;
  lastSuccessfulFetchAtMs: number | null;
  lastFailedFetchAtMs: number | null;
  lastAttemptedAtMs: number | null;
  lastError: string | null;
  lastRefreshOutcome: WeatherManualRefreshOutcome;
  lastRefreshMessage: string | null;
  lastManualRefreshFeedbackAtMs: number | null;
  forecastFromMs: number | null;
  forecastUntilMs: number | null;
  routeCoverageFromMeters: number | null;
  routeCoverageUntilMeters: number | null;
  routeId: string | null;
  plannedStartMs: number | null;
  fromIndex: number | null;
  forecastStartOverrideMs: number | null;
  hasForecastStartOverride: boolean;

  ensureWeatherFresh: (context: WeatherFetchContext) => Promise<void>;
  refreshWeatherNow: (context: WeatherFetchContext) => Promise<void>;
  recordManualRefreshUnavailable: (message?: string) => void;
  setForecastStartOverride: (value: number | null) => void;
  clearForecastStartOverride: () => void;
  clearWeather: () => void;
}

export const useWeatherStore = create<WeatherState>((set, get) => {
  const cached = loadCache();
  const hasCachedTimeline = (cached?.timeline.length ?? 0) > 0;

  async function fetchWeather(context: WeatherFetchContext): Promise<void> {
    if (get().fetchStatus === "fetching") {
      logWeatherDebug("skipped-refresh", { routeId: context.routeId, reason: "already_fetching" });
      if (context.refreshMode === "manual") {
        const feedbackAt = Date.now();
        set({
          lastRefreshOutcome: "unavailable",
          lastRefreshMessage: "Weather refresh already in progress",
          lastManualRefreshFeedbackAtMs: feedbackAt,
        });
      }
      return;
    }

    const attemptedAt = Date.now();
    const debug = startWeatherDebug("refresh", {
      routeId: context.routeId,
      mode: context.refreshMode,
      plannedStartMs: context.plannedStartMs,
      fromIndex: context.fromIndex,
      routePoints: context.points.length,
    });
    set({
      fetchStatus: "fetching",
      lastAttemptedAtMs: attemptedAt,
      lastError: null,
      ...(context.refreshMode === "manual"
        ? {
            lastRefreshOutcome: "idle" as const,
            lastRefreshMessage: null,
            lastManualRefreshFeedbackAtMs: attemptedAt,
          }
        : {}),
    });

    if (!useOfflineStore.getState().isConnected) {
      debug.error({ status: "offline" });
      const feedbackAt =
        context.refreshMode === "manual" ? attemptedAt : get().lastManualRefreshFeedbackAtMs;
      set({
        fetchStatus: "error",
        lastFailedFetchAtMs: attemptedAt,
        lastError: "Offline",
        lastRefreshOutcome: "error",
        lastRefreshMessage: "Offline",
        lastManualRefreshFeedbackAtMs: feedbackAt,
      });
      return;
    }

    try {
      const options = context.plannedStartMs
        ? { projectionStartTime: new Date(context.plannedStartMs) }
        : {};
      const forecasts = await fetchWeatherForecastsForRoute(
        context.points,
        context.fromIndex,
        context.cumulativeTime,
        options,
      );
      if (forecasts.length === 0) {
        throw new Error("No weather forecasts returned");
      }
      const buildResult = buildWeatherTimelineFromForecasts(
        context.points,
        context.fromIndex,
        context.cumulativeTime,
        forecasts,
        options,
      );
      const timeline = buildResult.timeline;
      debug.step("timeline-built", {
        timelineItemsTotal: timeline.length,
        timelineItemsOnRoute: timeline.filter((point) => point.phase === "route").length,
        timelineItemsPostFinish: timeline.filter((point) => point.phase === "post-finish").length,
      });
      const fetchedAt = Date.now();
      const cache: CachedWeather = {
        version: WEATHER_CACHE_VERSION,
        timeline,
        forecasts,
        fetchedAt,
        routeId: context.routeId,
        plannedStartMs: context.plannedStartMs,
        fromIndex: context.fromIndex,
        forecastFromMs: buildResult.forecastFromMs ?? minTimeMs(timeline),
        forecastUntilMs: buildResult.forecastUntilMs ?? maxTimeMs(timeline),
        routeCoverageFromMeters: buildResult.routeCoverageFromMeters ?? minDistance(timeline),
        routeCoverageUntilMeters: buildResult.routeCoverageUntilMeters ?? maxDistance(timeline),
      };
      persistCache(cache);
      debug.end({
        status: "success",
        forecastFromMs: cache.forecastFromMs,
        forecastUntilMs: cache.forecastUntilMs,
        routeCoverageFromMeters: cache.routeCoverageFromMeters,
        routeCoverageUntilMeters: cache.routeCoverageUntilMeters,
      });
      set({
        timeline,
        fetchStatus: "done",
        lastSuccessfulFetchAtMs: fetchedAt,
        lastFailedFetchAtMs: null,
        lastAttemptedAtMs: attemptedAt,
        lastError: null,
        forecastFromMs: cache.forecastFromMs,
        forecastUntilMs: cache.forecastUntilMs,
        routeCoverageFromMeters: cache.routeCoverageFromMeters,
        routeCoverageUntilMeters: cache.routeCoverageUntilMeters,
        routeId: context.routeId,
        plannedStartMs: context.plannedStartMs,
        fromIndex: context.fromIndex,
        ...(context.refreshMode === "manual"
          ? {
              lastRefreshOutcome: "success" as const,
              lastRefreshMessage: null,
              lastManualRefreshFeedbackAtMs: fetchedAt,
            }
          : {}),
      });
    } catch (e) {
      const failedAt = Date.now();
      const message = e instanceof Error ? e.message : "Failed to fetch weather";
      debug.error({ message: e instanceof Error ? e.message : "Failed to fetch weather" });
      const feedbackAt =
        context.refreshMode === "manual" ? failedAt : get().lastManualRefreshFeedbackAtMs;
      set({
        fetchStatus: "error",
        lastFailedFetchAtMs: failedAt,
        lastError: message,
        lastRefreshOutcome: "error",
        lastRefreshMessage: message,
        lastManualRefreshFeedbackAtMs: feedbackAt,
      });
    }
  }

  return {
    timeline: hasCachedTimeline ? (cached?.timeline ?? []) : [],
    fetchStatus: hasCachedTimeline ? "done" : "idle",
    lastSuccessfulFetchAtMs: hasCachedTimeline ? (cached?.fetchedAt ?? null) : null,
    lastFailedFetchAtMs: null,
    lastAttemptedAtMs: null,
    lastError: null,
    lastRefreshOutcome: "idle",
    lastRefreshMessage: null,
    lastManualRefreshFeedbackAtMs: null,
    forecastFromMs: hasCachedTimeline ? (cached?.forecastFromMs ?? null) : null,
    forecastUntilMs: hasCachedTimeline ? (cached?.forecastUntilMs ?? null) : null,
    routeCoverageFromMeters: hasCachedTimeline ? (cached?.routeCoverageFromMeters ?? null) : null,
    routeCoverageUntilMeters: hasCachedTimeline ? (cached?.routeCoverageUntilMeters ?? null) : null,
    routeId: hasCachedTimeline ? (cached?.routeId ?? null) : null,
    plannedStartMs: hasCachedTimeline ? (cached?.plannedStartMs ?? null) : null,
    fromIndex: hasCachedTimeline ? (cached?.fromIndex ?? null) : null,
    forecastStartOverrideMs: null,
    hasForecastStartOverride: false,

    ensureWeatherFresh: async (context) => {
      const state = get();
      const cachedData = loadCache();
      const rebuiltCache = rebuildCacheForContext(cachedData, context);
      const shouldRetryFailure =
        context.refreshMode === "automatic" && state.lastFailedFetchAtMs != null;
      if (
        !shouldRetryFailure &&
        stateMatchesContext(state, context) &&
        cacheMatchesContext(cachedData, context) &&
        state.timeline.length > 0 &&
        isFresh(state.lastSuccessfulFetchAtMs)
      ) {
        logWeatherDebug("skipped-refresh", {
          routeId: context.routeId,
          reason: "fresh_state",
          mode: context.refreshMode,
        });
        return;
      }

      if (
        !shouldRetryFailure &&
        cacheMatchesContext(cachedData, context) &&
        isFresh(cachedData?.fetchedAt ?? null)
      ) {
        logWeatherDebug("cache-decision", {
          routeId: context.routeId,
          hit: true,
          usingCache: true,
          mode: context.refreshMode,
          cacheAgeMinutes:
            cachedData?.fetchedAt != null
              ? Math.round((Date.now() - cachedData.fetchedAt) / 60_000)
              : null,
        });
        set({
          timeline: cachedData?.timeline ?? [],
          fetchStatus: "done",
          lastSuccessfulFetchAtMs: cachedData?.fetchedAt ?? null,
          lastFailedFetchAtMs: null,
          lastError: null,
          forecastFromMs: cachedData?.forecastFromMs ?? null,
          forecastUntilMs: cachedData?.forecastUntilMs ?? null,
          routeCoverageFromMeters: cachedData?.routeCoverageFromMeters ?? null,
          routeCoverageUntilMeters: cachedData?.routeCoverageUntilMeters ?? null,
          routeId: cachedData?.routeId ?? null,
          plannedStartMs: cachedData?.plannedStartMs ?? null,
          fromIndex: cachedData?.fromIndex ?? null,
        });
        return;
      }

      if (!shouldRetryFailure && rebuiltCache) {
        persistCache(rebuiltCache);
        logWeatherDebug("cache-decision", {
          routeId: context.routeId,
          hit: true,
          rebuilt: true,
          mode: context.refreshMode,
          plannedStartMs: context.plannedStartMs,
        });
        set(hydrateCachedTimeline(rebuiltCache));
        return;
      }

      if (
        context.refreshMode === "manual" &&
        stateMatchesContext(state, context) &&
        state.timeline.length > 0
      ) {
        logWeatherDebug("skipped-refresh", {
          routeId: context.routeId,
          reason: "manual_mode_existing_timeline",
        });
        return;
      }

      if (context.refreshMode === "manual") {
        logWeatherDebug("skipped-refresh", { routeId: context.routeId, reason: "manual_mode" });
        return;
      }
      await fetchWeather(context);
    },

    refreshWeatherNow: async (context) => {
      const manualContext: WeatherFetchContext = { ...context, refreshMode: "manual" };
      const state = get();
      const cachedData = loadCache();
      if (!useOfflineStore.getState().isConnected) {
        const feedbackAt = Date.now();
        set({
          fetchStatus: "error",
          lastAttemptedAtMs: feedbackAt,
          lastFailedFetchAtMs: feedbackAt,
          lastError: "Offline",
          lastRefreshOutcome: "error",
          lastRefreshMessage: "Offline",
          lastManualRefreshFeedbackAtMs: feedbackAt,
        });
        return;
      }
      const rebuiltCache = rebuildCacheForContext(cachedData, manualContext);
      if (rebuiltCache && !cacheMatchesContext(cachedData, manualContext)) {
        persistCache(rebuiltCache);
        logWeatherDebug("cache-decision", {
          routeId: manualContext.routeId,
          hit: true,
          rebuilt: true,
          mode: "manual",
          plannedStartMs: manualContext.plannedStartMs,
        });
        set({
          ...hydrateCachedTimeline(rebuiltCache),
          lastAttemptedAtMs: Date.now(),
          lastRefreshOutcome: "success",
          lastRefreshMessage: null,
          lastManualRefreshFeedbackAtMs: Date.now(),
        });
        return;
      }
      if (
        canSkipManualRefresh(
          cachedData,
          manualContext,
          state.lastSuccessfulFetchAtMs,
          state.lastFailedFetchAtMs,
        )
      ) {
        logWeatherDebug("skipped-refresh", {
          routeId: manualContext.routeId,
          reason: "manual_duplicate_fresh_cache",
        });
        const feedbackAt = Date.now();
        set({
          timeline: cachedData?.timeline ?? state.timeline,
          fetchStatus: "done",
          lastAttemptedAtMs: feedbackAt,
          lastFailedFetchAtMs: null,
          lastError: null,
          lastSuccessfulFetchAtMs: cachedData?.fetchedAt ?? state.lastSuccessfulFetchAtMs,
          lastRefreshOutcome: "skipped-fresh",
          lastRefreshMessage: "Already up to date",
          lastManualRefreshFeedbackAtMs: feedbackAt,
          forecastFromMs: cachedData?.forecastFromMs ?? state.forecastFromMs,
          forecastUntilMs: cachedData?.forecastUntilMs ?? state.forecastUntilMs,
          routeCoverageFromMeters:
            cachedData?.routeCoverageFromMeters ?? state.routeCoverageFromMeters,
          routeCoverageUntilMeters:
            cachedData?.routeCoverageUntilMeters ?? state.routeCoverageUntilMeters,
          routeId: cachedData?.routeId ?? state.routeId,
          plannedStartMs: cachedData?.plannedStartMs ?? state.plannedStartMs,
          fromIndex: cachedData?.fromIndex ?? state.fromIndex,
        });
        return;
      }
      await fetchWeather(manualContext);
    },

    recordManualRefreshUnavailable: (message = "Weather refresh unavailable") => {
      const feedbackAt = Date.now();
      set({
        lastRefreshOutcome: "unavailable",
        lastRefreshMessage: message,
        lastManualRefreshFeedbackAtMs: feedbackAt,
      });
    },

    setForecastStartOverride: (value) => {
      set({
        forecastStartOverrideMs: value != null && value > Date.now() ? value : null,
        hasForecastStartOverride: true,
      });
    },

    clearForecastStartOverride: () => {
      set({ forecastStartOverrideMs: null, hasForecastStartOverride: false });
    },

    clearWeather: () => {
      clearCache();
      set({
        timeline: [],
        fetchStatus: "idle",
        lastSuccessfulFetchAtMs: null,
        lastFailedFetchAtMs: null,
        lastAttemptedAtMs: null,
        lastError: null,
        lastRefreshOutcome: "idle",
        lastRefreshMessage: null,
        lastManualRefreshFeedbackAtMs: null,
        forecastFromMs: null,
        forecastUntilMs: null,
        routeCoverageFromMeters: null,
        routeCoverageUntilMeters: null,
        routeId: null,
        plannedStartMs: null,
        fromIndex: null,
      });
    },
  };
});
