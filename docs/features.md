# Ultra Companion — Features

What's implemented. For the "why" behind these, see `usage-context.md`.

## Map & GPS

- Full-screen Mapbox vector map with dark outdoor style for night riding
- On-demand GPS — position refreshes on app focus (if stale >10 min) or manual tap, no background polling
- Position age indicator when stale
- Heading-up / north-up toggle
- Floating map controls — compass (bottom-left), menu toggle (SlidersHorizontal icon, opens compact menu), GPS/follow (top-right)
- Map controls menu — compact by default with icons + toggles; labels expand via triangle or swipe-left gesture
- Pathline modes in the map controls menu: Segments, Weather, and Climbs selectable; Surface and Descends reserved for future overlays
- Display toggles: Distance markers, POIs, Waypoints (persisted in Settings > Map Display)

## Routes

- Import GPX/KML via file picker, share sheet, or URL
- Multiple routes with distinct colors
- Route list with toggle visibility, set active, delete
- Route metadata: total distance, ascent, descent
- Route snapping — snap GPS position to nearest point on active route

## Collections

- Group route segments into collections with ordered positions
- Variant auto-detection (alternative segments for the same position)
- Stitching — selected segments concatenated into continuous view for all downstream features
- Drag-to-reorder segments, radio-button variant selection

## Elevation Profile

- Interactive chart with gradient color coding (green through red by steepness)
- Current position marker
- Pinch-to-zoom, tap to highlight on map
- Bottom panel modes: 10km / 25km / 50km / 100km / 200km upcoming
- Segment boundary markers for stitched collections

## Climb Detection

- Auto-detected from elevation data on import
- Smoothing, dip absorption, qualification (50m+ gain, 2.5%+ avg gradient)
- Difficulty scoring (Climbbybike method — gradient squared times length)
- Upcoming climbs list with distance, ETA, stats
- Current climb mode — auto-zooms elevation chart, shows progress to top
- Climb shading on elevation profile (colored by difficulty)

## POI Search

- Along-route search with configurable global fallback radius and category-appropriate default corridors
- Categories: water, food stops, toilets/showers, shelter/rest, emergency help, bicycle repair, and train escape points
- Two data sources: Overpass/OSM for most categories, Google Places for gas stations and food stops (better opening hours)
- POI markers on map and elevation profile
- POI list sortable by distance along route
- POI text search (filter by name)
- Starred POIs
- Opening hours: open/closed status, color-coded, "open now" filter
- Category filters (multi-select)

## ETA Calculator

- Power-based speed model using cycling physics (power, weight, gradient, drag, rolling resistance)
- Terrain-aware — accounts for climbs, descents, flats
- Configurable: power output, total weight, advanced params (CdA, Crr, max descent speed)
- ETA displayed on POI cards, POI list items, and climb list
- Fully offline — pure math on elevation data

## Weather

- Route-aware forecast timeline at ETA positions with one cycling sample filter: All, Hourly, or 10km
- Chip row: cycling sample filter, Feels like, forecast-start chip (Now or selected time), and animated Refresh chip
- Status row: auto/manual refresh age, warning count, and appended readable refresh outcomes/errors
- Swipe up on the toolbar, status, gradient, or current weather row expands the Weather tab
- Current route forecast is shown as a full weather row above the timeline list
- Segment dividers appear only when switching to later route segments, not before the current/first segment
- Compact rows (very tight): ETA/distance, primary temp, condition icon/title, compact risk-specific warning badge when present, moisture/humidity indicator with percent, gust, and sustained wind
- Warning rows expand to centered warning details; non-warning rows do not expand
- Temperature gradient strip: shows trend by distance when enough samples exist
- Actual or feels-like temperature mode
- Night-aware icons (Moon, CloudMoon) with cool color palette
- Wind indicator: headwind/tailwind/crosswind relative to route direction
- Cached when online; failed refreshes keep cached values visible and show clear error status

## Offline Support

- Offline map tiles — download corridor along route at zoom 6–15
- Offline POI data — pre-fetched and cached in SQLite
- Download size estimator, progress UI, cancel/retry
- "Prepare for offline" per route/collection
- Storage management — space used per route, cleanup
- All features except weather work fully offline
