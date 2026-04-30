import type { RoutePoint, WeatherPoint, WeatherSampleKind, WindRelative } from "@/types";
import { WEATHER_WAYPOINT_INTERVAL_M } from "@/constants";
import { fetchForecasts, type HourlyForecast } from "./weatherClient";
import { getETAToDistance } from "./etaCalculator";
import { computeBearing } from "@/utils/geo";
import { startWeatherDebug } from "./weatherDebug";

const POST_FINISH_FORECAST_HOURS = 5;
const MIN_FORECAST_HOURS_TO_CACHE = 24;
const ROUTE_DISPLAY_SAMPLE_SECONDS = 3600;
const ROUTE_DISPLAY_SAMPLE_DISTANCE_M = 10_000;

export function sampleWaypoints(
  points: RoutePoint[],
  fromIndex: number,
): {
  latitude: number;
  longitude: number;
  distanceAlongRouteM: number;
  routeDistanceMeters: number;
  index: number;
}[] {
  if (points.length === 0 || fromIndex < 0 || fromIndex >= points.length) return [];

  const startDist = points[fromIndex].distanceFromStartMeters;
  const maxDist = points[points.length - 1].distanceFromStartMeters;
  const waypoints: {
    latitude: number;
    longitude: number;
    distanceAlongRouteM: number;
    routeDistanceMeters: number;
    index: number;
  }[] = [
    {
      latitude: points[fromIndex].latitude,
      longitude: points[fromIndex].longitude,
      distanceAlongRouteM: 0,
      routeDistanceMeters: startDist,
      index: fromIndex,
    },
  ];

  let nextThreshold = startDist + WEATHER_WAYPOINT_INTERVAL_M;
  let lastEligibleIndex = fromIndex;
  for (let i = fromIndex + 1; i < points.length; i++) {
    const dist = points[i].distanceFromStartMeters;
    if (dist > maxDist) break;
    lastEligibleIndex = i;
    if (dist >= nextThreshold) {
      waypoints.push({
        latitude: points[i].latitude,
        longitude: points[i].longitude,
        distanceAlongRouteM: dist - startDist,
        routeDistanceMeters: dist,
        index: i,
      });
      nextThreshold = dist + WEATHER_WAYPOINT_INTERVAL_M;
    }
  }

  const lastEligible = points[lastEligibleIndex];
  const lastWaypoint = waypoints[waypoints.length - 1];
  if (
    lastEligible &&
    lastEligibleIndex !== lastWaypoint.index &&
    lastEligible.distanceFromStartMeters - lastWaypoint.routeDistanceMeters >= 1000
  ) {
    waypoints.push({
      latitude: lastEligible.latitude,
      longitude: lastEligible.longitude,
      distanceAlongRouteM: lastEligible.distanceFromStartMeters - startDist,
      routeDistanceMeters: lastEligible.distanceFromStartMeters,
      index: lastEligibleIndex,
    });
  }

  return waypoints;
}

function getBearingAtIndex(points: RoutePoint[], index: number): number | null {
  if (points.length < 2) return null;
  const next = Math.min(index + 1, points.length - 1);
  const prev = Math.max(index - 1, 0);
  if (prev === next) return null;
  return computeBearing(
    points[prev].latitude,
    points[prev].longitude,
    points[next].latitude,
    points[next].longitude,
  );
}

export function classifyWind(windDirectionDeg: number, routeBearingDeg: number): WindRelative {
  // Wind direction = where wind comes FROM; headwind = wind from direction we're heading
  let angleDiff = windDirectionDeg - routeBearingDeg;
  while (angleDiff > 180) angleDiff -= 360;
  while (angleDiff < -180) angleDiff += 360;

  const abs = Math.abs(angleDiff);
  if (abs < 45) return "headwind";
  if (abs > 135) return "tailwind";
  return angleDiff > 0 ? "crosswind-right" : "crosswind-left";
}

export interface WeatherTimelineOptions {
  projectionStartTime?: Date;
}

export interface WeatherTimelineBuildResult {
  timeline: WeatherPoint[];
  routeCoverageFromMeters: number | null;
  routeCoverageUntilMeters: number | null;
  forecastFromMs: number | null;
  forecastUntilMs: number | null;
}

