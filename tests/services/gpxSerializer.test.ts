import { describe, expect, it } from "vitest";
import { serializeCollectionToGPX, serializeRouteToGPX } from "@/services/gpxSerializer";
import type { POI, RouteWaypoint, RouteWithPoints, StitchedCollection } from "@/types";

const baseRoute: RouteWithPoints = {
  id: "route-1",
  name: "Race Route",
  fileName: "race.gpx",
  color: "#f97316",
  isActive: true,
  isVisible: true,
  totalDistanceMeters: 1234,
  totalAscentMeters: 100,
  totalDescentMeters: 80,
  pointCount: 2,
  createdAt: "2026-04-25T00:00:00.000Z",
  points: [
    {
      latitude: 48.20849,
      longitude: 16.37208,
      elevationMeters: 171,
      distanceFromStartMeters: 0,
      idx: 0,
    },
    {
      latitude: 48.20901,
      longitude: 16.3735,
      elevationMeters: null,
      distanceFromStartMeters: 1234,
      idx: 1,
    },
  ],
};

const baseCollection: StitchedCollection = {
  collectionId: "collection-1",
  totalDistanceMeters: 3000,
  totalAscentMeters: 120,
  totalDescentMeters: 90,
  segments: [
    {
      routeId: "route-a",
      routeName: "First segment",
      position: 0,
      startPointIndex: 0,
      endPointIndex: 1,
      distanceOffsetMeters: 0,
      segmentDistanceMeters: 1000,
      segmentAscentMeters: 40,
      segmentDescentMeters: 20,
    },
    {
      routeId: "route-b",
      routeName: "Second segment",
      position: 1,
      startPointIndex: 2,
      endPointIndex: 3,
      distanceOffsetMeters: 1000,
      segmentDistanceMeters: 2000,
      segmentAscentMeters: 80,
      segmentDescentMeters: 70,
    },
  ],
  points: [
    {
      latitude: 47.1,
      longitude: 15.1,
      elevationMeters: 300,
      distanceFromStartMeters: 0,
      idx: 0,
    },
    {
      latitude: 47.2,
      longitude: 15.2,
      elevationMeters: null,
      distanceFromStartMeters: 1000,
      idx: 1,
    },
    {
      latitude: 48.1,
      longitude: 16.1,
      elevationMeters: 450,
      distanceFromStartMeters: 1000,
      idx: 2,
    },
    {
      latitude: 48.2,
      longitude: 16.2,
      elevationMeters: 500,
      distanceFromStartMeters: 3000,
      idx: 3,
    },
  ],
  pointsByRouteId: {
    "route-a": [],
    "route-b": [],
  },
};

const routeWaypoint: RouteWaypoint = {
  id: "route-1:gpx:0",
  routeId: "route-1",
  sourceIndex: 0,
  origin: "gpx",
  name: "Village shop & water",
  type: "groceries",
  description: "Ask for bottles <behind counter>",
  elevationMeters: 220,
  latitude: 48.21,
  longitude: 16.38,
  distanceFromRouteMeters: 12,
  distanceAlongRouteMeters: 3456,
};

const starredPoi: POI = {
  id: "poi-starred-1",
  sourceId: "osm-node-1",
  source: "osm",
  name: `Cafe "Gravel"`,
  category: "groceries",
  latitude: 48.22,
  longitude: 16.39,
  tags: {
    note: "Starred stop & resupply",
    "contact:phone": "+43 9 876",
  },
  distanceFromRouteMeters: 28,
  distanceAlongRouteMeters: 7890,
  routeId: "route-1",
};

