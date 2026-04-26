import { describe, expect, it, vi } from "vitest";
import { importRouteBatch, importRouteFileContent } from "@/services/routeImportPipeline";
import type {
  RouteImportDependencies,
  RouteImportFileContent,
} from "@/services/routeImportPipeline";
import type { RouteWaypoint } from "@/types";

const validGpx = (name = "Route") => `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>${name}</name><trkseg>
    <trkpt lat="48.0" lon="17.0"><ele>100</ele></trkpt>
    <trkpt lat="48.1" lon="17.1"><ele>120</ele></trkpt>
  </trkseg></trk>
</gpx>`;

const gpxWithWaypoints = (name = "Route") => `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <wpt lat="48.0" lon="17.0">
    <name>Start Cafe</name>
    <type>cafe</type>
    <desc>Open early</desc>
    <ele>100</ele>
  </wpt>
  <wpt lat="48.05" lon="17.05">
    <name>Midpoint Shop</name>
    <type>shop</type>
  </wpt>
  <trk><name>${name}</name><trkseg>
    <trkpt lat="48.0" lon="17.0"><ele>100</ele></trkpt>
    <trkpt lat="48.1" lon="17.1"><ele>120</ele></trkpt>
  </trkseg></trk>
</gpx>`;

const validKml = (name = "KML Route") => `<?xml version="1.0"?>
<kml><Document><Placemark><name>${name}</name><LineString>
  <coordinates>17.0,48.0,100 17.1,48.1,120</coordinates>
</LineString></Placemark></Document></kml>`;

function deps(): RouteImportDependencies {
  let nextId = 1;
  return {
    generateId: () => `route-${nextId++}`,
    now: () => "2026-01-01T00:00:00.000Z",
    insertRoute: vi.fn(async () => {}),
    detectAndStoreClimbs: vi.fn(async () => {}),
  };
}

function insertRouteMock(dependencies: RouteImportDependencies) {
  return dependencies.insertRoute as unknown as ReturnType<typeof vi.fn>;
}

