import { getOpeningHoursStatus } from "@/services/openingHoursParser";
import type { PlaceViewModel, POI, POICategory, RouteWaypoint, StitchedSegmentInfo } from "@/types";

// --- Adapters: entity -> PlaceViewModel ---

export function downloadedPoiToPlace(poi: POI, distanceOffset = 0): PlaceViewModel {
  return {
    entityType: "downloadedPoi",
    entityId: poi.id,
    placeId: `downloadedPoi:${poi.id}`,
    routeId: poi.routeId,
    category: poi.category,
    name: poi.name,
    latitude: poi.latitude,
    longitude: poi.longitude,
    tags: poi.tags,
    distanceFromRouteMeters: poi.distanceFromRouteMeters,
    rawDistanceAlongRouteMeters: poi.distanceAlongRouteMeters,
    effectiveDistanceAlongRouteMeters: poi.distanceAlongRouteMeters + distanceOffset,
    elevationMeters: null,
    openingHours: poi.tags?.opening_hours ?? null,
    waypointType: null,
    description: null,
    raw: poi,
  };
}

export function routeWaypointToPlace(waypoint: RouteWaypoint, distanceOffset = 0): PlaceViewModel {
  return {
    entityType: "routeWaypoint",
    entityId: waypoint.id,
    placeId: `routeWaypoint:${waypoint.id}`,
    routeId: waypoint.routeId,
    category: "waypoint",
    name: waypoint.name,
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    tags: {},
    distanceFromRouteMeters: waypoint.distanceFromRouteMeters,
    rawDistanceAlongRouteMeters: waypoint.distanceAlongRouteMeters,
    effectiveDistanceAlongRouteMeters: waypoint.distanceAlongRouteMeters + distanceOffset,
    elevationMeters: waypoint.elevationMeters,
    openingHours: null,
    waypointType: waypoint.type,
    description: waypoint.description,
    raw: waypoint,
  };
}

// --- Filtering helpers ---

export function filterPlacesByCategory(
  places: PlaceViewModel[],
  enabledCategories: Set<POICategory | "waypoint">,
): PlaceViewModel[] {
  return places.filter((p) => enabledCategories.has(p.category));
}

export function isKnownOpenNow(openingHours: string | null | undefined): boolean {
  if (!openingHours) return false;
  return getOpeningHoursStatus(openingHours)?.isOpen === true;
}

export function filterPlacesByOpenNow(places: PlaceViewModel[]): PlaceViewModel[] {
  return places.filter((p) => {
    if (p.entityType === "routeWaypoint") return true;
    return isKnownOpenNow(p.openingHours);
  });
}

// --- Category counts ---

export function getPlaceCategoryCounts(
  places: PlaceViewModel[],
): Partial<Record<POICategory | "waypoint", number>> {
  const counts: Partial<Record<POICategory | "waypoint", number>> = {};
  for (const place of places) {
    counts[place.category] = (counts[place.category] ?? 0) + 1;
  }
  return counts;
}

// --- GeoJSON feature builder ---

export function placeToGeoJSONFeature(place: PlaceViewModel): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {
      placeId: place.placeId,
      entityId: place.entityId,
      entityType: place.entityType,
      category: place.category,
      name: place.name,
      waypointType: place.waypointType,
    },
    geometry: {
      type: "Point",
      coordinates: [place.longitude, place.latitude],
    },
  };
}

// --- Stitching: offset places for collection rendering ---

export function stitchPlaces(
  segments: StitchedSegmentInfo[],
  placesByRoute: Record<string, PlaceViewModel[]>,
): PlaceViewModel[] {
  const combined: PlaceViewModel[] = [];

  for (const seg of segments) {
    const places = placesByRoute[seg.routeId];
    if (!places) continue;

    for (const place of places) {
      combined.push({
        ...place,
        effectiveDistanceAlongRouteMeters:
          place.rawDistanceAlongRouteMeters + seg.distanceOffsetMeters,
      });
    }
  }

  combined.sort(
    (a, b) => a.effectiveDistanceAlongRouteMeters - b.effectiveDistanceAlongRouteMeters,
  );
  return combined;
}
