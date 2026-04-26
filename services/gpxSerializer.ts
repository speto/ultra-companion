import type { POI, RoutePoint, RouteWaypoint, RouteWithPoints, StitchedCollection } from "@/types";

export interface GPXSerializerOptions {
  routeWaypoints?: RouteWaypoint[];
  poisAsWaypoints?: POI[];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function serializeTrackPoint(point: RoutePoint): string {
  const attributes = `lat="${point.latitude}" lon="${point.longitude}"`;

  if (point.elevationMeters === null) {
    return `      <trkpt ${attributes} />`;
  }

  return `      <trkpt ${attributes}>\n        <ele>${point.elevationMeters}</ele>\n      </trkpt>`;
}

function getPoiTag(poi: POI, keys: string[]): string | null {
  for (const key of keys) {
    const value = poi.tags[key];

    if (value) {
      return value;
    }
  }

  return null;
}

function buildPOIWaypointDescription(poi: POI): string {
  const parts = [`Source: ${poi.source}`, `Category: ${poi.category}`];
  const description = getPoiTag(poi, ["description", "desc"]);
  const note = getPoiTag(poi, ["note"]);
  const phone = getPoiTag(poi, ["phone", "contact:phone"]);
  const openingHours = getPoiTag(poi, ["opening_hours", "openingHours"]);

  if (description) {
    parts.push(`Description: ${description}`);
  }

  if (note) {
    parts.push(`Note: ${note}`);
  }

  if (phone) {
    parts.push(`Phone: ${phone}`);
  }

  if (openingHours) {
    parts.push(`Opening hours: ${openingHours}`);
  }

  parts.push(`Distance from route: ${poi.distanceFromRouteMeters} m`);
  parts.push(`Distance along route: ${poi.distanceAlongRouteMeters} m`);

  return parts.join("; ");
}

function buildRouteWaypointDescription(waypoint: RouteWaypoint): string {
  const parts = [`Source: ${waypoint.origin}`];

  if (waypoint.description) {
    parts.push(`Description: ${waypoint.description}`);
  }

  parts.push(`Distance from route: ${waypoint.distanceFromRouteMeters} m`);
  parts.push(`Distance along route: ${waypoint.distanceAlongRouteMeters} m`);

  return parts.join("; ");
}

function serializeRouteWaypoint(waypoint: RouteWaypoint): string {
  const lines = [`  <wpt lat="${waypoint.latitude}" lon="${waypoint.longitude}">`];

  if (waypoint.name) {
    lines.push(`    <name>${escapeXml(waypoint.name)}</name>`);
  }

  lines.push(`    <type>${escapeXml(waypoint.type ?? "waypoint")}</type>`);
  lines.push(`    <desc>${escapeXml(buildRouteWaypointDescription(waypoint))}</desc>`);
  lines.push("  </wpt>");

  return lines.join("\n");
}

function serializePOIWaypoint(poi: POI): string {
  const lines = [`  <wpt lat="${poi.latitude}" lon="${poi.longitude}">`];

  if (poi.name) {
    lines.push(`    <name>${escapeXml(poi.name)}</name>`);
  }

  lines.push(`    <type>${escapeXml(poi.category)}</type>`);
  lines.push(`    <desc>${escapeXml(buildPOIWaypointDescription(poi))}</desc>`);
  lines.push("  </wpt>");

  return lines.join("\n");
}

function serializeWaypoints(options: GPXSerializerOptions): string {
  const routeWaypoints = options.routeWaypoints ?? [];
  const poisAsWaypoints = options.poisAsWaypoints ?? [];
  if (routeWaypoints.length === 0 && poisAsWaypoints.length === 0) {
    return "";
  }

  return `${[
    ...routeWaypoints.map(serializeRouteWaypoint),
    ...poisAsWaypoints.map(serializePOIWaypoint),
  ].join("\n")}\n`;
}

function serializeTrackGPX(
  name: string,
  points: RoutePoint[],
  options: GPXSerializerOptions = {},
): string {
  const trackPoints = points.map(serializeTrackPoint).join("\n");
  const waypoints = serializeWaypoints(options);

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ultra Companion" xmlns="http://www.topografix.com/GPX/1/1">
${waypoints}  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

export function serializeRouteToGPX(
  route: RouteWithPoints,
  options: GPXSerializerOptions = {},
): string {
  if (route.points.length === 0) {
    throw new Error("Cannot serialize GPX for route with no points");
  }

  return serializeTrackGPX(route.name, route.points, options);
}

export function serializeCollectionToGPX(
  collectionName: string,
  collection: StitchedCollection,
  options: GPXSerializerOptions = {},
): string {
  if (collection.points.length === 0) {
    throw new Error("Cannot serialize GPX for collection with no points");
  }

  return serializeTrackGPX(collectionName, collection.points, options);
}
