import type { FetchablePOISource } from "@/types";
import type { ProgressInfo } from "@/store/poiStore";

function formatCount(done: number, total: number, unit: string): string {
  return `${done} of ${total} ${unit}`;
}

export function formatPoiProgress(progress: ProgressInfo, source?: FetchablePOISource): string {
  const phase = progress.phase.toLowerCase();

  if (phase === "processing") return "Processing POIs";
  if (phase === "done") return "Done processing POIs";

  if (source === "google") {
    return `Checking Google searches: ${formatCount(progress.done, progress.total, "searches")}`;
  }

  if (source === "osm") {
    return `Checking OSM route sections: ${formatCount(progress.done, progress.total, "sections")}`;
  }

  return `${progress.phase}: ${formatCount(progress.done, progress.total, "steps")}`;
}

export function formatSegmentProgress(done: number, total: number): string {
  return formatCount(done, total, "segments");
}

export function formatTileSegmentProgress(done: number, total: number): string {
  return `Downloading map tiles: ${formatSegmentProgress(done, total)}`;
}

export function formatCollectionPoiProgress(
  routeName: string,
  progress: ProgressInfo,
  source: FetchablePOISource,
  segmentDone: number,
  segmentTotal: number,
): string {
  return `${routeName}: ${formatPoiProgress(progress, source)} (${formatSegmentProgress(
    segmentDone,
    segmentTotal,
  )})`;
}
