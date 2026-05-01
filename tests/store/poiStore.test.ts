import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POI_CATEGORIES } from "@/constants";
import { buildPoi } from "@/tests/fixtures/poi";
import { createMockMMKV, reactNativeMmkvMocks } from "@/tests/mocks/reactNativeMmkv";
import type { POI } from "@/types";

vi.mock("react-native-mmkv", () => ({
  createMMKV: createMockMMKV,
}));

vi.mock("@/db/database", () => ({
  getPOIsForRoute: vi.fn(),
  deletePOIsBySource: vi.fn(),
  deleteDownloadedPOIsForRoute: vi.fn(),
  deletePOIsForRoute: vi.fn(),
  getStarredItems: vi.fn(() => []),
  setStarredItem: vi.fn(),
}));

vi.mock("@/services/poiFetcher", () => ({
  fetchOsmPOIs: vi.fn(),
  fetchGooglePOIs: vi.fn(),
}));

vi.mock("@/store/placeStore", () => ({
  usePlaceStore: {
    getState: vi.fn(() => ({ loadPlaces: vi.fn() })),
  },
}));

async function loadPoiStore() {
  return (await import("@/store/poiStore")).usePoiStore;
}

async function loadStarredStore() {
  return (await import("@/store/starredStore")).useStarredStore;
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

  it("treats Open now as a food/shop subfilter regardless of filter order", async () => {
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
      enabledCategories: POI_CATEGORIES.map((category) => category.key),
      showOpenOnly: false,
    });
    usePoiStore.getState().toggleShowOpenOnly();
    usePoiStore.getState().setAllCategories(false);
    usePoiStore.getState().toggleCategory("water");
    const openThenCategory = visibleIds(usePoiStore.getState().getVisiblePOIs(routeId));

    expect(categoryThenOpen).toEqual(["open-water", "closed-water", "unknown-water"]);
    expect(openThenCategory).toEqual(categoryThenOpen);
  });

  it("hides only confirmed-closed food/shop POIs when Open now is enabled", async () => {
    const usePoiStore = await loadPoiStore();
    const pois = [
      buildPoi("known-open", routeId, 100, {
        category: "bakery",
        tags: { opening_hours: mondayOpenHours },
      }),
      buildPoi("known-closed", routeId, 200, {
        category: "bakery",
        tags: { opening_hours: mondayClosedHours },
      }),
      buildPoi("missing-hours", routeId, 300, { category: "bakery", tags: {} }),
      buildPoi("malformed-hours", routeId, 400, {
        category: "bakery",
        tags: { opening_hours: "not-json" },
      }),
      buildPoi("unsupported-hours", routeId, 500, {
        category: "bakery",
        tags: { opening_hours: "Mo-Fr 09:00-17:00" },
      }),
      buildPoi("closed-restaurant", routeId, 550, {
        category: "restaurant",
        tags: { opening_hours: mondayClosedHours },
      }),
      buildPoi("water", routeId, 600, { category: "water" }),
    ];

    usePoiStore.setState({ pois: { [routeId]: pois } });
    usePoiStore.getState().toggleShowOpenOnly();

    expect(visibleIds(usePoiStore.getState().getVisiblePOIs(routeId))).toEqual([
      "known-open",
      "missing-hours",
      "malformed-hours",
      "unsupported-hours",
      "water",
    ]);
  });

  it("lets starred known-closed POIs bypass Open now", async () => {
    const usePoiStore = await loadPoiStore();
    const useStarredStore = await loadStarredStore();
    const pois = [
      buildPoi("known-open", routeId, 100, {
        category: "bakery",
        tags: { opening_hours: mondayOpenHours },
      }),
      buildPoi("starred-closed", routeId, 200, {
        category: "bakery",
        tags: { opening_hours: mondayClosedHours },
      }),
    ];

    usePoiStore.setState({ pois: { [routeId]: pois } });
    useStarredStore.setState({ starredKeys: new Set(["downloadedPoi:starred-closed"]) });
    usePoiStore.getState().toggleShowOpenOnly();

    expect(visibleIds(usePoiStore.getState().getVisiblePOIs(routeId))).toEqual([
      "known-open",
      "starred-closed",
    ]);
  });

  it("does not let starred POIs bypass category scope", async () => {
    const usePoiStore = await loadPoiStore();
    const useStarredStore = await loadStarredStore();
    const pois = [
      buildPoi("water", routeId, 100, { category: "water" }),
      buildPoi("starred-bakery", routeId, 200, { category: "bakery" }),
    ];

    usePoiStore.setState({ pois: { [routeId]: pois } });
    useStarredStore.setState({ starredKeys: new Set(["downloadedPoi:starred-bakery"]) });
    usePoiStore.getState().setEnabledCategories(["water"]);

    expect(visibleIds(usePoiStore.getState().getVisiblePOIs(routeId))).toEqual(["water"]);
  });

  it("keeps showOpenOnly derived from user-facing food availability mode", async () => {
    const usePoiStore = await loadPoiStore();

    usePoiStore.getState().setFoodAvailabilityMode("eta");
    expect(usePoiStore.getState().foodAvailabilityMode).toBe("eta");
    expect(usePoiStore.getState().showOpenOnly).toBe(false);

    usePoiStore.getState().setFoodAvailabilityMode("now");
    expect(usePoiStore.getState().foodAvailabilityMode).toBe("now");
    expect(usePoiStore.getState().showOpenOnly).toBe(true);

    usePoiStore.getState().setFoodAvailabilityMode("off");
    expect(usePoiStore.getState().foodAvailabilityMode).toBe("off");
    expect(usePoiStore.getState().showOpenOnly).toBe(false);
  });

  it("clears route POI cache state when deleting POIs for a route", async () => {
    const database = await import("@/db/database");
    const placeStore = await import("@/store/placeStore");
    const useStarredStore = await loadStarredStore();
    const loadPlaces = vi.fn();
    vi.mocked(placeStore.usePlaceStore.getState).mockReturnValue({ loadPlaces } as any);
    const usePoiStore = await loadPoiStore();

    usePoiStore.setState({
      pois: {
        [routeId]: [
          buildPoi("osm-water", routeId, 100, { source: "osm" }),
          buildPoi("google-shop", routeId, 200, { source: "google" }),
        ],
      },
      selectedPOI: buildPoi("google-shop", routeId, 200, { source: "google" }),
    });
    useStarredStore.setState({
      starredKeys: new Set(["downloadedPoi:osm-water", "downloadedPoi:google-shop"]),
    });

    await usePoiStore.getState().clearPOIs(routeId);

    expect(database.deleteDownloadedPOIsForRoute).toHaveBeenCalledWith(routeId);
    expect(database.deletePOIsForRoute).not.toHaveBeenCalled();
    expect(usePoiStore.getState().pois[routeId]).toBeUndefined();
    expect(database.getStarredItems).toHaveBeenCalled();
    expect(usePoiStore.getState().selectedPOI).toBeNull();
    expect(loadPlaces).toHaveBeenCalledWith(routeId);
  });
});
