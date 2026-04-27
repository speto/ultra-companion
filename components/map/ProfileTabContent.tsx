import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/theme";
import { usePanelStore } from "@/store/panelStore";
import { useRouteStore } from "@/store/routeStore";
import { useSettingsStore } from "@/store/settingsStore";
import { usePoiStore } from "@/store/poiStore";
import { useStarredStore } from "@/store/starredStore";
import { useClimbStore } from "@/store/climbStore";
import { useEtaStore } from "@/store/etaStore";
import { useWaypointStore } from "@/store/waypointStore";
import { computeSliceAscent, computeSliceDescent, extractRouteSlice } from "@/utils/geo";
import { formatDistance, formatDuration, formatElevation } from "@/utils/formatters";
import { climbDifficultyColor } from "@/constants/climbHelpers";
import { stitchPOIs } from "@/services/stitchingService";
import { computeRouteETA, getETABetweenIndices } from "@/services/etaCalculator";
import { horizonToMeters, horizonWindow } from "@/utils/horizon";
import { profileSegmentsFromStitchedSegments } from "@/utils/profileSegments";
import { useColorScheme } from "nativewind";
import { ArrowDown, ArrowUp, Clock3, Flag, Star } from "lucide-react-native";
import UpcomingElevation from "./UpcomingElevation";
import ElevationProfile, { type ProfileSegment } from "@/components/elevation/ElevationProfile";
import SegmentCard from "@/components/collection/SegmentCard";
import type { POI, ActiveRouteData, Climb, RoutePoint } from "@/types";

const MAX_SNAP_DISTANCE_M = 1000;
const STATS_HEIGHT = 28;
const CLIMB_ROW_HEIGHT = 36;
const MAX_CLIMBS_AHEAD = 4;
const HORIZONTAL_PADDING = 8;
const COLLECTION_META_ROW_HEIGHT = 32;
const MIN_PROFILE_CHART_HEIGHT = 96;
const MAX_PROFILE_CHART_HEIGHT = 360;
const SEGMENT_CARD_CHART_HEIGHT = 150;

interface ProfileTabContentProps {
  activeData: ActiveRouteData | null;
  width: number;
  height: number;
  compactHeight: number;
  sheetTranslateY?: SharedValue<number>;
  compactOffset?: number;
}

interface ExpandedProfileSection {
  id: string;
  title: string;
  subtitle: string;
  startIndex: number;
  endIndex: number;
  offsetMeters: number;
  isCurrent: boolean;
  segmentIndex: number;
  distanceText: string;
  ascentText: string;
  descentText: string;
  durationText?: string;
  waypointCount: number;
  starredCount: number;
  points: RoutePoint[];
  currentPointIndex?: number;
  profileSegments?: ProfileSegment[];
}