describe("routeImportPipeline", () => {
  it("imports a single GPX file and preserves existing route defaults", async () => {
    const dependencies = deps();

    const result = await importRouteFileContent(
      { fileName: "alps.gpx", content: validGpx("Alps") },
      dependencies,
    );

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.route).toMatchObject({
      id: "route-1",
      name: "Alps",
      fileName: "alps.gpx",
      isActive: false,
      isVisible: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(dependencies.insertRoute).toHaveBeenCalledOnce();
    expect(dependencies.detectAndStoreClimbs).toHaveBeenCalledOnce();
  });

  it("converts GPX waypoints into route-owned waypoints during import", async () => {
    const dependencies = deps();
    const insertPOIs = vi.fn(async () => {});
    dependencies.insertPOIs = insertPOIs;

    const result = await importRouteFileContent(
      { fileName: "alps.gpx", content: gpxWithWaypoints("Alps") },
      dependencies,
    );

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(insertPOIs).not.toHaveBeenCalled();
    const waypoints = insertRouteMock(dependencies).mock.calls[0][2] as RouteWaypoint[];
    expect(waypoints).toHaveLength(2);
    expect(waypoints[0]).toMatchObject({
      id: "route-1:gpx:0",
      sourceIndex: 0,
      origin: "gpx",
      name: "Start Cafe",
      type: "cafe",
      description: "Open early",
      elevationMeters: 100,
      latitude: 48.0,
      longitude: 17.0,
      routeId: "route-1",
      distanceFromRouteMeters: 0,
      distanceAlongRouteMeters: 0,
    });
    expect(waypoints[1]).toMatchObject({
      id: "route-1:gpx:1",
      sourceIndex: 1,
      origin: "gpx",
      name: "Midpoint Shop",
      type: "shop",
      routeId: "route-1",
    });
  });

  it("associates imported route waypoints with their distance along the route", async () => {
    const dependencies = deps();

    const result = await importRouteFileContent(
      { fileName: "alps.gpx", content: gpxWithWaypoints("Alps") },
      dependencies,
    );

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    const waypoints = insertRouteMock(dependencies).mock.calls[0][2] as RouteWaypoint[];
    expect(waypoints[1].distanceFromRouteMeters).toBeLessThan(1);
    expect(waypoints[1].distanceAlongRouteMeters).toBeCloseTo(
      result.route.totalDistanceMeters / 2,
      -1,
    );
  });

  it("passes an empty route-owned waypoint list for KML imports without parsed waypoints", async () => {
    const dependencies = deps();
    const insertPOIs = vi.fn(async () => {});
    dependencies.insertPOIs = insertPOIs;

    const result = await importRouteFileContent(
      { fileName: "route.kml", content: validKml("Route") },
      dependencies,
    );

    expect(result.status).toBe("success");
    expect(insertPOIs).not.toHaveBeenCalled();
    expect(insertRouteMock(dependencies).mock.calls[0][2]).toEqual([]);
  });

  it("does not persist route waypoints for duplicate files skipped within a batch", async () => {
    const dependencies = deps();
    const insertPOIs = vi.fn(async () => {});
    dependencies.insertPOIs = insertPOIs;
    const duplicate: RouteImportFileContent = {
      fileName: "same.gpx",
      content: gpxWithWaypoints("Same"),
    };

    const results = await importRouteBatch([duplicate, duplicate], dependencies);

    expect(results.map((result) => result.status)).toEqual(["success", "skipped"]);
    expect(insertPOIs).not.toHaveBeenCalled();
    expect(dependencies.insertRoute).toHaveBeenCalledOnce();
  });

  it("reports atomic route import failures before climb detection", async () => {
    const dependencies = deps();
    dependencies.insertRoute = vi.fn(async () => {
      throw new Error("route import transaction failed");
    });

    const result = await importRouteFileContent(
      { fileName: "alps.gpx", content: gpxWithWaypoints("Alps") },
      dependencies,
    );

    expect(result).toMatchObject({
      status: "failed",
      fileName: "alps.gpx",
      error: "route import transaction failed",
    });
    expect(dependencies.insertRoute).toHaveBeenCalledOnce();
    expect(dependencies.detectAndStoreClimbs).not.toHaveBeenCalled();
  });

  it("returns one per-file result in input order", async () => {
    const results = await importRouteBatch(
      [
        { fileName: "first.gpx", content: validGpx("First") },
        { fileName: "second.kml", content: validKml("Second") },
      ],
      deps(),
    );

    expect(results.map((result) => [result.index, result.fileName, result.status])).toEqual([
      [0, "first.gpx", "success"],
      [1, "second.kml", "success"],
    ]);
  });

  it("keeps importing later files after a failed file", async () => {
    const dependencies = deps();

    const results = await importRouteBatch(
      [
        { fileName: "broken.gpx", content: "<not-gpx />" },
        { fileName: "valid.gpx", content: validGpx("Valid") },
      ],
      dependencies,
    );

    expect(results.map((result) => result.status)).toEqual(["failed", "success"]);
    expect(results[0]).toMatchObject({ index: 0, fileName: "broken.gpx", status: "failed" });
    expect(dependencies.insertRoute).toHaveBeenCalledOnce();
  });

  it("skips duplicate files within the selected batch", async () => {
    const duplicate: RouteImportFileContent = { fileName: "same.gpx", content: validGpx("Same") };

    const results = await importRouteBatch([duplicate, duplicate], deps());

    expect(results.map((result) => result.status)).toEqual(["success", "skipped"]);
    expect(results[1]).toMatchObject({
      index: 1,
      fileName: "same.gpx",
      status: "skipped",
      reason: "duplicate",
    });
  });

  it("reports unsupported files as failed results instead of aborting the batch", async () => {
    const results = await importRouteBatch(
      [
        { fileName: "notes.txt", content: "hello" },
        { fileName: "valid.kml", content: validKml("Valid") },
      ],
      deps(),
    );

    expect(results.map((result) => result.status)).toEqual(["failed", "success"]);
    expect(results[0]).toMatchObject({
      status: "failed",
      error: "Unsupported file type. Use .gpx or .kml files.",
    });
  });

  it("emits itemized progress for each file", async () => {
    const onProgress = vi.fn();

    await importRouteBatch(
      [
        { fileName: "first.gpx", content: validGpx("First") },
        { fileName: "broken.gpx", content: "<not-gpx />" },
      ],
      deps(),
      { onProgress },
    );

    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { index: 0, fileName: "first.gpx", status: "importing" },
      { index: 0, fileName: "first.gpx", status: "success" },
      { index: 1, fileName: "broken.gpx", status: "importing" },
      { index: 1, fileName: "broken.gpx", status: "failed" },
    ]);
  });
});
