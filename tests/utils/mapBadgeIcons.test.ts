import { describe, expect, it, vi } from "vitest";
import { POI_CATEGORIES } from "@/constants";
import { WAYPOINT_CATEGORIES } from "@/constants/waypointCategories";
import { COLORS } from "@/theme/colors";
import { buildPoiBadgeSvgs, buildWaypointBadgeSvgs } from "@/components/map/mapBadgeIcons";

const Icon = vi.hoisted(() => () => null);

vi.mock("lucide-react-native", () => {
  return {
    AlertTriangle: Icon,
    Bed: Icon,
    Beer: Icon,
    Bike: Icon,
    CircleDot: Icon,
    Coffee: Icon,
    Droplets: Icon,
    Fuel: Icon,
    MapPin: Icon,
    Utensils: Icon,
    UtensilsCrossed: Icon,
  };
});

describe("map badge icons", () => {
  it("builds base and starred variants for every POI category", () => {
    const svgs = buildPoiBadgeSvgs();

    for (const category of POI_CATEGORIES) {
      expect(svgs[`poi-${category.key}`]).toBeDefined();
      expect(svgs[`poi-${category.key}-starred`]).toContain(COLORS.light.starred);
    }
  });

  it("uses the beer glyph for bar/pub POI badges", () => {
    const svgs = buildPoiBadgeSvgs();

    expect(svgs["poi-bar_pub"]).toContain("M17 11h1a3 3 0 0 1 0 6h-1");
  });

  it("builds base and starred variants for every waypoint category", () => {
    const svgs = buildWaypointBadgeSvgs();

    for (const category of WAYPOINT_CATEGORIES) {
      expect(svgs[`wp-${category.key}`]).toBeDefined();
      expect(svgs[`wp-${category.key}-starred`]).toContain(COLORS.light.starred);
    }
  });
});
