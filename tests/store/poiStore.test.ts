import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPoi } from "@/tests/fixtures/poi";
import { createMockMMKV, reactNativeMmkvMocks } from "@/tests/mocks/reactNativeMmkv";
import type { POI } from "@/types";

vi.mock("react-native-mmkv", () => ({
  createMMKV: createMockMMKV,
}));

vi.mock("@/db/database", () => ({
  getPOIsForRoute: vi.fn(),
  deletePOIsBySource: vi.fn(),
  deletePOIsForRoute: vi.fn(),
}));

vi.mock("@/services/poiFetcher", () => ({
  fetchOsmPOIs: vi.fn(),
  fetchGooglePOIs: vi.fn(),
}));

async function loadPoiStore() {
  return (await import("@/store/poiStore")).usePoiStore;
}

const routeId = "route-1";

const mondayOpenHours = JSON.stringify([
  { open: { day: 1, hour: 0, minute: 0 }, close: { day: 1, hour: 23, minute: 59 } },
]);

const mondayClosedHours = JSON.stringify([
  { open: { day: 1, hour: 0, minute: 0 }, close: { day: 1, hour: 1, minute: 0 } },
]);

function visibleIds(pois: POI[]): string[] {
  return pois.map((poi) => poi.id);
}

describe("POI store visible POI filtering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00"));
    vi.resetModules();
    reactNativeMmkvMocks.getString.mockReset();
    reactNativeMmkvMocks.set.mockReset();
    reactNativeMmkvMocks.getString.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats Open now as a subfilter over enabled categories regardless of filter order", async () => {
    const usePoiStore = await loadPoiStore();
    const pois = [
      buildPoi("open-water", routeId, 100, {
        category: "water",
        tags: { opening_hours: mondayOpenHours },
      }),
      buildPoi("open-bakery", routeId, 200, {
        category: "bakery",
        tags: { opening_hours: mondayOpenHours },
      }),
      buildPoi("closed-water", routeId, 300, {
        category: "water",
        tags: { opening_hours: mondayClosedHours },
      }),
      buildPoi("unknown-water", routeId, 400),
    ];

    usePoiStore.setState({ pois: { [routeId]: pois } });
    usePoiStore.getState().setAllCategories(false);
    usePoiStore.getState().toggleCategory("water");
    usePoiStore.getState().toggleShowOpenOnly();
    const categoryThenOpen = visibleIds(usePoiStore.getState().getVisiblePOIs(routeId));

    usePoiStore.setState({
      enabledCategories: [
        "water",
        "groceries",
        "gas_station",
        "bakery",
        "toilet_shower",
        "shelter",
        "bus_stop",
        "sports",
        "cemetery",
        "school",
      ],
      showOpenOnly: false,
    });
    usePoiStore.getState().toggleShowOpenOnly();
    usePoiStore.getState().setAllCategories(false);
    usePoiStore.getState().toggleCategory("water");
    const openThenCategory = visibleIds(usePoiStore.getState().getVisiblePOIs(routeId));

    expect(categoryThenOpen).toEqual(["open-water"]);
    expect(openThenCategory).toEqual(categoryThenOpen);
  });

  it("shows only known-open POIs when Open now is enabled", async () => {
    const usePoiStore = await loadPoiStore();
    const pois = [
      buildPoi("known-open", routeId, 100, { tags: { opening_hours: mondayOpenHours } }),
      buildPoi("known-closed", routeId, 200, { tags: { opening_hours: mondayClosedHours } }),
      buildPoi("missing-hours", routeId, 300, { tags: {} }),
      buildPoi("malformed-hours", routeId, 400, { tags: { opening_hours: "not-json" } }),
      buildPoi("unsupported-hours", routeId, 500, { tags: { opening_hours: "Mo-Fr 09:00-17:00" } }),
      buildPoi("absent-hours", routeId, 600),
    ];

    usePoiStore.setState({ pois: { [routeId]: pois } });
    usePoiStore.getState().toggleShowOpenOnly();

    expect(visibleIds(usePoiStore.getState().getVisiblePOIs(routeId))).toEqual(["known-open"]);
  });

  it("does not let starred known-closed POIs bypass Open now", async () => {
    const usePoiStore = await loadPoiStore();
    const pois = [
      buildPoi("known-open", routeId, 100, { tags: { opening_hours: mondayOpenHours } }),
      buildPoi("starred-closed", routeId, 200, { tags: { opening_hours: mondayClosedHours } }),
    ];

    usePoiStore.setState({
      pois: { [routeId]: pois },
      starredPOIIds: new Set(["starred-closed"]),
    });
    usePoiStore.getState().toggleShowOpenOnly();

    expect(visibleIds(usePoiStore.getState().getVisiblePOIs(routeId))).toEqual(["known-open"]);
  });
});
