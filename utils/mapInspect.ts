import type { Href } from "expo-router";

export type MapInspectType = "route" | "collection";

export interface MapInspectParams {
  type: string | undefined;
  id: string | undefined;
  isValid: boolean;
}

/**
 * Generates the href for the full-screen map inspection route.
 */
export function getMapInspectHref(type: MapInspectType, id: string): Href {
  return `/map-inspect?type=${type}&id=${encodeURIComponent(id)}` as Href;
}

/**
 * Parses and validates the query parameters for the map inspection route.
 */
export function parseMapInspectParams(
  type: string | string[] | undefined,
  id: string | string[] | undefined,
): MapInspectParams {
  const typeStr = Array.isArray(type) ? type[0] : type;
  const idStr = Array.isArray(id) ? id[0] : id;

  const isValidType = typeStr === "route" || typeStr === "collection";
  const isValidId = typeof idStr === "string" && idStr.length > 0;

  return {
    type: typeStr,
    id: idStr,
    isValid: isValidType && isValidId,
  };
}