function minForecastTimeMs(forecasts: HourlyForecast[]): number | null {
  const times = forecasts.flatMap((forecast) =>
    forecast.hours.map((hour) => new Date(hour.time).getTime()),
  );
  return times.length > 0 ? Math.min(...times) : null;
}

function maxForecastTimeMs(forecasts: HourlyForecast[]): number | null {
  const times = forecasts.flatMap((forecast) =>
    forecast.hours.map((hour) => new Date(hour.time).getTime()),
  );
  return times.length > 0 ? Math.max(...times) : null;
}

function forecastHoursForProjection(projectionStart: Date, maxRidingTimeSeconds: number): number {
  const hoursUntilProjection = Math.max(
    0,
    Math.ceil((projectionStart.getTime() - Date.now()) / 3600_000),
  );
  const neededHours =
    hoursUntilProjection + Math.ceil(maxRidingTimeSeconds / 3600) + POST_FINISH_FORECAST_HOURS + 2;
  return Math.max(MIN_FORECAST_HOURS_TO_CACHE, neededHours);
}

function ridingTimeToRoutePosition(
  cumulativeTime: number[],
  points: RoutePoint[],
  fromIndex: number,
  ridingTimeSeconds: number,
): {
  latitude: number;
  longitude: number;
  distanceAlongRouteM: number;
  routeDistanceMeters: number;
  index: number;
} | null {
  if (points.length === 0 || cumulativeTime.length === 0) return null;
  if (fromIndex < 0 || fromIndex >= points.length) return null;

  const startTime = cumulativeTime[fromIndex] ?? 0;
  const targetTime = startTime + Math.max(0, ridingTimeSeconds);
  const startDist = points[fromIndex].distanceFromStartMeters;

  for (let index = fromIndex + 1; index < points.length; index++) {
    const prevTime = cumulativeTime[index - 1];
    const nextTime = cumulativeTime[index];
    if (nextTime < targetTime) continue;

    const prevPoint = points[index - 1];
    const nextPoint = points[index];
    const timeDelta = nextTime - prevTime;
    const progress = timeDelta > 0 ? (targetTime - prevTime) / timeDelta : 0;
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const routeDistanceMeters =
      prevPoint.distanceFromStartMeters +
      (nextPoint.distanceFromStartMeters - prevPoint.distanceFromStartMeters) * clampedProgress;

    return {
      latitude: prevPoint.latitude + (nextPoint.latitude - prevPoint.latitude) * clampedProgress,
      longitude:
        prevPoint.longitude + (nextPoint.longitude - prevPoint.longitude) * clampedProgress,
      distanceAlongRouteM: routeDistanceMeters - startDist,
      routeDistanceMeters,
      index,
    };
  }

  const finalPoint = points[points.length - 1];
  return {
    latitude: finalPoint.latitude,
    longitude: finalPoint.longitude,
    distanceAlongRouteM: finalPoint.distanceFromStartMeters - startDist,
    routeDistanceMeters: finalPoint.distanceFromStartMeters,
    index: points.length - 1,
  };
}

