import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockMMKV, reactNativeMmkvMocks } from "../mocks/reactNativeMmkv";

vi.mock("react-native-mmkv", () => ({
  createMMKV: createMockMMKV,
}));

vi.mock("@/services/gps", () => ({
  requestLocationPermission: vi.fn(),
  getCurrentPosition: vi.fn(),
}));

async function loadMapStore() {
  return (await import("@/store/mapStore")).useMapStore;
}

describe("map store preferences", () => {
  beforeEach(() => {
    vi.resetModules();
    reactNativeMmkvMocks.getString.mockReset();
    reactNativeMmkvMocks.set.mockReset();
    reactNativeMmkvMocks.getString.mockReturnValue(null);
  });

  it("defaults distance markers to off", async () => {
    const useMapStore = await loadMapStore();

    expect(useMapStore.getState().showDistanceMarkers).toBe(false);
  });

  it("defaults POIs and waypoints to visible", async () => {
    const useMapStore = await loadMapStore();

    expect(useMapStore.getState().showPOIs).toBe(true);
    expect(useMapStore.getState().showWaypoints).toBe(true);
  });

  it("hydrates persisted distance marker visibility", async () => {
    reactNativeMmkvMocks.getString.mockImplementation((key) =>
      key === "showDistanceMarkers" ? "true" : null,
    );

    const useMapStore = await loadMapStore();

    expect(useMapStore.getState().showDistanceMarkers).toBe(true);
  });

  it("hydrates persisted POI and waypoint visibility", async () => {
    reactNativeMmkvMocks.getString.mockImplementation((key) => {
      if (key === "showPOIs") return "false";
      if (key === "showWaypoints") return "false";
      return null;
    });

    const useMapStore = await loadMapStore();

    expect(useMapStore.getState().showPOIs).toBe(false);
    expect(useMapStore.getState().showWaypoints).toBe(false);
  });

  it("toggles and persists distance marker visibility", async () => {
    const useMapStore = await loadMapStore();

    useMapStore.getState().toggleDistanceMarkers();

    expect(useMapStore.getState().showDistanceMarkers).toBe(true);
    expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("showDistanceMarkers", "true");
  });

  it("toggles and persists POI visibility", async () => {
    const useMapStore = await loadMapStore();

    useMapStore.getState().togglePOIs();

    expect(useMapStore.getState().showPOIs).toBe(false);
    expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("showPOIs", "false");
  });

  it("toggles and persists waypoint visibility", async () => {
    const useMapStore = await loadMapStore();

    useMapStore.getState().toggleWaypoints();

    expect(useMapStore.getState().showWaypoints).toBe(false);
    expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("showWaypoints", "false");
  });

  it("defaults Follow GPS mode to off", async () => {
    const useMapStore = await loadMapStore();

    expect(useMapStore.getState().followUser).toBe(false);
  });

  it("hydrates persisted Follow GPS mode", async () => {
    reactNativeMmkvMocks.getString.mockImplementation((key) =>
      key === "followUser" ? "true" : null,
    );

    const useMapStore = await loadMapStore();

    expect(useMapStore.getState().followUser).toBe(true);
  });

  it("persists Follow GPS mode changes", async () => {
    const useMapStore = await loadMapStore();

    useMapStore.getState().setFollowUser(true);

    expect(useMapStore.getState().followUser).toBe(true);
    expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("followUser", "true");
  });
});
