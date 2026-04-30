import React, { useMemo, useState, useCallback, useEffect, useRef, useDeferredValue } from "react";
import {
  Keyboard,
  View,
  useWindowDimensions,
  FlatList,
  TouchableOpacity,
  type AccessibilityActionEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import {
  ArrowUp,
  ChevronsUp,
  Clock3,
  Flag,
  Maximize2,
  Mountain,
  Ruler,
  TrendingUp,
} from "lucide-react-native";
import { useThemeColors } from "@/theme";
import { useSettingsStore } from "@/store/settingsStore";
import { useRouteStore } from "@/store/routeStore";
import { useClimbStore } from "@/store/climbStore";
import { usePanelStore } from "@/store/panelStore";
import { extractRouteSlice } from "@/utils/geo";
import ElevationProfile from "@/components/elevation/ElevationProfile";
import ClimbListItem from "@/components/climb/ClimbListItem";
import PanelSearchInput from "@/components/map/PanelSearchInput";
import { getAdjacentClimb, resolveActiveClimb } from "@/utils/climbSelect";
import { CLIMB_DIFFICULTY_LABELS, getClimbDifficulty } from "@/constants/climbHelpers";
import { formatDistance, formatElevation } from "@/utils/formatters";
import type { Climb, ActiveRouteData, ClimbGraphSize } from "@/types";
import type { DistanceMarkerInterval } from "@/utils/routeMarkers";

const EXPANDED_LIST_MOUNT_DELAY_MS = 180;
const SWIPE_HINT_HIDE_DELAY_MS = 7000;
const DISTANCE_BUCKET_M = 100;
const CLIMB_ROW_HEIGHT = 72;
const CLIMB_SEARCH_HEIGHT = 49;
const CLIMB_GRAPH_HEIGHT: Record<ClimbGraphSize, { min: number; ratio: number }> = {
  small: { min: 132, ratio: 0.34 },
  medium: { min: 184, ratio: 0.48 },
  large: { min: 264, ratio: 0.68 },
};

interface ClimbTabContentProps {
  activeData: ActiveRouteData | null;
  distanceMarkerInterval: DistanceMarkerInterval;
  showDistanceMarkers: boolean;
  sheetTranslateY?: SharedValue<number>;
  compactOffset?: number;
}

export default function ClimbTabContent({
  activeData,
  distanceMarkerInterval,
  showDistanceMarkers,
  sheetTranslateY,
  compactOffset,
}: ClimbTabContentProps) {
  const colors = useThemeColors();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const units = useSettingsStore((s) => s.units);
  const climbGraphSize = useSettingsStore((s) => s.climbGraphSize);
  const setClimbGraphSize = useSettingsStore((s) => s.setClimbGraphSize);
  const showClimbSearch = useSettingsStore((s) => s.showClimbSearch);
  const climbGraphSwipeHintSeen = useSettingsStore((s) => s.climbGraphSwipeHintSeen);
  const setClimbGraphSwipeHintSeen = useSettingsStore((s) => s.setClimbGraphSwipeHintSeen);
  const { width: screenWidth } = useWindowDimensions();
  const currentDist = useRouteStore((s) => s.snappedPosition?.distanceAlongRouteMeters ?? null);
  const snappedPointIndex = useRouteStore((s) => s.snappedPosition?.pointIndex ?? null);
  const getClimbsForDisplay = useClimbStore((s) => s.getClimbsForDisplay);
  const allClimbs = useClimbStore((s) => s.climbs);
  const selectedClimb = useClimbStore((s) => s.selectedClimb);
  const setSelectedClimb = useClimbStore((s) => s.setSelectedClimb);
  const renameClimb = useClimbStore((s) => s.renameClimb);
  const isExpanded = usePanelStore((s) => s.isExpanded);
  const setIsExpanded = usePanelStore((s) => s.setIsExpanded);
  const setClimbZoomScope = usePanelStore((s) => s.setClimbZoomScope);
  // No horizon filtering: show all climbs for stable ordinal/navigation

  const routeIds = useMemo(() => activeData?.routeIds ?? [], [activeData?.routeIds]);
  const segments = activeData?.segments ?? null;
  const currentDistBucket =
    currentDist == null ? null : Math.floor(currentDist / DISTANCE_BUCKET_M);
  const bucketedCurrentDist =
    currentDistBucket == null ? null : currentDistBucket * DISTANCE_BUCKET_M;
  const snappedPositionPresent = snappedPointIndex != null;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editingClimb, setEditingClimb] = useState<Climb | null>(null);
  const [graphHeight, setGraphHeight] = useState(0);
  const [mountExpandedList, setMountExpandedList] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSwipeHintThisVisit, setShowSwipeHintThisVisit] = useState(true);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const listRef = useRef<FlatList<Climb>>(null);
  const lastCommittedEditKeyRef = useRef<string | null>(null);
  const consumeNextEditDismissActionRef = useRef(false);
  const saveEditIntentRef = useRef(false);

  const displayedClimbs = useMemo(
    () => getClimbsForDisplay(routeIds, segments),
    // allClimbs is a reactivity trigger: getClimbsForDisplay reads store via get() and is not itself reactive
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeIds, segments, allClimbs, getClimbsForDisplay],
  );

  const climb = useMemo(() => {
    if (editingClimb) return editingClimb;
    return resolveActiveClimb(displayedClimbs, currentDist, selectedClimb);
  }, [displayedClimbs, currentDist, editingClimb, selectedClimb]);

  const climbProfile = useMemo(() => {
    if (!climb || !activeData?.points?.length) return null;
    const points = activeData.points;
    let startIdx = 0;
    for (let i = 0; i < points.length; i++) {
      if (points[i].distanceFromStartMeters >= climb.startDistanceMeters) {
        startIdx = Math.max(0, i - 1);
        break;
      }
    }
    const sliceLength = climb.endDistanceMeters - points[startIdx].distanceFromStartMeters;
    if (sliceLength <= 0) return null;
    const sliced = extractRouteSlice(points, startIdx, sliceLength);
    if (sliced.length < 2) return null;
    let currentIdxInSlice: number | undefined;
    if (snappedPointIndex != null) {
      const idx = snappedPointIndex - startIdx;
      if (idx >= 0 && idx < sliced.length) currentIdxInSlice = idx;
    }
    return {
      points: sliced,
      offsetMeters: points[startIdx].distanceFromStartMeters,
      currentIdxInSlice,
    };
  }, [climb, activeData, snappedPointIndex]);

  const climbElevationDomain = useMemo(() => {
    if (!climb || !climbProfile?.points.length) return undefined;
    let minE = Infinity;
    let maxE = -Infinity;
    for (const point of climbProfile.points) {
      const elevation = point.elevationMeters ?? 0;
      if (elevation < minE) minE = elevation;
      if (elevation > maxE) maxE = elevation;
    }
    const rawRange = maxE - minE || 100;
    const minRange = Math.min(200, Math.max(50, climb.lengthMeters * 0.05));
    const range = Math.max(rawRange, minRange);
    const bottomPad = range * 0.14;
    const topPad = range * 0.06;
    let min = minE - bottomPad;
    let max = maxE + topPad;
    if (min < 0 && minE >= 0) {
      min = 0;
      max = Math.max(max, range + bottomPad + topPad);
    }
    return { min, max };
  }, [climb, climbProfile]);

  const gradeFillDomainMeters = useMemo(() => {
    if (!climb || !climbProfile) return undefined;
    return {
      start: climb.startDistanceMeters - climbProfile.offsetMeters,
      end: climb.endDistanceMeters - climbProfile.offsetMeters,
    };
  }, [climb, climbProfile]);

  const commitEditName = useCallback(
    (selectSavedClimb: boolean) => {
      if (!editingClimb) {
        setIsEditing(false);
        return;
      }
      const trimmed = editName.trim() || null;
      const editableSource = editingClimb.sourceClimbs?.[0] ?? editingClimb;
      const commitKey = `${editableSource.routeId}:${editableSource.id}:${trimmed ?? ""}`;
      const updatedClimb = { ...editingClimb, name: trimmed };
      if (lastCommittedEditKeyRef.current !== commitKey) {
        lastCommittedEditKeyRef.current = commitKey;
        void renameClimb(editableSource.id, editableSource.routeId, trimmed);
      }
      if (selectSavedClimb) {
        setSelectedClimb(updatedClimb);
      }
      setIsEditing(false);
      setEditingClimb(null);
    },
    [editName, editingClimb, renameClimb, setSelectedClimb],
  );

  const handleSaveName = useCallback(() => {
    saveEditIntentRef.current = false;
    commitEditName(true);
  }, [commitEditName]);

  const handleSaveEditIntentStart = useCallback(() => {
    saveEditIntentRef.current = true;
  }, []);

  const cancelEditName = useCallback(() => {
    if (saveEditIntentRef.current) return;
    if (!editingClimb) {
      setIsEditing(false);
      return;
    }
    Keyboard.dismiss();
    consumeNextEditDismissActionRef.current = true;
    setTimeout(() => {
      consumeNextEditDismissActionRef.current = false;
    }, 250);
    setEditName(editingClimb.name ?? "");
    setIsEditing(false);
    setEditingClimb(null);
    lastCommittedEditKeyRef.current = null;
  }, [editingClimb]);

  const handleEditBlur = useCallback(() => {
    cancelEditName();
    saveEditIntentRef.current = false;
  }, [cancelEditName]);

  const cancelEditIfNeeded = useCallback(() => {
    if (consumeNextEditDismissActionRef.current) {
      consumeNextEditDismissActionRef.current = false;
      return true;
    }
    if (!editingClimb) return false;
    cancelEditName();
    return true;
  }, [cancelEditName, editingClimb]);

  const handleStartEdit = useCallback(
    (targetClimb?: Climb) => {
      if (cancelEditIfNeeded()) return;
      const nextEditingClimb = targetClimb ?? climb;
      if (!nextEditingClimb) return;
      const rawRouteClimbs = allClimbs[nextEditingClimb.routeId] ?? [];
      const editableSource = nextEditingClimb.sourceClimbs?.[0] ?? nextEditingClimb;
      const editableSourceClimbs = allClimbs[editableSource.routeId] ?? rawRouteClimbs;
      const isPersistedClimb = editableSourceClimbs.some((item) => item.id === editableSource.id);
      if (!isPersistedClimb) return;
      setSelectedClimb(nextEditingClimb);
      setEditingClimb(nextEditingClimb);
      setEditName(nextEditingClimb.name ?? "");
      lastCommittedEditKeyRef.current = null;
      setIsEditing(true);
    },
    [allClimbs, cancelEditIfNeeded, climb, setSelectedClimb],
  );

  const handleSearchChangeText = useCallback(
    (text: string) => {
      if (cancelEditIfNeeded()) return;
      setSearchQuery(text);
    },
    [cancelEditIfNeeded],
  );

  // Sorted climbs for display and navigation
  const sortedClimbs = useMemo(
    () => [...displayedClimbs].sort((a, b) => a.startDistanceMeters - b.startDistanceMeters),
    [displayedClimbs],
  );

  const ordinalByClimbId = useMemo(() => {
    const map = new Map<string, { current: number; total: number }>();
    const total = sortedClimbs.length;
    sortedClimbs.forEach((item, index) => {
      map.set(item.id, { current: index + 1, total });
    });
    return map;
  }, [sortedClimbs]);

  const searchableClimbs = useMemo(
    () =>
      sortedClimbs.map((item) => {
        const ordinal = ordinalByClimbId.get(item.id);
        const difficulty = CLIMB_DIFFICULTY_LABELS[getClimbDifficulty(item.difficultyScore)];
        return {
          climb: item,
          searchText: [
            item.name ?? "unnamed climb",
            ordinal ? `${ordinal.current} ${ordinal.current}/${ordinal.total}` : "",
            difficulty,
            formatDistance(item.startDistanceMeters, units),
            formatDistance(item.lengthMeters, units),
            formatElevation(item.totalAscentMeters, units),
            `${item.averageGradientPercent}%`,
            `${item.maxGradientPercent}%`,
            String(Math.round(item.difficultyScore)),
          ]
            .join(" ")
            .toLowerCase(),
        };
      }),
    [ordinalByClimbId, sortedClimbs, units],
  );

  const filteredClimbs = useMemo(() => {
    const query = showClimbSearch ? deferredSearchQuery : "";
    if (!query) return sortedClimbs;
    return searchableClimbs
      .filter((item) => item.searchText.includes(query))
      .map((item) => item.climb);
  }, [deferredSearchQuery, searchableClimbs, showClimbSearch, sortedClimbs]);

  const previousClimb = useMemo(() => {
    if (!climb) return null;
    return getAdjacentClimb(sortedClimbs, climb.id, "prev");
  }, [climb, sortedClimbs]);

  const nextClimb = useMemo(() => {
    if (!climb) return null;
    return getAdjacentClimb(sortedClimbs, climb.id, "next");
  }, [climb, sortedClimbs]);

  const handleClimbPress = useCallback(
    (c: Climb) => {
      if (cancelEditIfNeeded()) return;
      setSelectedClimb(c);
      setClimbZoomScope("climb");
      setIsExpanded(false);
    },
    [cancelEditIfNeeded, setClimbZoomScope, setIsExpanded, setSelectedClimb],
  );

  const handleSelectAdjacentClimb = useCallback(
    (target: Climb | null) => {
      if (!target) return;
      if (cancelEditIfNeeded()) return;
      setSelectedClimb(target);
      setClimbZoomScope("climb");
      setClimbGraphSwipeHintSeen(true);
    },
    [cancelEditIfNeeded, setClimbGraphSwipeHintSeen, setClimbZoomScope, setSelectedClimb],
  );

  const handleSelectPreviousClimb = useCallback(() => {
    handleSelectAdjacentClimb(previousClimb);
  }, [handleSelectAdjacentClimb, previousClimb]);

  const handleSelectNextClimb = useCallback(() => {
    handleSelectAdjacentClimb(nextClimb);
  }, [handleSelectAdjacentClimb, nextClimb]);

  const handleGraphLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const nextHeight = Math.round(event.nativeEvent.layout.height);
      setGraphHeight((current) => (current === nextHeight ? current : nextHeight));
    },
    [],
  );

  const handleGraphAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === "increment") {
        handleSelectAdjacentClimb(nextClimb);
        return;
      }
      if (event.nativeEvent.actionName === "decrement") {
        handleSelectAdjacentClimb(previousClimb);
      }
    },
    [handleSelectAdjacentClimb, nextClimb, previousClimb],
  );

  const selectedClimbIndex = useMemo(() => {
    if (!climb) return -1;
    return filteredClimbs.findIndex((item) => item.id === climb.id);
  }, [climb, filteredClimbs]);

  const cycleGraphSize = useCallback(() => {
    if (cancelEditIfNeeded()) return;
    const nextSize: ClimbGraphSize =
      climbGraphSize === "small" ? "medium" : climbGraphSize === "medium" ? "large" : "small";
    setClimbGraphSize(nextSize);
  }, [cancelEditIfNeeded, climbGraphSize, setClimbGraphSize]);

  const handleCollapsePanel = useCallback(() => {
    if (cancelEditIfNeeded()) return;
    setIsExpanded(false);
  }, [cancelEditIfNeeded, setIsExpanded]);

  const graphSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onEnd((event) => {
          const absX = Math.abs(event.translationX);
          const absY = Math.abs(event.translationY);
          const isMostlyHorizontal = absX > absY * 1.35;
          const isHorizontalSwipe = absX > 18 || Math.abs(event.velocityX) > 300;
          if (isMostlyHorizontal && isHorizontalSwipe) {
            if (event.translationX > 0) {
              runOnJS(handleSelectPreviousClimb)();
            } else {
              runOnJS(handleSelectNextClimb)();
            }
            return;
          }

          const isMostlyVertical = absY > absX * 1.2;
          if (!isMostlyVertical) return;
          const isDownward = event.translationY > 24 || event.velocityY > 350;
          if (isDownward) {
            runOnJS(handleCollapsePanel)();
            return;
          }
          const isUpward = event.translationY < -24 || event.velocityY < -350;
          if (!isExpanded && isUpward) {
            runOnJS(setIsExpanded)(true);
          }
        }),
    [
      handleCollapsePanel,
      handleSelectNextClimb,
      handleSelectPreviousClimb,
      isExpanded,
      setIsExpanded,
    ],
  );

  const searchCollapseSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-28, 28])
        .onEnd((event) => {
          const isDownward = event.translationY > 24 || event.velocityY > 350;
          const isMostlyVertical =
            Math.abs(event.translationY) > Math.abs(event.translationX) * 1.2;
          if (isDownward && isMostlyVertical) {
            runOnJS(handleCollapsePanel)();
          }
        }),
    [handleCollapsePanel],
  );

  const headerCollapseSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-28, 28])
        .onEnd((event) => {
          const isDownward = event.translationY > 24 || event.velocityY > 350;
          const isMostlyVertical =
            Math.abs(event.translationY) > Math.abs(event.translationX) * 1.2;
          if (isDownward && isMostlyVertical) {
            runOnJS(handleCollapsePanel)();
          }
        }),
    [handleCollapsePanel],
  );

  const searchAnimatedStyle = useAnimatedStyle(() => {
    if (!showClimbSearch) {
      return { height: 0, opacity: 0, overflow: "hidden" };
    }
    if (!sheetTranslateY || !compactOffset) {
      return {
        height: isExpanded ? CLIMB_SEARCH_HEIGHT : 0,
        opacity: isExpanded ? 1 : 0,
        overflow: "hidden",
      };
    }

    const height = interpolate(
      sheetTranslateY.value,
      [0, compactOffset * 0.45],
      [CLIMB_SEARCH_HEIGHT, 0],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      sheetTranslateY.value,
      [0, compactOffset * 0.2],
      [1, 0],
      Extrapolation.CLAMP,
    );

    return { height, opacity, overflow: "hidden" };
  });

  useEffect(() => {
    if (!isExpanded) {
      setMountExpandedList(false);
      return;
    }
    const timeout = setTimeout(() => {
      setMountExpandedList(true);
    }, EXPANDED_LIST_MOUNT_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [isExpanded]);

  const shouldShowSwipeHint =
    sortedClimbs.length > 1 && !climbGraphSwipeHintSeen && showSwipeHintThisVisit;

  useEffect(() => {
    if (!shouldShowSwipeHint) return;
    const timeout = setTimeout(() => {
      setShowSwipeHintThisVisit(false);
    }, SWIPE_HINT_HIDE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [shouldShowSwipeHint]);

  const getItemLayout = useCallback(
    (_: ArrayLike<Climb> | null | undefined, index: number) => ({
      length: CLIMB_ROW_HEIGHT,
      offset: CLIMB_ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      if (info.averageItemLength > 0) {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, info.averageItemLength * info.index),
          animated: false,
        });
      }
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0 });
      }, 80);
    },
    [],
  );

  const renderClimbListItem = useCallback(
    ({ item }: { item: Climb }) => {
      const rawRouteClimbs = allClimbs[item.routeId] ?? [];
      const editableSource = item.sourceClimbs?.[0] ?? item;
      const editableSourceClimbs = allClimbs[editableSource.routeId] ?? rawRouteClimbs;
      const canEdit = editableSourceClimbs.some((climbItem) => climbItem.id === editableSource.id);
      return (
        <ClimbListItem
          climb={item}
          currentDistAlongRoute={bucketedCurrentDist}
          isPast={bucketedCurrentDist != null && item.endDistanceMeters < bucketedCurrentDist}
          isSelected={climb?.id === item.id}
          onPress={handleClimbPress}
          onEdit={isExpanded && canEdit ? handleStartEdit : undefined}
          isEditing={isEditing && editingClimb?.id === item.id}
          editName={editName}
          onEditNameChange={setEditName}
          onSaveEdit={handleSaveName}
          onCancelEdit={handleEditBlur}
          onSaveEditIntentStart={handleSaveEditIntentStart}
          ordinal={ordinalByClimbId.get(item.id) ?? null}
          snappedPositionPresent={snappedPositionPresent}
        />
      );
    },
    [
      allClimbs,
      bucketedCurrentDist,
      climb?.id,
      editName,
      editingClimb?.id,
      handleEditBlur,
      handleClimbPress,
      handleSaveName,
      handleSaveEditIntentStart,
      handleStartEdit,
      isExpanded,
      isEditing,
      ordinalByClimbId,
      snappedPositionPresent,
    ],
  );

  // Empty state
  if (displayedClimbs.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <Mountain size={24} color={colors.textTertiary} />
        <Text className="text-[13px] text-muted-foreground font-barlow-medium mt-2">
          No climbs on this route
        </Text>
      </View>
    );
  }

  if (!climb) return null;

  const graphSizeConfig = CLIMB_GRAPH_HEIGHT[climbGraphSize];
  const graphHeightTarget = Math.max(
    graphSizeConfig.min,
    Math.round(screenWidth * graphSizeConfig.ratio),
  );
  const currentClimbOrdinal = ordinalByClimbId.get(climb.id) ?? null;

  const climbGraph = (
    <View>
      {climbProfile && (
        <GestureDetector gesture={graphSwipeGesture}>
          <View
            className="mx-2 overflow-hidden"
            style={{ height: graphHeightTarget }}
            onLayout={handleGraphLayout}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={
              currentClimbOrdinal
                ? `Climb profile, climb ${currentClimbOrdinal.current} of ${currentClimbOrdinal.total}`
                : "Climb profile"
            }
            accessibilityHint="Swipe left or right to change climb. VoiceOver users can use adjustable actions for previous or next climb."
            accessibilityActions={[
              { name: "decrement", label: "Previous climb" },
              { name: "increment", label: "Next climb" },
            ]}
            onAccessibilityAction={handleGraphAccessibilityAction}
          >
            {graphHeight > 0 && (
              <ElevationProfile
                points={climbProfile.points}
                units={units}
                width={screenWidth - 16}
                height={graphHeight}
                showLegend
                fitToWidth
                yDomainMeters={climbElevationDomain}
                compact
                debugName="climb"
                debugMinSamples={50}
                gradeFillDomainMeters={gradeFillDomainMeters}
                distanceOffsetMeters={climbProfile.offsetMeters}
                currentPointIndex={climbProfile.currentIdxInSlice}
                showStartAxisLine
                showEndAxisLine
                showDistanceMarkers={showDistanceMarkers}
                distanceMarkerIntervalKm={distanceMarkerInterval}
                distanceMarkerMinPx={52}
                distanceMarkerStrokeWidth={0.9}
                markerOpacity={0.72}
                showDistanceMarkerLabels={showDistanceMarkers}
                xLabelInsets={isExpanded ? { right: 10 } : undefined}
              />
            )}
            {shouldShowSwipeHint && (
              <View
                pointerEvents="none"
                className="absolute left-0 right-0 items-center"
                style={{ top: 30 }}
                importantForAccessibility="no-hide-descendants"
              >
                <View
                  className="rounded-full px-3 py-1.5 border border-border-subtle"
                  style={{ backgroundColor: `${colors.surface}CC` }}
                >
                  <Text className="text-[12px] font-barlow-semibold text-foreground">
                    Swipe graph ← / → to change climb
                  </Text>
                </View>
              </View>
            )}
            {isExpanded && (
              <TouchableOpacity
                className="absolute right-2 w-[48px] h-[48px] items-center justify-center rounded-xl border border-border-subtle"
                style={{ bottom: 44, backgroundColor: `${colors.surface}99` }}
                onPress={cycleGraphSize}
                accessibilityLabel="Cycle climb graph size"
                accessibilityRole="button"
                activeOpacity={0.75}
              >
                <Maximize2 size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
          </View>
        </GestureDetector>
      )}
    </View>
  );

  return (
    <View className="flex-1">
      {climbGraph}
      <GestureDetector gesture={searchCollapseSwipeGesture}>
        <Animated.View style={searchAnimatedStyle}>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.borderSubtle }}>
            <PanelSearchInput
              value={searchQuery}
              onChangeText={handleSearchChangeText}
              placeholder="Search climbs..."
              accessibilityLabel="Search climbs"
            />
          </View>
        </Animated.View>
      </GestureDetector>
      <GestureDetector gesture={headerCollapseSwipeGesture}>
        <View>
          <ClimbMetricHeader />
        </View>
      </GestureDetector>
      {isExpanded && mountExpandedList ? (
        filteredClimbs.length > 0 ? (
          <FlatList
            ref={listRef}
            data={filteredClimbs}
            keyExtractor={(item) => item.id}
            renderItem={renderClimbListItem}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: safeBottom }}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            initialScrollIndex={selectedClimbIndex >= 0 ? selectedClimbIndex : undefined}
            getItemLayout={getItemLayout}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={3}
            removeClippedSubviews={false}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Mountain size={20} color={colors.textTertiary} />
            <Text className="text-[12px] text-muted-foreground font-barlow-medium mt-2">
              No climbs match search
            </Text>
          </View>
        )
      ) : (
        <View>{renderClimbListItem({ item: climb })}</View>
      )}
    </View>
  );
}