function routeDisplaySamples(
  cumulativeTime: number[],
  points: RoutePoint[],
  fromIndex: number,
  finishRidingTimeSeconds: number,
): {
  latitude: number;
  longitude: number;
  distanceAlongRouteM: number;
  routeDistanceMeters: number;
  index: number;
  ridingTimeSeconds: number;
  sampleKind: WeatherSampleKind;
  sampleKinds: WeatherSampleKind[];
}[] {
  const samples: {
    latitude: number;
    longitude: number;
    distanceAlongRouteM: number;
    routeDistanceMeters: number;
    index: number;
    ridingTimeSeconds: number;
    sampleKind: WeatherSampleKind;
    sampleKinds: WeatherSampleKind[];
  }[] = [];

  const finishSeconds = Math.max(0, finishRidingTimeSeconds);
  const startDist = points[fromIndex]?.distanceFromStartMeters ?? 0;
  const finishDist = points[points.length - 1]?.distanceFromStartMeters ?? startDist;

  const addSample = (ridingTimeSeconds: number, sampleKind: WeatherSampleKind) => {
    const position = ridingTimeToRoutePosition(
      cumulativeTime,
      points,
      fromIndex,
      ridingTimeSeconds,
    );
    if (!position) return;
    const distanceKey = Math.round(position.routeDistanceMeters / 100);
    const existing = samples.find(
      (sample) => Math.round(sample.routeDistanceMeters / 100) === distanceKey,
    );
    if (existing) {
      if (!existing.sampleKinds.includes(sampleKind)) existing.sampleKinds.push(sampleKind);
      return;
    }
    samples.push({ ...position, ridingTimeSeconds, sampleKind, sampleKinds: [sampleKind] });
  };

  for (
    let elapsedSeconds = 0;
    elapsedSeconds <= finishSeconds;
    elapsedSeconds += ROUTE_DISPLAY_SAMPLE_SECONDS
  ) {
    addSample(elapsedSeconds, "hourly");
  }

  for (
    let routeDistanceMeters = startDist + ROUTE_DISPLAY_SAMPLE_DISTANCE_M;
    routeDistanceMeters < finishDist;
    routeDistanceMeters += ROUTE_DISPLAY_SAMPLE_DISTANCE_M
  ) {
    const eta = getETAToDistance(cumulativeTime, points, fromIndex, routeDistanceMeters);
    if (eta) addSample(eta.ridingTimeSeconds, "distance");
  }

  const finalSample = samples[samples.length - 1];
  if (!finalSample || Math.abs(finalSample.ridingTimeSeconds - finishSeconds) > 60) {
    addSample(finishSeconds, "finish");
  }

  return samples.sort((a, b) => a.routeDistanceMeters - b.routeDistanceMeters);
}

function hasForecastCoverage(
  parsed: { time: number; data: HourlyForecast["hours"][number] }[] | undefined,
  targetMs: number,
): boolean {
  if (!parsed?.length) return false;
  const first = parsed[0].time;
  const last = parsed[parsed.length - 1].time;
  return targetMs >= first - 3600_000 && targetMs <= last + 3600_000;
}

/**
 * Build weather timeline using precomputed ETA data.
 * Route rows include hourly, 10 km distance, and finish samples; post-finish rows follow finish.
 */
export async function buildWeatherTimeline(
  points: RoutePoint[],
  fromIndex: number,
  cumulativeTime: number[],
  options: WeatherTimelineOptions = {},
): Promise<WeatherPoint[]> {
  const forecasts = await fetchWeatherForecastsForRoute(points, fromIndex, cumulativeTime, options);
  return buildWeatherTimelineFromForecasts(points, fromIndex, cumulativeTime, forecasts, options)
    .timeline;
}

export async function fetchWeatherForecastsForRoute(
  points: RoutePoint[],
  fromIndex: number,
  cumulativeTime: number[],
  options: WeatherTimelineOptions = {},
): Promise<HourlyForecast[]> {
  const projectionStart = options.projectionStartTime ?? new Date();
  const waypoints = sampleWaypoints(points, fromIndex);
  if (waypoints.length === 0) return [];

  const startDist = points[fromIndex].distanceFromStartMeters;
  const waypointETAs = waypoints.map((waypoint) => {
    const targetDist = startDist + waypoint.distanceAlongRouteM;
    const eta = getETAToDistance(cumulativeTime, points, fromIndex, targetDist);
    return eta?.ridingTimeSeconds ?? 0;
  });
  const finishPoint = points[points.length - 1];
  const finishEta = getETAToDistance(
    cumulativeTime,
    points,
    fromIndex,
    finishPoint.distanceFromStartMeters,
  );
  const maxRidingTimeSeconds = finishEta?.ridingTimeSeconds ?? Math.max(...waypointETAs);
  return fetchForecasts(
    waypoints.map((w) => ({ latitude: w.latitude, longitude: w.longitude })),
    forecastHoursForProjection(projectionStart, maxRidingTimeSeconds),
  );
}

