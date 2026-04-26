import type { RoutePoint } from "@/types";

const EARTH_RADIUS_M = 6_371_000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Bearing in degrees (0=N, clockwise) from point A to point B */
export function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Haversine distance between two points in meters */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compute cumulative distances and elevation stats for an array of raw coordinates */
export function computeRouteStats(
  coords: { latitude: number; longitude: number; elevation: number | null }[],
): {
  points: RoutePoint[];
  totalDistanceMeters: number;
  totalAscentMeters: number;
  totalDescentMeters: number;
} {
  let totalDistance = 0;
  let totalAscent = 0;
  let totalDescent = 0;

  const points: RoutePoint[] = coords.map((coord, i) => {
    if (i > 0) {
      const prev = coords[i - 1];
      totalDistance += haversineDistance(
        prev.latitude,
        prev.longitude,
        coord.latitude,
        coord.longitude,
      );

      if (coord.elevation != null && prev.elevation != null) {
        const elevDiff = coord.elevation - prev.elevation;
        if (elevDiff > 0) totalAscent += elevDiff;
        else totalDescent += Math.abs(elevDiff);
      }
    }

    return {
      latitude: coord.latitude,
      longitude: coord.longitude,
      elevationMeters: coord.elevation,
      distanceFromStartMeters: totalDistance,
      idx: i,
    };
  });

  return {
    points,
    totalDistanceMeters: totalDistance,
    totalAscentMeters: totalAscent,
    totalDescentMeters: totalDescent,
  };
}

/**
 * Find the nearest point on a route to a given position.
 * Returns the index of the nearest point and perpendicular distance.
 */
export function findNearestPointOnRoute(
  lat: number,
  lon: number,
  points: RoutePoint[],
): { index: number; distanceMeters: number } {
  let minDist = Infinity;
  let minIndex = 0;

  for (let i = 0; i < points.length; i++) {
    const d = haversineDistance(lat, lon, points[i].latitude, points[i].longitude);
    if (d < minDist) {
      minDist = d;
      minIndex = i;
    }
  }

  return { index: minIndex, distanceMeters: minDist };
}

/** Downsample an array to at most maxPoints using Ramer-Douglas-Peucker on elevation vs distance */
export function downsampleForChart<
  T extends { distanceFromStartMeters: number; elevationMeters: number | null },
>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;

  // Simple uniform sampling — preserves first and last
  const step = (points.length - 1) / (maxPoints - 1);
  const result: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.round(i * step)]);
  }
  return result;
}

/** Compute elevation gain/loss done and remaining at a given point index */
export function computeElevationProgress(
  points: RoutePoint[],
  currentIndex: number,
): {
  ascentDone: number;
  descentDone: number;
  ascentRemaining: number;
  descentRemaining: number;
} {
  let ascentDone = 0;
  let descentDone = 0;
  let ascentRemaining = 0;
  let descentRemaining = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].elevationMeters;
    const curr = points[i].elevationMeters;
    if (prev == null || curr == null) continue;
    const diff = curr - prev;
    if (i <= currentIndex) {
      if (diff > 0) ascentDone += diff;
      else descentDone += Math.abs(diff);
    } else {
      if (diff > 0) ascentRemaining += diff;
      else descentRemaining += Math.abs(diff);
    }
  }

  return { ascentDone, descentDone, ascentRemaining, descentRemaining };
}

/**
 * Extract a slice of route points starting at startIndex, going forward by maxDistanceM.
 * Returns re-indexed points with distances re-zeroed from the slice start.
 */
export function extractRouteSlice(
  points: RoutePoint[],
  startIndex: number,
  maxDistanceM: number,
): RoutePoint[] {
  if (startIndex < 0 || startIndex >= points.length) return [];

  const startDist = points[startIndex].distanceFromStartMeters;
  const endDist = startDist + maxDistanceM;

  let endIndex = startIndex;
  while (endIndex < points.length - 1 && points[endIndex + 1].distanceFromStartMeters <= endDist) {
    endIndex++;
  }
  // Include one point past the boundary for a complete slice
  if (endIndex < points.length - 1) endIndex++;

  const slice = points.slice(startIndex, endIndex + 1);
  return slice.map((p, i) => ({
    latitude: p.latitude,
    longitude: p.longitude,
    elevationMeters: p.elevationMeters,
    distanceFromStartMeters: p.distanceFromStartMeters - startDist,
    idx: i,
  }));
}

/** Compute bounding box for an array of route points */
export function computeBounds(points: RoutePoint[]): {
  ne: [number, number];
  sw: [number, number];
} {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLon) minLon = p.longitude;
    if (p.longitude > maxLon) maxLon = p.longitude;
  }
  return {
    ne: [maxLon, maxLat],
    sw: [minLon, minLat],
  };
}

/** Compute ascent within a distance-bounded slice starting at a given index */
export function computeSliceAscent(
  points: RoutePoint[],
  startIndex: number,
  endDistanceMeters: number,
): number {
  let ascent = 0;
  for (let i = startIndex + 1; i < points.length; i++) {
    if (points[i].distanceFromStartMeters > endDistanceMeters) break;
    const prev = points[i - 1].elevationMeters;
    const curr = points[i].elevationMeters;
    if (prev != null && curr != null && curr > prev) ascent += curr - prev;
  }
  return ascent;
}

