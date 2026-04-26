import { classifySurfaceTags } from "./surfaceClassifier";
import type { ClassifiedSurfaceWay } from "@/types";
import type { OverpassElement } from "./overpassClient";

function coordString(points: { lat: number; lon: number }[]): string {
  return points.map((point) => `${point.lat},${point.lon}`).join(",");
}

export function buildSurfaceOverpassQuery(
  points: { lat: number; lon: number }[],
  corridorWidthM: number,
): string {
  const coords = coordString(points);
  return `[out:json][timeout:30];
(
  way["highway"]["surface"](around:${corridorWidthM},${coords});
);
out tags geom;`;
}

export function mapOverpassToSurfaceWays(elements: OverpassElement[]): ClassifiedSurfaceWay[] {
  const seen = new Set<string>();
  const ways: ClassifiedSurfaceWay[] = [];

  for (const element of elements) {
    if (element.type !== "way") continue;
    if (!element.geometry || element.geometry.length < 2) continue;

    const sourceId = `${element.type}/${element.id}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const tags = element.tags ?? {};
    ways.push({
      sourceId,
      surfaceTag: tags.surface ?? null,
      surfaceClass: classifySurfaceTags(tags),
      tags,
      geometry: element.geometry.map((point) => ({
        latitude: point.lat,
        longitude: point.lon,
      })),
    });
  }

  return ways;
}