export function buildWeatherTimelineFromForecasts(
  points: RoutePoint[],
  fromIndex: number,
  cumulativeTime: number[],
  forecasts: HourlyForecast[],
  options: WeatherTimelineOptions = {},
): WeatherTimelineBuildResult {
  const debug = startWeatherDebug("timeline", {
    points: points.length,
    fromIndex,
    projectionStartIso: options.projectionStartTime?.toISOString() ?? null,
    source: "forecasts",
  });
  const projectionStart = options.projectionStartTime ?? new Date();
  const waypoints = sampleWaypoints(points, fromIndex);
  if (waypoints.length === 0) {
    debug.end({ status: "empty", reason: "no_waypoints" });
    return emptyBuildResult(forecasts);
  }

  const startDist = points[fromIndex].distanceFromStartMeters;
  const waypointETAs = waypoints.map((waypoint) => {
    const targetDist = startDist + waypoint.distanceAlongRouteM;
    const eta = getETAToDistance(cumulativeTime, points, fromIndex, targetDist);
    return {
      waypoint,
      ridingTimeSeconds: eta?.ridingTimeSeconds ?? 0,
    };
  });

  const finishPoint = points[points.length - 1];
  const finishEta = getETAToDistance(
    cumulativeTime,
    points,
    fromIndex,
    finishPoint.distanceFromStartMeters,
  );
  const maxRidingTimeSeconds =
    finishEta?.ridingTimeSeconds ?? Math.max(...waypointETAs.map((wp) => wp.ridingTimeSeconds));
  debug.step("sampled", {
    waypoints: waypoints.length,
    forecasts: forecasts.length,
    projectedRideHours: Math.round((maxRidingTimeSeconds / 3600) * 10) / 10,
  });
  if (forecasts.length === 0) {
    debug.end({ status: "empty", reason: "no_forecasts", waypoints: waypoints.length });
    return emptyBuildResult(forecasts);
  }
  debug.step("forecasts", { forecasts: forecasts.length });

  const waypointForecasts = waypointETAs.map((wp) => ({
    waypoint: wp.waypoint,
    ridingTimeSeconds: wp.ridingTimeSeconds,
    forecast: findClosestForecast(forecasts, wp.waypoint.latitude, wp.waypoint.longitude),
  }));

  // Pre-parse forecast hour timestamps once per forecast
  const parsedForecasts = new Map<
    HourlyForecast,
    { time: number; data: HourlyForecast["hours"][number] }[]
  >();
  for (const f of forecasts) {
    parsedForecasts.set(
      f,
      f.hours.map((h) => ({ time: new Date(h.time).getTime(), data: h })),
    );
  }

  const timeline: WeatherPoint[] = [];

  const displaySamples = routeDisplaySamples(
    cumulativeTime,
    points,
    fromIndex,
    maxRidingTimeSeconds,
  );
  debug.step("display-samples", { displaySamples: displaySamples.length });

  for (let index = 0; index < displaySamples.length; index++) {
    const sample = displaySamples[index];
    const forecast = findClosestForecast(forecasts, sample.latitude, sample.longitude);
    if (!forecast) continue;

    const etaTime = new Date(projectionStart.getTime() + sample.ridingTimeSeconds * 1000);

    // Find closest forecast hour using pre-parsed timestamps
    const parsed = parsedForecasts.get(forecast);
    if (!hasForecastCoverage(parsed, etaTime.getTime())) continue;
    const hourData = findClosestHour(parsed, etaTime.getTime());
    if (!hourData) continue;

    const bearing = getBearingAtIndex(points, sample.index);

    timeline.push({
      hourOffset: index,
      phase: "route",
      sampleKind: sample.sampleKind,
      sampleKinds: sample.sampleKinds,
      time: hourData.time,
      etaTime: etaTime.toISOString(),
      temperatureC: hourData.temperature2m,
      apparentTemperatureC: hourData.apparentTemperature2m,
      dewPointC: hourData.dewPoint2m,
      relativeHumidityPercent: hourData.relativeHumidity2m,
      precipitationMm: hourData.precipitation,
      precipitationProbability: hourData.precipitationProbability,
      windSpeedKmh: hourData.windSpeed10m,
      windDirectionDeg: hourData.windDirection10m,
      windGustKmh: hourData.windGusts10m,
      weatherCode: hourData.weatherCode,
      isDay: hourData.isDay === 1,
      latitude: sample.latitude,
      longitude: sample.longitude,
      distanceAlongRouteM: sample.distanceAlongRouteM,
      routeDistanceMeters: sample.routeDistanceMeters,
      routeBearingDeg: bearing,
    });
  }

  const finishForecast = waypointForecasts[waypointForecasts.length - 1];
  const isActualFinish = finishForecast?.waypoint.index === points.length - 1;
  if (finishForecast?.forecast && isActualFinish) {
    const parsed = parsedForecasts.get(finishForecast.forecast);
    const finishEtaTime = new Date(
      projectionStart.getTime() + finishForecast.ridingTimeSeconds * 1000,
    );
    const bearing = getBearingAtIndex(points, finishForecast.waypoint.index);

    for (let hour = 1; hour <= POST_FINISH_FORECAST_HOURS; hour++) {
      const postFinishTime = new Date(finishEtaTime.getTime() + hour * 3600_000);
      if (!hasForecastCoverage(parsed, postFinishTime.getTime())) continue;
      const hourData = findClosestHour(parsed, postFinishTime.getTime());
      if (!hourData) continue;

      timeline.push({
        hourOffset: timeline.length,
        phase: "post-finish",
        sampleKind: "post-finish",
        sampleKinds: ["post-finish"],
        time: hourData.time,
        etaTime: postFinishTime.toISOString(),
        temperatureC: hourData.temperature2m,
        apparentTemperatureC: hourData.apparentTemperature2m,
        dewPointC: hourData.dewPoint2m,
        relativeHumidityPercent: hourData.relativeHumidity2m,
        precipitationMm: hourData.precipitation,
        precipitationProbability: hourData.precipitationProbability,
        windSpeedKmh: hourData.windSpeed10m,
        windDirectionDeg: hourData.windDirection10m,
        windGustKmh: hourData.windGusts10m,
        weatherCode: hourData.weatherCode,
        isDay: hourData.isDay === 1,
        latitude: finishForecast.waypoint.latitude,
        longitude: finishForecast.waypoint.longitude,
        distanceAlongRouteM: finishForecast.waypoint.distanceAlongRouteM,
        routeDistanceMeters: finishForecast.waypoint.routeDistanceMeters,
        routeBearingDeg: bearing,
      });
    }
  }

  debug.end({
    status: "success",
    timelineItemsTotal: timeline.length,
    timelineItemsOnRoute: timeline.filter((point) => point.phase === "route").length,
    timelineItemsPostFinish: timeline.filter((point) => point.phase === "post-finish").length,
  });
  return {
    timeline,
    routeCoverageFromMeters: minWeatherDistance(timeline),
    routeCoverageUntilMeters: maxWeatherDistance(timeline),
    forecastFromMs: minForecastTimeMs(forecasts),
    forecastUntilMs: maxForecastTimeMs(forecasts),
  };
}