function ClimbMetricHeader() {
  const colors = useThemeColors();
  const metrics = [
    { key: "start", label: "Start", icon: <Flag size={11} color={colors.textTertiary} /> },
    { key: "eta", label: "ETA", icon: <Clock3 size={11} color={colors.textTertiary} /> },
    { key: "gain", label: "Gain", icon: <ArrowUp size={11} color={colors.textTertiary} /> },
    { key: "length", label: "Length", icon: <Ruler size={11} color={colors.textTertiary} /> },
    { key: "avg", label: "Avg", icon: <TrendingUp size={11} color={colors.textTertiary} /> },
    { key: "max", label: "Max", icon: <ChevronsUp size={11} color={colors.textTertiary} /> },
  ];

  return (
    <View
      className="flex-row px-4 py-1.5 bg-surface"
      style={{
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderTopColor: colors.borderSubtle,
        borderBottomColor: colors.borderSubtle,
      }}
    >
      {metrics.map((metric) => (
        <View key={metric.key} className="flex-1 min-w-0 items-center px-0.5">
          <View className="flex-row items-center justify-center min-w-0">
            <View className="w-[13px] items-center mr-0.5">{metric.icon}</View>
            <Text
              className="text-[10px] text-muted-foreground font-barlow-medium text-center"
              numberOfLines={1}
            >
              {metric.label}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
