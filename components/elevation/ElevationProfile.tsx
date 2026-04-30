import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  PanResponder,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Line,
  G,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { Text } from "@/components/ui/text";
import { useThemeColors, gradientColor } from "@/theme";
import { ELEVATION_STOPS } from "@/theme/elevation";
import { formatDistance, formatElevation } from "@/utils/formatters";
import { downsampleElevationM4 } from "@/utils/elevationLod";
import { buildDistanceMarkerDistances } from "@/utils/routeMarkers";
import { getOpeningHoursStatus } from "@/services/openingHoursParser";
import { categoryColor, categoryLetter, ohStatusColorKey } from "@/constants/poiHelpers";
import { climbDifficultyColor } from "@/constants/climbHelpers";
import type { RoutePoint, UnitSystem, POI, Climb } from "@/types";
import type { DistanceMarkerInterval } from "@/utils/routeMarkers";

interface SegmentBoundary {
  distanceMeters: number;
  label?: string;
}

export interface ProfileSegment {
  startDistanceMeters: number;
  endDistanceMeters: number;
  lengthMeters: number;
  name: string;
  color: string;
}

interface ElevationProfileProps {
  points: RoutePoint[];
  units: UnitSystem;
  width: number;
  height: number;
  currentPointIndex?: number;
  showLegend?: boolean;
  /** Offset added to X-axis labels so they show absolute route distance */
  distanceOffsetMeters?: number;
  pois?: POI[];
  onPOIPress?: (poi: POI) => void;
  /** Vertical boundary lines at segment junctions (for stitched collections) */
  segmentBoundaries?: SegmentBoundary[];
  /** Colored stitched collection segments shown above the profile line. */
  profileSegments?: ProfileSegment[];
  climbs?: Climb[];
  /** Force fit-to-width — disables horizontal scrolling and the overview minimap */
  fitToWidth?: boolean;
  /** Optional local distance domain to map into the chart width without scaling labels/text. */
  visibleDomainMeters?: { start: number; end: number };
  /** Optional fixed elevation domain so charts keep the same y-scale across sizes. */
  yDomainMeters?: { min: number; max: number };
  /** Compact chart padding for small bottom-sheet climb profiles. */
  compact?: boolean;
  /** Optional local distance domain whose uphill subsegments get grade-colored fills. */
  gradeFillDomainMeters?: { start: number; end: number };
  /** Dev-only render stats label. */
  debugName?: string;
  /** Dev-only minimum samples before logging render stats. */
  debugMinSamples?: number;
  showSegmentLabels?: boolean;
  showSegmentLengths?: boolean;
  showBoundaryLabels?: boolean;
  showStartAxisLine?: boolean;
  showEndAxisLine?: boolean;
  showDistanceMarkers?: boolean;
  yMarkersUseDomain?: boolean;
  includeYDomainExtents?: boolean;
  markerOpacity?: number;
  distanceMarkerTargetPx?: number;
  distanceMarkerMinPx?: number;
  distanceMarkerStrokeWidth?: number;
  distanceMarkerDasharray?: string;
  showDistanceMarkerLabels?: boolean;
  distanceMarkerIntervalKm?: DistanceMarkerInterval;
  distanceMarkerLabelInsets?: { left?: number; right?: number };
  xLabelInsets?: { left?: number; right?: number };
  climbRenderMode?: "profile" | "range";
}

const PADDING = { top: 30, right: 16, bottom: 38, left: 48 };
const COMPACT_PADDING = { top: 8, right: 10, bottom: 20, left: 40 };
const BASE_INTERVAL_M = 100;
const MAX_DETAIL_SAMPLES = 8000;
const FIT_LOD_POINTS_PER_PX = 3;
const FIT_LOD_MAX_POINTS = 1800;
const PROFILE_RENDER_LOG_MIN_SAMPLES = 1600;
// Scrolling kicks in when fit-to-width would produce less than this many px/km.
const MIN_PX_PER_KM = 2;
const MAX_GRADIENT_STOPS = 120;
const REDUCED_GRADIENT_STOPS = 80;
const REDUCED_DETAIL_MIN_DOMAIN_M = 100_000;
const REDUCED_POI_MARKER_LIMIT = 80;
const MAX_EXAGGERATION = 200;
const OVERVIEW_HEIGHT = 52;
const OVERVIEW_BAR_HEIGHT = 32;
const OVERVIEW_PADDING_V = 4;
const OVERVIEW_MAX_SAMPLES = 220;
const OVERVIEW_MARKER_RADIUS = 3;
const CURRENT_MARKER_RADIUS = 5;
const POI_MARKER_RADIUS = 6;
const POI_MARKER_OFFSET_Y = -14;
const POI_COLLISION_MIN_PX = 12;
const POI_COLLISION_STEP_PX = 16;
const POI_HIT_SIZE = 48;
const Y_LABEL_OFFSET_Y = 7;
const Y_LABEL_MIN_STEP_M = 5;
const Y_LABEL_MIN_SPACING_PX = 18;
const X_LABEL_WIDTH = 48;
const X_LABEL_HALF_WIDTH = X_LABEL_WIDTH / 2;
// Target ~one X-axis tick per this many pixels of scrollable content.
const X_TICK_TARGET_PX = 120;
const DISTANCE_MARKER_MIN_PX = 40;
const DISTANCE_MARKER_STROKE_WIDTH = 0.5;
const DISTANCE_MARKER_DASH = "3,5";
const DISTANCE_MARKER_LABEL_TOP_SPACE = 22;
const DISTANCE_MARKER_LABEL_TOP = 2;
const DISTANCE_MARKER_LABEL_MIN_GAP_PX = 4;
const SEGMENT_BOUNDARY_TOP_Y = 2;
const SEGMENT_NAME_Y = PADDING.top - 15;
const SEGMENT_TOP_LINE_Y = PADDING.top - 7;
const SEGMENT_LENGTH_Y = PADDING.top + 7;
const SEGMENT_TOP_LINE_WIDTH = 2.5;
const SEGMENT_LABEL_SIDE_PADDING_PX = 8;
const SEGMENT_LABEL_AVG_CHAR_PX = 6;
const SEGMENT_LABEL_MIN_GAP_PX = 10;
const SEGMENT_LENGTH_LABEL_MIN_WIDTH_PX = 42;
const SEGMENT_BOUNDARY_LABEL_MIN_GAP_PX = 46;
const SEGMENT_BOUNDARY_STROKE_WIDTH = 2;
const SEGMENT_BOUNDARY_DASH = "4,3";

type Sample = { distance: number; elevation: number };