function emptyBuildResult(forecasts: HourlyForecast[]): WeatherTimelineBuildResult {
  return {
    timeline: [],
    routeCoverageFromMeters: null,
    routeCoverageUntilMeters: null,
    forecastFromMs: minForecastTimeMs(forecasts),
    forecastUntilMs: maxForecastTimeMs(forecasts),
  };
}

function minWeatherDistance(timeline: WeatherPoint[]): number | null {
  return timeline.length > 0
    ? Math.min(...timeline.map((point) => point.routeDistanceMeters))
    : null;
}

function maxWeatherDistance(timeline: WeatherPoint[]): number | null {
  return timeline.length > 0
    ? Math.max(...timeline.map((point) => point.routeDistanceMeters))
    : null;
}

function findClosestForecast(
  forecasts: HourlyForecast[],
  lat: number,
  lon: number,
): HourlyForecast | null {
  let best: HourlyForecast | null = null;
  let bestDist = Infinity;
  for (const f of forecasts) {
    const d = Math.abs(f.latitude - lat) + Math.abs(f.longitude - lon);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best;
}

function findClosestHour(
  parsed: { time: number; data: HourlyForecast["hours"][number] }[] | undefined,
  targetMs: number,
): HourlyForecast["hours"][number] | null {
  if (!parsed?.length) return null;
  let best = parsed[0].data;
  let bestDiff = Math.abs(parsed[0].time - targetMs);
  for (let i = 1; i < parsed.length; i++) {
    const diff = Math.abs(parsed[i].time - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = parsed[i].data;
    }
  }
  return best;
}
