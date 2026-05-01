import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_POI_CATEGORY_CORRIDOR_WIDTH_M,
  getPoiCategoryCorridorWidthM,
  POI_CATEGORIES,
} from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";

vi.mock("lucide-react-native", () => {
  return {
    Bus: () => null,
    AlertTriangle: () => null,
    Ambulance: () => null,
    Bike: () => null,
    CircleDot: () => null,
    Coffee: () => null,
    Croissant: () => null,
    Droplets: () => null,
    Dumbbell: () => null,
    Fuel: () => null,
    HeartPulse: () => null,
    Hospital: () => null,
    Landmark: () => null,
    Phone: () => null,
    Pill: () => null,
    School: () => null,
    ShoppingCart: () => null,
    Toilet: () => null,
    Tent: () => null,
    TrainFront: () => null,
    Utensils: () => null,
    UtensilsCrossed: () => null,
    Wrench: () => null,
  };
});

describe("POI category metadata", () => {
  it("keeps waypoints out of POI_CATEGORIES", () => {
    const keys = POI_CATEGORIES.map((category) => category.key);
    expect(keys).not.toContain("waypoint");
  });

  it("includes expanded logistics categories in POI_CATEGORIES for default filter inclusion", () => {
    const keys = POI_CATEGORIES.map((category) => category.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "coffee",
        "restaurant",
        "bar_pub",
        "pharmacy",
        "hospital_er",
        "defibrillator",
        "emergency_phone",
        "ambulance_station",
        "camp_site",
        "bike_shop",
        "repair_station",
        "pump_air",
        "train_station",
        "bus_stop",
        "sports",
        "cemetery",
        "school",
      ]),
    );
  });

  it("defines metadata and icon mappings for every POI category", () => {
    for (const category of POI_CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
      expect(category.group.length).toBeGreaterThan(0);
      expect(category.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(POI_ICON_MAP[category.iconName]).toBeDefined();
    }
  });

  it("keeps POI category keys unique", () => {
    const keys = POI_CATEGORIES.map((category) => category.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps category visual signatures unique", () => {
    const signatures = POI_CATEGORIES.map((category) => `${category.color}:${category.iconName}`);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("defines a default corridor for every POI category", () => {
    for (const category of POI_CATEGORIES) {
      expect(DEFAULT_POI_CATEGORY_CORRIDOR_WIDTH_M[category.key]).toBeGreaterThan(0);
      expect(getPoiCategoryCorridorWidthM(category.key)).toBeGreaterThan(0);
    }
  });

  it("keeps emergency and escape categories wider than bus stop shelters", () => {
    expect(getPoiCategoryCorridorWidthM("bus_stop")).toBeLessThan(
      getPoiCategoryCorridorWidthM("hospital_er"),
    );
    expect(getPoiCategoryCorridorWidthM("bus_stop")).toBeLessThan(
      getPoiCategoryCorridorWidthM("train_station"),
    );
  });
});
