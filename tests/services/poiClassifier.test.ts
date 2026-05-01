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
    [{ amenity: "cafe" }, "coffee"],
    [{ amenity: "restaurant" }, "restaurant"],
    [{ amenity: "pub" }, "bar_pub"],
    [{ shop: "supermarket" }, "groceries"],
    [{ shop: "bakery" }, "bakery"],
    [{ amenity: "fuel" }, "gas_station"],
    [{ highway: "bus_stop", shelter: "yes" }, "bus_stop"],
    [{ public_transport: "platform", bus: "yes", shelter: "yes" }, "bus_stop"],
    [{ public_transport: "stop_position", bus: "yes", shelter: "yes" }, "bus_stop"],
    [{ tourism: "camp_site" }, "camp_site"],
    [{ amenity: "pharmacy" }, "pharmacy"],
    [{ healthcare: "pharmacy" }, "pharmacy"],
    [{ amenity: "hospital" }, "hospital_er"],
    [{ emergency: "defibrillator" }, "defibrillator"],
    [{ emergency: "phone" }, "emergency_phone"],
    [{ emergency: "ambulance_station" }, "ambulance_station"],
    [{ shop: "bicycle" }, "bike_shop"],
    [{ amenity: "bicycle_repair_station" }, "repair_station"],
    [{ amenity: "compressed_air" }, "pump_air"],
    [{ "service:bicycle:pump": "yes" }, "pump_air"],
    [{ railway: "station" }, "train_station"],
    [{ public_transport: "station", train: "yes" }, "train_station"],
    [{ leisure: "pitch", sport: "soccer" }, "sports"],
    [{ leisure: "sports_centre" }, "sports"],
    [{ amenity: "grave_yard" }, "cemetery"],
    [{ landuse: "cemetery" }, "cemetery"],
    [{ amenity: "school" }, "school"],
  ])("classifies %o as %s", (tags, expectedCategory) => {
    expect(classifyElement(element(tags))).toBe(expectedCategory);
  });

  it("ignores unsheltered bus stops", () => {
    expect(classifyElement(element({ highway: "bus_stop" }))).toBeNull();
  });

  it("maps classified logistics POIs with coordinates and names", () => {
    const elements: OverpassElement[] = [
      {
        type: "node",
        id: 10,
        lat: 48.1,
        lon: 17.1,
        tags: { highway: "bus_stop", shelter: "yes", name: "Village stop" },
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
        tags: { highway: "bus_stop", shelter: "yes", name: "Village stop" },
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
