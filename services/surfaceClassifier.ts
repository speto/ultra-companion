import type { SurfaceClass } from "@/types";

const PAVED_SURFACES = new Set([
  "paved",
  "asphalt",
  "chipseal",
  "concrete",
  "concrete:lanes",
  "concrete:plates",
  "paving_stones",
  "paving_stones:lanes",
  "sett",
  "unhewn_cobblestone",
  "bricks",
  "metal",
  "metal_grid",
  "wood",
]);

const UNPAVED_SURFACES = new Set([
  "unpaved",
  "compacted",
  "fine_gravel",
  "gravel",
  "pebblestone",
  "ground",
  "dirt",
  "earth",
  "mud",
  "sand",
  "grass",
  "clay",
  "woodchips",
  "shells",
]);

export function classifySurfaceTag(surface: string | null | undefined): SurfaceClass {
  const normalized = surface?.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (PAVED_SURFACES.has(normalized)) return "paved";
  if (UNPAVED_SURFACES.has(normalized)) return "unpaved";
  return "unknown";
}

export function classifySurfaceTags(tags: Record<string, string>): SurfaceClass {
  return classifySurfaceTag(tags.surface);
}
