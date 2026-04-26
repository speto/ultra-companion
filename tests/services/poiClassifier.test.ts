import { describe, expect, it } from "vitest";
import { classifyElement, mapOverpassToPOIs } from "@/services/poiClassifier";
import type { OverpassElement } from "@/services/overpassClient";

function element(tags: Record<string, string>): OverpassElement {
  return {
    type: "node",
    id: 1,
    lat: 48.1,
    lon: 17.1,
    tags,
  };
}

describe("poiClassifier", () => {
  it.each([
    [{ highway: "bus_stop" }, "bus_stop"],
    [{ public_transport: "platform", bus: "yes" }, "bus_stop"],
    [{ public_transport: "stop_position", bus: "yes" }, "bus_stop"],
    [{ leisure: "pitch", sport: "soccer" }, "sports"],
    [{ leisure: "sports_centre" }, "sports"],
    [{ amenity: "grave_yard" }, "cemetery"],
    [{ landuse: "cemetery" }, "cemetery"],
    [{ amenity: "school" }, "school"],
  ])("classifies %o as %s", (tags, expectedCategory) => {
    expect(classifyElement(element(tags))).toBe(expectedCategory);
  });

  it("maps classified logistics POIs with coordinates and names", () => {
    const elements: OverpassElement[] = [
      {
        type: "node",
        id: 10,
        lat: 48.1,
        lon: 17.1,
        tags: { highway: "bus_stop", name: "Village stop" },
      },
      {
        type: "way",
        id: 11,
        center: { lat: 48.2, lon: 17.2 },
        tags: { amenity: "school", name: "Primary School" },
      },
    ];

    expect(mapOverpassToPOIs(elements)).toEqual([
      {
        sourceId: "node/10",
        name: "Village stop",
        category: "bus_stop",
        latitude: 48.1,
        longitude: 17.1,
        tags: { highway: "bus_stop", name: "Village stop" },
      },
      {
        sourceId: "way/11",
        name: "Primary School",
        category: "school",
        latitude: 48.2,
        longitude: 17.2,
        tags: { amenity: "school", name: "Primary School" },
      },
    ]);
  });
});
