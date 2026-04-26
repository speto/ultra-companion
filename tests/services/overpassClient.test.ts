import { describe, expect, it } from "vitest";
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

  it("adds Phase 4 logistics clauses", () => {
    const query = buildOverpassQuery([{ lat: 48.1, lon: 17.1 }], 100);

    expect(query).toContain('node["highway"="bus_stop"](around:100,48.1,17.1);');
    expect(query).toContain(
      'node["public_transport"~"^(platform|stop_position)$"]["bus"="yes"](around:100,48.1,17.1);',
    );
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
});
