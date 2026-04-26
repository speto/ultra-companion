import { describe, expect, it } from "vitest";
import {
  formatCollectionPoiProgress,
  formatPoiProgress,
  formatSegmentProgress,
  formatTileSegmentProgress,
} from "@/utils/offlineProgress";

describe("offline progress formatters", () => {
  it("labels Google progress as searches", () => {
    expect(formatPoiProgress({ phase: "Fetching", done: 3, total: 12 }, "google")).toBe(
      "Checking Google searches: 3 of 12 searches",
    );
  });

  it("labels OSM progress as route sections", () => {
    expect(formatPoiProgress({ phase: "Fetching", done: 2, total: 5 }, "osm")).toBe(
      "Checking OSM route sections: 2 of 5 sections",
    );
  });

  it("uses indeterminate copy for processing phases", () => {
    expect(formatPoiProgress({ phase: "Processing", done: 0, total: 1 }, "osm")).toBe(
      "Processing POIs",
    );
    expect(formatPoiProgress({ phase: "Done", done: 1, total: 1 }, "google")).toBe(
      "Done processing POIs",
    );
  });

  it("formats segment progress with explicit units", () => {
    expect(formatSegmentProgress(2, 5)).toBe("2 of 5 segments");
    expect(formatTileSegmentProgress(2, 5)).toBe("Downloading map tiles: 2 of 5 segments");
  });

  it("formats collection POI progress without bare ratios", () => {
    const label = formatCollectionPoiProgress(
      "Segment A",
      { phase: "Fetching", done: 1, total: 4 },
      "google",
      2,
      5,
    );

    expect(label).toBe("Segment A: Checking Google searches: 1 of 4 searches (2 of 5 segments)");
    expect(label).not.toContain("1/4");
    expect(label).not.toContain("2 / 5");
  });
});
