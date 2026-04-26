import type { Climb } from "@/types";

/** Pick the most relevant climb: current (by distance), next upcoming, or last. */
export function resolveActiveClimb(
  climbs: Climb[],
  currentDist: number | null,
  selectedClimb: Climb | null,
): Climb | null {
  if (selectedClimb) return selectedClimb;
  if (climbs.length === 0) return null;
  if (currentDist == null) return climbs[0];

  const current = climbs.find(
    (c) => currentDist >= c.startDistanceMeters && currentDist <= c.endDistanceMeters,
  );
  if (current) return current;

  const next = climbs.find((c) => c.startDistanceMeters > currentDist);
  return next ?? climbs[climbs.length - 1];
}
export function getClimbOrdinal(
  climbs: Climb[],
  climbId: string,
): { current: number; total: number } | null {
  const index = climbs.findIndex((c) => c.id === climbId);
  if (index === -1) return null;
  return { current: index + 1, total: climbs.length };
}

export function getAdjacentClimb(
  climbs: Climb[],
  currentClimbId: string,
  direction: "prev" | "next",
): Climb | null {
  const index = climbs.findIndex((c) => c.id === currentClimbId);
  if (index === -1) return null;

  if (direction === "prev" && index > 0) {
    return climbs[index - 1];
  }
  if (direction === "next" && index < climbs.length - 1) {
    return climbs[index + 1];
  }
  return null;
}
