import { describe, expect, it } from "vitest";
import {
  downloadedPoiToPlace,
  routeWaypointToPlace,
  filterPlacesByCategory,
  filterPlacesByOpenNow,
  getPlaceCategoryCounts,
  stitchPlaces,
  placeToGeoJSONFeature,
} from "@/utils/placeAdapter";
import type { POI, POICategory, RouteWaypoint, StitchedSegmentInfo } from "@/types";

const makePoi = (
  id: string,
  routeId: string,
  dist: number,
  category: POICategory = "water",
): POI => ({
  id,
  sourceId: id,
  source: "osm",
  name: `POI ${id}`,
  category,
  latitude: 48.0,
  longitude: 17.0,
  tags: { opening_hours: "Mo-Fr 08:00-18:00" },
  distanceFromRouteMeters: 10,
  distanceAlongRouteMeters: dist,
  routeId,
});

const makeWaypoint = (id: string, routeId: string, dist: number): RouteWaypoint => ({
  id,
  routeId,
  sourceIndex: 0,
  origin: "gpx",
  name: `Waypoint ${id}`,
  type: "control",
  description: null,
  elevationMeters: 250,
  latitude: 48.1,
  longitude: 17.1,
  distanceFromRouteMeters: 5,
  distanceAlongRouteMeters: dist,
});

const makeSegment = (routeId: string, offset: number, distance = 1000): StitchedSegmentInfo => ({
  routeId,
  routeName: routeId,
  position: 0,
  startPointIndex: 0,
  endPointIndex: 1,
  distanceOffsetMeters: offset,
  segmentDistanceMeters: distance,
  segmentAscentMeters: 50,
  segmentDescentMeters: 30,
});

const alwaysOpenHours = JSON.stringify([{ open: { day: 0, hour: 0, minute: 0 } }]);

const mondayClosedHours = JSON.stringify([
  { open: { day: 1, hour: 0, minute: 0 }, close: { day: 1, hour: 1, minute: 0 } },
]);

