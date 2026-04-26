import { describe, expect, it } from "vitest";
import { buildSurfaceOverpassQuery, mapOverpassToSurfaceWays } from "@/services/surfaceOverpass";
import type { OverpassElement } from "@/services/overpassClient";

describe("surfaceOverpass", () => {
  it("builds a highway surface query for a route corridor", () => {
    const query = buildSurfaceOverpassQuery(
      [
        { lat: 48.1, lon: 17.1 },
        { lat: 48.2, lon: 17.2 },
      ],
      75,
    );

    expect(query).toContain("[out:json][timeout:30]");
    expect(query).toContain('way["highway"]["surface"](around:75,48.1,17.1,48.2,17.2);');
    expect(query).toContain("out tags geom;");
  });

  it("maps Overpass surface ways to classified route-surface candidates", () => {
    const elements: OverpassElement[] = [
      {
        type: "way",
        id: 10,
        tags: { highway: "secondary", surface: "asphalt", name: "Main road" },
        geometry: [
          { lat: 48.1, lon: 17.1 },
          { lat: 48.2, lon: 17.2 },
        ],
      },
      {
        type: "way",
        id: 11,
        tags: { highway: "track", surface: "fine_gravel" },
        geometry: [
          { lat: 48.3, lon: 17.3 },
          { lat: 48.4, lon: 17.4 },
        ],
      },
      {
        type: "node",
        id: 12,
        tags: { highway: "crossing", surface: "asphalt" },
      },
    ];

    expect(mapOverpassToSurfaceWays(elements)).toEqual([
      {
        sourceId: "way/10",
        surfaceTag: "asphalt",
        surfaceClass: "paved",
        tags: { highway: "secondary", surface: "asphalt", name: "Main road" },
        geometry: [
          { latitude: 48.1, longitude: 17.1 },
          { latitude: 48.2, longitude: 17.2 },
        ],
      },
      {
        sourceId: "way/11",
        surfaceTag: "fine_gravel",
        surfaceClass: "unpaved",
        tags: { highway: "track", surface: "fine_gravel" },
        geometry: [
          { latitude: 48.3, longitude: 17.3 },
          { latitude: 48.4, longitude: 17.4 },
        ],
      },
    ]);
  });
});
