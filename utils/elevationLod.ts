import type { RoutePoint } from "@/types";

export interface ElevationLodOptions {
  maxPoints: number;
  forcedDistancesMeters?: number[];
}

interface IndexedPoint {
  point: RoutePoint;
  index: number;
}

export function downsampleElevationM4(
  points: RoutePoint[],
  { maxPoints, forcedDistancesMeters = [] }: ElevationLodOptions,
): RoutePoint[] {
  if (points.length <= 2 || points.length <= maxPoints) return points;

  const target = Math.max(2, Math.floor(maxPoints));
  const indexed = points.map((point, index) => ({ point, index }));

  const selected = new Set<number>([0, points.length - 1]);
  const forced = new Set<number>([0, points.length - 1]);
  for (const distance of forcedDistancesMeters) {
    if (!Number.isFinite(distance)) continue;
    const index = nearestIndexByDistance(indexed, distance);
    selected.add(index);
    forced.add(index);
  }

  const remainingBudget = Math.max(0, target - selected.size);
  if (remainingBudget === 0) return selectedPoints(points, selected, target, forced);

  const bucketCount = Math.max(1, Math.ceil(remainingBudget / 4));
  const firstDistance = points[0].distanceFromStartMeters;
  const lastDistance = points[points.length - 1].distanceFromStartMeters;
  const span = Math.max(1, lastDistance - firstDistance);
  const bucketSize = span / bucketCount;
  let cursor = 0;

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const bucketEnd =
      bucket === bucketCount - 1 ? Infinity : firstDistance + (bucket + 1) * bucketSize;
    const start = cursor;
    while (cursor < points.length && points[cursor].distanceFromStartMeters < bucketEnd) cursor++;
    const end = bucket === bucketCount - 1 ? points.length : cursor;
    if (end <= start) continue;

    if (end - start <= 4) {
      for (let i = start; i < end; i++) selected.add(i);
      continue;
    }

    selected.add(start);
    selected.add(end - 1);

    let min = start;
    let max = start;
    for (let i = start + 1; i < end; i++) {
      const elevation = points[i].elevationMeters ?? 0;
      if (elevation < (points[min].elevationMeters ?? 0)) min = i;
      if (elevation > (points[max].elevationMeters ?? 0)) max = i;
    }
    selected.add(min);
    selected.add(max);
  }

  return selectedPoints(points, selected, target, forced);
}

function nearestIndexByDistance(points: IndexedPoint[], target: number) {
  let best = points[0];
  let bestDistance = Math.abs(points[0].point.distanceFromStartMeters - target);
  for (let i = 1; i < points.length; i++) {
    const distance = Math.abs(points[i].point.distanceFromStartMeters - target);
    if (distance < bestDistance) {
      best = points[i];
      bestDistance = distance;
    }
  }
  return best.index;
}

function selectedPoints(
  points: RoutePoint[],
  selected: Set<number>,
  maxPoints: number,
  forced = new Set<number>([0, points.length - 1]),
) {
  const ordered = Array.from(selected).sort((a, b) => a - b);
  if (ordered.length <= maxPoints) return ordered.map((index) => points[index]);

  const removable = ordered.filter((index) => !forced.has(index));
  const keep = new Set<number>(forced);
  const budget = Math.max(0, maxPoints - keep.size);
  if (budget > 0) {
    const step = Math.max(1, (removable.length - 1) / Math.max(1, budget - 1));
    for (let i = 0; i < budget; i++) {
      keep.add(removable[Math.min(removable.length - 1, Math.round(i * step))]);
    }
  }
  return Array.from(keep)
    .sort((a, b) => a - b)
    .map((index) => points[index]);
}