describe("serializeRouteToGPX", () => {
  it("emits deterministic GPX 1.1 track XML for route geometry", () => {
    expect(serializeRouteToGPX(baseRoute)).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ultra Companion" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Race Route</name>
    <trkseg>
      <trkpt lat="48.20849" lon="16.37208">
        <ele>171</ele>
      </trkpt>
      <trkpt lat="48.20901" lon="16.3735" />
    </trkseg>
  </trk>
</gpx>`);
  });

  it("escapes XML-sensitive route names", () => {
    const route = {
      ...baseRoute,
      name: `A&B <route> "quoted" 'apostrophe'`,
    };

    expect(serializeRouteToGPX(route)).toContain(
      "<name>A&amp;B &lt;route&gt; &quot;quoted&quot; &apos;apostrophe&apos;</name>",
    );
  });

  it("emits supplied route-owned waypoints before the route track", () => {
    const gpx = serializeRouteToGPX(baseRoute, {
      routeWaypoints: [routeWaypoint],
    });

    expect(gpx.indexOf("  <wpt")).toBeLessThan(gpx.indexOf("  <trk>"));
    expect(gpx).toContain(`  <wpt lat="48.21" lon="16.38">
    <name>Village shop &amp; water</name>
    <type>groceries</type>
    <desc>Source: gpx; Description: Ask for bottles &lt;behind counter&gt;; Distance from route: 12 m; Distance along route: 3456 m</desc>
  </wpt>`);
  });

  it("omits GPX waypoints when none are supplied", () => {
    expect(serializeRouteToGPX(baseRoute)).not.toContain("<wpt");
  });

  it("escapes waypoint names and description metadata", () => {
    const waypoint: RouteWaypoint = {
      ...routeWaypoint,
      name: `A&B <stop> "quoted" 'apostrophe'`,
      description: `Use "side" door & ask <staff>`,
    };

    const gpx = serializeRouteToGPX(baseRoute, {
      routeWaypoints: [waypoint],
    });

    expect(gpx).toContain(
      "<name>A&amp;B &lt;stop&gt; &quot;quoted&quot; &apos;apostrophe&apos;</name>",
    );
    expect(gpx).toContain("Description: Use &quot;side&quot; door &amp; ask &lt;staff&gt;");
  });

  it("throws a clear error when the route has no points", () => {
    const route = {
      ...baseRoute,
      points: [],
    };

    expect(() => serializeRouteToGPX(route)).toThrow(
      "Cannot serialize GPX for route with no points",
    );
  });
});

describe("serializeCollectionToGPX", () => {
  it("emits GPX track geometry for stitched collection points in route order", () => {
    expect(serializeCollectionToGPX("Race Collection", baseCollection))
      .toBe(`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ultra Companion" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Race Collection</name>
    <trkseg>
      <trkpt lat="47.1" lon="15.1">
        <ele>300</ele>
      </trkpt>
      <trkpt lat="47.2" lon="15.2" />
      <trkpt lat="48.1" lon="16.1">
        <ele>450</ele>
      </trkpt>
      <trkpt lat="48.2" lon="16.2">
        <ele>500</ele>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`);
  });

  it("escapes XML-sensitive collection names", () => {
    expect(
      serializeCollectionToGPX(`A&B <collection> "quoted" 'apostrophe'`, baseCollection),
    ).toContain(
      "<name>A&amp;B &lt;collection&gt; &quot;quoted&quot; &apos;apostrophe&apos;</name>",
    );
  });

  it("emits supplied POIs as GPX waypoints before the collection track", () => {
    const gpx = serializeCollectionToGPX("Race Collection", baseCollection, {
      poisAsWaypoints: [starredPoi],
    });

    expect(gpx.indexOf("  <wpt")).toBeLessThan(gpx.indexOf("  <trk>"));
    expect(gpx).toContain(`  <wpt lat="48.22" lon="16.39">
    <name>Cafe &quot;Gravel&quot;</name>
    <type>groceries</type>
    <desc>Source: osm; Category: groceries; Note: Starred stop &amp; resupply; Phone: +43 9 876; Distance from route: 28 m; Distance along route: 7890 m</desc>
  </wpt>`);
  });

  it("omits GPX waypoints from collections when none are supplied", () => {
    expect(serializeCollectionToGPX("Race Collection", baseCollection)).not.toContain("<wpt");
  });

  it("throws a clear error when the collection has no stitched points", () => {
    const collection = {
      ...baseCollection,
      points: [],
    };

    expect(() => serializeCollectionToGPX("Empty Collection", collection)).toThrow(
      "Cannot serialize GPX for collection with no points",
    );
  });
});