describe("placeAdapter", () => {
  describe("downloadedPoiToPlace", () => {
    it("maps POI fields to PlaceViewModel", () => {
      const poi = makePoi("p1", "r1", 500);
      const place = downloadedPoiToPlace(poi);

      expect(place.entityType).toBe("downloadedPoi");
      expect(place.entityId).toBe("p1");
      expect(place.placeId).toBe("downloadedPoi:p1");
      expect(place.routeId).toBe("r1");
      expect(place.category).toBe("water");
      expect(place.name).toBe("POI p1");
      expect(place.rawDistanceAlongRouteMeters).toBe(500);
      expect(place.effectiveDistanceAlongRouteMeters).toBe(500);
      expect(place.elevationMeters).toBeNull();
      expect(place.openingHours).toBe("Mo-Fr 08:00-18:00");
      expect(place.waypointType).toBeNull();
      expect(place.raw).toBe(poi);
    });

    it("applies distance offset for collections", () => {
      const poi = makePoi("p1", "r1", 500);
      const place = downloadedPoiToPlace(poi, 2000);
      expect(place.rawDistanceAlongRouteMeters).toBe(500);
      expect(place.effectiveDistanceAlongRouteMeters).toBe(2500);
    });
  });

  describe("routeWaypointToPlace", () => {
    it("maps RouteWaypoint fields to PlaceViewModel", () => {
      const wp = makeWaypoint("w1", "r1", 300);
      const place = routeWaypointToPlace(wp);

      expect(place.entityType).toBe("routeWaypoint");
      expect(place.entityId).toBe("w1");
      expect(place.placeId).toBe("routeWaypoint:w1");
      expect(place.routeId).toBe("r1");
      expect(place.category).toBe("waypoint");
      expect(place.name).toBe("Waypoint w1");
      expect(place.rawDistanceAlongRouteMeters).toBe(300);
      expect(place.elevationMeters).toBe(250);
      expect(place.openingHours).toBeNull();
      expect(place.waypointType).toBe("control");
      expect(place.raw).toBe(wp);
    });
  });

  describe("filterPlacesByCategory", () => {
    it("filters by enabled categories", () => {
      const places = [
        downloadedPoiToPlace(makePoi("p1", "r1", 100, "water")),
        downloadedPoiToPlace(makePoi("p2", "r1", 200, "groceries")),
        routeWaypointToPlace(makeWaypoint("w1", "r1", 150)),
      ];
      const enabled = new Set<POICategory | "waypoint">(["water", "waypoint"]);
      const filtered = filterPlacesByCategory(places, enabled);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].entityId).toBe("p1");
      expect(filtered[1].entityId).toBe("w1");
    });
  });

  describe("filterPlacesByOpenNow", () => {
    it("keeps only known-open downloaded POIs while passing route waypoints through", () => {
      const places = [
        downloadedPoiToPlace({
          ...makePoi("known-open", "r1", 100, "water"),
          tags: { opening_hours: alwaysOpenHours },
        }),
        downloadedPoiToPlace({
          ...makePoi("known-closed", "r1", 200, "water"),
          tags: { opening_hours: mondayClosedHours },
        }),
        downloadedPoiToPlace({
          ...makePoi("missing-hours", "r1", 300, "water"),
          tags: {},
        }),
        downloadedPoiToPlace({
          ...makePoi("malformed-hours", "r1", 400, "water"),
          tags: { opening_hours: "not-json" },
        }),
        routeWaypointToPlace(makeWaypoint("waypoint", "r1", 500)),
      ];
      expect(filterPlacesByOpenNow(places).map((place) => place.entityId)).toEqual([
        "known-open",
        "waypoint",
      ]);
    });
  });

  describe("getPlaceCategoryCounts", () => {
    it("counts by category", () => {
      const places = [
        downloadedPoiToPlace(makePoi("p1", "r1", 100, "water")),
        downloadedPoiToPlace(makePoi("p2", "r1", 200, "water")),
        downloadedPoiToPlace(makePoi("p3", "r1", 300, "groceries")),
        routeWaypointToPlace(makeWaypoint("w1", "r1", 150)),
      ];
      const counts = getPlaceCategoryCounts(places);

      expect(counts.water).toBe(2);
      expect(counts.groceries).toBe(1);
      expect(counts.waypoint).toBe(1);
    });
  });

  describe("placeToGeoJSONFeature", () => {
    it("creates valid GeoJSON feature", () => {
      const place = downloadedPoiToPlace(makePoi("p1", "r1", 100));
      const feature = placeToGeoJSONFeature(place);

      expect(feature.type).toBe("Feature");
      expect(feature.properties?.placeId).toBe("downloadedPoi:p1");
      expect(feature.properties?.entityType).toBe("downloadedPoi");
      expect(feature.properties?.category).toBe("water");
      expect(feature.geometry?.type).toBe("Point");
      // Cast to Point geometry for coordinates access
      const geom = feature.geometry as GeoJSON.Point;
      expect(geom.coordinates).toEqual([17.0, 48.0]);
    });
  });

  describe("stitchPlaces", () => {
    it("offsets and sorts places across segments", () => {
      const segments = [makeSegment("r1", 0), makeSegment("r2", 1000)];

      const placesByRoute = {
        r1: [
          downloadedPoiToPlace(makePoi("p1", "r1", 800)),
          routeWaypointToPlace(makeWaypoint("w1", "r1", 500)),
        ],
        r2: [downloadedPoiToPlace(makePoi("p2", "r2", 100))],
      };

      const stitched = stitchPlaces(segments, placesByRoute);

      expect(stitched).toHaveLength(3);
      // w1 at 500, p1 at 800, p2 at 1000+100=1100
      expect(stitched.map((p) => p.entityId)).toEqual(["w1", "p1", "p2"]);
      expect(stitched[2].effectiveDistanceAlongRouteMeters).toBe(1100);
    });

    it("ignores routes with no places", () => {
      const segments = [makeSegment("r1", 0), makeSegment("r2", 1000)];

      const placesByRoute = {
        r1: [downloadedPoiToPlace(makePoi("p1", "r1", 100))],
      };

      const stitched = stitchPlaces(segments, placesByRoute);
      expect(stitched).toHaveLength(1);
      expect(stitched[0].entityId).toBe("p1");
    });
  });
});
