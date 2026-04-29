import { haversineDistance } from "./geo";

const EARTH_CIRCUMFERENCE_M = 40075016.686;
const DEFAULT_CENTER_TOLERANCE_PX = 24;
const DEFAULT_ENDPOINT_OVERLAP_PX = 40;

export type MapFocusTargetKind = "gps" | "start" | "finish" | "combined";

export interface MapFocusPoint {
  latitude: number;
  longitude: number;
}

export interface MapFocusInput {
  cameraCenter: [number, number];
  zoom: number;
  gpsPosition?: MapFocusPoint | null;
  start?: MapFocusPoint | null;
  finish?: MapFocusPoint | null;
  centerTolerancePx?: number;
  endpointOverlapPx?: number;
  canAttemptGps?: boolean;
}

export function metersPerPixel(latitude: number, zoom: number): number {
  return (Math.cos((latitude * Math.PI) / 180) * EARTH_CIRCUMFERENCE_M) / (256 * 2 ** zoom);
}

export function distanceMeters(a: MapFocusPoint, b: MapFocusPoint): number {
  return haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
}

export function getTargetCenter(
  target: MapFocusPoint | [MapFocusPoint, MapFocusPoint],
): MapFocusPoint {
  if (!Array.isArray(target)) return target;
  const [start, finish] = target;
  return {
    latitude: (start.latitude + finish.latitude) / 2,
    longitude: (start.longitude + finish.longitude) / 2,
  };
}

export function isCenteredOn(
  cameraCenter: [number, number],
  target: MapFocusPoint,
  zoom: number,
  tolerancePx = DEFAULT_CENTER_TOLERANCE_PX,
): boolean {
  const center = { longitude: cameraCenter[0], latitude: cameraCenter[1] };
  const toleranceMeters = metersPerPixel(target.latitude, zoom) * tolerancePx;
  return distanceMeters(center, target) <= toleranceMeters;
}

export function endpointsLookSame(
  start: MapFocusPoint,
  finish: MapFocusPoint,
  zoom: number,
  thresholdPx = DEFAULT_ENDPOINT_OVERLAP_PX,
): boolean {
  const center = getTargetCenter([start, finish]);
  const thresholdMeters = metersPerPixel(center.latitude, zoom) * thresholdPx;
  return distanceMeters(start, finish) <= thresholdMeters;
}

export function getCurrentFocusTarget(input: MapFocusInput): MapFocusTargetKind | "none" {
  const tolerancePx = input.centerTolerancePx ?? DEFAULT_CENTER_TOLERANCE_PX;
  const endpointOverlapPx = input.endpointOverlapPx ?? DEFAULT_ENDPOINT_OVERLAP_PX;

  if (
    input.gpsPosition &&
    isCenteredOn(input.cameraCenter, input.gpsPosition, input.zoom, tolerancePx)
  ) {
    return "gps";
  }

  if (!input.start || !input.finish) return "none";

  if (endpointsLookSame(input.start, input.finish, input.zoom, endpointOverlapPx)) {
    return isCenteredOn(
      input.cameraCenter,
      getTargetCenter([input.start, input.finish]),
      input.zoom,
      tolerancePx,
    )
      ? "combined"
      : "none";
  }

  if (isCenteredOn(input.cameraCenter, input.start, input.zoom, tolerancePx)) return "start";
  if (isCenteredOn(input.cameraCenter, input.finish, input.zoom, tolerancePx)) return "finish";
  return "none";
}

export function getNextFocusTarget(input: MapFocusInput): MapFocusTargetKind | null {
  const current = getCurrentFocusTarget(input);
  const canFocusGps = input.gpsPosition != null || input.canAttemptGps !== false;
  const start = input.start;
  const finish = input.finish;

  if (!start || !finish) return canFocusGps ? "gps" : null;

  const endpointOverlapPx = input.endpointOverlapPx ?? DEFAULT_ENDPOINT_OVERLAP_PX;
  const endpointsCollapsed = endpointsLookSame(start, finish, input.zoom, endpointOverlapPx);
  const routeFallback: MapFocusTargetKind = endpointsCollapsed ? "combined" : "start";
  const gpsOrRouteFallback = canFocusGps ? "gps" : routeFallback;

  if (endpointsCollapsed) {
    if (current === "gps") return "combined";
    if (current === "combined") return gpsOrRouteFallback;
    return gpsOrRouteFallback;
  }

  if (current === "gps") {
    if (
      input.gpsPosition &&
      isCenteredOn(
        [input.gpsPosition.longitude, input.gpsPosition.latitude],
        start,
        input.zoom,
        input.centerTolerancePx ?? DEFAULT_CENTER_TOLERANCE_PX,
      ) &&
      !isCenteredOn(
        [input.gpsPosition.longitude, input.gpsPosition.latitude],
        finish,
        input.zoom,
        input.centerTolerancePx ?? DEFAULT_CENTER_TOLERANCE_PX,
      )
    ) {
      return "finish";
    }
    return "start";
  }
  if (current === "start") return "finish";
  if (current === "finish") return gpsOrRouteFallback;
  return gpsOrRouteFallback;
}