function resampleAtInterval(points: RoutePoint[], intervalM: number): Sample[] {
  if (points.length === 0) return [];

  const result: Sample[] = [];
  const totalDist = points[points.length - 1].distanceFromStartMeters;

  let ptIdx = 0;
  for (let d = 0; d <= totalDist; d += intervalM) {
    while (ptIdx < points.length - 1 && points[ptIdx + 1].distanceFromStartMeters < d) {
      ptIdx++;
    }

    if (ptIdx >= points.length - 1) {
      const last = points[points.length - 1];
      result.push({ distance: d, elevation: last.elevationMeters ?? 0 });
      continue;
    }

    const p1 = points[ptIdx];
    const p2 = points[ptIdx + 1];
    const segDist = p2.distanceFromStartMeters - p1.distanceFromStartMeters;
    const t = segDist > 0 ? (d - p1.distanceFromStartMeters) / segDist : 0;
    const e1 = p1.elevationMeters ?? 0;
    const e2 = p2.elevationMeters ?? 0;
    result.push({ distance: d, elevation: e1 + t * (e2 - e1) });
  }

  const lastSample = result[result.length - 1];
  if (lastSample && lastSample.distance < totalDist - 1) {
    const last = points[points.length - 1];
    result.push({ distance: totalDist, elevation: last.elevationMeters ?? 0 });
  }

  return result;
}

function routePointsToSamples(points: RoutePoint[]): Sample[] {
  return points.map((point) => ({
    distance: point.distanceFromStartMeters,
    elevation: point.elevationMeters ?? 0,
  }));
}

function interpolateElevation(samples: Sample[], distance: number): number {
  if (samples.length === 0) return 0;
  const first = samples[0].distance;
  const last = samples[samples.length - 1].distance;
  if (distance <= first) return samples[0].elevation;
  if (distance >= last) return samples[samples.length - 1].elevation;

  const i = Math.min(
    Math.floor(((distance - first) / (last - first)) * (samples.length - 1)),
    samples.length - 2,
  );
  const segDist = samples[i + 1].distance - samples[i].distance;
  const t = segDist > 0 ? (distance - samples[i].distance) / segDist : 0;
  return samples[i].elevation + t * (samples[i + 1].elevation - samples[i].elevation);
}

/** First index in `samples` with distance >= target. Binary search (O(log n)). */
function findFirstSampleAtOrAfter(samples: Sample[], target: number): number {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].distance < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Round-number spacing (1/2/5 × 10ⁿ) that yields ~targetCount steps over `range`. */
function niceStep(range: number, targetCount: number): number {
  const raw = range / targetCount;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const mult = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return mult * pow;
}

/** Elevation ticks covering the actual data range unless a caller opts into full-domain markers. */
function buildYLabels(
  yMin: number,
  yMax: number,
  dataMin: number,
  dataMax: number,
  useDomain = false,
  includeExtents = false,
): number[] {
  const lo = useDomain ? yMin : Math.max(0, yMin, Math.floor(dataMin));
  const hi = useDomain ? yMax : Math.min(yMax, dataMax);
  const range = hi - lo;
  if (range <= 0) return [Math.round(lo)];

  // Floor step to avoid dense tick stacks on flat profiles (e.g. 138/140/142/144).
  const step = Math.max(Y_LABEL_MIN_STEP_M, niceStep(range, 3));
  const first = Math.ceil(lo / step) * step;
  const last = Math.floor(hi / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= last + 1e-6; v += step) ticks.push(Math.round(v));

  if (!useDomain && yMin <= 0 && (ticks.length === 0 || ticks[0] !== 0)) ticks.unshift(0);
  if (includeExtents) {
    ticks.push(Math.round(yMin), Math.round(yMax));
  }
  return [...new Set(ticks)].sort((a, b) => a - b);
}

function buildXTicks(totalD: number, targetCount: number): number[] {
  if (totalD <= 0 || targetCount < 1) return [0];
  const step = niceStep(totalD, targetCount);
  const ticks: number[] = [];
  for (let v = 0; v <= totalD + 1e-6; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < totalD - step * 0.3) ticks.push(totalD);
  return ticks;
}

function buildLinePath(
  samples: Sample[],
  xs: (d: number) => number,
  ys: (e: number) => number,
): string {
  let d = "";
  for (let i = 0; i < samples.length; i++) {
    const x = xs(samples[i].distance);
    const y = ys(samples[i].elevation);
    d += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
  }
  return d;
}

interface POIMarkerPos {
  poi: POI;
  x: number;
  y: number;
  color: string;
  letter: string;
  ohRingColor: string | null;
}

interface ClimbRegion {
  id: string;
  color: string;
  fillPath?: string;
  x?: number;
  width?: number;
}

interface GradeFillRegion {
  id: string;
  color: string;
  fillPath: string;
  linePath: string;
}

