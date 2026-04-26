import { describe, expect, it, vi } from "vitest";
import {
  getWaypointCategoryMeta,
  WAYPOINT_CATEGORIES,
  WAYPOINT_ICON_MAP,
} from "@/constants/waypointCategories";

vi.mock("lucide-react-native", () => {
  return {
    AlertTriangle: () => null,
    Bed: () => null,
    Bike: () => null,
    CircleDot: () => null,
    Coffee: () => null,
    Droplets: () => null,
    Fuel: () => null,
    MapPin: () => null,
    Utensils: () => null,
    UtensilsCrossed: () => null,
  };
});

describe("waypoint category metadata", () => {
  it("defines separate waypoint metadata and icon mappings", () => {
    for (const category of WAYPOINT_CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
      expect(category.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(WAYPOINT_ICON_MAP[category.iconName]).toBeDefined();
    }
  });

  it("normalizes common waypoint types without using POI categories", () => {
    expect(getWaypointCategoryMeta("water-source").key).toBe("water");
    expect(getWaypointCategoryMeta("checkpoint").key).toBe("control");
    expect(getWaypointCategoryMeta("Bike Shop").key).toBe("bike");
    expect(getWaypointCategoryMeta(null).key).toBe("generic");
  });

  it("does not treat unsupported raw waypoint types as domain categories", () => {
    expect(getWaypointCategoryMeta("crew stop").key).toBe("generic");
  });
});
