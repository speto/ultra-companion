import { HORIZON_CHOICES, type HorizonKm } from "@/types";

/** Human-readable label for a horizon choice. */
export function horizonLabel(km: HorizonKm): string {
  if (km === null) return "Whole route";
  return `${km}`;
}

/** Convert HorizonKm to meters for look-ahead calculations. Returns null for whole-route. */
export function horizonToMeters(km: HorizonKm): number | null {
  if (km === null) return null;
  return km * 1_000;
}

/**
 * Compute the window bounds for a horizon filter.
 * Returns { startDist, endDist } in meters from route start.
 * When horizon is null (whole route), endDist is totalDistance.
 */
export function horizonWindow(
  riderDistMeters: number,
  horizonKm: HorizonKm,
  totalDistanceMeters: number,
): { startDist: number; endDist: number } {
  if (horizonKm === null) {
    return { startDist: riderDistMeters, endDist: totalDistanceMeters };
  }
  const lookAhead = horizonKm * 1_000;
  return {
    startDist: riderDistMeters,
    endDist: Math.min(riderDistMeters + lookAhead, totalDistanceMeters),
  };
}

/** All valid horizon choices for iteration. */
export const HORIZON_OPTIONS = HORIZON_CHOICES;

/**
 * Approximate zoom-level thresholds for horizon bucket sync.
 * When the user manually zooms the map, we map the resulting zoom level
 * to the nearest horizon choice. Ordered from close (high zoom) to wide (low zoom).
 */
const ZOOM_HORIZON_THRESHOLDS: readonly { maxZoom: number; horizon: HorizonKm }[] = [
  { maxZoom: 14.5, horizon: 10 },
  { maxZoom: 12.5, horizon: 20 },
  { maxZoom: 10.5, horizon: 50 },
  { maxZoom: 9.0, horizon: 100 },
  { maxZoom: 7.5, horizon: 200 },
  // below 7.5 -> null (All)
];

/**
 * Map a Mapbox zoom level to the appropriate HorizonKm bucket.
 * Returns null for "All" (very wide zoom).
 */
export function zoomToHorizon(zoom: number): HorizonKm {
  for (const { maxZoom, horizon } of ZOOM_HORIZON_THRESHOLDS) {
    if (zoom >= maxZoom) return horizon;
  }
  return null;
}
