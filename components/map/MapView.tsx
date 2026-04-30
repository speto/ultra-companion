import React, { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { View, AppState, useWindowDimensions } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { Camera, MapView as MapboxMapView, LocationPuck } from "@rnmapbox/maps";
import { Easing, useSharedValue, withTiming } from "react-native-reanimated";
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
import MapSheetControls from "./MapSheetControls";
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
import { horizonWindow, zoomToHorizon } from "@/utils/horizon";
import { isNorthUp, nextDisplayHeading, normalizeHeading } from "@/utils/mapHeading";
import { watchForegroundHeading, watchForegroundPosition } from "@/services/gps";
import {
  getNextFocusTarget,
  getTargetCenter,
  isCenteredOn,
  type MapFocusTargetKind,
  type MapFocusPoint,
} from "@/utils/mapFocus";
import { getDistanceMarkerIntervalForZoom } from "@/utils/routeMarkers";
import type { MapState } from "@rnmapbox/maps";
import type { RoutePoint } from "@/types";

const COMPASS_FOLLOW_FILTER_TAU_MS = 160;
const COMPASS_FOLLOW_MIN_DELTA_DEGREES = 0.75;
const COMPASS_FOLLOW_MIN_UPDATE_MS = 60;
const COMPASS_FOLLOW_ACTIVATION_ANIMATION_MS = 200;
const RESET_NORTH_ANIMATION_MS = 200;
const RESET_NORTH_VISUAL_HOLD_MS = 260;

function signedHeadingDelta(fromHeading: number, toHeading: number): number {
  const from = normalizeHeading(fromHeading);
  const to = normalizeHeading(toHeading);
  return ((to - from + 540) % 360) - 180;
}

function nearestHeading(fromHeading: number, toHeading: number): number {
  return fromHeading + signedHeadingDelta(fromHeading, toHeading);
}

function nearestRotation(current: number, target: number): number {
  const delta = ((target - current + 540) % 360) - 180;
  return current + delta;
}

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
  const isFocused = useIsFocused();
  const cameraRef = useRef<Camera>(null);
  const mapRef = useRef<MapboxMapView>(null);
  const [hasGpsFix, setHasGpsFix] = useState(false);
  const [routeMarkerZoom, setRouteMarkerZoom] = useState(() => useMapStore.getState().zoom);
  const [distanceMarkerInterval, setDistanceMarkerInterval] = useState(() =>
    getDistanceMarkerIntervalForZoom(useMapStore.getState().zoom),
  );
  const distanceMarkerIntervalRef = useRef(distanceMarkerInterval);
  const [heading, setHeading] = useState(0);
  const [advancedFocusMode, setAdvancedFocusMode] = useState<"follow" | null>(() =>
    useMapStore.getState().followUser ? "follow" : null,
  );
  const [isCompassMode, setIsCompassMode] = useState(false);
  const [isResettingNorth, setIsResettingNorth] = useState(false);
  const { height: screenHeight } = useWindowDimensions();
  const { bottom: safeBottom } = useSafeAreaInsets();

  const { followUser, setFollowUser } = useMapStore();
  const showDistanceMarkers = useMapStore((s) => s.showDistanceMarkers);
  const userPosition = useMapStore((s) => s.userPosition);
  const setUserPosition = useMapStore((s) => s.setUserPosition);
  const refreshPosition = useMapStore((s) => s.refreshPosition);
  const persistCamera = useMapStore((s) => s.persistCamera);
  const initialCamera = useRef({
    center: useMapStore.getState().center,
    zoom: useMapStore.getState().zoom,
    heading: 0,
  });
  const compassRotation = useSharedValue(-initialCamera.current.heading);
  const lastCamera = useRef(initialCamera.current);
  const lastCompassCommand = useRef({ heading: initialCamera.current.heading, timestamp: 0 });
  const lastCompassDialRotation = useRef(-initialCamera.current.heading);
  const resetNorthTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualCameraInteraction = useRef(false);
  const manualCameraInteractionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelTab = usePanelStore((s) => s.panelTab);
  const horizonFitRequestId = usePanelStore((s) => s.horizonFitRequestId);
  const lastHorizonFitId = useRef(horizonFitRequestId);
  const climbZoomScope = usePanelStore((s) => s.climbZoomScope);
  const climbScopeFitRequestId = usePanelStore((s) => s.climbScopeFitRequestId);
  const setHorizonFromZoom = usePanelStore((s) => s.setHorizonFromZoom);
  const setHorizonFromCamera = usePanelStore((s) => s.setHorizonFromCamera);
  const setHorizonPopoverOpen = usePanelStore((s) => s.setHorizonPopoverOpen);
  const compactPanelHeight = Math.round(screenHeight * SHEET_COMPACT_RATIO) + safeBottom;

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
  const focusStart = activeRoutePoints?.[0] ?? null;
  const focusFinish = activeRoutePoints?.[activeRoutePoints.length - 1] ?? null;
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

  const clearResetNorthTimeout = useCallback(() => {
    if (resetNorthTimeout.current) {
      clearTimeout(resetNorthTimeout.current);
      resetNorthTimeout.current = null;
    }
  }, []);

  useEffect(() => () => clearResetNorthTimeout(), [clearResetNorthTimeout]);

  const clearManualCameraInteractionTimeout = useCallback(() => {
    if (manualCameraInteractionTimeout.current) {
      clearTimeout(manualCameraInteractionTimeout.current);
      manualCameraInteractionTimeout.current = null;
    }
  }, []);

  const scheduleManualCameraInteractionClear = useCallback(() => {
    clearManualCameraInteractionTimeout();
    manualCameraInteractionTimeout.current = setTimeout(() => {
      manualCameraInteraction.current = false;
      manualCameraInteractionTimeout.current = null;
    }, 220);
  }, [clearManualCameraInteractionTimeout]);

  useEffect(
    () => () => clearManualCameraInteractionTimeout(),
    [clearManualCameraInteractionTimeout],
  );

  const updateCompassDial = useCallback(
    (targetMapHeading: number, durationMs: number) => {
      const targetRotation = nearestRotation(lastCompassDialRotation.current, -targetMapHeading);
      lastCompassDialRotation.current = targetRotation;

      if (durationMs > 0) {
        compassRotation.value = withTiming(targetRotation, {
          duration: durationMs,
          easing: Easing.out(Easing.cubic),
        });
        return;
      }

      compassRotation.value = targetRotation;
    },
    [compassRotation],
  );

  useEffect(() => {
    if (!isResettingNorth || !isNorthUp(heading)) return;
    clearResetNorthTimeout();
    setIsResettingNorth(false);
  }, [clearResetNorthTimeout, heading, isResettingNorth]);

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

  const setLastCameraCenter = useCallback((point: MapFocusPoint, zoom: number) => {
    lastCamera.current = {
      center: [point.longitude, point.latitude],
      zoom,
      heading: lastCamera.current.heading,
    };
  }, []);

  const focusGps = useCallback(
    async (options: { enableFollow?: boolean } = {}) => {
      if (options.enableFollow) setFollowUser(true);
      const zoomLevel = lastCamera.current.zoom;
      const animationDuration = 500;
      const currentPos = useMapStore.getState().userPosition;
      const cachedAnimationStartedAt = currentPos ? Date.now() : null;
      if (currentPos) {
        setLastCameraCenter(currentPos, zoomLevel);
        cameraRef.current?.setCamera({
          centerCoordinate: [currentPos.longitude, currentPos.latitude],
          zoomLevel,
          heading: lastCamera.current.heading,
          animationMode: "easeTo",
          animationDuration,
        });
      }
      const position = await refreshPosition();
      if (position) {
        if (!hasGpsFix) setHasGpsFix(true);
        snapAfterRefresh(position);
        if (
          currentPos &&
          isCenteredOn([currentPos.longitude, currentPos.latitude], position, zoomLevel)
        ) {
          return true;
        }
        if (cachedAnimationStartedAt != null) {
          const elapsedMs = Date.now() - cachedAnimationStartedAt;
          const remainingMs = Math.max(0, animationDuration - elapsedMs);
          if (remainingMs > 0) {
            await new Promise((resolve) => {
              setTimeout(resolve, remainingMs);
            });
          }
        }
        setLastCameraCenter(position, zoomLevel);
        cameraRef.current?.setCamera({
          centerCoordinate: [position.longitude, position.latitude],
          zoomLevel,
          heading: lastCamera.current.heading,
          animationMode: "easeTo",
          animationDuration,
        });
      }
      return currentPos != null || position != null;
    },
    [setFollowUser, refreshPosition, snapAfterRefresh, hasGpsFix, setLastCameraCenter],
  );

  useEffect(() => {
    if (!isFocused) {
      setAdvancedFocusMode(null);
      return;
    }
    if (!followUser) return;

    setAdvancedFocusMode("follow");
    void focusGps({ enableFollow: true });
  }, [focusGps, followUser, isFocused]);

  useEffect(() => {
    if (advancedFocusMode === "follow" && !followUser) setAdvancedFocusMode(null);
  }, [advancedFocusMode, followUser]);

  useEffect(() => {
    if (advancedFocusMode !== "follow" || !isFocused) return;

    let cancelled = false;
    let subscription: { remove: () => void } | null = null;

    void watchForegroundPosition((position) => {
      if (cancelled) return;
      const zoomLevel = lastCamera.current.zoom;
      setUserPosition(position);
      setHasGpsFix(true);
      snapAfterRefresh(position);
      setLastCameraCenter(position, zoomLevel);
      cameraRef.current?.setCamera({
        centerCoordinate: [position.longitude, position.latitude],
        zoomLevel,
        heading: lastCamera.current.heading,
        animationMode: "easeTo",
        animationDuration: 500,
      });
    }).then((nextSubscription) => {
      if (cancelled) {
        nextSubscription?.remove();
        return;
      }
      if (!nextSubscription) {
        setAdvancedFocusMode((current) => (current === "follow" ? null : current));
        setFollowUser(false);
        return;
      }
      subscription = nextSubscription;
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [
    advancedFocusMode,
    isFocused,
    setFollowUser,
    setLastCameraCenter,
    setUserPosition,
    snapAfterRefresh,
  ]);

  useEffect(() => {
    if (!isCompassMode) return;

    manualCameraInteraction.current = false;
    clearManualCameraInteractionTimeout();

    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    let smoothedHeading = normalizeHeading(lastCamera.current.heading);
    let lastSampleTimestamp = 0;
    let hasAnimatedInitialHeading = false;
    let initialAnimationUntil = 0;

    const applyCompassHeading = (phoneHeading: number) => {
      if (cancelled) return;

      const now = Date.now();
      const dtMs = Math.max(16, now - lastSampleTimestamp);
      const alpha = 1 - Math.exp(-dtMs / COMPASS_FOLLOW_FILTER_TAU_MS);
      const rawPhoneHeading = normalizeHeading(phoneHeading);
      const smoothingDelta = signedHeadingDelta(smoothedHeading, rawPhoneHeading);
      smoothedHeading = normalizeHeading(smoothedHeading + smoothingDelta * alpha);
      lastSampleTimestamp = now;

      const previousHeading = lastCompassCommand.current.heading;
      const targetHeading = nearestHeading(previousHeading, smoothedHeading);
      const commandDelta = Math.abs(targetHeading - previousHeading);

      if (commandDelta < COMPASS_FOLLOW_MIN_DELTA_DEGREES) return;

      const elapsedMs = now - lastCompassCommand.current.timestamp;
      if (elapsedMs < COMPASS_FOLLOW_MIN_UPDATE_MS) return;

      if (hasAnimatedInitialHeading && now < initialAnimationUntil) return;

      lastCompassCommand.current = { heading: targetHeading, timestamp: now };
      lastCamera.current = { ...lastCamera.current, heading: targetHeading };

      if (!hasAnimatedInitialHeading) {
        hasAnimatedInitialHeading = true;
        initialAnimationUntil = now + COMPASS_FOLLOW_ACTIVATION_ANIMATION_MS;
        updateCompassDial(targetHeading, COMPASS_FOLLOW_ACTIVATION_ANIMATION_MS);
        cameraRef.current?.setCamera({
          heading: targetHeading,
          animationMode: "easeTo",
          animationDuration: COMPASS_FOLLOW_ACTIVATION_ANIMATION_MS,
        });
        return;
      }

      updateCompassDial(targetHeading, 0);
      cameraRef.current?.setCamera({
        heading: targetHeading,
        animationMode: "none",
        animationDuration: 0,
      });
    };

    lastCompassCommand.current = {
      heading: lastCamera.current.heading,
      timestamp: 0,
    };

    void watchForegroundHeading((phoneHeading) => {
      applyCompassHeading(phoneHeading);
    }).then((nextSubscription) => {
      if (cancelled) {
        nextSubscription?.remove();
        return;
      }
      if (!nextSubscription) {
        setIsCompassMode(false);
        return;
      }
      subscription = nextSubscription;
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [clearManualCameraInteractionTimeout, isCompassMode, updateCompassDial]);

  const handleFollowToggle = useCallback(() => {
    if (advancedFocusMode === "follow") {
      setAdvancedFocusMode(null);
      setFollowUser(false);
      return;
    }

    setAdvancedFocusMode("follow");
    setFollowUser(true);
  }, [advancedFocusMode, setFollowUser]);

  const focusRouteTarget = useCallback(
    (target: Exclude<MapFocusTargetKind, "gps">) => {
      if (!focusStart || !focusFinish) return;
      setFollowUser(false);
      const zoomLevel = lastCamera.current.zoom;

      if (target === "start" || target === "finish") {
        const point = target === "start" ? focusStart : focusFinish;
        setLastCameraCenter(point, zoomLevel);
        cameraRef.current?.setCamera({
          centerCoordinate: [point.longitude, point.latitude],
          zoomLevel,
          animationMode: "easeTo",
          animationDuration: 500,
        });
        return;
      }

      const center = getTargetCenter([focusStart, focusFinish]);
      setLastCameraCenter(center, zoomLevel);
      cameraRef.current?.setCamera({
        centerCoordinate: [center.longitude, center.latitude],
        zoomLevel,
        animationMode: "easeTo",
        animationDuration: 500,
      });
    },
    [focusStart, focusFinish, setFollowUser, setLastCameraCenter],
  );

  const handleLocate = useCallback(async () => {
    setAdvancedFocusMode(null);
    setFollowUser(false);

    const nextTarget = getNextFocusTarget({
      cameraCenter: lastCamera.current.center,
      zoom: lastCamera.current.zoom,
      gpsPosition: useMapStore.getState().userPosition,
      start: focusStart,
      finish: focusFinish,
    });

    if (nextTarget === "gps") {
      const focusedGps = await focusGps();
      if (focusedGps) return;

      const fallbackTarget = getNextFocusTarget({
        cameraCenter: lastCamera.current.center,
        zoom: lastCamera.current.zoom,
        gpsPosition: null,
        start: focusStart,
        finish: focusFinish,
        canAttemptGps: false,
      });
      if (fallbackTarget && fallbackTarget !== "gps") focusRouteTarget(fallbackTarget);
      return;
    }

    if (nextTarget) focusRouteTarget(nextTarget);
  }, [focusGps, focusRouteTarget, focusStart, focusFinish, setFollowUser]);

  const handleCameraChanged = useCallback(
    (state: MapState) => {
      const c = state.properties.center;
      const nextZoom = state.properties.zoom;
      const nextHeading = state.properties.heading;
      lastCamera.current = { center: [c[0], c[1]], zoom: nextZoom, heading: nextHeading };
      setRouteMarkerZoom((current) => (current === nextZoom ? current : nextZoom));
      const nextDistanceMarkerInterval = getDistanceMarkerIntervalForZoom(nextZoom);
      if (distanceMarkerIntervalRef.current !== nextDistanceMarkerInterval) {
        distanceMarkerIntervalRef.current = nextDistanceMarkerInterval;
        setDistanceMarkerInterval(nextDistanceMarkerInterval);
      }
      setHeading((prev) => nextDisplayHeading(prev, nextHeading));

      if (manualCameraInteraction.current) {
        if (!isCompassMode && !isResettingNorth) updateCompassDial(nextHeading, 0);
        scheduleManualCameraInteractionClear();
      }

      // Programmatic camera moves also emit camera events; only real map gestures update the chip.
      if (state.gestures.isGestureActive) {
        const newHorizon = zoomToHorizon(nextZoom);
        setHorizonFromZoom(newHorizon);
        setAdvancedFocusMode((current) => (current == null ? current : null));
        setIsCompassMode(false);
        setIsResettingNorth(false);
      }
    },
    [isCompassMode, isResettingNorth, scheduleManualCameraInteractionClear, setHorizonFromZoom, updateCompassDial],
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

  // Also persist when leaving the map screen so reopening restores the last focused view
  // unless Follow GPS is enabled, in which case the focus effect will recenter on GPS.
  useEffect(() => {
    if (isFocused) return;
    persistCamera(lastCamera.current.center, lastCamera.current.zoom);
  }, [isFocused, persistCamera]);

  const handleTouchStart = useCallback(() => {
    manualCameraInteraction.current = true;
    scheduleManualCameraInteractionClear();
    setHorizonPopoverOpen(false);
    if (isCompassMode) {
      setIsCompassMode(false);
    }
    if (followUser) {
      setFollowUser(false);
    }
  }, [followUser, isCompassMode, scheduleManualCameraInteractionClear, setFollowUser, setHorizonPopoverOpen]);

  const handleResetNorth = useCallback(() => {
    clearResetNorthTimeout();
    manualCameraInteraction.current = false;
    clearManualCameraInteractionTimeout();
    setIsResettingNorth(true);
    updateCompassDial(0, RESET_NORTH_ANIMATION_MS);
    cameraRef.current?.setCamera({
      heading: 0,
      animationDuration: RESET_NORTH_ANIMATION_MS,
      animationMode: "easeTo",
    });
    resetNorthTimeout.current = setTimeout(() => {
      resetNorthTimeout.current = null;
      setIsResettingNorth(false);
    }, RESET_NORTH_VISUAL_HOLD_MS);
  }, [clearManualCameraInteractionTimeout, clearResetNorthTimeout, updateCompassDial]);

  const handleCompassPress = useCallback(() => {
    if (isCompassMode) {
      handleResetNorth();
      setIsCompassMode(false);
      return;
    }

    if (!isNorthUp(heading)) {
      handleResetNorth();
      return;
    }
  }, [handleResetNorth, heading, isCompassMode]);

  const handleCompassLongPress = useCallback(() => {
    if (isCompassMode) {
      handleResetNorth();
      setIsCompassMode(false);
      return;
    }

    setIsCompassMode(true);
  }, [handleResetNorth, isCompassMode]);

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
      paddingBottom: compactPanelHeight,
    }),
    [compactPanelHeight],
  );

  const pulsingConfig = useMemo(
    () => ({ isEnabled: true, color: themeColors.accent, radius: 40 }),
    [themeColors.accent],
  );

  const focusAccessibilityLabel = useMemo(() => {
    const target = getNextFocusTarget({
      cameraCenter: lastCamera.current.center,
      zoom: routeMarkerZoom,
      gpsPosition: userPosition,
      start: focusStart,
      finish: focusFinish,
    });
    const contextLabel = activeData?.type === "collection" ? "collection" : "route";

    switch (target) {
      case "start":
        return `Focus ${contextLabel} start`;
      case "finish":
        return `Focus ${contextLabel} finish`;
      case "combined":
        return `Show ${contextLabel} start and finish`;
      case "gps":
      default:
        return "Center on my location";
    }
  }, [activeData?.type, focusStart, focusFinish, routeMarkerZoom, userPosition]);

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

  // Forces upper overlays to remount so their native layers are recreated on top of lower layers.
  const renderedRouteKey = useMemo(() => {
    return (
      renderedRoutes
        .map((r) => `${r.id}:${visibleRoutePoints[r.id]?.length ?? 0}`)
        .sort()
        .join(",") + `-${mapStyle.styleKey}`
    );
  }, [renderedRoutes, visibleRoutePoints, mapStyle.styleKey]);

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

  // RNMapbox inserts native layers in mount order, so remount each upper tier after lower tiers change.
  const routeStackKey = renderedRouteKey;
  const climbStackKey = `${routeStackKey}-${highlightedClimb?.id ?? "none"}`;
  const overlayStackKey = `${climbStackKey}-${activeContextKey ?? "none"}`;

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
              key={`arrows-${route.id}-${routeStackKey}`}
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
            key={`climb-${highlightedClimb.id}-${routeStackKey}`}
            climb={highlightedClimb}
            points={activeRoutePoints}
          />
        )}
        <RouteMarkerLayer
          key={`route-markers-${overlayStackKey}`}
          activeContextKey={activeContextKey}
          points={activeRoutePoints ?? []}
          showDistanceMarkers={showDistanceMarkers}
        />
        {activeRouteIds.length > 0 && (
          <POILayer key={`pois-${overlayStackKey}`} routeIds={activeRouteIds} />
        )}
        <LocationPuck
          key={`puck-${overlayStackKey}`}
          puckBearing="heading"
          puckBearingEnabled
          pulsing={pulsingConfig}
        />
      </MapboxMapView>

      <MapControls />
      <TabbedBottomPanel
        activeData={activeData}
        distanceMarkerInterval={distanceMarkerInterval}
        showDistanceMarkers={showDistanceMarkers}
        floatingControls={
          <MapSheetControls
            onLocate={handleLocate}
            isFollowActive={advancedFocusMode === "follow"}
            onFollowToggle={handleFollowToggle}
            isCompassActive={isCompassMode}
            onCompassPress={handleCompassPress}
            onCompassLongPress={handleCompassLongPress}
            isResettingNorth={isResettingNorth}
            locateAccessibilityLabel={focusAccessibilityLabel}
            heading={heading}
            compassRotation={compassRotation}
          />
        }
      />
    </View>
  );
}
