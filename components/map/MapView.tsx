import React, { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { View, AppState, useWindowDimensions } from "react-native";
import { Camera, MapView as MapboxMapView, LocationPuck } from "@rnmapbox/maps";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";
import { useCollectionStore } from "@/store/collectionStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePanelStore } from "@/store/panelStore";
import {
  ACTIVE_ROUTE_POLISHED,
  ACTIVE_ROUTE_POLISHED_DARK,
  SEGMENT_COLORS_DARK,
  SEGMENT_COLORS_LIGHT,
  SHEET_COMPACT_RATIO,
} from "@/constants";
import { useThemeColors } from "@/theme";
import { useColorScheme } from "nativewind";
import { useMapStyle } from "@/hooks/useMapStyle";
import { GPS_STALE_THRESHOLD_MS } from "@/constants";
import MapControls from "./MapControls";
import RouteLayer, { RouteArrowLayer } from "./RouteLayer";
import RouteMarkerLayer from "./RouteMarkerLayer";
import POILayer from "./POILayer";
import ClimbHighlightLayer from "./ClimbHighlightLayer";
import TabbedBottomPanel from "./TabbedBottomPanel";
import { resolveActiveClimb } from "@/utils/climbSelect";
import { snapToRoute } from "@/services/routeSnapping";
import { useActiveRouteData, getActiveRouteDataImperative } from "@/hooks/useActiveRouteData";
import { usePoiStore } from "@/store/poiStore";
import { usePlaceStore } from "@/store/placeStore";
import { useWaypointStore } from "@/store/waypointStore";
import { useStarredStore } from "@/store/starredStore";
import { useClimbStore } from "@/store/climbStore";
import { useEtaStore } from "@/store/etaStore";
import { useWeatherStore } from "@/store/weatherStore";
import { useOfflineStore } from "@/store/offlineStore";
import { selectDistanceMarkerZoomBucket } from "@/utils/routeMarkers";
import { horizonWindow, zoomToHorizon } from "@/utils/horizon";
import { nextDisplayHeading } from "@/utils/mapHeading";
import type { MapState } from "@rnmapbox/maps";
import type { RoutePoint } from "@/types";

function getRouteWindowBounds(input: {
  points: RoutePoint[];
  startIndex: number;
  startDistanceMeters: number;
  endDistanceMeters: number;
}): { minLat: number; maxLat: number; minLon: number; maxLon: number } | null {
  const { points, startIndex, startDistanceMeters, endDistanceMeters } = input;
  if (points.length === 0) return null;

  let minLat = 90,
    maxLat = -90,
    minLon = 180,
    maxLon = -180;
  let found = false;

  for (let i = Math.max(0, startIndex); i < points.length; i++) {
    const point = points[i];
    if (point.distanceFromStartMeters < startDistanceMeters && i > startIndex) continue;

    found = true;
    if (point.latitude < minLat) minLat = point.latitude;
    if (point.latitude > maxLat) maxLat = point.latitude;
    if (point.longitude < minLon) minLon = point.longitude;
    if (point.longitude > maxLon) maxLon = point.longitude;

    if (point.distanceFromStartMeters > endDistanceMeters) break;
  }

  return found ? { minLat, maxLat, minLon, maxLon } : null;
}

export default function MapScreen() {
  const themeColors = useThemeColors();
  const { colorScheme } = useColorScheme();
  const mapStyle = useMapStyle();
  const cameraRef = useRef<Camera>(null);
  const mapRef = useRef<MapboxMapView>(null);
  const [hasGpsFix, setHasGpsFix] = useState(false);
  const [routeMarkerZoom, setRouteMarkerZoom] = useState(() => useMapStore.getState().zoom);
  const [heading, setHeading] = useState(0);
  const { height: screenHeight } = useWindowDimensions();
  const { bottom: safeBottom } = useSafeAreaInsets();

  const { followUser, setFollowUser } = useMapStore();
  const showDistanceMarkers = useMapStore((s) => s.showDistanceMarkers);
  const refreshPosition = useMapStore((s) => s.refreshPosition);
  const persistCamera = useMapStore((s) => s.persistCamera);
  const initialCamera = useRef({
    center: useMapStore.getState().center,
    zoom: useMapStore.getState().zoom,
  });
  const lastCamera = useRef(initialCamera.current);
  const panelTab = usePanelStore((s) => s.panelTab);
  const horizonFitRequestId = usePanelStore((s) => s.horizonFitRequestId);
  const lastHorizonFitId = useRef(horizonFitRequestId);
  const climbZoomScope = usePanelStore((s) => s.climbZoomScope);
  const climbScopeFitRequestId = usePanelStore((s) => s.climbScopeFitRequestId);
  const setHorizonFromZoom = usePanelStore((s) => s.setHorizonFromZoom);
  const setHorizonFromCamera = usePanelStore((s) => s.setHorizonFromCamera);
  const setHorizonPopoverOpen = usePanelStore((s) => s.setHorizonPopoverOpen);
  const panelHeight = Math.round(screenHeight * SHEET_COMPACT_RATIO) + safeBottom;

  const routes = useRouteStore((s) => s.routes);
  const visibleRoutePoints = useRouteStore((s) => s.visibleRoutePoints);
  const loadRoutesAndPoints = useRouteStore((s) => s.loadRoutesAndPoints);
  const snappedPosition = useRouteStore((s) => s.snappedPosition);
  const setSnappedPosition = useRouteStore((s) => s.setSnappedPosition);
  const loadCollections = useCollectionStore((s) => s.loadCollections);
  const loadPOIs = usePoiStore((s) => s.loadPOIs);
  const loadPlaces = usePlaceStore((s) => s.loadPlaces);
  const loadWaypoints = useWaypointStore((s) => s.loadWaypoints);
  const loadStarredItems = useStarredStore((s) => s.loadStarredItems);
  const computeETAForRoute = useEtaStore((s) => s.computeETAForRoute);
  const cumulativeTime = useEtaStore((s) => s.cumulativeTime);
  const fetchWeather = useWeatherStore((s) => s.fetchWeather);
  const plannedStart = useWeatherStore((s) => s.plannedStart);
  const isConnected = useOfflineStore((s) => s.isConnected);

  // Unified active context — works for both standalone routes and collections
  const activeData = useActiveRouteData();
  const activeRoutePoints = activeData?.points ?? null;
  const activeDataId = activeData?.id ?? null;
  const activeTotalDistance = activeData?.totalDistanceMeters ?? 0;
  const activeRouteIds = useMemo(() => activeData?.routeIds ?? [], [activeData?.routeIds]);
  const activeRouteIdsKey = useMemo(() => activeRouteIds.join(","), [activeRouteIds]);

  // Set of routeIds that are part of the active collection (for RouteLayer styling)
  const activeCollectionRouteIds = useMemo(() => {
    if (activeData?.type === "collection") return new Set(activeData.routeIds);
    return null;
  }, [activeData]);

  useEffect(() => {
    loadRoutesAndPoints();
    loadCollections();
    loadStarredItems();
  }, [loadRoutesAndPoints, loadCollections, loadStarredItems]);

  const loadClimbs = useClimbStore((s) => s.loadClimbs);
  const updateCurrentClimb = useClimbStore((s) => s.updateCurrentClimb);
  const selectedClimb = useClimbStore((s) => s.selectedClimb);
  const setSelectedClimb = useClimbStore((s) => s.setSelectedClimb);
  const getClimbsForDisplay = useClimbStore((s) => s.getClimbsForDisplay);
  const allClimbData = useClimbStore((s) => s.climbs);

  // Clear stale climb selection when active route/collection changes
  const activeContextKey = activeData ? `${activeData.id}:${activeRouteIdsKey}` : null;
  const prevActiveContextKey = useRef(activeContextKey);
  useEffect(() => {
    if (activeContextKey !== prevActiveContextKey.current) {
      prevActiveContextKey.current = activeContextKey;
      setSelectedClimb(null);
    }
  }, [activeContextKey, setSelectedClimb]);

  // Load POIs, waypoints, places, and climbs when active context changes
  useEffect(() => {
    if (activeRouteIds.length === 0) return;
    for (const routeId of activeRouteIds) {
      loadPOIs(routeId);
      loadWaypoints(routeId);
      loadPlaces(routeId);
      loadClimbs(routeId);
    }
  }, [activeRouteIds, activeRouteIdsKey, loadPOIs, loadWaypoints, loadPlaces, loadClimbs]);

  useEffect(() => {
    if (activeData && activeRoutePoints?.length) {
      computeETAForRoute(activeData.id, activeRoutePoints);
    }
    // Intentional: fire only when id/points change; full activeData reference not needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeData?.id, activeRoutePoints, computeETAForRoute]);

  // Fetch weather when active context + snapped position + ETA are available (and online)
  useEffect(() => {
    if (
      activeData &&
      activeRoutePoints?.length &&
      snappedPosition &&
      cumulativeTime &&
      isConnected
    ) {
      fetchWeather(activeData.id, activeRoutePoints, snappedPosition.pointIndex, cumulativeTime);
    }
    // Intentional: fire on id/pointIndex changes, not full object identities
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeData?.id,
    snappedPosition?.pointIndex,
    isConnected,
    cumulativeTime,
    fetchWeather,
    plannedStart,
  ]);

  // Snap eagerly when routes load (don't wait for next GPS refresh)
  useEffect(() => {
    if (!activeData || !activeRoutePoints?.length) return;
    const pos = useMapStore.getState().userPosition;
    if (!pos) return;
    const snapped = snapToRoute(pos.latitude, pos.longitude, activeData.id, activeRoutePoints);
    setSnappedPosition(snapped);
    // Intentional: fire only when active id or points change; the full activeData reference isn't meaningful
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeData?.id, activeRoutePoints, setSnappedPosition]);

  // Snap to route after each position refresh
  const snapAfterRefresh = useCallback(
    (position: { latitude: number; longitude: number }) => {
      const data = getActiveRouteDataImperative();
      if (data && data.points.length > 0) {
        const snapped = snapToRoute(position.latitude, position.longitude, data.id, data.points);
        setSnappedPosition(snapped);
      }
    },
    [setSnappedPosition],
  );

  // On-demand GPS: fetch position on mount
  useEffect(() => {
    (async () => {
      const position = await refreshPosition();
      if (position) {
        if (!hasGpsFix) setHasGpsFix(true);
        snapAfterRefresh(position);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh on app focus if position is stale
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      const pos = useMapStore.getState().userPosition;
      if (!pos || Date.now() - pos.timestamp >= GPS_STALE_THRESHOLD_MS) {
        const position = await refreshPosition();
        if (position) {
          if (!hasGpsFix) setHasGpsFix(true);
          snapAfterRefresh(position);
        }
      }
    });
    return () => subscription.remove();
  }, [refreshPosition, snapAfterRefresh, hasGpsFix]);

  // Track current climb based on snapped position
  useEffect(() => {
    if (snappedPosition && activeData) {
      updateCurrentClimb(
        snappedPosition.distanceAlongRouteMeters,
        activeData.routeIds,
        activeData.segments,
      );
    }
    // Intentional: fire on primitive id/distance changes, not on full object/array identities
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snappedPosition?.distanceAlongRouteMeters, activeData?.id, updateCurrentClimb]);

  // Fly to selected POI/place
  const selectedPOI = usePoiStore((s) => s.selectedPOI);
  const selectedPlace = usePlaceStore((s) => s.selectedPlace);
  useEffect(() => {
    const target =
      selectedPlace ??
      (selectedPOI ? { longitude: selectedPOI.longitude, latitude: selectedPOI.latitude } : null);
    if (target) {
      setFollowUser(false);
      cameraRef.current?.setCamera({
        centerCoordinate: [target.longitude, target.latitude],
        zoomLevel: 14,
        animationDuration: 500,
      });
      setHorizonFromCamera(zoomToHorizon(14));
    }
  }, [selectedPOI, selectedPlace, setFollowUser, setHorizonFromCamera]);

  const handleLocate = useCallback(async () => {
    setFollowUser(true);
    // Snap to cached position instantly, then ease to fresh fix (no zoom change)
    const currentPos = useMapStore.getState().userPosition;
    if (currentPos) {
      cameraRef.current?.setCamera({
        centerCoordinate: [currentPos.longitude, currentPos.latitude],
        animationMode: "moveTo",
        animationDuration: 0,
      });
    }
    const position = await refreshPosition();
    if (position) {
      if (!hasGpsFix) setHasGpsFix(true);
      snapAfterRefresh(position);
      cameraRef.current?.setCamera({
        centerCoordinate: [position.longitude, position.latitude],
        animationMode: "easeTo",
        animationDuration: 500,
      });
    }
  }, [setFollowUser, refreshPosition, snapAfterRefresh, hasGpsFix]);

  const handleCameraChanged = useCallback(
    (state: MapState) => {
      const c = state.properties.center;
      const nextZoom = state.properties.zoom;
      const nextHeading = state.properties.heading;
      lastCamera.current = { center: [c[0], c[1]], zoom: nextZoom };
      setRouteMarkerZoom((currentZoom) =>
        selectDistanceMarkerZoomBucket(currentZoom) === selectDistanceMarkerZoomBucket(nextZoom)
          ? currentZoom
          : nextZoom,
      );
      setHeading((prev) => nextDisplayHeading(prev, nextHeading));

      // Programmatic camera moves also emit camera events; only real map gestures update the chip.
      if (state.gestures.isGestureActive) {
        const newHorizon = zoomToHorizon(nextZoom);
        setHorizonFromZoom(newHorizon);
      }
    },
    [setHorizonFromZoom],
  );

  // Persist camera to MMKV when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background" || s === "inactive") {
        persistCamera(lastCamera.current.center, lastCamera.current.zoom);
      }
    });
    return () => sub.remove();
  }, [persistCamera]);

  const handleTouchStart = useCallback(() => {
    setHorizonPopoverOpen(false);
    if (followUser) {
      setFollowUser(false);
    }
  }, [followUser, setFollowUser, setHorizonPopoverOpen]);

  const handleResetNorth = useCallback(() => {
    cameraRef.current?.setCamera({
      heading: 0,
      animationDuration: 300,
      animationMode: "easeTo",
    });
  }, []);

  useEffect(() => {
    if (!activeDataId || !activeRoutePoints?.length) return;
    if (panelTab === "climbs") return;
    // Only run camera fit for explicit horizon selector changes
    if (horizonFitRequestId === lastHorizonFitId.current) return;
    lastHorizonFitId.current = horizonFitRequestId;

    const horizon = usePanelStore.getState().horizon;

    const isValidSnap =
      snappedPosition?.routeId === activeDataId && snappedPosition.distanceFromRouteMeters <= 1000;

    const startIndex = isValidSnap ? snappedPosition.pointIndex : 0;
    const startDistanceMeters =
      horizon === null
        ? 0
        : isValidSnap
          ? snappedPosition.distanceAlongRouteMeters
          : (activeRoutePoints[startIndex]?.distanceFromStartMeters ?? 0);
    const endDistanceMeters =
      horizon === null
        ? activeTotalDistance
        : horizonWindow(startDistanceMeters, horizon, activeTotalDistance).endDist;

    const bounds = getRouteWindowBounds({
      points: activeRoutePoints,
      startIndex: horizon === null ? 0 : startIndex,
      startDistanceMeters,
      endDistanceMeters,
    });
    if (!bounds) return;

    setFollowUser(false);
    if (bounds.minLat === bounds.maxLat && bounds.minLon === bounds.maxLon) {
      cameraRef.current?.setCamera({
        centerCoordinate: [bounds.minLon, bounds.minLat],
        zoomLevel: 14,
        animationDuration: 500,
        animationMode: "easeTo",
      });
      return;
    }

    cameraRef.current?.fitBounds(
      [bounds.maxLon, bounds.maxLat],
      [bounds.minLon, bounds.minLat],
      [60, 40, 40, 40],
      500,
    );
  }, [
    activeDataId,
    activeTotalDistance,
    activeRoutePoints,
    panelTab,
    horizonFitRequestId,
    snappedPosition?.distanceAlongRouteMeters,
    snappedPosition?.distanceFromRouteMeters,
    snappedPosition?.pointIndex,
    snappedPosition?.routeId,
    setFollowUser,
  ]);

  // Camera fit: climbs tab — uses climbZoomScope (Climb | Segment | All)
  // instead of numeric horizon. Climb fits exact climb bounds, Segment fits
  // the collection segment containing the climb, All fits the full route.
  const lastClimbScopeFitId = useRef(climbScopeFitRequestId);
  const prevClimbScopePanelTab = useRef(panelTab);
  const lastClimbFocusKey = useRef<string | null>(null);
  useEffect(() => {
    if (!activeDataId || !activeRoutePoints?.length) return;
    const enteredClimbs = prevClimbScopePanelTab.current !== "climbs" && panelTab === "climbs";
    prevClimbScopePanelTab.current = panelTab;
    if (panelTab !== "climbs") return;

    const isScopeChange = climbScopeFitRequestId !== lastClimbScopeFitId.current;

    const scope = usePanelStore.getState().climbZoomScope;

    // All: fit the whole route
    if (scope === "all") {
      if (!enteredClimbs && !isScopeChange) return;
      lastClimbScopeFitId.current = climbScopeFitRequestId;
      lastClimbFocusKey.current = `${activeDataId}:all`;
      const bounds = getRouteWindowBounds({
        points: activeRoutePoints,
        startIndex: 0,
        startDistanceMeters: 0,
        endDistanceMeters: activeTotalDistance,
      });
      if (bounds) {
        setFollowUser(false);
        if (bounds.minLat === bounds.maxLat && bounds.minLon === bounds.maxLon) {
          cameraRef.current?.setCamera({
            centerCoordinate: [bounds.minLon, bounds.minLat],
            zoomLevel: 14,
            animationDuration: 500,
            animationMode: "easeTo",
          });
        } else {
          cameraRef.current?.fitBounds(
            [bounds.maxLon, bounds.maxLat],
            [bounds.minLon, bounds.minLat],
            [60, 40, 40, 40],
            500,
          );
        }
      }
      return;
    }

    // Resolve the active/selected climb for Climb and Segment scopes
    const climbs = getClimbsForDisplay(activeRouteIds, activeData?.segments ?? null);
    const resolvedClimb = resolveActiveClimb(
      climbs,
      snappedPosition?.distanceAlongRouteMeters ?? null,
      selectedClimb,
    );
    if (!resolvedClimb) return;

    const focusKey = `${activeDataId}:${scope}:${resolvedClimb.id}:${resolvedClimb.startDistanceMeters}:${resolvedClimb.endDistanceMeters}`;
    if (!enteredClimbs && !isScopeChange && lastClimbFocusKey.current === focusKey) return;
    lastClimbScopeFitId.current = climbScopeFitRequestId;
    lastClimbFocusKey.current = focusKey;

    // Segment: fit the collection segment with the largest overlap with the climb
    if (scope === "segment") {
      const segments = activeData?.segments;
      if (!segments || segments.length === 0) {
        // No segment data — fall back to climb scope behavior
        // (Segment button is hidden in UI when no segments, but guard anyway)
      } else {
        const climbStart = resolvedClimb.startDistanceMeters;
        const climbEnd = resolvedClimb.endDistanceMeters;
        const climbLen = climbEnd - climbStart;

        // Find the segment with the largest overlap with the climb
        let bestSeg = segments[0];
        let bestOverlap = -1;
        for (const seg of segments) {
          const segStart = seg.distanceOffsetMeters;
          const segEnd = segStart + seg.segmentDistanceMeters;
          const overlapStart = Math.max(climbStart, segStart);
          const overlapEnd = Math.min(climbEnd, segEnd);
          const overlap = Math.max(0, overlapEnd - overlapStart);
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestSeg = seg;
          }
        }

        // Also include adjacent segments that are roughly tied (within 10% of climb length)
        const tiedSegments = segments.filter((seg) => {
          if (seg === bestSeg) return true;
          const segStart = seg.distanceOffsetMeters;
          const segEnd = segStart + seg.segmentDistanceMeters;
          const overlapStart = Math.max(climbStart, segStart);
          const overlapEnd = Math.min(climbEnd, segEnd);
          const overlap = Math.max(0, overlapEnd - overlapStart);
          return overlap > 0 && Math.abs(overlap - bestOverlap) < climbLen * 0.1;
        });

        // Compute bounds for the union of tied segments
        let minDist = Infinity;
        let maxDist = -Infinity;
        for (const seg of tiedSegments) {
          const segStart = seg.distanceOffsetMeters;
          const segEnd = segStart + seg.segmentDistanceMeters;
          if (segStart < minDist) minDist = segStart;
          if (segEnd > maxDist) maxDist = segEnd;
        }

        const bounds = getRouteWindowBounds({
          points: activeRoutePoints,
          startIndex: 0,
          startDistanceMeters: minDist,
          endDistanceMeters: maxDist,
        });
        if (bounds) {
          setFollowUser(false);
          if (bounds.minLat === bounds.maxLat && bounds.minLon === bounds.maxLon) {
            cameraRef.current?.setCamera({
              centerCoordinate: [bounds.minLon, bounds.minLat],
              zoomLevel: 14,
              animationDuration: 500,
              animationMode: "easeTo",
            });
          } else {
            cameraRef.current?.fitBounds(
              [bounds.maxLon, bounds.maxLat],
              [bounds.minLon, bounds.minLat],
              [60, 40, 40, 40],
              500,
            );
          }
        }
        return;
      }
      // Fall through to climb scope when no segments
    }

    // Climb scope: fit exact climb bounds
    let minLat = 90,
      maxLat = -90,
      minLon = 180,
      maxLon = -180;
    let found = false;
    for (const point of activeRoutePoints) {
      if (point.distanceFromStartMeters < resolvedClimb.startDistanceMeters) continue;
      if (point.distanceFromStartMeters > resolvedClimb.endDistanceMeters) break;
      found = true;
      if (point.latitude < minLat) minLat = point.latitude;
      if (point.latitude > maxLat) maxLat = point.latitude;
      if (point.longitude < minLon) minLon = point.longitude;
      if (point.longitude > maxLon) maxLon = point.longitude;
    }
    if (!found) return;

    setFollowUser(false);
    if (minLat === maxLat && minLon === maxLon) {
      cameraRef.current?.setCamera({
        centerCoordinate: [minLon, minLat],
        zoomLevel: 14,
        animationDuration: 500,
        animationMode: "easeTo",
      });
      return;
    }

    cameraRef.current?.fitBounds([maxLon, maxLat], [minLon, minLat], [60, 40, 40, 40], 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedClimb,
    panelTab,
    climbScopeFitRequestId,
    climbZoomScope,
    activeDataId,
    activeTotalDistance,
    activeRoutePoints,
    activeRouteIds,
    activeData?.segments,
    snappedPosition?.distanceAlongRouteMeters,
    allClimbData,
    setFollowUser,
  ]);

  const cameraPadding = useMemo(
    () => ({
      paddingTop: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingBottom: panelHeight,
    }),
    [panelHeight],
  );

  const pulsingConfig = useMemo(
    () => ({ isEnabled: true, color: themeColors.accent, radius: 40 }),
    [themeColors.accent],
  );

  // Routes that should be rendered on the map (active or part of active collection, with loaded points)
  const renderedRoutes = useMemo(
    () =>
      routes.filter(
        (r) =>
          r.isVisible &&
          visibleRoutePoints[r.id] &&
          (r.isActive || (activeCollectionRouteIds?.has(r.id) ?? false)),
      ),
    [routes, visibleRoutePoints, activeCollectionRouteIds],
  );

  // Forces LocationPuck to remount so its layer is recreated on top of route/POI layers.
  const renderedRouteKey = useMemo(() => {
    return (
      renderedRoutes
        .map((r) => r.id)
        .sort()
        .join(",") + `-${mapStyle.styleKey}`
    );
  }, [renderedRoutes, mapStyle.styleKey]);

  // Climb to highlight on the map — active when Climbs tab is selected
  const highlightedClimb = useMemo(() => {
    if (panelTab !== "climbs") return null;
    const displayed = getClimbsForDisplay(activeRouteIds, activeData?.segments ?? null);
    return resolveActiveClimb(
      displayed,
      snappedPosition?.distanceAlongRouteMeters ?? null,
      selectedClimb,
    );
    // allClimbData is a reactivity trigger: getClimbsForDisplay reads store via get() and is not itself reactive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    panelTab,
    selectedClimb,
    activeRouteIds,
    activeData?.segments,
    snappedPosition?.distanceAlongRouteMeters,
    allClimbData,
  ]);

  // The climbs-tab camera effect handles zooming; highlightedClimb is only for layer styling.

  return (
    <View className="flex-1">
      <MapboxMapView
        ref={mapRef}
        style={{ flex: 1 }}
        {...mapStyle.props}
        compassEnabled={false}
        scaleBarEnabled={false}
        rotateEnabled={true}
        pitchEnabled={false}
        onTouchStart={handleTouchStart}
        onCameraChanged={handleCameraChanged}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: initialCamera.current.center,
            zoomLevel: initialCamera.current.zoom,
          }}
          animationDuration={500}
          padding={cameraPadding}
        />
        {renderedRoutes.map((route) => {
          const styledRoute = route.isActive ? route : { ...route, isActive: true };
          const isCollectionRoute =
            (activeCollectionRouteIds?.has(route.id) ?? false) && activeData?.type === "collection";
          const segmentIndex = isCollectionRoute
            ? (activeData?.segments?.findIndex((segment) => segment.routeId === route.id) ?? -1)
            : -1;
          const segmentColors = colorScheme === "dark" ? SEGMENT_COLORS_DARK : SEGMENT_COLORS_LIGHT;
          const colorOverride =
            isCollectionRoute && segmentIndex >= 0
              ? segmentColors[segmentIndex % segmentColors.length]
              : undefined;
          const isSingleActive = route.isActive && activeData?.type === "route";
          const singleColor = isSingleActive
            ? colorScheme === "dark"
              ? ACTIVE_ROUTE_POLISHED_DARK
              : ACTIVE_ROUTE_POLISHED
            : undefined;

          return (
            <RouteLayer
              key={`${route.id}-${mapStyle.styleKey}`}
              route={styledRoute}
              points={visibleRoutePoints[route.id]}
              dimmed={highlightedClimb != null}
              colorOverride={colorOverride ?? singleColor}
            />
          );
        })}
        {renderedRoutes.map((route) => {
          const styledRoute = route.isActive ? route : { ...route, isActive: true };
          const isCollectionRoute =
            (activeCollectionRouteIds?.has(route.id) ?? false) && activeData?.type === "collection";
          const segmentIndex = isCollectionRoute
            ? (activeData?.segments?.findIndex((segment) => segment.routeId === route.id) ?? -1)
            : -1;
          const segmentColors = colorScheme === "dark" ? SEGMENT_COLORS_DARK : SEGMENT_COLORS_LIGHT;
          const colorOverride =
            isCollectionRoute && segmentIndex >= 0
              ? segmentColors[segmentIndex % segmentColors.length]
              : undefined;
          const showRouteArrows = route.isActive || isCollectionRoute;
          const isSingleActive = route.isActive && activeData?.type === "route";
          const singleColor = isSingleActive
            ? colorScheme === "dark"
              ? ACTIVE_ROUTE_POLISHED_DARK
              : ACTIVE_ROUTE_POLISHED
            : undefined;

          return (
            <RouteArrowLayer
              key={`arrows-${route.id}-${mapStyle.styleKey}`}
              route={styledRoute}
              points={visibleRoutePoints[route.id]}
              dimmed={highlightedClimb != null}
              colorOverride={colorOverride ?? singleColor}
              showArrows={showRouteArrows}
              zoom={routeMarkerZoom}
            />
          );
        })}
        {highlightedClimb && activeRoutePoints && (
          <ClimbHighlightLayer
            key={`climb-${highlightedClimb.id}-${mapStyle.styleKey}`}
            climb={highlightedClimb}
            points={activeRoutePoints}
          />
        )}
        <RouteMarkerLayer
          key={`route-markers-${activeData?.id ?? "none"}-${mapStyle.styleKey}`}
          activeContextKey={activeContextKey}
          points={activeRoutePoints ?? []}
          showDistanceMarkers={showDistanceMarkers}
          zoom={routeMarkerZoom}
        />
        {activeRouteIds.length > 0 && (
          <POILayer key={mapStyle.styleKey} routeIds={activeRouteIds} />
        )}
        <LocationPuck
          key={`puck-${renderedRouteKey}`}
          puckBearing="heading"
          puckBearingEnabled
          pulsing={pulsingConfig}
        />
      </MapboxMapView>

      <MapControls onLocate={handleLocate} heading={heading} onResetNorth={handleResetNorth} />
      <TabbedBottomPanel activeData={activeData} />
    </View>
  );
}
