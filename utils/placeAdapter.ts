import { getOpeningHoursStatus, isOpenAt } from "@/services/openingHoursParser";
import type { PlaceViewModel, POI, POICategory, RouteWaypoint, StitchedSegmentInfo } from "@/types";

const FOOD_SHOP_CATEGORIES = new Set<POICategory>(["groceries", "bakery", "gas_station"]);

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

export function isConfirmedClosedNow(openingHours: string | null | undefined): boolean {
  if (!openingHours) return false;
  return getOpeningHoursStatus(openingHours)?.isOpen === false;
}

export function filterPlacesByOpenNow(places: PlaceViewModel[]): PlaceViewModel[] {
  return places.filter((p) => {
    if (p.entityType === "routeWaypoint") return true;
    if (!FOOD_SHOP_CATEGORIES.has(p.category as POICategory)) return true;
    return !isConfirmedClosedNow(p.openingHours);
  });
}

export type FoodAvailabilityFilterMode = "off" | "now" | "eta" | "custom";

export function filterPlacesByFoodAvailability(
  places: PlaceViewModel[],
  mode: FoodAvailabilityFilterMode,
  options: {
    customTime: string | null;
    getETAToPOI: (poi: POI) => { eta: Date } | null;
    starredIds?: Set<string>;
  },
): PlaceViewModel[] {
  if (mode === "off") return places;

  const customDate = mode === "custom" && options.customTime ? new Date(options.customTime) : null;
  if (mode === "custom" && (!customDate || Number.isNaN(customDate.getTime()))) return places;

  return places.filter((place) => {
    if (place.entityType !== "downloadedPoi") return true;
    if (options.starredIds?.has(place.entityId)) return true;
    if (!isFoodShopCategory(place.category)) return true;
    if (!place.openingHours) return true;

    if (mode === "now") {
      return !isConfirmedClosedNow(place.openingHours);
    }

    const targetTime = mode === "eta" ? options.getETAToPOI(place.raw as POI)?.eta : customDate;
    if (!targetTime) return true;

    return isOpenAt(place.openingHours, targetTime) !== false;
  });
}

export function isFoodShopCategory(category: POICategory | "waypoint"): boolean {
  return FOOD_SHOP_CATEGORIES.has(category as POICategory);
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
