import type {
  POI,
  POICategory,
  RoutePoint,
  RouteWaypoint,
  RouteWithPoints,
  StitchedCollection,
} from "@/types";

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

function formatCoordinate(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function serializeTrackPoint(point: RoutePoint): string {
  const attributes = `lat="${formatCoordinate(point.latitude)}" lon="${formatCoordinate(point.longitude)}"`;

  if (point.elevationMeters === null) {
    return `      <trkpt ${attributes} />`;
  }

  return `      <trkpt ${attributes}>\n        <ele>${point.elevationMeters}</ele>\n      </trkpt>`;
}

function interpolateRoutePointAtDistance(points: RoutePoint[], distanceMeters: number): RoutePoint {
  if (distanceMeters <= points[0].distanceFromStartMeters) return points[0];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const next = points[i];

    if (distanceMeters > next.distanceFromStartMeters) continue;

    const spanMeters = next.distanceFromStartMeters - prev.distanceFromStartMeters;
    if (spanMeters <= 0) return next;

    const ratio = (distanceMeters - prev.distanceFromStartMeters) / spanMeters;
    const elevationMeters =
      prev.elevationMeters != null && next.elevationMeters != null
        ? prev.elevationMeters + (next.elevationMeters - prev.elevationMeters) * ratio
        : null;

    return {
      latitude: prev.latitude + (next.latitude - prev.latitude) * ratio,
      longitude: prev.longitude + (next.longitude - prev.longitude) * ratio,
      elevationMeters,
      distanceFromStartMeters: distanceMeters,
      idx: prev.idx,
    };
  }

  return points[points.length - 1];
}

const POI_WAYPOINT_METADATA: Record<POICategory, { fallbackName: string; karooLabel: string }> = {
  water: { fallbackName: "Water", karooLabel: "Water" },
  groceries: { fallbackName: "Groceries", karooLabel: "Food" },
  gas_station: { fallbackName: "Gas Station", karooLabel: "Food" },
  bakery: { fallbackName: "Bakery", karooLabel: "Food" },
  coffee: { fallbackName: "Coffee", karooLabel: "Cafe" },
  restaurant: { fallbackName: "Restaurant", karooLabel: "Restaurant" },
  bar_pub: { fallbackName: "Bar / Pub", karooLabel: "Water" },
  toilet_shower: { fallbackName: "WC", karooLabel: "Generic" },
  shelter: { fallbackName: "Shelter", karooLabel: "Camping" },
  bus_stop: { fallbackName: "Bus Shelter", karooLabel: "Camping" },
  camp_site: { fallbackName: "Camp Site", karooLabel: "Camping" },
  pharmacy: { fallbackName: "Pharmacy", karooLabel: "Generic" },
  hospital_er: { fallbackName: "Hospital / ER", karooLabel: "Generic" },
  defibrillator: { fallbackName: "Defibrillator", karooLabel: "Generic" },
  emergency_phone: { fallbackName: "Emergency Phone", karooLabel: "Generic" },
  ambulance_station: { fallbackName: "Ambulance", karooLabel: "Generic" },
  bike_shop: { fallbackName: "Bike Shop", karooLabel: "Generic" },
  repair_station: { fallbackName: "Repair Station", karooLabel: "Generic" },
  pump_air: { fallbackName: "Pump / Air", karooLabel: "Generic" },
  train_station: { fallbackName: "Train Station", karooLabel: "Generic" },
  sports: { fallbackName: "Sports", karooLabel: "Camping" },
  cemetery: { fallbackName: "Cemetery", karooLabel: "Water" },
  school: { fallbackName: "School", karooLabel: "Camping" },
};

function getPOIWaypointMetadata(poi: POI) {
  return POI_WAYPOINT_METADATA[poi.category];
}

function formatOffRouteDistance(distanceMeters: number): string {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km off route`;
  }

  return `${Math.round(distanceMeters)} m off route`;
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
  const lines = [
    `  <wpt lat="${formatCoordinate(waypoint.latitude)}" lon="${formatCoordinate(waypoint.longitude)}">`,
  ];

  if (waypoint.name) {
    lines.push(`    <name>${escapeXml(waypoint.name)}</name>`);
  }

  lines.push(`    <type>${escapeXml(waypoint.type ?? "waypoint")}</type>`);
  lines.push(`    <desc>${escapeXml(buildRouteWaypointDescription(waypoint))}</desc>`);
  lines.push("  </wpt>");

  return lines.join("\n");
}

function serializePOIWaypoint(poi: POI, points: RoutePoint[]): string {
  const meta = getPOIWaypointMetadata(poi);
  const cuePoint = interpolateRoutePointAtDistance(points, poi.distanceAlongRouteMeters);
  const name =
    poi.distanceFromRouteMeters > 0
      ? `${poi.name ?? meta.fallbackName} (${formatOffRouteDistance(poi.distanceFromRouteMeters)})`
      : (poi.name ?? meta.fallbackName);

  return [
    `  <wpt lat="${formatCoordinate(cuePoint.latitude)}" lon="${formatCoordinate(cuePoint.longitude)}">`,
    `    <name>${escapeXml(name)}</name>`,
    "    <desc></desc>",
    `    <sym>${escapeXml(meta.karooLabel)}</sym>`,
    `    <type>${escapeXml(meta.karooLabel)}</type>`,
    "  </wpt>",
  ].join("\n");
}

function serializeWaypoints(points: RoutePoint[], options: GPXSerializerOptions): string {
  const routeWaypoints = options.routeWaypoints ?? [];
  const poisAsWaypoints = options.poisAsWaypoints ?? [];
  if (routeWaypoints.length === 0 && poisAsWaypoints.length === 0) {
    return "";
  }

  return `${[
    ...routeWaypoints.map(serializeRouteWaypoint),
    ...poisAsWaypoints.map((poi) => serializePOIWaypoint(poi, points)),
  ].join("\n")}\n`;
}

function serializeTrackGPX(
  name: string,
  points: RoutePoint[],
  options: GPXSerializerOptions = {},
): string {
  const trackPoints = points.map(serializeTrackPoint).join("\n");
  const waypoints = serializeWaypoints(points, options);

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
