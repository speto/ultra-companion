import React, { useMemo } from "react";
import { View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/theme";
import { usePanelStore } from "@/store/panelStore";
import { useRouteStore } from "@/store/routeStore";
import { useSettingsStore } from "@/store/settingsStore";
import { usePoiStore } from "@/store/poiStore";
import { useStarredStore } from "@/store/starredStore";
import { useClimbStore } from "@/store/climbStore";
import { computeSliceAscent, computeSliceDescent, extractRouteSlice } from "@/utils/geo";
import { formatDistance, formatElevation } from "@/utils/formatters";
import { climbDifficultyColor } from "@/constants/climbHelpers";
import { stitchPOIs } from "@/services/stitchingService";
import { horizonToMeters, horizonWindow } from "@/utils/horizon";
import { profileSegmentsFromStitchedSegments } from "@/utils/profileSegments";
import { useColorScheme } from "nativewind";
import UpcomingElevation from "./UpcomingElevation";
import ElevationProfile from "@/components/elevation/ElevationProfile";
import type { POI, ActiveRouteData, Climb } from "@/types";

const MAX_SNAP_DISTANCE_M = 1000;
const STATS_HEIGHT = 28;
const CLIMB_ROW_HEIGHT = 36;
const MAX_CLIMBS_AHEAD = 4;
const HORIZONTAL_PADDING = 8;

interface ProfileTabContentProps {
  activeData: ActiveRouteData | null;
  width: number;
  height: number;
}

export default function ProfileTabContent({ activeData, width, height }: ProfileTabContentProps) {
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
  const setSelectedPOI = usePoiStore((s) => s.setSelectedPOI);

  const isSnapped =
    snappedPosition &&
    activeId &&
    snappedPosition.routeId === activeId &&
    snappedPosition.distanceFromRouteMeters <= MAX_SNAP_DISTANCE_M;

  const getStarredPOIs = usePoiStore((s) => s.getStarredPOIs);
  const starredKeys = useStarredStore((s) => s.starredKeys);
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

  if (!activeId || !activeRoutePoints?.length) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-[15px] text-muted-foreground">Import and activate a route</Text>
      </View>
    );
  }

  const effectivePointIndex = isSnapped ? snappedPosition!.pointIndex : 0;
  const lookAhead = horizonToMeters(horizon) ?? activeTotalDistance;

  const showClimbBar = isExpanded && showClimbZoom && !!climbProgressText;
  const showStats = isExpanded && !showClimbZoom && !!statsText;
  const showClimbsAhead = isExpanded && !showClimbZoom && climbsAhead.length > 0;

  const climbsAheadHeight = showClimbsAhead
    ? Math.min(climbsAhead.length, MAX_CLIMBS_AHEAD) * CLIMB_ROW_HEIGHT + 24
    : 0;

  const headerBlockHeight =
    (showStats ? STATS_HEIGHT : 0) + (showClimbBar ? STATS_HEIGHT : 0) + climbsAheadHeight;

  const chartHeight = height - headerBlockHeight - safeBottom;
  const chartWidth = width - HORIZONTAL_PADDING * 2;

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

      <View className="items-center px-2">
        {showClimbZoom ? (
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
        ) : (
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
            onPOIPress={(poi) => {
              const raw = usePoiStore.getState().pois[poi.routeId]?.find((p) => p.id === poi.id);
              setSelectedPOI(raw ?? poi);
            }}
          />
        )}
      </View>
    </View>
  );
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
