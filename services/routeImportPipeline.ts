import { INACTIVE_ROUTE_COLOR } from "@/constants";
import { computePOIRouteAssociation } from "@/utils/geo";
import { parseGPX } from "./gpxParser";
import { parseKML } from "./kmlParser";
import type { ParsedRoute, ParsedWaypoint, Route, RoutePoint, RouteWaypoint } from "@/types";

export interface RouteImportFileContent {
  fileName: string;
  content: string;
}

export interface RouteImportDependencies {
  generateId: () => string;
  now: () => string;
  insertRoute: (route: Route, points: RoutePoint[], waypoints: RouteWaypoint[]) => Promise<void>;
  detectAndStoreClimbs?: (routeId: string, points: RoutePoint[]) => Promise<void>;
}

export interface RouteImportSuccess {
  status: "success";
  index: number;
  fileName: string;
  route: Route;
  fingerprint: string;
}

export interface RouteImportFailure {
  status: "failed";
  index: number;
  fileName: string;
  error: string;
}

export interface RouteImportSkipped {
  status: "skipped";
  index: number;
  fileName: string;
  reason: "duplicate";
  fingerprint: string;
}

export type RouteImportResult = RouteImportSuccess | RouteImportFailure | RouteImportSkipped;
export type RouteImportProgressStatus = "pending" | "importing" | RouteImportResult["status"];

export interface RouteImportProgress {
  index: number;
  fileName: string;
  status: RouteImportProgressStatus;
}

function extensionFor(fileName: string): string | null {
  return fileName.toLowerCase().split(".").pop() ?? null;
}

export function isSupportedRouteFile(fileName: string): boolean {
  const ext = extensionFor(fileName);
  return ext === "gpx" || ext === "kml";
}

function parseRouteContent(file: RouteImportFileContent): ParsedRoute {
  const ext = extensionFor(file.fileName);
  if (ext === "gpx") return parseGPX(file.content, file.fileName);
  if (ext === "kml") return parseKML(file.content, file.fileName);
  throw new Error("Unsupported file type. Use .gpx or .kml files.");
}

export function routeImportFingerprint(parsed: ParsedRoute): string {
  const first = parsed.points[0];
  const last = parsed.points[parsed.points.length - 1];
  return [
    parsed.name.trim().toLowerCase(),
    parsed.points.length,
    Math.round(parsed.totalDistanceMeters),
    first?.latitude.toFixed(5) ?? "none",
    first?.longitude.toFixed(5) ?? "none",
    last?.latitude.toFixed(5) ?? "none",
    last?.longitude.toFixed(5) ?? "none",
  ].join(":");
}

function routeFromParsed(
  parsed: ParsedRoute,
  fileName: string,
  dependencies: RouteImportDependencies,
): Route {
  return {
    id: dependencies.generateId(),
    name: parsed.name,
    fileName,
    color: INACTIVE_ROUTE_COLOR,
    isActive: false,
    isVisible: true,
    totalDistanceMeters: parsed.totalDistanceMeters,
    totalAscentMeters: parsed.totalAscentMeters,
    totalDescentMeters: parsed.totalDescentMeters,
    pointCount: parsed.points.length,
    createdAt: dependencies.now(),
  };
}

function routeWaypointsFromParsed(
  route: Route,
  points: RoutePoint[],
  waypoints: ParsedWaypoint[],
): RouteWaypoint[] {
  return waypoints.map((waypoint, index) => {
    const association = computePOIRouteAssociation(waypoint.latitude, waypoint.longitude, points);
    return {
      id: `${route.id}:gpx:${index}`,
      routeId: route.id,
      sourceIndex: index,
      origin: "gpx",
      name: waypoint.name,
      type: waypoint.type,
      description: waypoint.description,
      elevationMeters: waypoint.elevationMeters,
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      distanceFromRouteMeters: association.distanceFromRouteMeters,
      distanceAlongRouteMeters: association.distanceAlongRouteMeters,
    };
  });
}

export async function importRouteFileContent(
  file: RouteImportFileContent,
  dependencies: RouteImportDependencies,
  options: { index?: number; seenFingerprints?: Set<string> } = {},
): Promise<RouteImportResult> {
  const index = options.index ?? 0;
  try {
    const parsed = parseRouteContent(file);
    const fingerprint = routeImportFingerprint(parsed);
    if (options.seenFingerprints?.has(fingerprint)) {
      return {
        status: "skipped",
        index,
        fileName: file.fileName,
        reason: "duplicate",
        fingerprint,
      };
    }

    const route = routeFromParsed(parsed, file.fileName, dependencies);
    const waypoints = routeWaypointsFromParsed(route, parsed.points, parsed.waypoints);
    await dependencies.insertRoute(route, parsed.points, waypoints);
    await dependencies.detectAndStoreClimbs?.(route.id, parsed.points);
    options.seenFingerprints?.add(fingerprint);

    return { status: "success", index, fileName: file.fileName, route, fingerprint };
  } catch (error) {
    return {
      status: "failed",
      index,
      fileName: file.fileName,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function importRouteBatch(
  files: RouteImportFileContent[],
  dependencies: RouteImportDependencies,
  options: { onProgress?: (progress: RouteImportProgress) => void } = {},
): Promise<RouteImportResult[]> {
  const seenFingerprints = new Set<string>();
  const results: RouteImportResult[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    options.onProgress?.({ index, fileName: file.fileName, status: "importing" });
    const result = await importRouteFileContent(file, dependencies, { index, seenFingerprints });
    results.push(result);
    options.onProgress?.({ index, fileName: file.fileName, status: result.status });
  }

  return results;
}
