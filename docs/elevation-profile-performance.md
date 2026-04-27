# Elevation Profile — LOD, Downsampling, and Performance

This document covers the Level-of-Detail (LOD) system for elevation profile rendering, the M4/min-max bucket algorithm, logging fields, and performance constraints.

## Why LOD Exists

The elevation profile renders potentially thousands of data points (one per GPS coordinate in a 1000km+ route). Rendering all points at every zoom level is wasteful and causes:
- SVG path recalculation on every frame during gestures
- Excessive memory usage
- Janky pinch-to-zoom and pan interactions

LOD reduces the rendered point count to a manageable number (typically 200-400 points) while preserving the visual shape of the terrain.

## M4 Min-Max Bucket Algorithm

The M4 algorithm downsamples time-series data while preserving peaks and valleys:

1. **Bucket creation**: Divide the visible distance range into N equal buckets (N ≈ 300-400 for the profile width)
2. **Min-max extraction**: For each bucket, find the minimum and maximum elevation values
3. **Path construction**: Alternate between min and max points to capture the full range

This guarantees that no significant elevation feature (peak or valley) is lost, regardless of zoom level.

### Implementation Notes

- Bucket count scales with the current zoom window (10km, 25km, 50km, etc.)
- The algorithm runs on the **stitched** coordinate space (see `docs/architecture.md` for raw vs stitched)
- Results are cached until the zoom level or visible range changes

## Logging Fields

Three log fields track data at different stages:

| Field | Description |
| ----- |-------------|
| `raw` | Original point count from GPX import (can be 10,000+ for long routes) |
| `visibleRaw` | Points within the current zoom window, before LOD applied |
| `pathLod` | Final point count after M4 downsampling (what actually renders) |

Use these to diagnose rendering issues:
- If `pathLod` ≈ `visibleRaw`, LOD isn't activating (check zoom window calculation)
- If `raw` is much larger than expected, the GPX has excessive sampling (pre-process on import)

## Forced Anchors

Certain points must always be included in the LOD output, regardless of bucket boundaries:

- **Segment boundaries**: Where collection segments join (critical for stitched routes)
- **Climb starts/ends**: To accurately render climb highlights and difficulty shading
- **Current position**: The rider's location marker

Implementation: After M4 computation, inject these points into the result array at their correct distance positions, merging with adjacent points if needed.

## Performance Anti-Patterns to Avoid

### Per-Frame SVG Rerenders During Gestures

During pinch-to-zoom or pan, the elevation profile should not recalculate the SVG path on every frame. Instead:
- Debounce LOD recalculation (wait ~100ms after gesture ends)
- Use a temporary low-res path during gesture, swap to high-res on release

### Scaling Text Labels

Do not scale font size based on zoom level. This creates unreadable labels at extreme zooms. Use fixed-size labels with appropriate truncation instead.

### Hiding Crucial Graph Details for Performance

The elevation profile must always show:
- Current position marker
- Climb highlights (start, end, difficulty)
- Segment boundaries
- Min/max elevation labels

Hiding these for performance violates the core purpose of the profile. If performance is an issue, fix the LOD algorithm, not the information density.

## Future Improvements

- **Adaptive bucket count**: Fewer buckets on slower devices, more on faster ones
- **WebGL rendering**: For very large routes, SVG may not scale; consider a canvas/WebGL alternative
- **Pre-computed LOD levels**: Generate multiple LOD tiers on import, select at runtime