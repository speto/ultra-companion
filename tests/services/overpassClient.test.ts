import { describe, expect, it } from "vitest";
import { getMaxPoiCorridorWidthM } from "@/constants";
import { buildOverpassQuery } from "@/services/overpassClient";

describe("overpassClient", () => {
  it("keeps existing water, toilet, and shelter clauses", () => {
    const query = buildOverpassQuery(
      [
        { lat: 48.1, lon: 17.1 },
        { lat: 48.2, lon: 17.2 },
      ],
      75,
    );

    expect(query).toContain('node["amenity"="drinking_water"](around:75,48.1,17.1,48.2,17.2);');
    expect(query).toContain('node["natural"="spring"](around:75,48.1,17.1,48.2,17.2);');
    expect(query).toContain('node["man_made"="water_tap"](around:75,48.1,17.1,48.2,17.2);');
    expect(query).toContain('node["amenity"~"^(toilets|shower)$"](around:75,48.1,17.1,48.2,17.2);');
    expect(query).toContain(
      'node["amenity"="shelter"]["shelter_type"!="public_transport"](around:75,48.1,17.1,48.2,17.2);',
    );
    expect(query).toContain(
      'way["amenity"="shelter"]["shelter_type"!="public_transport"](around:75,48.1,17.1,48.2,17.2);',
    );
  });

  it("adds expanded logistics clauses", () => {
    const query = buildOverpassQuery([{ lat: 48.1, lon: 17.1 }], 100);

    expect(query).toContain('node["amenity"="cafe"](around:100,48.1,17.1);');
    expect(query).toContain('node["amenity"="restaurant"](around:100,48.1,17.1);');
    expect(query).toContain('node["amenity"~"^(bar|pub)$"](around:100,48.1,17.1);');
    expect(query).toContain('node["highway"="bus_stop"]["shelter"="yes"](around:100,48.1,17.1);');
    expect(query).toContain(
      'node["public_transport"~"^(platform|stop_position)$"]["bus"="yes"]["shelter"="yes"](around:100,48.1,17.1);',
    );
    expect(query).toContain('node["tourism"="camp_site"](around:100,48.1,17.1);');
    expect(query).toContain('node["amenity"="pharmacy"](around:100,48.1,17.1);');
    expect(query).toContain('node["amenity"="hospital"](around:100,48.1,17.1);');
    expect(query).toContain('node["emergency"="defibrillator"](around:100,48.1,17.1);');
    expect(query).toContain('node["emergency"="phone"](around:100,48.1,17.1);');
    expect(query).toContain('node["emergency"="ambulance_station"](around:100,48.1,17.1);');
    expect(query).toContain('node["shop"="bicycle"](around:100,48.1,17.1);');
    expect(query).toContain('node["amenity"="bicycle_repair_station"](around:100,48.1,17.1);');
    expect(query).toContain('node["amenity"="compressed_air"](around:100,48.1,17.1);');
    expect(query).toContain('node["railway"~"^(station|halt)$"](around:100,48.1,17.1);');
    expect(query).toContain('node["leisure"="pitch"]["sport"="soccer"](around:100,48.1,17.1);');
    expect(query).toContain('way["leisure"="pitch"]["sport"="soccer"](around:100,48.1,17.1);');
    expect(query).toContain('node["leisure"="sports_centre"](around:100,48.1,17.1);');
    expect(query).toContain('way["leisure"="sports_centre"](around:100,48.1,17.1);');
    expect(query).toContain('node["amenity"="grave_yard"](around:100,48.1,17.1);');
    expect(query).toContain('way["amenity"="grave_yard"](around:100,48.1,17.1);');
    expect(query).toContain('node["landuse"="cemetery"](around:100,48.1,17.1);');
    expect(query).toContain('way["landuse"="cemetery"](around:100,48.1,17.1);');
    expect(query).toContain('node["amenity"="school"](around:100,48.1,17.1);');
    expect(query).toContain('way["amenity"="school"](around:100,48.1,17.1);');
  });

  it("exposes a wider fetch radius for category-specific corridor defaults", () => {
    expect(getMaxPoiCorridorWidthM(75)).toBeGreaterThan(75);
  });
});
