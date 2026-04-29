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

  it("hydrates persisted distance marker visibility", async () => {
    reactNativeMmkvMocks.getString.mockImplementation((key) =>
      key === "showDistanceMarkers" ? "true" : null,
    );

    const useMapStore = await loadMapStore();

    expect(useMapStore.getState().showDistanceMarkers).toBe(true);
  });

  it("toggles and persists distance marker visibility", async () => {
    const useMapStore = await loadMapStore();

    useMapStore.getState().toggleDistanceMarkers();

    expect(useMapStore.getState().showDistanceMarkers).toBe(true);
    expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("showDistanceMarkers", "true");
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
