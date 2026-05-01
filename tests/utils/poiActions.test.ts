import { describe, expect, it } from "vitest";
import {
  buildPoiMapLinkPayload,
  buildPhoneUrl,
  getPoiAddress,
  getPoiExtraDetailFields,
  getPoiPhone,
  hasExpandablePoiDetails,
  POI_MAP_APPS_WHITE_LIST,
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
  it("builds the installed-map chooser payload", () => {
    expect(buildPoiMapLinkPayload(poi())).toEqual({
      latitude: 48.123,
      longitude: 17.456,
      title: "Spring Hut",
      dialogTitle: "Open in Maps",
      dialogMessage: "Choose an installed map app for this POI.",
      cancelText: "Cancel",
      appsWhiteList: [...POI_MAP_APPS_WHITE_LIST],
      googleForceLatLon: true,
    });
  });

  it("includes Google place IDs without bypassing the map picker", () => {
    expect(
      buildPoiMapLinkPayload(
        poi({
          source: "google",
          sourceId: "places/ChIJN1t_tDeuEmsRUsoyG83frY4",
          name: "Google Cafe",
        }),
      ),
    ).toMatchObject({
      title: "Google Cafe",
      appsWhiteList: [...POI_MAP_APPS_WHITE_LIST],
      googleForceLatLon: false,
      googlePlaceId: "places/ChIJN1t_tDeuEmsRUsoyG83frY4",
    });
  });

  it("formats tel URLs", () => {
    expect(buildPhoneUrl("+421 900 123 456")).toBe("tel:+421900123456");
    expect(buildPhoneUrl("  ")).toBeNull();
  });

  it("extracts address and phone details", () => {
    expect(
      getPoiAddress(
        poi({
          tags: {
            "addr:street": "Main Road",
            "addr:housenumber": "12",
            "addr:postcode": "90000",
            "addr:city": "Bratislava",
          },
        }),
      ),
    ).toBe("Main Road 12, 90000 Bratislava");
    expect(getPoiPhone(poi({ tags: { "contact:phone": "+421 900 123 456" } }))).toBe(
      "+421 900 123 456",
    );
  });

  it("keeps bare coordinate/category POIs collapsed", () => {
    expect(
      hasExpandablePoiDetails(poi({ category: "toilet_shower", tags: { amenity: "toilets" } })),
    ).toBe(false);
  });

  it("expands POIs with meaningful extra detail", () => {
    expect(hasExpandablePoiDetails(poi({ tags: { opening_hours: "Mo-Fr 07:00-18:00" } }))).toBe(
      true,
    );
    expect(hasExpandablePoiDetails(poi({ tags: { phone: "+421 900 123 456" } }))).toBe(true);
    expect(hasExpandablePoiDetails(poi({ tags: { operator: "Municipal water" } }))).toBe(true);
  });

  it("returns compact extra detail fields", () => {
    expect(getPoiExtraDetailFields(poi({ tags: { operator: "Municipal", fee: "no" } }))).toEqual([
      { label: "Operator", value: "Municipal" },
      { label: "Fee", value: "no" },
    ]);
  });
});
