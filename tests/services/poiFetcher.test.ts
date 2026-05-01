import { beforeEach, describe, expect, it, vi } from "vitest";
import { associateAndFilter, fetchOsmPOIs } from "@/services/poiFetcher";
import type { RoutePoint } from "@/types";
import type { ClassifiedPOI } from "@/services/poiClassifier";

const { mockFetchAllPOIs, mockMapOverpassToPOIs, mockInsertPOIs, mockDeletePOIsBySource } =
  vi.hoisted(() => ({
    mockFetchAllPOIs: vi.fn(),
    mockMapOverpassToPOIs: vi.fn(),
    mockInsertPOIs: vi.fn(),
    mockDeletePOIsBySource: vi.fn(),
  }));

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock("@/db/database", () => ({
  insertPOIs: mockInsertPOIs,
  deletePOIsBySource: mockDeletePOIsBySource,
}));
vi.mock("@/services/overpassClient", () => ({
  fetchAllPOIs: mockFetchAllPOIs,
}));
vi.mock("@/services/poiClassifier", () => ({
  mapOverpassToPOIs: mockMapOverpassToPOIs,
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
  beforeEach(() => {
    mockFetchAllPOIs.mockReset();
    mockMapOverpassToPOIs.mockReset();
    mockInsertPOIs.mockReset();
    mockDeletePOIsBySource.mockReset();
  });

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

  it("preserves starred POI rows when refreshing a source with stable downloaded POI ids", async () => {
    mockFetchAllPOIs.mockResolvedValue([]);
    mockMapOverpassToPOIs.mockReturnValue([classified("water-1", "water", 20)]);

    await fetchOsmPOIs("route-1", routePoints, 1000);

    expect(mockDeletePOIsBySource).toHaveBeenCalledWith("route-1", "osm", {
      preserveStarred: true,
    });
    expect(mockInsertPOIs).toHaveBeenCalledWith([
      expect.objectContaining({ id: "route-1_water-1", routeId: "route-1", sourceId: "water-1" }),
    ]);
  });
});