/** Compute descent within a distance-bounded slice starting at a given index */
export function computeSliceDescent(
  points: RoutePoint[],
  startIndex: number,
  endDistanceMeters: number,
): number {
  let descent = 0;
  for (let i = startIndex + 1; i < points.length; i++) {
    if (points[i].distanceFromStartMeters > endDistanceMeters) break;
    const prev = points[i - 1].elevationMeters;
    const curr = points[i].elevationMeters;
    if (prev != null && curr != null && curr < prev) descent += prev - curr;
  }
  return descent;
}

// --- Phase 3: POI-to-route association ---

/**
 * Perpendicular distance from a point to a line segment, using planar
 * approximation with latitude-corrected longitude. Returns the distance
 * in meters and the fraction (0–1) along the segment of the closest point.
 */
export function pointToSegmentDistance(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): { distanceMeters: number; fraction: number } {
  // Convert to approximate meters using local tangent plane
  const cosLat = Math.cos(toRad((aLat + bLat) / 2));
  const px = (pLon - aLon) * cosLat;
  const py = pLat - aLat;
  const bx = (bLon - aLon) * cosLat;
  const by = bLat - aLat;

  const segLenSq = bx * bx + by * by;
  let fraction: number;

  if (segLenSq < 1e-12) {
    // Degenerate segment (a == b)
    fraction = 0;
  } else {
    fraction = Math.max(0, Math.min(1, (px * bx + py * by) / segLenSq));
  }

  const projLat = aLat + fraction * (bLat - aLat);
  const projLon = aLon + fraction * (bLon - aLon);

  return {
    distanceMeters: haversineDistance(pLat, pLon, projLat, projLon),
    fraction,
  };
}

/**
 * For a POI at (lat, lon), find the nearest point on the route
 * and compute both perpendicular distance and distance along route.
 * Uses segment projection for accuracy.
 */
export function computePOIRouteAssociation(
  poiLat: number,
  poiLon: number,
  routePoints: RoutePoint[],
): {
  distanceFromRouteMeters: number;
  distanceAlongRouteMeters: number;
  nearestIndex: number;
} {
  if (routePoints.length === 0) {
    return { distanceFromRouteMeters: Infinity, distanceAlongRouteMeters: 0, nearestIndex: 0 };
  }

  if (routePoints.length === 1) {
    return {
      distanceFromRouteMeters: haversineDistance(
        poiLat,
        poiLon,
        routePoints[0].latitude,
        routePoints[0].longitude,
      ),
      distanceAlongRouteMeters: routePoints[0].distanceFromStartMeters,
      nearestIndex: 0,
    };
  }

  let bestDist = Infinity;
  let bestAlongRoute = 0;
  let bestIndex = 0;

  for (let i = 0; i < routePoints.length - 1; i++) {
    const a = routePoints[i];
    const b = routePoints[i + 1];

    const { distanceMeters, fraction } = pointToSegmentDistance(
      poiLat,
      poiLon,
      a.latitude,
      a.longitude,
      b.latitude,
      b.longitude,
    );

    if (distanceMeters < bestDist) {
      bestDist = distanceMeters;
      // Interpolate the along-route distance
      bestAlongRoute =
        a.distanceFromStartMeters +
        fraction * (b.distanceFromStartMeters - a.distanceFromStartMeters);
      bestIndex = fraction < 0.5 ? i : i + 1;
    }
  }

  return {
    distanceFromRouteMeters: bestDist,
    distanceAlongRouteMeters: bestAlongRoute,
    nearestIndex: bestIndex,
  };
}

/** Convert route points to GeoJSON LineString for Mapbox */
export function routeToGeoJSON(points: RoutePoint[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: points.map((p) => [p.longitude, p.latitude]),
    },
  };
}

export interface DirectionArrowProperties {
  bearing: number;
  rotation: number;
  color: string;
}

const DIRECTION_ARROW_MIN_SPACING_M = 3000;
const DIRECTION_ARROW_ENDPOINT_CLEARANCE_M = 3000;
const DIRECTION_ARROW_OVERVIEW_ZOOM = 8;
const DIRECTION_ARROW_MID_ZOOM = 10;
const DIRECTION_ARROW_DETAIL_ZOOM = 13;
const DIRECTION_ARROW_OVERVIEW_BEARING_WINDOW_M = 800;
const DIRECTION_ARROW_MID_BEARING_WINDOW_M = 400;
const DIRECTION_ARROW_DETAIL_BEARING_WINDOW_M = 150;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function selectDirectionArrowCount(segmentDistanceMeters: number): number {
  const segmentKm = segmentDistanceMeters / 1000;
  if (segmentKm < 8) return 0;

  if (segmentKm <= 100) {
    return clamp(Math.round(segmentKm / 12.5), 1, 8);
  }

  if (segmentKm < 200) {
    const t = (segmentKm - 100) / 100;
    return Math.round(8 - t * 3);
  }

  return 5;
}