export default function ProfileTabContent({
  activeData,
  width,
  height,
  compactHeight,
  sheetTranslateY,
  compactOffset,
}: ProfileTabContentProps) {
  const colors = useThemeColors();
  const { colorScheme } = useColorScheme();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const activeRoutePoints = activeData?.points ?? null;
  const activeId = activeData?.id ?? null;
  const activeRouteIds = useMemo(() => activeData?.routeIds ?? [], [activeData?.routeIds]);
  const activeSegments = activeData?.segments ?? null;
  const activeTotalDistance = activeData?.totalDistanceMeters ?? 0;
  const profileSegments = useMemo(
    () => profileSegmentsFromStitchedSegments(activeSegments, colorScheme),
    [activeSegments, colorScheme],
  );

  const horizon = usePanelStore((s) => s.horizon);
  const setPanelTab = usePanelStore((s) => s.setPanelTab);
  const isExpanded = usePanelStore((s) => s.isExpanded);
  const snappedPosition = useRouteStore((s) => s.snappedPosition);
  const units = useSettingsStore((s) => s.units);
  const powerConfig = useEtaStore((s) => s.powerConfig);
  const setSelectedPOI = usePoiStore((s) => s.setSelectedPOI);
  const loadWaypoints = useWaypointStore((s) => s.loadWaypoints);
  const waypointsByRoute = useWaypointStore((s) => s.waypoints);
  const starredKeys = useStarredStore((s) => s.starredKeys);
  const starredRouteWaypointIds = useMemo(
    () => starredIdsForType(starredKeys, "routeWaypoint"),
    [starredKeys],
  );
  const starredPoiIds = useMemo(
    () => starredIdsForType(starredKeys, "downloadedPoi"),
    [starredKeys],
  );

  const isSnapped =
    snappedPosition &&
    activeId &&
    snappedPosition.routeId === activeId &&
    snappedPosition.distanceFromRouteMeters <= MAX_SNAP_DISTANCE_M;

  const getStarredPOIs = usePoiStore((s) => s.getStarredPOIs);
  const [expandedSegmentIds, setExpandedSegmentIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    for (const routeId of activeRouteIds) {
      void loadWaypoints(routeId);
    }
  }, [activeRouteIds, loadWaypoints]);

  const cumulativeEta = useMemo(
    () => (activeRoutePoints?.length ? computeRouteETA(activeRoutePoints, powerConfig) : []),
    [activeRoutePoints, powerConfig],
  );
  const poisForChart = useMemo(() => {
    if (!activeId || activeRouteIds.length === 0) return [];
    if (activeSegments) {
      const poisByRoute: Record<string, POI[]> = {};
      for (const routeId of activeRouteIds) {
        poisByRoute[routeId] = getStarredPOIs(routeId);
      }
      return stitchPOIs(activeSegments, poisByRoute);
    }
    return getStarredPOIs(activeRouteIds[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeRouteIds, activeSegments, getStarredPOIs, starredKeys]);

  const getClimbsForDisplay = useClimbStore((s) => s.getClimbsForDisplay);
  const allClimbs = useClimbStore((s) => s.climbs);
  const climbsForChart = useMemo(() => {
    if (!activeId || activeRouteIds.length === 0) return [];
    return getClimbsForDisplay(activeRouteIds, activeSegments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeRouteIds, activeSegments, getClimbsForDisplay, allClimbs]);

  const currentClimbId = useClimbStore((s) => s.currentClimbId);
  const isClimbZoomed = useClimbStore((s) => s.isClimbZoomed);
  const setClimbZoomed = useClimbStore((s) => s.setClimbZoomed);
  const setSelectedClimb = useClimbStore((s) => s.setSelectedClimb);

  const currentClimb = useMemo(() => {
    if (!currentClimbId) return null;
    return climbsForChart.find((c) => c.id === currentClimbId) ?? null;
  }, [currentClimbId, climbsForChart]);

  const climbSlice = useMemo(() => {
    if (!currentClimb || !activeRoutePoints?.length) return null;
    const padding = 500;
    const startDist = Math.max(0, currentClimb.startDistanceMeters - padding);
    let startIdx = 0;
    for (let i = 0; i < activeRoutePoints.length; i++) {
      if (activeRoutePoints[i].distanceFromStartMeters >= startDist) {
        startIdx = Math.max(0, i - 1);
        break;
      }
    }
    const totalSliceM =
      currentClimb.endDistanceMeters +
      padding -
      activeRoutePoints[startIdx].distanceFromStartMeters;
    const sliced = extractRouteSlice(activeRoutePoints, startIdx, totalSliceM);
    let currentIdxInSlice: number | undefined;
    if (isSnapped) {
      currentIdxInSlice = snappedPosition!.pointIndex - startIdx;
      if (currentIdxInSlice < 0 || currentIdxInSlice >= sliced.length) {
        currentIdxInSlice = undefined;
      }
    }
    return {
      points: sliced,
      currentIdxInSlice,
      offsetMeters: activeRoutePoints[startIdx].distanceFromStartMeters,
    };
  }, [currentClimb, activeRoutePoints, isSnapped, snappedPosition]);

  const climbProgressText = useMemo(() => {
    if (!currentClimb || !isSnapped || !snappedPosition || !activeRoutePoints?.length) return null;
    const currentDist = snappedPosition.distanceAlongRouteMeters;
    const distToTop = currentClimb.endDistanceMeters - currentDist;
    if (distToTop <= 0) return null;
    const ascentRemaining = computeSliceAscent(
      activeRoutePoints,
      snappedPosition.pointIndex,
      currentClimb.endDistanceMeters,
    );
    return `↑ ${formatElevation(ascentRemaining, units)} remaining  ·  ${formatDistance(distToTop, units)} to top  ·  ${currentClimb.averageGradientPercent}% avg`;
  }, [currentClimb, isSnapped, snappedPosition, activeRoutePoints, units]);

  const showClimbZoom = isClimbZoomed && currentClimb && climbSlice && climbSlice.points.length > 1;

  // Slice bounds (uses shared horizon filter)
  const { windowStartDist, windowEndDist, riderIdx } = useMemo(() => {
    if (!isSnapped || !activeRoutePoints?.length) {
      return { windowStartDist: 0, windowEndDist: 0, riderIdx: 0 };
    }
    const idx = snappedPosition!.pointIndex;
    const distDone = activeRoutePoints[idx]?.distanceFromStartMeters ?? 0;
    const { endDist } = horizonWindow(distDone, horizon, activeTotalDistance);
    return { windowStartDist: distDone, windowEndDist: endDist, riderIdx: idx };
  }, [isSnapped, snappedPosition, activeRoutePoints, horizon, activeTotalDistance]);

  const statsText = useMemo(() => {
    if (!isSnapped || !activeRoutePoints?.length) return null;
    const asc = computeSliceAscent(activeRoutePoints, riderIdx, windowEndDist);
    const desc = computeSliceDescent(activeRoutePoints, riderIdx, windowEndDist);
    return `↑ ${formatElevation(asc, units)}  ·  ↓ ${formatElevation(desc, units)}`;
  }, [isSnapped, activeRoutePoints, riderIdx, windowEndDist, units]);

  const climbsAhead = useMemo<Climb[]>(() => {
    if (climbsForChart.length === 0) return [];
    return climbsForChart
      .filter((c) => c.endDistanceMeters > windowStartDist && c.startDistanceMeters < windowEndDist)
      .sort((a, b) => a.startDistanceMeters - b.startDistanceMeters)
      .slice(0, MAX_CLIMBS_AHEAD);
  }, [climbsForChart, windowStartDist, windowEndDist]);

  const activeName = activeData?.name ?? "Route";
  const activeTotalAscent = activeData?.totalAscentMeters ?? 0;
  const activeTotalDescent = activeData?.totalDescentMeters ?? 0;

  const hasCollectionProfile = Boolean(
    !showClimbZoom && activeRoutePoints?.length && activeSegments && activeSegments.length > 1,
  );
  const [showExpandedCollectionVisual, setShowExpandedCollectionVisual] = useState(false);
  const showExpandedCollection =
    hasCollectionProfile && (isExpanded || showExpandedCollectionVisual);

  useAnimatedReaction(
    () => {
      if (!hasCollectionProfile || !sheetTranslateY || !compactOffset) return "closed";
      if (sheetTranslateY.value < compactOffset * 0.96) return "open";
      if (sheetTranslateY.value >= compactOffset * 0.995) return "closed";
      return "hold";
    },
    (state, previousState) => {
      if (state === previousState || state === "hold") return;
      runOnJS(setShowExpandedCollectionVisual)(state === "open");
    },
    [hasCollectionProfile, sheetTranslateY, compactOffset],
  );

  useEffect(() => {
    if (!hasCollectionProfile) setShowExpandedCollectionVisual(false);
  }, [hasCollectionProfile]);

  const expandedSections = useMemo(() => {
    if (!showExpandedCollection || !activeRoutePoints?.length || !activeSegments) {
      return null;
    }

    const segments = activeSegments;

    let currentSegIdx = 0;
    if (isSnapped && snappedPosition) {
      const idx = segments.findIndex(
        (s) =>
          snappedPosition.pointIndex >= s.startPointIndex &&
          snappedPosition.pointIndex <= s.endPointIndex,
      );
      if (idx >= 0) currentSegIdx = idx;
    }

    const sections: ExpandedProfileSection[] = [];

    for (let i = currentSegIdx; i < segments.length; i++) {
      const seg = segments[i];
      const isCurrent = Boolean(i === currentSegIdx && isSnapped && snappedPosition);

      let startIdx = seg.startPointIndex;
      let offsetMeters = seg.distanceOffsetMeters;
      const endIdx = seg.endPointIndex;
      const segmentEndDist =
        activeRoutePoints[endIdx]?.distanceFromStartMeters ??
        seg.distanceOffsetMeters + seg.segmentDistanceMeters;
      let distance = Math.max(0, segmentEndDist - offsetMeters);
      let ascent = seg.segmentAscentMeters;
      let descent = seg.segmentDescentMeters;

      if (isCurrent) {
        startIdx = snappedPosition!.pointIndex;
        offsetMeters = activeRoutePoints[startIdx].distanceFromStartMeters;
        distance = Math.max(0, segmentEndDist - offsetMeters);
        ascent = computeSliceAscent(activeRoutePoints, startIdx, segmentEndDist);
        descent = computeSliceDescent(activeRoutePoints, startIdx, segmentEndDist);
      }

      if (endIdx > startIdx) {
        const segmentProfile = profileSegments?.[i];
        const slicedPoints = extractExactPointRange(activeRoutePoints, startIdx, endIdx);
        const localStartDistance = Math.max(0, offsetMeters - seg.distanceOffsetMeters);
        const waypoints = waypointsByRoute[seg.routeId] ?? [];
        const waypointCount = waypoints.filter(
          (waypoint) =>
            waypoint.distanceAlongRouteMeters >= localStartDistance &&
            waypoint.distanceAlongRouteMeters <= seg.segmentDistanceMeters,
        ).length;
        const starredWaypointCount = waypoints.filter(
          (waypoint) =>
            starredRouteWaypointIds.has(waypoint.id) &&
            waypoint.distanceAlongRouteMeters >= localStartDistance &&
            waypoint.distanceAlongRouteMeters <= seg.segmentDistanceMeters,
        ).length;
        const starredPoiCount = poisForChart.filter(
          (poi) =>
            poi.routeId === seg.routeId &&
            starredPoiIds.has(poi.id) &&
            poi.distanceAlongRouteMeters >= offsetMeters &&
            poi.distanceAlongRouteMeters <= segmentEndDist,
        ).length;
        const duration = getETABetweenIndices(cumulativeEta, startIdx, endIdx);
        sections.push({
          id: `${seg.routeId}-${i}`,
          title: seg.routeName,
          subtitle: `${formatDistance(distance, units)} · ↑ ${formatElevation(ascent, units)} · ↓ ${formatElevation(descent, units)}`,
          distanceText: formatDistance(distance, units),
          ascentText: formatElevation(ascent, units),
          descentText: formatElevation(descent, units),
          durationText: duration > 0 ? formatDuration(duration) : undefined,
          waypointCount,
          starredCount: starredWaypointCount + starredPoiCount,
          startIndex: startIdx,
          endIndex: endIdx,
          offsetMeters,
          isCurrent,
          segmentIndex: i + 1,
          points: slicedPoints,
          currentPointIndex: isCurrent ? 0 : undefined,
          profileSegments: segmentProfile
            ? [
                {
                  startDistanceMeters: offsetMeters,
                  endDistanceMeters: offsetMeters + distance,
                  lengthMeters: distance,
                  name: segmentProfile.name,
                  color: segmentProfile.color,
                },
              ]
            : undefined,
        });
      }
    }

    return sections;
  }, [
    showExpandedCollection,
    activeRoutePoints,
    activeSegments,
    profileSegments,
    cumulativeEta,
    isSnapped,
    snappedPosition,
    units,
    waypointsByRoute,
    starredRouteWaypointIds,
    starredPoiIds,
    poisForChart,
  ]);

  const showClimbBar = isExpanded && showClimbZoom && !!climbProgressText;
  const showStats = !showClimbZoom && !!statsText;
  const showClimbsAhead = isExpanded && !showClimbZoom && climbsAhead.length > 0;

  const climbsAheadHeight = showClimbsAhead
    ? Math.min(climbsAhead.length, MAX_CLIMBS_AHEAD) * CLIMB_ROW_HEIGHT + 24
    : 0;

  const headerBlockHeight =
    (showStats ? STATS_HEIGHT : 0) + (showClimbBar ? STATS_HEIGHT : 0) + climbsAheadHeight;

  const chartHeight = height - headerBlockHeight - safeBottom;
  const chartWidth = width - HORIZONTAL_PADDING * 2;
  const compactChartHeight = clampChartHeight(compactHeight - safeBottom);
  const effectivePointIndex = isSnapped ? snappedPosition!.pointIndex : 0;
  const lookAhead = horizonToMeters(horizon) ?? activeTotalDistance;

  const collectionMetaAnimatedStyle = useAnimatedStyle(() => {
    if (!sheetTranslateY || !compactOffset) {
      return {
        height: isExpanded ? COLLECTION_META_ROW_HEIGHT : 0,
        opacity: isExpanded ? 1 : 0,
        overflow: "hidden",
        transform: [{ translateY: isExpanded ? 0 : -6 }],
      };
    }

    const rowHeight = interpolate(
      sheetTranslateY.value,
      [compactOffset, 0],
      [0, COLLECTION_META_ROW_HEIGHT],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      sheetTranslateY.value,
      [compactOffset * 0.85, compactOffset * 0.25, 0],
      [0, 0.65, 1],
      Extrapolation.CLAMP,
    );
    const translateY = interpolate(
      sheetTranslateY.value,
      [compactOffset, 0],
      [-6, 0],
      Extrapolation.CLAMP,
    );

    return {
      height: rowHeight,
      opacity,
      overflow: "hidden",
      transform: [{ translateY }],
    };
  });

  const handleChartPOIPress = useCallback(
    (poi: POI) => {
      const raw = usePoiStore.getState().pois[poi.routeId]?.find((p) => p.id === poi.id);
      setSelectedPOI(raw ?? poi);
    },
    [setSelectedPOI],
  );

  const allSegmentsExpanded = Boolean(
    expandedSections?.length &&
    expandedSections.every((section) => expandedSegmentIds.has(section.id)),
  );

  const toggleSegment = useCallback((id: string) => {
    setExpandedSegmentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllSegments = useCallback(() => {
    if (!expandedSections) return;
    setExpandedSegmentIds(() =>
      allSegmentsExpanded ? new Set() : new Set(expandedSections.map((section) => section.id)),
    );
  }, [allSegmentsExpanded, expandedSections]);

  const expandedListHeader = useMemo(() => {
    if (!showExpandedCollection || !activeRoutePoints?.length) return null;

    return (
      <View className="mb-3">
        <Animated.View style={collectionMetaAnimatedStyle}>
          <View
            className="flex-row items-center justify-between px-1"
            style={{ height: COLLECTION_META_ROW_HEIGHT }}
          >
            <Text
              className="font-barlow-semibold text-[14px] text-foreground flex-1 mr-2"
              numberOfLines={1}
            >
              {activeName}
            </Text>
            <Text className="font-barlow-sc-medium text-[12px] text-muted-foreground">
              {formatDistance(activeTotalDistance, units)} · ↑{" "}
              {formatElevation(activeTotalAscent, units)} · ↓{" "}
              {formatElevation(activeTotalDescent, units)}
            </Text>
          </View>
        </Animated.View>
        <View style={{ height: compactChartHeight, overflow: "hidden" }}>
          <ElevationProfile
            points={activeRoutePoints}
            units={units}
            width={chartWidth}
            height={compactChartHeight}
            currentPointIndex={isSnapped ? snappedPosition!.pointIndex : undefined}
            distanceOffsetMeters={0}
            pois={poisForChart}
            climbs={climbsForChart}
            profileSegments={profileSegments}
            fitToWidth
            showLegend
            showStartAxisLine={true}
            onPOIPress={handleChartPOIPress}
          />
        </View>
        <View className="flex-row items-center justify-between mt-2 px-1">
          <Text className="font-barlow-sc-semibold text-[11px] text-muted-foreground">
            SEGMENTS
          </Text>
          <TouchableOpacity onPress={toggleAllSegments} accessibilityRole="button">
            <Text className="font-barlow-sc-semibold text-[11px] text-accent">
              {allSegmentsExpanded ? "Hide All" : "Show All"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [
    activeName,
    activeRoutePoints,
    activeTotalAscent,
    activeTotalDescent,
    activeTotalDistance,
    chartWidth,
    collectionMetaAnimatedStyle,
    compactChartHeight,
    climbsForChart,
    allSegmentsExpanded,
    handleChartPOIPress,
    isSnapped,
    poisForChart,
    profileSegments,
    showExpandedCollection,
    snappedPosition,
    toggleAllSegments,
    units,
  ]);

  if (!activeId || !activeRoutePoints?.length) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-[15px] text-muted-foreground">Import and activate a route</Text>
      </View>
    );
  }

  return (
    <View style={{ height }}>
      {showClimbBar && (
        <TouchableOpacity
          className="justify-center items-center"
          style={[
            { height: STATS_HEIGHT },
            { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
          ]}
          onPress={() => setClimbZoomed(false)}
          accessibilityLabel="Exit climb zoom"
        >
          <Text className="text-[13px] text-foreground font-barlow-sc-semibold">
            {climbProgressText}
          </Text>
        </TouchableOpacity>
      )}
      {showStats && (
        <View
          className="items-center justify-center"
          style={[
            { height: STATS_HEIGHT },
            { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
          ]}
        >
          <Text
            className="text-[13px] text-muted-foreground font-barlow-sc-medium"
            numberOfLines={1}
          >
            {statsText}
          </Text>
        </View>
      )}

      {showClimbsAhead && (
        <ClimbsAheadStrip
          climbs={climbsAhead}
          riderDistance={windowStartDist}
          units={units}
          height={climbsAheadHeight}
          onClimbPress={(climb) => {
            setSelectedClimb(climb);
            setPanelTab("climbs");
          }}
        />
      )}

      {showClimbZoom ? (
        <View className="items-center px-2">
          <ElevationProfile
            points={climbSlice!.points}
            units={units}
            width={chartWidth}
            height={chartHeight}
            currentPointIndex={climbSlice!.currentIdxInSlice}
            showLegend={false}
            distanceOffsetMeters={climbSlice!.offsetMeters}
            climbs={climbsForChart}
            profileSegments={profileSegments}
            fitToWidth
          />
        </View>
      ) : expandedSections ? (
        <ScrollView
          style={{ width, height: chartHeight + safeBottom }}
          contentContainerStyle={{
            paddingBottom: safeBottom + 20,
            paddingTop: 2,
            paddingHorizontal: HORIZONTAL_PADDING,
          }}
          showsVerticalScrollIndicator={false}
        >
          {expandedListHeader}
          {expandedSections.map((section) => (
            <ExpandedProfileSegmentRow
              key={section.id}
              item={section}
              units={units}
              chartWidth={chartWidth}
              expanded={expandedSegmentIds.has(section.id)}
              onToggle={() => toggleSegment(section.id)}
              pois={poisForChart}
              climbs={climbsForChart}
              onPOIPress={handleChartPOIPress}
            />
          ))}
        </ScrollView>
      ) : (
        <View className="items-center px-2">
          <UpcomingElevation
            points={activeRoutePoints}
            currentPointIndex={effectivePointIndex}
            lookAhead={lookAhead}
            units={units}
            width={chartWidth}
            height={chartHeight}
            pois={poisForChart}
            climbs={climbsForChart}
            profileSegments={profileSegments}
            fitToWidth
            showLegend
            showStartAxisLine
            onPOIPress={(poi) => {
              const raw = usePoiStore.getState().pois[poi.routeId]?.find((p) => p.id === poi.id);
              setSelectedPOI(raw ?? poi);
            }}
          />
        </View>
      )}
    </View>
  );
}

function ExpandedProfileSegmentRow({
  item,
  units,
  chartWidth,
  expanded,
  onToggle,
  pois,
  climbs,
  onPOIPress,
}: {
  item: ExpandedProfileSection;
  units: "metric" | "imperial";
  chartWidth: number;
  expanded: boolean;
  onToggle: () => void;
  pois: POI[];
  climbs: Climb[];
  onPOIPress: (poi: POI) => void;
}) {
  const segmentColor = item.profileSegments?.[0]?.color;
  const colors = useThemeColors();
  const metadataItems = [
    { label: item.ascentText, icon: <ArrowUp size={11} color={colors.textTertiary} /> },
    { label: item.descentText, icon: <ArrowDown size={11} color={colors.textTertiary} /> },
    item.durationText
      ? { label: item.durationText, icon: <Clock3 size={11} color={colors.textTertiary} /> }
      : null,
    item.waypointCount > 0
      ? { label: String(item.waypointCount), icon: <Flag size={11} color={colors.textTertiary} /> }
      : null,
    item.starredCount > 0
      ? { label: String(item.starredCount), icon: <Star size={11} color={colors.textTertiary} /> }
      : null,
  ].filter(
    (metadataItem): metadataItem is NonNullable<typeof metadataItem> => metadataItem != null,
  );

  return (
    <SegmentCard
      title={item.title}
      subtitle={item.distanceText}
      metadataItems={metadataItems}
      color={segmentColor}
      index={item.segmentIndex}
      isCurrent={item.isCurrent}
      expanded={expanded}
      onPress={onToggle}
    >
      <ElevationProfile
        points={item.points}
        units={units}
        width={chartWidth - HORIZONTAL_PADDING * 2}
        height={SEGMENT_CARD_CHART_HEIGHT}
        currentPointIndex={item.currentPointIndex}
        showLegend={false}
        distanceOffsetMeters={item.offsetMeters}
        pois={pois}
        climbs={climbs}
        profileSegments={item.profileSegments}
        fitToWidth
        showStartAxisLine={true}
        onPOIPress={onPOIPress}
      />
    </SegmentCard>
  );
}

function extractExactPointRange(points: RoutePoint[], startIndex: number, endIndex: number) {
  if (points.length === 0) return [];

  const boundedStart = Math.max(0, Math.min(startIndex, points.length - 1));
  const boundedEnd = Math.max(boundedStart, Math.min(endIndex, points.length - 1));
  const baseDistance = points[boundedStart].distanceFromStartMeters;

  return points.slice(boundedStart, boundedEnd + 1).map((point, idx) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    elevationMeters: point.elevationMeters,
    distanceFromStartMeters: Math.max(0, point.distanceFromStartMeters - baseDistance),
    idx,
  }));
}

function clampChartHeight(value: number) {
  if (!Number.isFinite(value)) return MIN_PROFILE_CHART_HEIGHT;
  return Math.min(MAX_PROFILE_CHART_HEIGHT, Math.max(MIN_PROFILE_CHART_HEIGHT, value));
}

function starredIdsForType(starredKeys: Set<string>, entityType: string) {
  const prefix = `${entityType}:`;
  const ids = new Set<string>();
  for (const key of starredKeys) {
    if (key.startsWith(prefix)) ids.add(key.slice(prefix.length));
  }
  return ids;
}

function ClimbsAheadStrip({
  climbs,
  riderDistance,
  units,
  height,
  onClimbPress,
}: {
  climbs: Climb[];
  riderDistance: number;
  units: "metric" | "imperial";
  height: number;
  onClimbPress?: (climb: Climb) => void;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        height,
        paddingHorizontal: HORIZONTAL_PADDING + 4,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <Text
        className="font-barlow-sc-semibold text-[11px] text-muted-foreground"
        style={{ marginBottom: 4 }}
      >
        CLIMBS AHEAD
      </Text>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={climbs.length > MAX_CLIMBS_AHEAD}
      >
        {climbs.map((climb) => {
          const distTo = Math.max(0, climb.startDistanceMeters - riderDistance);
          const color = climbDifficultyColor(climb.difficultyScore);
          return (
            <TouchableOpacity
              key={climb.id}
              className="flex-row items-center"
              style={{ height: CLIMB_ROW_HEIGHT }}
              onPress={onClimbPress ? () => onClimbPress(climb) : undefined}
              disabled={!onClimbPress}
              accessibilityRole="button"
              accessibilityLabel={`Open climb, ${formatDistance(climb.lengthMeters, units)}, ${climb.averageGradientPercent.toFixed(1)}% average`}
            >
              <View
                style={{
                  width: 6,
                  height: 22,
                  borderRadius: 3,
                  backgroundColor: color,
                  marginRight: 10,
                }}
              />
              <View className="flex-1">
                <Text
                  className="font-barlow-semibold text-[13px] text-foreground"
                  numberOfLines={1}
                >
                  {distTo > 0 ? `in ${formatDistance(distTo, units)}` : "now"}
                  <Text className="font-barlow-sc-medium text-[11px] text-muted-foreground">
                    {`  ·  ${formatDistance(climb.lengthMeters, units)} · +${formatElevation(climb.totalAscentMeters, units)}`}
                  </Text>
                </Text>
              </View>
              <Text
                className="font-barlow-sc-semibold text-[13px]"
                style={{ color, minWidth: 44, textAlign: "right" }}
              >
                {climb.averageGradientPercent.toFixed(1)}%
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
