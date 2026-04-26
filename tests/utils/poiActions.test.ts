import { describe, expect, it } from "vitest";
import {
  buildAppleMapsUrl,
  buildGoogleMapsUrl,
  buildMapyActionLabel,
  buildMapyUrl,
  buildPhoneUrl,
  getCuratedMapyUrl,
  shouldPromoteMapy,
} from "@/utils/poiActions";
import type { POI } from "@/types";

function poi(overrides: Partial<POI> = {}): POI {
  return {
    id: "poi-1",
    sourceId: "osm/1",
    source: "osm",
    name: "Spring Hut",
    category: "water",
    latitude: 48.123,
    longitude: 17.456,
    tags: {},
    distanceFromRouteMeters: 10,
    distanceAlongRouteMeters: 1000,
    routeId: "route-1",
    ...overrides,
  };
}

describe("POI action helpers", () => {
  it("builds Apple Maps URLs", () => {
    expect(buildAppleMapsUrl(poi())).toBe(
      "https://maps.apple.com/?ll=48.123,17.456&q=Spring%20Hut",
    );
  });

  it("builds Google Maps search URLs", () => {
    expect(buildGoogleMapsUrl(poi())).toBe(
      "https://www.google.com/maps/search/?api=1&query=Spring%20Hut%2048.123%2C17.456",
    );
  });

  it("uses curated Mapy URLs when available", () => {
    const curated = "https://mapy.com/s/example-place";
    expect(getCuratedMapyUrl({ mapy_url: curated })).toBe(curated);
    expect(buildMapyUrl(poi({ tags: { website: curated } }))).toBe(curated);
  });

  it("generates Mapy search fallback URLs for named POIs", () => {
    expect(buildMapyUrl(poi())).toBe(
      "https://mapy.com/fnc/v1/search?query=Spring%20Hut&x=17.456&y=48.123&z=17",
    );
  });

  it("generates Mapy showmap fallback URLs for unnamed POIs", () => {
    expect(buildMapyUrl(poi({ name: null }))).toBe(
      "https://mapy.com/fnc/v1/showmap?x=17.456&y=48.123&z=17",
    );
  });

  it("labels every Mapy handoff as online", () => {
    expect(buildMapyActionLabel()).toBe("Mapy (online)");
  });

  it("formats tel URLs", () => {
    expect(buildPhoneUrl("+421 900 123 456")).toBe("tel:+421900123456");
    expect(buildPhoneUrl("  ")).toBeNull();
  });

  it("promotes Mapy for shelters and springs", () => {
    expect(shouldPromoteMapy(poi({ category: "shelter" }))).toBe(true);
    expect(shouldPromoteMapy(poi({ category: "water", tags: { natural: "spring" } }))).toBe(true);
    expect(shouldPromoteMapy(poi({ category: "water", tags: { amenity: "drinking_water" } }))).toBe(
      false,
    );
  });
});