export default function ElevationProfile({
  points,
  units,
  width,
  height,
  currentPointIndex,
  showLegend = true,
  distanceOffsetMeters = 0,
  pois,
  onPOIPress,
  segmentBoundaries,
  profileSegments,
  climbs,
  fitToWidth = false,
  visibleDomainMeters,
  yDomainMeters,
  compact = false,
  gradeFillDomainMeters,
  debugName,
  debugMinSamples,
  showSegmentLabels = true,
  showSegmentLengths = true,
  showBoundaryLabels = true,
  showStartAxisLine = false,
  showEndAxisLine = false,
  showDistanceMarkers = false,
  yMarkersUseDomain = false,
  includeYDomainExtents = false,
  markerOpacity = 0.45,
  distanceMarkerMinPx = DISTANCE_MARKER_MIN_PX,
  distanceMarkerStrokeWidth = DISTANCE_MARKER_STROKE_WIDTH,
  distanceMarkerDasharray = DISTANCE_MARKER_DASH,
  showDistanceMarkerLabels = false,
  distanceMarkerIntervalKm = 1,
  distanceMarkerLabelInsets,
  xLabelInsets,
  climbRenderMode = "profile",
}: ElevationProfileProps) {
  const colors = useThemeColors();
  const baseChartPadding = compact ? COMPACT_PADDING : PADDING;
  const chartPadding = showDistanceMarkerLabels
    ? {
        ...baseChartPadding,
        top: Math.max(baseChartPadding.top, DISTANCE_MARKER_LABEL_TOP_SPACE),
      }
    : baseChartPadding;

  const totalMeters = points.length > 0 ? points[points.length - 1].distanceFromStartMeters : 0;
  const totalKm = totalMeters / 1000;

  const fitInnerWidth = Math.max(0, width - chartPadding.left - chartPadding.right);
  const desiredScrollInnerWidth = totalKm * MIN_PX_PER_KM;
  const isScrollable =
    !fitToWidth && totalMeters > 0 && desiredScrollInnerWidth > fitInnerWidth + 0.5;
  const innerWidth = isScrollable ? Math.ceil(desiredScrollInnerWidth) : fitInnerWidth;

  const overviewShown = isScrollable;
  const overviewHeight = overviewShown ? OVERVIEW_HEIGHT : 0;
  const legendHeight = showLegend ? 18 : 0;
  const mainChartHeight = Math.max(0, height - overviewHeight - legendHeight);
  const chartPlotHeight = Math.max(0, mainChartHeight - chartPadding.top - chartPadding.bottom);
  const viewportWidth = Math.max(0, width - chartPadding.left);
  const axisY = chartPadding.top + chartPlotHeight;

  const detailInterval = useMemo(() => {
    if (!isScrollable) return BASE_INTERVAL_M;
    if (totalMeters === 0 || innerWidth === 0) return BASE_INTERVAL_M;
    // ~2 samples per content pixel, with a hard cap on total samples.
    const byDensity = totalMeters / Math.max(1, innerWidth * 2);
    const byCap = totalMeters / MAX_DETAIL_SAMPLES;
    return Math.max(BASE_INTERVAL_M, byDensity, byCap);
  }, [isScrollable, totalMeters, innerWidth]);

  const samples = useMemo(
    () => resampleAtInterval(points, detailInterval),
    [points, detailInterval],
  );

  const domainStart = visibleDomainMeters
    ? Math.max(0, Math.min(totalMeters, visibleDomainMeters.start))
    : 0;
  const domainEnd = visibleDomainMeters
    ? Math.max(domainStart + 1, Math.min(totalMeters, visibleDomainMeters.end))
    : totalMeters;
  const domainLength = Math.max(1, domainEnd - domainStart);

  const visibleSamples = useMemo(() => {
    if (!visibleDomainMeters || samples.length < 2 || totalMeters <= 0) return samples;

    const domainSamples: Sample[] = [
      { distance: domainStart, elevation: interpolateElevation(samples, domainStart) },
    ];
    for (const sample of samples) {
      if (sample.distance > domainStart && sample.distance < domainEnd) {
        domainSamples.push(sample);
      }
    }
    domainSamples.push({
      distance: domainEnd,
      elevation: interpolateElevation(samples, domainEnd),
    });
    return domainSamples;
  }, [visibleDomainMeters, samples, totalMeters, domainStart, domainEnd]);

  const reducedDetail = fitToWidth && !isScrollable && domainLength >= REDUCED_DETAIL_MIN_DOMAIN_M;

  const forcedDistances = useMemo(() => {
    const distances: number[] = [domainStart, domainEnd];
    if (currentPointIndex != null && currentPointIndex >= 0 && currentPointIndex < points.length) {
      distances.push(points[currentPointIndex].distanceFromStartMeters);
    }
    for (const segment of profileSegments ?? []) {
      distances.push(segment.startDistanceMeters - distanceOffsetMeters);
      distances.push(segment.endDistanceMeters - distanceOffsetMeters);
    }
    for (const boundary of segmentBoundaries ?? []) {
      distances.push(boundary.distanceMeters - distanceOffsetMeters);
    }
    for (const climb of climbs ?? []) {
      distances.push(climb.startDistanceMeters - distanceOffsetMeters);
      distances.push(climb.endDistanceMeters - distanceOffsetMeters);
    }
    return distances.filter((distance) => distance >= domainStart && distance <= domainEnd);
  }, [
    climbs,
    currentPointIndex,
    distanceOffsetMeters,
    domainEnd,
    domainStart,
    points,
    profileSegments,
    segmentBoundaries,
  ]);

  const pathSamples = useMemo(() => {
    if (visibleSamples.length <= 2) return visibleSamples;
    if (isScrollable) return visibleSamples;

    const target = Math.min(
      FIT_LOD_MAX_POINTS,
      Math.max(120, Math.ceil(innerWidth * FIT_LOD_POINTS_PER_PX)),
    );
    if (visibleSamples.length <= target) return visibleSamples;

    const lodPoints = downsampleElevationM4(
      visibleSamples.map((sample, idx) => ({
        latitude: 0,
        longitude: 0,
        elevationMeters: sample.elevation,
        distanceFromStartMeters: sample.distance,
        idx,
      })),
      { maxPoints: target, forcedDistancesMeters: forcedDistances },
    );
    return routePointsToSamples(lodPoints);
  }, [forcedDistances, innerWidth, isScrollable, visibleSamples]);

  const overviewInterval = useMemo(() => {
    if (!overviewShown || totalMeters === 0) return BASE_INTERVAL_M;
    return Math.max(BASE_INTERVAL_M, totalMeters / OVERVIEW_MAX_SAMPLES);
  }, [overviewShown, totalMeters]);

  const overviewSamples = useMemo(
    () => (overviewShown ? resampleAtInterval(points, overviewInterval) : []),
    [overviewShown, points, overviewInterval],
  );

  const { yMin, yMax, dataMin, dataMax } = useMemo(() => {
    if (visibleSamples.length < 2) {
      return { yMin: 0, yMax: 100, dataMin: 0, dataMax: 100 };
    }
    let minE = Infinity;
    let maxE = -Infinity;
    for (const s of visibleSamples) {
      if (s.elevation < minE) minE = s.elevation;
      if (s.elevation > maxE) maxE = s.elevation;
    }
    if (yDomainMeters) {
      return { yMin: yDomainMeters.min, yMax: yDomainMeters.max, dataMin: minE, dataMax: maxE };
    }
    const rawRange = maxE - minE || 100;
    const totalD = domainLength;
    const minRange = Math.min(200, Math.max(50, totalD * 0.05));
    const horizMPerPx = innerWidth > 0 ? totalD / innerWidth : 0;
    // Cap vertical exaggeration so long routes in tall charts don't look like cliffs.
    const minRangeForAspect = (chartPlotHeight * horizMPerPx) / MAX_EXAGGERATION;
    const elevRange = Math.max(rawRange, minRange, minRangeForAspect);
    const mid = (minE + maxE) / 2;
    const paddedRange = elevRange * 1.2;
    let yn = mid - paddedRange / 2;
    let yx = mid + paddedRange / 2;
    // If padding would push below sea level but actual data isn't, anchor 0 to bottom.
    if (yn < 0 && minE >= 0) {
      yx = paddedRange;
      yn = 0;
    }
    return { yMin: yn, yMax: yx, dataMin: minE, dataMax: maxE };
  }, [visibleSamples, yDomainMeters, innerWidth, chartPlotHeight, domainLength]);

  const xScale = useCallback(
    (d: number) => (domainLength > 0 ? ((d - domainStart) / domainLength) * innerWidth : 0),
    [domainStart, domainLength, innerWidth],
  );

  const visibleProfileSegments = useMemo(() => {
    if (!profileSegments?.length || totalMeters <= 0) return [];

    let lastLabelRight = -Infinity;

    return profileSegments
      .map((segment) => {
        const startLocal = Math.max(
          domainStart,
          segment.startDistanceMeters - distanceOffsetMeters,
        );
        const endLocal = Math.min(domainEnd, segment.endDistanceMeters - distanceOffsetMeters);
        if (endLocal <= domainStart || startLocal >= domainEnd || endLocal <= startLocal)
          return null;

        const originalStartLocal = segment.startDistanceMeters - distanceOffsetMeters;
        const originalEndLocal = segment.endDistanceMeters - distanceOffsetMeters;
        const fullSegmentVisible =
          originalStartLocal >= domainStart - 1 && originalEndLocal <= domainEnd + 1;

        const x1 = xScale(startLocal);
        const x2 = xScale(endLocal);
        const widthPx = x2 - x1;
        const centerX = x1 + widthPx / 2;
        const nameWidth =
          segment.name.length * SEGMENT_LABEL_AVG_CHAR_PX + SEGMENT_LABEL_SIDE_PADDING_PX * 2;
        const showLabel =
          showSegmentLabels &&
          widthPx >= nameWidth &&
          centerX - nameWidth / 2 >= lastLabelRight + SEGMENT_LABEL_MIN_GAP_PX;
        const showLength =
          showSegmentLengths && fullSegmentVisible && widthPx >= SEGMENT_LENGTH_LABEL_MIN_WIDTH_PX;

        if (showLabel) lastLabelRight = centerX + nameWidth / 2;

        return {
          ...segment,
          x1,
          x2,
          centerX,
          widthPx,
          showLabel,
          showLength,
          fullSegmentVisible,
          originalStartLocal,
          originalEndLocal,
        };
      })
      .filter((segment): segment is NonNullable<typeof segment> => segment != null);
  }, [
    profileSegments,
    totalMeters,
    distanceOffsetMeters,
    domainStart,
    domainEnd,
    xScale,
    showSegmentLabels,
    showSegmentLengths,
  ]);

  const segmentBoundaryXLabels = useMemo(() => {
    if (visibleProfileSegments.length === 0 || totalMeters <= 0 || !showBoundaryLabels) return [];

    const labels: { value: number; x: number }[] = [];
    const seen = new Set<string>();
    for (const segment of visibleProfileSegments) {
      for (const boundary of [
        {
          value: segment.startDistanceMeters,
          x: segment.x1,
          visible: segment.originalStartLocal >= domainStart - 1,
        },
        {
          value: segment.endDistanceMeters,
          x: segment.x2,
          visible: segment.originalEndLocal <= domainEnd + 1,
        },
      ]) {
        if (!boundary.visible) continue;
        if (boundary.x < 0 || boundary.x > innerWidth) continue;
        const key = Math.round(boundary.value).toString();
        if (seen.has(key)) continue;
        seen.add(key);
        labels.push(boundary);
      }
    }

    labels.sort((a, b) => a.x - b.x);
    const visible: { value: number; x: number }[] = [];
    let lastX = -Infinity;
    for (const label of labels) {
      if (label.x - lastX < SEGMENT_BOUNDARY_LABEL_MIN_GAP_PX) continue;
      visible.push(label);
      lastX = label.x;
    }
    return visible;
  }, [visibleProfileSegments, totalMeters, innerWidth, showBoundaryLabels, domainStart, domainEnd]);
  const yScale = useCallback(
    (e: number) =>
      chartPadding.top +
      chartPlotHeight -
      ((e - yMin) / Math.max(1e-6, yMax - yMin)) * chartPlotHeight,
    [chartPadding.top, chartPlotHeight, yMin, yMax],
  );

  const gradientSamples = reducedDetail ? visibleSamples : pathSamples;

  const { linePath, fillPath, gradientStops } = useMemo(() => {
    if (pathSamples.length < 2) {
      return {
        linePath: "",
        fillPath: "",
        gradientStops: [] as { offset: string; color: string }[],
      };
    }
    const lineD = buildLinePath(pathSamples, xScale, yScale);
    const fillD = lineD + ` L${xScale(domainEnd)},${axisY} L${xScale(domainStart)},${axisY} Z`;

    // Decimated gradient stops, smoothed by step interval.
    const n = gradientSamples.length;
    const gradientStopLimit = reducedDetail ? REDUCED_GRADIENT_STOPS : MAX_GRADIENT_STOPS;
    const step = Math.max(1, Math.floor(n / gradientStopLimit));
    const stops: { offset: string; color: string }[] = [];
    for (let i = 0; i < n; i += step) {
      const prev = gradientSamples[Math.max(0, i - step)];
      const cur = gradientSamples[i];
      const dist = cur.distance - prev.distance;
      const grad = dist > 0 ? ((cur.elevation - prev.elevation) / dist) * 100 : 0;
      const fraction = domainLength > 0 ? (cur.distance - domainStart) / domainLength : 0;
      stops.push({ offset: Math.min(1, fraction).toFixed(4), color: gradientColor(grad) });
    }
    if (stops.length === 0 || stops[stops.length - 1].offset !== "1.0000") {
      const last = gradientSamples[n - 1];
      const prev = gradientSamples[Math.max(0, n - 1 - step)];
      const dist = last.distance - prev.distance;
      const grad = dist > 0 ? ((last.elevation - prev.elevation) / dist) * 100 : 0;
      stops.push({ offset: "1.0000", color: gradientColor(grad) });
    }
    return { linePath: lineD, fillPath: fillD, gradientStops: stops };
  }, [
    pathSamples,
    gradientSamples,
    xScale,
    yScale,
    axisY,
    domainStart,
    domainEnd,
    domainLength,
    reducedDetail,
  ]);

  const gradeFillRegions = useMemo<GradeFillRegion[]>(() => {
    if (!gradeFillDomainMeters || pathSamples.length < 2) return [];

    const fillStart = Math.max(domainStart, gradeFillDomainMeters.start);
    const fillEnd = Math.min(domainEnd, gradeFillDomainMeters.end);
    if (fillStart >= fillEnd) return [];

    const boundedSamples: Sample[] = [
      { distance: fillStart, elevation: interpolateElevation(pathSamples, fillStart) },
    ];
    for (const sample of pathSamples) {
      if (sample.distance > fillStart && sample.distance < fillEnd) boundedSamples.push(sample);
    }
    boundedSamples.push({
      distance: fillEnd,
      elevation: interpolateElevation(pathSamples, fillEnd),
    });

    const regions: GradeFillRegion[] = [];
    let runColor: string | null = null;
    let runStart: Sample | null = null;
    let runEnd: Sample | null = null;
    let runPath = "";

    const closeRun = () => {
      if (!runColor || !runStart || !runEnd || !runPath) return;
      regions.push({
        id: `${Math.round(runStart.distance)}-${Math.round(runEnd.distance)}-${runColor}`,
        color: runColor,
        linePath: runPath,
        fillPath:
          runPath +
          ` L${xScale(runEnd.distance)},${axisY} L${xScale(runStart.distance)},${axisY} Z`,
      });
      runColor = null;
      runStart = null;
      runEnd = null;
      runPath = "";
    };

    for (let i = 1; i < boundedSamples.length; i++) {
      const prev = boundedSamples[i - 1];
      const cur = boundedSamples[i];
      const distance = cur.distance - prev.distance;
      const elevationGain = cur.elevation - prev.elevation;
      if (distance <= 0 || elevationGain <= 0) {
        closeRun();
        continue;
      }

      const color = gradientColor((elevationGain / distance) * 100);
      if (runColor !== color) {
        closeRun();
        runColor = color;
        runStart = prev;
        runPath = `M${xScale(prev.distance)},${yScale(prev.elevation)}`;
      }

      runEnd = cur;
      runPath += ` L${xScale(cur.distance)},${yScale(cur.elevation)}`;
    }
    closeRun();

    return regions;
  }, [gradeFillDomainMeters, domainStart, domainEnd, pathSamples, xScale, yScale, axisY]);

  const poiMarkers = useMemo<POIMarkerPos[]>(() => {
    if (!pois || pois.length === 0 || samples.length === 0 || totalMeters === 0) return [];

    const markers: POIMarkerPos[] = [];
    for (const poi of pois) {
      const localDist = poi.distanceAlongRouteMeters - distanceOffsetMeters;
      if (localDist < domainStart || localDist > domainEnd) continue;

      const x = xScale(localDist);
      const elev = interpolateElevation(samples, localDist);
      const baseY = yScale(elev) + POI_MARKER_OFFSET_Y;

      const ohTag = reducedDetail ? null : poi.tags?.opening_hours;
      const ohKey = ohTag ? ohStatusColorKey(getOpeningHoursStatus(ohTag)) : null;
      const ohRingColor = ohKey ? colors[ohKey] : null;

      markers.push({
        poi,
        x,
        y: baseY,
        color: categoryColor(poi.category),
        letter: categoryLetter(poi.category),
        ohRingColor,
      });
    }

    markers.sort((a, b) => a.x - b.x);
    if (reducedDetail && markers.length > REDUCED_POI_MARKER_LIMIT) {
      const step = Math.ceil(markers.length / REDUCED_POI_MARKER_LIMIT);
      return markers.filter((_, index) => index % step === 0).slice(0, REDUCED_POI_MARKER_LIMIT);
    }

    for (let i = 1; i < markers.length; i++) {
      if (markers[i].x - markers[i - 1].x < POI_COLLISION_MIN_PX) {
        markers[i].y = markers[i - 1].y - POI_COLLISION_STEP_PX;
      }
    }
    for (const m of markers) {
      m.y = Math.max(chartPadding.top + POI_MARKER_RADIUS + 2, m.y);
    }
    return markers;
  }, [
    pois,
    samples,
    totalMeters,
    distanceOffsetMeters,
    domainStart,
    domainEnd,
    xScale,
    yScale,
    chartPadding.top,
    colors,
    reducedDetail,
  ]);

  const climbRegions = useMemo<ClimbRegion[]>(() => {
    if (!climbs || climbs.length === 0 || samples.length === 0 || totalMeters === 0) return [];

    const regions: ClimbRegion[] = [];
    for (const climb of climbs) {
      const localStart = climb.startDistanceMeters - distanceOffsetMeters;
      const localEnd = climb.endDistanceMeters - distanceOffsetMeters;
      const visStart = Math.max(domainStart, localStart);
      const visEnd = Math.min(domainEnd, localEnd);
      if (visStart >= visEnd) continue;

      const startX = xScale(visStart);
      const endX = xScale(visEnd);
      const color = climbDifficultyColor(climb.difficultyScore);

      if (climbRenderMode === "range") {
        regions.push({
          id: climb.id,
          color,
          x: startX,
          width: Math.max(1, endX - startX),
        });
        continue;
      }

      const climbSamples = reducedDetail ? pathSamples : samples;
      const startElev = interpolateElevation(climbSamples, visStart);
      let d = `M${startX},${yScale(startElev)}`;

      const startIdx = findFirstSampleAtOrAfter(climbSamples, visStart);
      const endIdx = findFirstSampleAtOrAfter(climbSamples, visEnd);
      for (let i = startIdx; i < endIdx; i++) {
        const s = climbSamples[i];
        if (s.distance <= visStart) continue;
        d += ` L${xScale(s.distance)},${yScale(s.elevation)}`;
      }

      const endElev = interpolateElevation(climbSamples, visEnd);
      d += ` L${endX},${yScale(endElev)}`;
      d += ` L${endX},${axisY} L${startX},${axisY} Z`;

      regions.push({
        id: climb.id,
        color,
        fillPath: d,
      });
    }
    return regions;
  }, [
    climbs,
    samples,
    pathSamples,
    totalMeters,
    distanceOffsetMeters,
    domainStart,
    domainEnd,
    xScale,
    yScale,
    axisY,
    reducedDetail,
    climbRenderMode,
  ]);

  const renderStatsKey = `${debugName ?? "profile"}:${samples.length}:${visibleSamples.length}:${pathSamples.length}:${poiMarkers.length}:${climbRegions.length}:${gradeFillRegions.length}:${reducedDetail}:${Math.round(domainLength / 1000)}`;
  const lastRenderStatsKey = useRef<string | null>(null);
  useEffect(() => {
    if (!__DEV__) return;
    const minSamples = debugMinSamples ?? PROFILE_RENDER_LOG_MIN_SAMPLES;
    if (pathSamples.length < minSamples && visibleSamples.length < minSamples) {
      return;
    }
    if (lastRenderStatsKey.current === renderStatsKey) return;
    lastRenderStatsKey.current = renderStatsKey;
    console.info(
      `[${debugName ? `${debugName}-profile-render` : "profile-render"}] mode=${reducedDetail ? "overview" : "detail"} raw=${samples.length} visibleRaw=${visibleSamples.length} pathLod=${pathSamples.length} pois=${poiMarkers.length} climbs=${climbRegions.length} gradeFills=${gradeFillRegions.length} climbStyle=${climbRenderMode} domainKm=${Math.round(domainLength / 1000)}`,
    );
  }, [
    climbRegions.length,
    climbRenderMode,
    debugMinSamples,
    debugName,
    domainLength,
    gradeFillRegions.length,
    pathSamples.length,
    poiMarkers.length,
    reducedDetail,
    renderStatsKey,
    samples.length,
    visibleSamples.length,
  ]);

  const currentPos = useMemo(() => {
    if (currentPointIndex == null || currentPointIndex < 0 || currentPointIndex >= points.length)
      return null;
    const p = points[currentPointIndex];
    if (p.distanceFromStartMeters < domainStart || p.distanceFromStartMeters > domainEnd)
      return null;
    return {
      x: xScale(p.distanceFromStartMeters),
      y: yScale(p.elevationMeters ?? 0),
    };
  }, [currentPointIndex, points, domainStart, domainEnd, xScale, yScale]);

  const scrollRef = useRef<ScrollView | null>(null);
  const [scrollX, setScrollX] = useState(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollX(e.nativeEvent.contentOffset.x);
  }, []);

  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (!isScrollable) return;
    if (didAutoScroll.current) return;
    if (innerWidth <= viewportWidth) return;
    didAutoScroll.current = true;
    if (currentPos) {
      const target = Math.max(
        0,
        Math.min(innerWidth - viewportWidth, currentPos.x - viewportWidth / 2),
      );
      scrollRef.current?.scrollTo({ x: target, animated: false });
      setScrollX(target);
    }
  }, [isScrollable, currentPos, innerWidth, viewportWidth]);

  const overviewWidth = width;
  const overviewInnerWidth = Math.max(0, overviewWidth - chartPadding.left - chartPadding.right);
  const overviewPlotHeight = OVERVIEW_BAR_HEIGHT - OVERVIEW_PADDING_V * 2;

  const { overviewLinePath, overviewFillPath } = useMemo(() => {
    if (!overviewShown || overviewSamples.length < 2 || overviewInnerWidth === 0) {
      return { overviewLinePath: "", overviewFillPath: "" };
    }
    let minE = Infinity;
    let maxE = -Infinity;
    for (const s of overviewSamples) {
      if (s.elevation < minE) minE = s.elevation;
      if (s.elevation > maxE) maxE = s.elevation;
    }
    const range = maxE - minE || 100;
    const pad = range * 0.1;
    const oyMin = minE - pad;
    const oyMax = maxE + pad;
    const oxs = (d: number) =>
      chartPadding.left + (totalMeters > 0 ? (d / totalMeters) * overviewInnerWidth : 0);
    const oys = (e: number) =>
      OVERVIEW_PADDING_V +
      overviewPlotHeight -
      ((e - oyMin) / Math.max(1e-6, oyMax - oyMin)) * overviewPlotHeight;

    const d = buildLinePath(overviewSamples, oxs, oys);
    const ay = OVERVIEW_PADDING_V + overviewPlotHeight;
    const fillD = d + ` L${oxs(totalMeters)},${ay} L${oxs(0)},${ay} Z`;
    return { overviewLinePath: d, overviewFillPath: fillD };
  }, [
    chartPadding.left,
    overviewShown,
    overviewSamples,
    overviewInnerWidth,
    overviewPlotHeight,
    totalMeters,
  ]);

  const seekFromOverviewX = useCallback(
    (touchX: number) => {
      if (!overviewShown) return;
      const px = Math.max(0, Math.min(overviewInnerWidth, touchX - chartPadding.left));
      const frac = overviewInnerWidth > 0 ? px / overviewInnerWidth : 0;
      const targetContentX = frac * innerWidth;
      const target = Math.max(
        0,
        Math.min(innerWidth - viewportWidth, targetContentX - viewportWidth / 2),
      );
      scrollRef.current?.scrollTo({ x: target, animated: false });
      setScrollX(target);
    },
    [chartPadding.left, overviewShown, overviewInnerWidth, innerWidth, viewportWidth],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => seekFromOverviewX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => seekFromOverviewX(e.nativeEvent.locationX),
    }),
  ).current;

  const viewportIndicator = useMemo(() => {
    if (!overviewShown || innerWidth === 0) return null;
    const fracStart = scrollX / innerWidth;
    const fracEnd = Math.min(1, (scrollX + viewportWidth) / innerWidth);
    const x = chartPadding.left + fracStart * overviewInnerWidth;
    const w = Math.max(4, (fracEnd - fracStart) * overviewInnerWidth);
    return { x, w };
  }, [chartPadding.left, overviewShown, innerWidth, scrollX, viewportWidth, overviewInnerWidth]);

  const overviewCurrentX = useMemo(() => {
    if (!overviewShown || !currentPos || totalMeters === 0 || currentPointIndex == null)
      return null;
    const frac = points[currentPointIndex].distanceFromStartMeters / totalMeters;
    return chartPadding.left + frac * overviewInnerWidth;
  }, [
    chartPadding.left,
    overviewShown,
    currentPos,
    totalMeters,
    currentPointIndex,
    points,
    overviewInnerWidth,
  ]);

  const yLabels = useMemo(() => {
    const extentValues = includeYDomainExtents
      ? new Set([Math.round(yMin), Math.round(yMax)])
      : null;
    const raw = buildYLabels(
      yMin,
      yMax,
      dataMin,
      dataMax,
      yMarkersUseDomain,
      includeYDomainExtents,
    ).map((value) => ({
      value,
      y: yScale(value),
      isExtent: extentValues?.has(value) ?? false,
    }));
    // Drop ticks that would render within MIN_SPACING_PX of the previous one
    // to prevent visual overlap on flat profiles or cramped chart heights.
    if (raw.length <= 1) return raw;
    const sorted = [...raw].sort((a, b) => b.y - a.y);
    const kept: typeof raw = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const spacingOk = kept[kept.length - 1].y - sorted[i].y >= Y_LABEL_MIN_SPACING_PX;
      if (spacingOk) {
        kept.push(sorted[i]);
      }
    }
    return kept;
  }, [yMin, yMax, dataMin, dataMax, yMarkersUseDomain, includeYDomainExtents, yScale]);

  const xLabels = useMemo(() => {
    if (totalMeters <= 0) return [];
    const leftInset = xLabelInsets?.left ?? 0;
    const rightInset = xLabelInsets?.right ?? 0;
    const minLabelX = X_LABEL_HALF_WIDTH + leftInset;
    const maxLabelX = Math.max(minLabelX, innerWidth - X_LABEL_HALF_WIDTH - rightInset);
    const toLabel = (d: number) => {
      const x = xScale(d);
      return {
        value: d,
        x,
        labelX: Math.max(minLabelX, Math.min(maxLabelX, x)),
      };
    };
    if (!isScrollable) {
      return [domainStart, domainStart + domainLength / 2, domainEnd].map(toLabel);
    }
    const target = Math.max(3, Math.round(innerWidth / X_TICK_TARGET_PX));
    return buildXTicks(totalMeters, target).map(toLabel);
  }, [
    totalMeters,
    xLabelInsets?.left,
    xLabelInsets?.right,
    isScrollable,
    innerWidth,
    domainStart,
    domainEnd,
    domainLength,
    xScale,
  ]);

  const distanceMarkers = useMemo(() => {
    if (!showDistanceMarkers || innerWidth <= 0 || domainLength <= 0) return [];
    const absoluteDomainStart = domainStart + distanceOffsetMeters;
    const absoluteDomainEnd = domainEnd + distanceOffsetMeters;
    const totalRouteMeters = distanceOffsetMeters + totalMeters;
    const markerTicks = buildDistanceMarkerDistances(totalRouteMeters, distanceMarkerIntervalKm)
      .filter((distanceMeters) => {
        return (
          distanceMeters > absoluteDomainStart + 1e-6 && distanceMeters < absoluteDomainEnd - 1e-6
        );
      })
      .map((absoluteDistanceMeters) => {
        const value = absoluteDistanceMeters - distanceOffsetMeters;
        return { value, x: xScale(value) };
      })
      .sort((a, b) => a.x - b.x);
    const visible: typeof markerTicks = [];
    let lastX = -Infinity;
    for (const marker of markerTicks) {
      if (marker.x - lastX < distanceMarkerMinPx) continue;
      visible.push(marker);
      lastX = marker.x;
    }
    return visible;
  }, [
    showDistanceMarkers,
    innerWidth,
    domainLength,
    distanceOffsetMeters,
    totalMeters,
    domainStart,
    domainEnd,
    xScale,
    distanceMarkerMinPx,
    distanceMarkerIntervalKm,
  ]);

  const distanceMarkerLabels = useMemo(() => {
    if (!showDistanceMarkerLabels || distanceMarkers.length === 0) return [];
    const leftInset = distanceMarkerLabelInsets?.left ?? 0;
    const rightInset = distanceMarkerLabelInsets?.right ?? 0;
    const minLabelX = X_LABEL_HALF_WIDTH + leftInset;
    const maxLabelX = Math.max(minLabelX, innerWidth - X_LABEL_HALF_WIDTH - rightInset);
    const visible: { value: number; x: number; labelX: number }[] = [];
    let lastLabelRight = -Infinity;

    for (const marker of distanceMarkers) {
      const labelX = Math.max(minLabelX, Math.min(maxLabelX, marker.x));
      const labelLeft = labelX - X_LABEL_HALF_WIDTH;
      if (labelLeft < lastLabelRight + DISTANCE_MARKER_LABEL_MIN_GAP_PX) continue;
      visible.push({ ...marker, labelX });
      lastLabelRight = labelX + X_LABEL_HALF_WIDTH;
    }

    return visible;
  }, [
    showDistanceMarkerLabels,
    distanceMarkers,
    distanceMarkerLabelInsets?.left,
    distanceMarkerLabelInsets?.right,
    innerWidth,
  ]);

  // Memoized SVG tree — avoids re-rendering thousands of nodes on every scroll
  // frame. None of its deps change while the user pans the detail chart.
  const detailSvg = useMemo(
    () => (
      <Svg width={innerWidth} height={mainChartHeight}>
        <Defs>
          <LinearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.textTertiary} stopOpacity="0.15" />
            <Stop offset="1" stopColor={colors.textTertiary} stopOpacity="0.03" />
          </LinearGradient>
          <LinearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            {gradientStops.map((s) => (
              <Stop key={`${s.offset}-${s.color}`} offset={s.offset} stopColor={s.color} />
            ))}
          </LinearGradient>
        </Defs>

        {yLabels.map((l) => (
          <Line
            key={`grid-${l.value}`}
            x1={0}
            y1={l.y}
            x2={innerWidth}
            y2={l.y}
            stroke={colors.border}
            strokeWidth={0.5}
          />
        ))}

        <Path d={fillPath} fill="url(#elevFill)" />

        {gradeFillRegions.map((region) => (
          <Path
            key={`grade-fill-${region.id}`}
            d={region.fillPath}
            fill={region.color}
            opacity={0.18}
          />
        ))}

        {distanceMarkers.map((marker) => (
          <Line
            key={`distance-marker-${Math.round(marker.value)}`}
            x1={marker.x}
            y1={chartPadding.top}
            x2={marker.x}
            y2={axisY}
            stroke={colors.border}
            strokeWidth={distanceMarkerStrokeWidth}
            strokeDasharray={distanceMarkerDasharray}
            opacity={markerOpacity}
          />
        ))}

        {showStartAxisLine && (
          <Line
            x1={xScale(domainStart)}
            y1={chartPadding.top}
            x2={xScale(domainStart)}
            y2={axisY}
            stroke={colors.border}
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.85}
          />
        )}

        {showEndAxisLine && (
          <Line
            x1={xScale(domainEnd)}
            y1={chartPadding.top}
            x2={xScale(domainEnd)}
            y2={axisY}
            stroke={colors.border}
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.85}
          />
        )}

        {climbRegions.map((region) =>
          region.fillPath ? (
            <Path
              key={`climb-${region.id}`}
              d={region.fillPath}
              fill={region.color}
              opacity={0.2}
            />
          ) : (
            <Rect
              key={`climb-${region.id}`}
              x={region.x ?? 0}
              y={chartPadding.top}
              width={region.width ?? 0}
              height={Math.max(0, axisY - chartPadding.top)}
              fill={region.color}
              opacity={0.12}
            />
          ),
        )}

        {visibleProfileSegments.map((segment) => (
          <Line
            key={`profile-segment-top-${segment.startDistanceMeters}-${segment.endDistanceMeters}`}
            x1={segment.x1}
            y1={SEGMENT_TOP_LINE_Y}
            x2={segment.x2}
            y2={SEGMENT_TOP_LINE_Y}
            stroke={segment.color}
            strokeWidth={SEGMENT_TOP_LINE_WIDTH}
            strokeLinecap="round"
            opacity={0.95}
          />
        ))}

        <Path
          d={linePath}
          stroke="url(#lineGrad)"
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
        />

        {gradeFillRegions.map((region) => (
          <Path
            key={`grade-line-${region.id}`}
            d={region.linePath}
            stroke={region.color}
            strokeWidth={2.5}
            fill="none"
            strokeLinejoin="round"
          />
        ))}

        {currentPos && (
          <>
            <Line
              x1={currentPos.x}
              y1={chartPadding.top}
              x2={currentPos.x}
              y2={axisY}
              stroke={colors.accent}
              strokeWidth={1}
              strokeDasharray="4,4"
            />
            <Circle
              cx={currentPos.x}
              cy={currentPos.y}
              r={CURRENT_MARKER_RADIUS}
              fill={colors.accent}
            />
          </>
        )}

        {segmentBoundaries?.map((b) => {
          const localDist = b.distanceMeters - distanceOffsetMeters;
          if (localDist <= domainStart || localDist >= domainEnd) return null;
          const bx = xScale(localDist);
          return (
            <Line
              key={`seg-boundary-${b.distanceMeters}`}
              x1={bx}
              y1={SEGMENT_BOUNDARY_TOP_Y}
              x2={bx}
              y2={axisY}
              stroke={colors.border}
              strokeWidth={SEGMENT_BOUNDARY_STROKE_WIDTH}
              strokeDasharray={SEGMENT_BOUNDARY_DASH}
              opacity={0.9}
            />
          );
        })}

        {(!segmentBoundaries || segmentBoundaries.length === 0) &&
          visibleProfileSegments.map((segment) => {
            const boundaryXs = [
              { key: "start", x: segment.x1 },
              { key: "end", x: segment.x2 },
            ];
            return boundaryXs.map(({ key, x }) => {
              if (x <= 0 || x >= innerWidth) return null;
              return (
                <Line
                  key={`profile-segment-boundary-${segment.startDistanceMeters}-${key}`}
                  x1={x}
                  y1={SEGMENT_BOUNDARY_TOP_Y}
                  x2={x}
                  y2={axisY}
                  stroke={colors.border}
                  strokeWidth={SEGMENT_BOUNDARY_STROKE_WIDTH}
                  strokeDasharray={SEGMENT_BOUNDARY_DASH}
                  opacity={0.9}
                />
              );
            });
          })}

        {visibleProfileSegments.map((segment) =>
          segment.showLabel ? (
            <SvgText
              key={`profile-segment-label-${segment.startDistanceMeters}`}
              x={segment.centerX}
              y={SEGMENT_NAME_Y}
              fontSize={10}
              fontWeight="600"
              fill={colors.textSecondary}
              textAnchor="middle"
              opacity={0.9}
            >
              {segment.name}
            </SvgText>
          ) : null,
        )}

        {visibleProfileSegments.map((segment) =>
          segment.showLength ? (
            <SvgText
              key={`profile-segment-length-${segment.startDistanceMeters}`}
              x={segment.centerX}
              y={SEGMENT_LENGTH_Y}
              fontSize={9}
              fontWeight="500"
              fill={colors.textTertiary}
              textAnchor="middle"
              opacity={0.9}
            >
              {formatDistance(segment.lengthMeters, units)}
            </SvgText>
          ) : null,
        )}

        {poiMarkers.map((m) => (
          <G key={m.poi.id} onPress={onPOIPress ? () => onPOIPress(m.poi) : undefined}>
            {!reducedDetail && m.ohRingColor && (
              <Circle
                cx={m.x}
                cy={m.y}
                r={POI_MARKER_RADIUS + 2.5}
                fill="none"
                stroke={m.ohRingColor}
                strokeWidth={2}
              />
            )}
            <Circle
              cx={m.x}
              cy={m.y}
              r={reducedDetail ? POI_MARKER_RADIUS - 2 : POI_MARKER_RADIUS}
              fill={m.color}
            />
            {!reducedDetail && (
              <SvgText
                x={m.x}
                y={m.y + 3.5}
                fontSize={9}
                fontWeight="bold"
                fill="white"
                textAnchor="middle"
              >
                {m.letter}
              </SvgText>
            )}
            {!reducedDetail && onPOIPress && (
              <Rect
                x={m.x - POI_HIT_SIZE / 2}
                y={m.y - POI_HIT_SIZE / 2}
                width={POI_HIT_SIZE}
                height={POI_HIT_SIZE}
                fill="transparent"
              />
            )}
          </G>
        ))}
      </Svg>
    ),
    [
      innerWidth,
      mainChartHeight,
      colors,
      gradientStops,
      yLabels,
      fillPath,
      gradeFillRegions,
      distanceMarkers,
      distanceMarkerStrokeWidth,
      distanceMarkerDasharray,
      climbRegions,
      linePath,
      currentPos,
      axisY,
      chartPadding.top,
      segmentBoundaries,
      visibleProfileSegments,
      distanceOffsetMeters,
      domainStart,
      domainEnd,
      xScale,
      poiMarkers,
      onPOIPress,
      units,
      reducedDetail,
      showStartAxisLine,
      showEndAxisLine,
      markerOpacity,
    ],
  );

  if (points.length === 0) {
    return (
      <View className="bg-surface" style={{ width, height }}>
        <Text className="text-center text-muted-foreground mt-10">No elevation data</Text>
      </View>
    );
  }

  const detailBody = (
    <View style={{ width: innerWidth, height: mainChartHeight }}>
      {detailSvg}
      {xLabels.map((l) => (
        <Text
          key={`xl-${l.value}`}
          className="font-barlow-sc-medium text-[10px] text-muted-foreground text-center"
          style={{
            position: "absolute",
            left: l.labelX - X_LABEL_HALF_WIDTH,
            bottom: 4,
            width: X_LABEL_WIDTH,
          }}
        >
          {formatDistance(l.value + distanceOffsetMeters, units)}
        </Text>
      ))}
      {distanceMarkerLabels.map((marker) => (
        <Text
          key={`distance-marker-label-${Math.round(marker.value)}`}
          className="font-barlow-sc-medium text-[10px] text-muted-foreground text-center"
          style={{
            position: "absolute",
            left: marker.labelX - X_LABEL_HALF_WIDTH,
            top: DISTANCE_MARKER_LABEL_TOP,
            width: X_LABEL_WIDTH,
          }}
        >
          {formatDistance(marker.value + distanceOffsetMeters, units)}
        </Text>
      ))}
      {segmentBoundaryXLabels.map((l) => (
        <Text
          key={`seg-xl-${l.value}`}
          className="font-barlow-sc-semibold text-[10px] text-foreground text-center"
          style={{
            position: "absolute",
            left: l.x - X_LABEL_HALF_WIDTH,
            bottom: 18,
            width: X_LABEL_WIDTH,
          }}
        >
          {formatDistance(l.value, units)}
        </Text>
      ))}
    </View>
  );

  return (
    <View className="bg-surface" style={{ width, height }}>
      {overviewShown && (
        <View
          style={{ height: OVERVIEW_HEIGHT, width: overviewWidth }}
          {...panResponder.panHandlers}
        >
          <Svg width={overviewWidth} height={OVERVIEW_BAR_HEIGHT}>
            <Defs>
              <LinearGradient id="ovFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.textTertiary} stopOpacity="0.25" />
                <Stop offset="1" stopColor={colors.textTertiary} stopOpacity="0.05" />
              </LinearGradient>
            </Defs>
            <Path d={overviewFillPath} fill="url(#ovFill)" />
            <Path d={overviewLinePath} stroke={colors.textTertiary} strokeWidth={1} fill="none" />
            {viewportIndicator && (
              <Rect
                x={viewportIndicator.x}
                y={OVERVIEW_PADDING_V - 2}
                width={viewportIndicator.w}
                height={overviewPlotHeight + 4}
                fill={colors.accent}
                fillOpacity={0.18}
                stroke={colors.accent}
                strokeWidth={1}
                rx={2}
              />
            )}
            {overviewCurrentX != null && (
              <Circle
                cx={overviewCurrentX}
                cy={OVERVIEW_PADDING_V + overviewPlotHeight / 2}
                r={OVERVIEW_MARKER_RADIUS}
                fill={colors.accent}
              />
            )}
          </Svg>
          <View
            style={{
              position: "absolute",
              left: chartPadding.left,
              right: chartPadding.right,
              top: OVERVIEW_BAR_HEIGHT + 2,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text className="font-barlow-sc-medium text-[10px] text-muted-foreground">
              {formatDistance(distanceOffsetMeters, units)}
            </Text>
            <Text className="font-barlow-sc-medium text-[10px] text-muted-foreground">
              {formatDistance(distanceOffsetMeters + totalMeters, units)}
            </Text>
          </View>
        </View>
      )}

      <View style={{ flexDirection: "row", height: mainChartHeight }}>
        <View style={{ width: chartPadding.left, height: mainChartHeight }}>
          {yLabels.map((l) => (
            <Text
              key={`yl-${l.value}`}
              className="font-barlow-sc-medium text-[10px] text-muted-foreground text-right"
              style={{
                position: "absolute",
                left: 2,
                top: l.y - Y_LABEL_OFFSET_Y,
                width: chartPadding.left - 8,
              }}
            >
              {formatElevation(l.value, units)}
            </Text>
          ))}
        </View>

        {isScrollable ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
            bounces={false}
            overScrollMode="never"
            style={{ width: viewportWidth }}
          >
            {detailBody}
          </ScrollView>
        ) : (
          <View style={{ width: viewportWidth, height: mainChartHeight }}>{detailBody}</View>
        )}
      </View>

      {showLegend && (
        <View className="flex-row items-center justify-center pb-1 gap-1">
          {ELEVATION_STOPS.map((stop) => (
            <React.Fragment key={stop.label}>
              <View className="w-2 h-2 rounded-full ml-1" style={{ backgroundColor: stop.color }} />
              <Text className="text-[9px] text-muted-foreground">{stop.label}</Text>
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}
