import { describe, expect, it, vi } from "vitest";
import { POI_CATEGORIES } from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";

vi.mock("lucide-react-native", () => {
  return {
    Bus: () => null,
    Croissant: () => null,
    Droplets: () => null,
    Dumbbell: () => null,
    Fuel: () => null,
    Landmark: () => null,
    School: () => null,
    ShoppingCart: () => null,
    ShowerHead: () => null,
    Tent: () => null,
  };
});

describe("POI category metadata", () => {
  it("keeps waypoints out of POI_CATEGORIES", () => {
    const keys = POI_CATEGORIES.map((category) => category.key);
    expect(keys).not.toContain("waypoint");
  });

  it("includes logistics categories in POI_CATEGORIES for default filter inclusion", () => {
    const keys = POI_CATEGORIES.map((category) => category.key);
    expect(keys).toEqual(expect.arrayContaining(["bus_stop", "sports", "cemetery", "school"]));
  });

  it("defines metadata and icon mappings for every POI category", () => {
    for (const category of POI_CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
      expect(category.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(POI_ICON_MAP[category.iconName]).toBeDefined();
    }
  });

  it("keeps POI category keys unique", () => {
    const keys = POI_CATEGORIES.map((category) => category.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps POI category icon names unique", () => {
    const iconNames = POI_CATEGORIES.map((category) => category.iconName);
    expect(new Set(iconNames).size).toBe(iconNames.length);
  });
});
