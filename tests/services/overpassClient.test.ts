import { describe, expect, it } from "vitest";
import { buildOverpassQuery } from "@/services/overpassClient";

describe("overpassClient", () => {
  it("keeps existing water, toilet, and shelter clauses at category-specific radii", () => {
    const query = buildOverpassQuery(
      [
        { lat: 48.1, lon: 17.1 },
        { lat: 48.2, lon: 17.2 },
      ],
      75,
    );

    expect(query).toContain('node["amenity"="drinking_water"](around:1000,48.1,17.1,48.2,17.2);');
    expect(query).toContain('node["natural"="spring"](around:1000,48.1,17.1,48.2,17.2);');
    expect(query).toContain('node["man_made"="water_tap"](around:1000,48.1,17.1,48.2,17.2);');
    expect(query).toContain('node["amenity"~"^(toilets|shower)$"](around:1000,48.1,17.1,48.2,17.2);');
    expect(query).toContain(
      'node["amenity"="shelter"]["shelter_type"!="public_transport"](around:300,48.1,17.1,48.2,17.2);',
    );
    expect(query).toContain(
      'way["amenity"="shelter"]["shelter_type"!="public_transport"](around:300,48.1,17.1,48.2,17.2);',
    );
  });

  it("adds expanded logistics clauses at category-specific radii", () => {
    const query = buildOverpassQuery([{ lat: 48.1, lon: 17.1 }], 100);

    expect(query).toContain('node["amenity"="cafe"](around:1000,48.1,17.1);');
    expect(query).toContain('node["amenity"="restaurant"](around:1500,48.1,17.1);');
    expect(query).toContain('node["amenity"~"^(bar|pub)$"](around:1500,48.1,17.1);');
    expect(query).toContain('node["highway"="bus_stop"]["shelter"="yes"](around:30,48.1,17.1);');
    expect(query).toContain(
      'node["public_transport"~"^(platform|stop_position)$"]["bus"="yes"]["shelter"="yes"](around:30,48.1,17.1);',
    );
    expect(query).toContain('node["tourism"="camp_site"](around:5000,48.1,17.1);');
    expect(query).toContain('node["amenity"="pharmacy"](around:3000,48.1,17.1);');
    expect(query).toContain('node["amenity"="hospital"](around:10000,48.1,17.1);');
    expect(query).toContain('node["emergency"="defibrillator"](around:1000,48.1,17.1);');
    expect(query).toContain('node["emergency"="phone"](around:1000,48.1,17.1);');
    expect(query).toContain('node["emergency"="ambulance_station"](around:5000,48.1,17.1);');
    expect(query).toContain('node["shop"="bicycle"](around:5000,48.1,17.1);');
    expect(query).toContain('node["amenity"="bicycle_repair_station"](around:500,48.1,17.1);');
    expect(query).toContain('node["amenity"="compressed_air"](around:500,48.1,17.1);');
    expect(query).toContain('node["railway"~"^(station|halt)$"](around:10000,48.1,17.1);');
    expect(query).toContain('node["leisure"="pitch"]["sport"="soccer"](around:1000,48.1,17.1);');
    expect(query).toContain('way["leisure"="pitch"]["sport"="soccer"](around:1000,48.1,17.1);');
    expect(query).toContain('node["leisure"="sports_centre"](around:1000,48.1,17.1);');
    expect(query).toContain('way["leisure"="sports_centre"](around:1000,48.1,17.1);');
    expect(query).toContain('node["amenity"="grave_yard"](around:1000,48.1,17.1);');
    expect(query).toContain('way["amenity"="grave_yard"](around:1000,48.1,17.1);');
    expect(query).toContain('node["landuse"="cemetery"](around:1000,48.1,17.1);');
    expect(query).toContain('way["landuse"="cemetery"](around:1000,48.1,17.1);');
    expect(query).toContain('node["amenity"="school"](around:1000,48.1,17.1);');
    expect(query).toContain('way["amenity"="school"](around:1000,48.1,17.1);');
  });

  it("does not inflate every query clause to the widest category radius", () => {
    const query = buildOverpassQuery([{ lat: 48.1, lon: 17.1 }], 500);

    expect(query).toContain('node["highway"="bus_stop"]["shelter"="yes"](around:30,48.1,17.1);');
    expect(query).toContain('node["amenity"="hospital"](around:10000,48.1,17.1);');
    expect(query).not.toContain('node["amenity"="cafe"](around:10000,48.1,17.1);');
    expect(query).not.toContain('node["highway"="bus_stop"]["shelter"="yes"](around:10000,48.1,17.1);');
  });
});
