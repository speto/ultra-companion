import { describe, expect, it } from "vitest";
import { classifySurfaceTag, classifySurfaceTags } from "@/services/surfaceClassifier";

describe("surfaceClassifier", () => {
  it.each([
    "paved",
    "asphalt",
    "chipseal",
    "concrete",
    "concrete:lanes",
    "concrete:plates",
    "paving_stones",
    "paving_stones:lanes",
    "sett",
    "unhewn_cobblestone",
    "bricks",
    "metal",
    "metal_grid",
    "wood",
  ])("classifies %s as paved", (surface) => {
    expect(classifySurfaceTag(surface)).toBe("paved");
  });

  it.each([
    "unpaved",
    "compacted",
    "fine_gravel",
    "gravel",
    "pebblestone",
    "ground",
    "dirt",
    "earth",
    "mud",
    "sand",
    "grass",
    "clay",
    "woodchips",
    "shells",
  ])("classifies %s as unpaved", (surface) => {
    expect(classifySurfaceTag(surface)).toBe("unpaved");
  });

  it.each([
    undefined,
    null,
    "",
    "unknown",
    "yes",
    "no",
    "mixed",
    "cobblestone",
    "cobblestone:flattened",
    "grass_paver",
    "artificial_turf",
    "tartan",
    "carpet",
    "acrylic",
    "something_unmapped",
  ])("keeps ambiguous surface %s as unknown", (surface) => {
    expect(classifySurfaceTag(surface)).toBe("unknown");
  });

  it("normalizes casing and surrounding whitespace", () => {
    expect(classifySurfaceTag(" Asphalt ")).toBe("paved");
    expect(classifySurfaceTag(" FINE_GRAVEL ")).toBe("unpaved");
  });

  it("classifies the surface tag from an OSM tag map", () => {
    expect(classifySurfaceTags({ highway: "track", surface: "compacted" })).toBe("unpaved");
    expect(classifySurfaceTags({ highway: "primary", surface: "asphalt" })).toBe("paved");
    expect(classifySurfaceTags({ highway: "residential" })).toBe("unknown");
  });
});
