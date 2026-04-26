export function normalizeHeading(heading: number): number {
  const normalized = heading % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function headingDeltaFromNorth(heading: number): number {
  const normalized = normalizeHeading(heading);
  return Math.min(normalized, 360 - normalized);
}

export function isNorthUp(heading: number, thresholdDegrees = 1): boolean {
  return headingDeltaFromNorth(heading) <= thresholdDegrees;
}

export function nextDisplayHeading(
  previousHeading: number,
  nextHeading: number,
  updateThresholdDegrees = 2,
): number {
  const previous = normalizeHeading(previousHeading);
  const next = normalizeHeading(nextHeading);

  if (isNorthUp(next)) return previous === 0 ? previous : 0;

  const delta = Math.abs(previous - next);
  const wrappedDelta = Math.min(delta, 360 - delta);
  return wrappedDelta > updateThresholdDegrees ? next : previous;
}
