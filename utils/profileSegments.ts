import { SEGMENT_COLORS_DARK, SEGMENT_COLORS_LIGHT } from "@/constants";
import type { ProfileSegment } from "@/components/elevation/ElevationProfile";
import type { StitchedSegmentInfo } from "@/types";

export function profileSegmentsFromStitchedSegments(
  segments: StitchedSegmentInfo[] | null | undefined,
  colorScheme: "light" | "dark" | undefined | null,
): ProfileSegment[] | undefined {
  if (!segments || segments.length <= 1) return undefined;

  const palette = colorScheme === "dark" ? SEGMENT_COLORS_DARK : SEGMENT_COLORS_LIGHT;

  return segments.map((segment, index) => ({
    startDistanceMeters: segment.distanceOffsetMeters,
    endDistanceMeters: segment.distanceOffsetMeters + segment.segmentDistanceMeters,
    lengthMeters: segment.segmentDistanceMeters,
    name: segment.routeName,
    color: palette[index % palette.length],
  }));
}
