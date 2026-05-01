import { describe, expect, it, vi } from "vitest";
import { associateAndFilter } from "@/services/poiFetcher";
import type { RoutePoint } from "@/types";
import type { ClassifiedPOI } from "@/services/poiClassifier";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock("@/db/database", () => ({
  insertPOIs: vi.fn(),
  deletePOIsBySource: vi.fn(),
}));
vi.mock("@/utils/geo", () => ({
  computePOIRouteAssociation: vi.fn((latitude: number) => ({
    distanceFromRouteMeters: latitude,
    distanceAlongRouteMeters: 100,
  })),
}));

const routePoints: RoutePoint[] = [
  { latitude: 0, longitude: 0, elevationMeters: null, distanceFromStartMeters: 0, idx: 0 },
  { latitude: 0, longitude: 1, elevationMeters: null, distanceFromStartMeters: 1000, idx: 1 },
];

function classified(sourceId: string, category: ClassifiedPOI["category"], distanceM: number) {
  return {
    sourceId,
    name: sourceId,
    category,
    latitude: distanceM,
    longitude: 0,
    tags: {},
  } satisfies ClassifiedPOI;
}

describe("poiFetcher", () => {
  it("filters associated POIs by category-specific corridor defaults", () => {
    const pois = associateAndFilter(
      [
        classified("near-bus", "bus_stop", 20),
        classified("far-bus", "bus_stop", 100),
        classified("far-hospital", "hospital_er", 9000),
      ],
      "route-1",
      routePoints,
      1000,
      "osm",
    );

    expect(pois.map((poi) => poi.sourceId)).toEqual(["near-bus", "far-hospital"]);
  });
});