function interpolateNumber(
  input: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number,
): number {
  const t = clamp((input - inputMin) / (inputMax - inputMin), 0, 1);
  return outputMin + (outputMax - outputMin) * t;
}

function selectDirectionArrowBearingWindowMeters(zoom: number): number {
  if (zoom <= DIRECTION_ARROW_MID_ZOOM) {
    return interpolateNumber(
      zoom,
      DIRECTION_ARROW_OVERVIEW_ZOOM,
      DIRECTION_ARROW_MID_ZOOM,
      DIRECTION_ARROW_OVERVIEW_BEARING_WINDOW_M,
      DIRECTION_ARROW_MID_BEARING_WINDOW_M,
    );
  }

  return interpolateNumber(
    zoom,
    DIRECTION_ARROW_MID_ZOOM,
    DIRECTION_ARROW_DETAIL_ZOOM,
    DIRECTION_ARROW_MID_BEARING_WINDOW_M,
    DIRECTION_ARROW_DETAIL_BEARING_WINDOW_M,
  );
}

function interpolateRoutePointAtDistance(
  points: RoutePoint[],
  distanceMeters: number,
): { point: RoutePoint; previous: RoutePoint } | null {
  if (points.length < 2) return null;

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    const previousDistance = previous.distanceFromStartMeters;
    const currentDistance = current.distanceFromStartMeters;

    if (distanceMeters > currentDistance) continue;

    if (currentDistance <= previousDistance) {
      return { point: current, previous };
    }

    const fraction = (distanceMeters - previousDistance) / (currentDistance - previousDistance);
    return {
      point: {
        latitude: previous.latitude + (current.latitude - previous.latitude) * fraction,
        longitude: previous.longitude + (current.longitude - previous.longitude) * fraction,
        elevationMeters: null,
        distanceFromStartMeters: distanceMeters,
        idx: previous.idx,
      },
      previous,
    };
  }

  return null;
}

/**
 * Sample direction arrow positions along a route, computing bearing at each point.
 * Spacing adapts to the rendered segment length so similarly sized segments look consistent.
 * Returns a GeoJSON FeatureCollection of Points with bearing, glyph rotation, and color properties.
 */
export function buildDirectionArrows(
  points: RoutePoint[],
  routeColor: string,
  zoom = DIRECTION_ARROW_MID_ZOOM,
  minSpacingMeters = DIRECTION_ARROW_MIN_SPACING_M,
): GeoJSON.FeatureCollection<GeoJSON.Point, DirectionArrowProperties> {
  if (points.length < 2) {
    return { type: "FeatureCollection", features: [] };
  }

  const totalDistance = points[points.length - 1].distanceFromStartMeters;
  const targetArrowCount = selectDirectionArrowCount(totalDistance);
  if (targetArrowCount === 0 || totalDistance < minSpacingMeters) {
    return { type: "FeatureCollection", features: [] };
  }

  const endpointClearance = DIRECTION_ARROW_ENDPOINT_CLEARANCE_M;
  const usableDistance = totalDistance - endpointClearance * 2;
  if (usableDistance <= 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const maxArrowCountBySpacing =
    targetArrowCount <= 1 ? 1 : Math.max(1, Math.floor(usableDistance / minSpacingMeters) + 1);
  const effectiveArrowCount = Math.max(1, Math.min(targetArrowCount, maxArrowCountBySpacing));
  const spacing = effectiveArrowCount <= 1 ? 0 : usableDistance / (effectiveArrowCount - 1);
  const bearingWindowMeters = selectDirectionArrowBearingWindowMeters(zoom);

  const features: GeoJSON.Feature<GeoJSON.Point, DirectionArrowProperties>[] = [];

  for (let i = 1; i <= effectiveArrowCount; i++) {
    const arrowDistance =
      effectiveArrowCount <= 1 ? totalDistance / 2 : endpointClearance + spacing * (i - 1);
    const sample = interpolateRoutePointAtDistance(points, arrowDistance);
    if (!sample) continue;

    const before = interpolateRoutePointAtDistance(
      points,
      clamp(arrowDistance - bearingWindowMeters, 0, totalDistance),
    );
    const after = interpolateRoutePointAtDistance(
      points,
      clamp(arrowDistance + bearingWindowMeters, 0, totalDistance),
    );

    const bearing = computeBearing(
      before?.point.latitude ?? sample.previous.latitude,
      before?.point.longitude ?? sample.previous.longitude,
      after?.point.latitude ?? sample.point.latitude,
      after?.point.longitude ?? sample.point.longitude,
    );
    const rotation = (bearing - 90 + 360) % 360;
    features.push({
      type: "Feature",
      id: `arrow-${Math.round(arrowDistance)}`,
      properties: { bearing, rotation, color: routeColor },
      geometry: {
        type: "Point",
        coordinates: [sample.point.longitude, sample.point.latitude],
      },
    });
  }

  return { type: "FeatureCollection", features };
}
