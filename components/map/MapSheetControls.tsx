import React, { useEffect, useState } from "react";
import {
  PanResponder,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Path, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bike,
  Cloud,
  Compass,
  Grip,
  Layers,
  LocateFixed,
  MapPin,
  Mountain,
  Navigation,
  Route,
  Ruler,
  SlidersHorizontal,
  Sun,
  Utensils,
} from "lucide-react-native";
import Animated, {
  cancelAnimation,
  createAnimatedComponent,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import {
  GPS_STALE_THRESHOLD_MS,
  POSITION_AGE_VISIBLE_THRESHOLD_MS,
  SHEET_COMPACT_RATIO,
  SHEET_EXPANDED_RATIO,
} from "@/constants";
import { cn } from "@/lib/cn";
import { useMapStore } from "@/store/mapStore";
import { usePanelStore } from "@/store/panelStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useThemeColors } from "@/theme";
import { formatDistance, formatTimeDelta } from "@/utils/formatters";
import { isNorthUp } from "@/utils/mapHeading";
import {
  HORIZON_CHOICES,
  type ActiveRouteData,
  type ClimbZoomScope,
  type HorizonKm,
} from "@/types";
import MapControls from "./MapControls";

const FLOATING_CONTROLS_HEIGHT = 144;
const MAP_BUTTON_SIZE = 52;
const MAP_BUTTON_BOTTOM_OFFSET = 16;
const MENU_SCREEN_MARGIN = 12;
const MENU_ROW_HEIGHT = 48;
const MENU_SECTION_HEADER_HEIGHT = 22;
const MENU_GROUP_GAP = 8;
const HORIZON_BUCKET_COLUMN_WIDTH = 64;
const HORIZON_BUCKET_PADDING = 8;
const HORIZON_BUCKET_PITCH = 56;
const SCRUB_CHIP_SIZE = MENU_ROW_HEIGHT;
const SCRUB_CHIP_PITCH = HORIZON_BUCKET_PITCH;
const SCRUB_COLUMN_X = SCRUB_CHIP_PITCH;
const SCRUB_PANEL_PADDING = 8;
const MAP_CONTROLS_Z_INDEX = 3;
const MAP_DISPLAY_BACKDROP_Z_INDEX = 20;
const MAP_DISPLAY_OVERLAY_Z_INDEX = 40;
const MAP_DISPLAY_HANDLE_Z_INDEX = MAP_DISPLAY_OVERLAY_Z_INDEX + 1;
const MAP_DISPLAY_BACKDROP_COLOR = "rgba(0,0,0,0.28)";
const PATH_MODE_COUNT = 5;
const DISPLAY_TOGGLE_COUNT = 4;
const MENU_HEIGHT =
  PATH_MODE_COUNT * MENU_ROW_HEIGHT +
  DISPLAY_TOGGLE_COUNT * MENU_ROW_HEIGHT +
  MENU_SECTION_HEADER_HEIGHT * 2 +
  MENU_GROUP_GAP;
// Lucide Compass points NW by default; compensate so its needle points to the red N.
const COMPASS_ICON_NORTH_OFFSET_DEGREES = -45;
type PathMode = "segments" | "weather" | "climbs" | "surface" | "descends";
const AnimatedText = createAnimatedComponent(Text);

const CLIMB_SCOPE_CHOICES_WITH_SEGMENT: readonly ClimbZoomScope[] = ["climb", "segment", "all"];
const CLIMB_SCOPE_CHOICES_NO_SEGMENT: readonly ClimbZoomScope[] = ["climb", "all"];
const SCOPE_LABELS: Record<ClimbZoomScope, string> = {
  climb: "Climb",
  segment: "Segment",
  all: "All",
};

type BucketChoice =
  | { key: string; label: string; type: "horizon"; value: HorizonKm }
  | { key: string; label: string; type: "climbScope"; value: ClimbZoomScope };

type ScrubChipPosition = { x: number; y: number };

const HORIZON_SCRUB_POSITIONS: Record<string, ScrubChipPosition> = {
  "10": { x: SCRUB_COLUMN_X, y: 0 },
  "20": { x: SCRUB_COLUMN_X, y: SCRUB_CHIP_PITCH },
  "50": { x: SCRUB_COLUMN_X, y: SCRUB_CHIP_PITCH * 2 },
  "100": { x: SCRUB_COLUMN_X, y: SCRUB_CHIP_PITCH * 3 },
  "200": { x: SCRUB_COLUMN_X, y: SCRUB_CHIP_PITCH * 4 },
  all: { x: 0, y: SCRUB_CHIP_PITCH * 2 },
};

function getMapDisplayMenuMetrics({
  screenHeight,
  safeTop,
  safeBottom,
  isPanelExpanded,
  screenWidth,
  menuHeight = MENU_HEIGHT,
  collapsedCenterHeight = menuHeight,
}: {
  screenHeight: number;
  safeTop: number;
  safeBottom: number;
  isPanelExpanded: boolean;
  screenWidth?: number;
  menuHeight?: number;
  collapsedCenterHeight?: number;
}) {
  const sheetHeight =
    Math.round(screenHeight * (isPanelExpanded ? SHEET_EXPANDED_RATIO : SHEET_COMPACT_RATIO)) +
    safeBottom;
  const controlsTop = screenHeight - sheetHeight - FLOATING_CONTROLS_HEIGHT;
  const buttonTop = FLOATING_CONTROLS_HEIGHT - MAP_BUTTON_BOTTOM_OFFSET - MAP_BUTTON_SIZE;
  const preferredMenuTop = isPanelExpanded
    ? buttonTop - MENU_GROUP_GAP - menuHeight
    : buttonTop + MAP_BUTTON_SIZE / 2 - collapsedCenterHeight / 2;
  const topClearance = safeTop + (isPanelExpanded ? 28 : MENU_SCREEN_MARGIN);
  const minMenuTop = topClearance - controlsTop;
  const maxMenuTop = screenHeight - safeBottom - MENU_SCREEN_MARGIN - menuHeight - controlsTop;
  const menuTop = Math.max(
    minMenuTop,
    Math.min(preferredMenuTop, Math.max(minMenuTop, maxMenuTop)),
  );

  const buttonCenterY = buttonTop + MAP_BUTTON_SIZE / 2;
  const buttonCenterX =
    screenWidth == null ? undefined : screenWidth - MAP_BUTTON_BOTTOM_OFFSET - MAP_BUTTON_SIZE / 2;

  return { controlsTop, menuTop, buttonCenterX, buttonCenterY };
}

function getBucketMenuHeight(choiceCount: number): number {
  return (
    HORIZON_BUCKET_PADDING * 2 +
    choiceCount * MENU_ROW_HEIGHT +
    Math.max(0, choiceCount - 1) * MENU_GROUP_GAP
  );
}

function horizonIndexFromMenuLocalY(localY: number, clamp: boolean, choiceCount: number): number {
  "worklet";

  const firstBucketTop = HORIZON_BUCKET_PADDING;
  const lastBucketBottom =
    HORIZON_BUCKET_PADDING + (choiceCount - 1) * HORIZON_BUCKET_PITCH + MENU_ROW_HEIGHT;

  if (!clamp && (localY < firstBucketTop || localY > lastBucketBottom)) return -1;

  const rawIndex = Math.round(
    (localY - HORIZON_BUCKET_PADDING - MENU_ROW_HEIGHT / 2) / HORIZON_BUCKET_PITCH,
  );
  return Math.max(0, Math.min(choiceCount - 1, rawIndex));
}

function buildHorizonBucketChoices(formatHorizonChoice: (km: HorizonKm) => string): BucketChoice[] {
  return HORIZON_CHOICES.map((value) => ({
    key: value === null ? "all" : String(value),
    label: formatHorizonChoice(value),
    type: "horizon",
    value,
  }));
}

function buildClimbScopeChoices(hasSegments: boolean): BucketChoice[] {
  const scopes = hasSegments ? CLIMB_SCOPE_CHOICES_WITH_SEGMENT : CLIMB_SCOPE_CHOICES_NO_SEGMENT;
  return scopes.map((value) => ({
    key: value,
    label: SCOPE_LABELS[value],
    type: "climbScope",
    value,
  }));
}

function getEffectiveClimbScope(
  climbZoomScope: ClimbZoomScope,
  hasSegments: boolean,
): ClimbZoomScope {
  return !hasSegments && climbZoomScope === "segment" ? "climb" : climbZoomScope;
}

function getSelectedBucketIndex(
  choices: readonly BucketChoice[],
  selectedValue: HorizonKm | ClimbZoomScope,
) {
  const index = choices.findIndex((choice) => choice.value === selectedValue);
  return index >= 0 ? index : 0;
}

function getScrubChipPosition(choice: BucketChoice): ScrubChipPosition {
  if (choice.type === "horizon") {
    return HORIZON_SCRUB_POSITIONS[choice.key] ?? { x: SCRUB_COLUMN_X, y: 0 };
  }

  if (choice.value === "all") {
    return { x: 0, y: SCRUB_CHIP_PITCH };
  }

  return {
    x: SCRUB_COLUMN_X,
    y: choice.value === "segment" ? SCRUB_CHIP_PITCH : 0,
  };
}

function getScrubChipPositions(choices: readonly BucketChoice[]): ScrubChipPosition[] {
  if (choices.length === 2 && choices.every((choice) => choice.type === "climbScope")) {
    return choices.map((choice) => ({
      x: choice.value === "all" ? 0 : SCRUB_COLUMN_X,
      y: 0,
    }));
  }

  return choices.map(getScrubChipPosition);
}

function getScrubClusterBounds(positions: readonly ScrubChipPosition[]) {
  return positions.reduce(
    (bounds, position) => ({
      width: Math.max(bounds.width, position.x + SCRUB_CHIP_SIZE),
      height: Math.max(bounds.height, position.y + SCRUB_CHIP_SIZE),
    }),
    { width: SCRUB_CHIP_SIZE, height: SCRUB_CHIP_SIZE },
  );
}

function getScrubAnchorPosition(
  choices: readonly BucketChoice[],
  positions: readonly ScrubChipPosition[],
  selectedIndex: number,
) {
  const preferredIndex = choices.findIndex((choice) => {
    if (choice.type === "horizon") return choice.value === 50;
    return choice.value === "segment";
  });
  return (
    positions[preferredIndex >= 0 ? preferredIndex : selectedIndex] ?? { x: SCRUB_COLUMN_X, y: 0 }
  );
}

function scrubIndexFromAbsolutePoint(
  absoluteX: number,
  absoluteY: number,
  clusterLeft: number,
  clusterTop: number,
  positionXs: readonly number[],
  positionYs: readonly number[],
  choiceCount: number,
) {
  "worklet";

  for (let index = 0; index < choiceCount; index += 1) {
    const left = clusterLeft + (positionXs[index] ?? 0);
    const top = clusterTop + (positionYs[index] ?? 0);
    if (
      absoluteX >= left &&
      absoluteX <= left + SCRUB_CHIP_SIZE &&
      absoluteY >= top &&
      absoluteY <= top + SCRUB_CHIP_SIZE
    ) {
      return index;
    }
  }

  return -1;
}

interface MapSheetControlsProps {
  activeData?: ActiveRouteData | null;
  onLocate: () => void;
  isFollowActive: boolean;
  onFollowToggle: () => void;
  isCompassActive: boolean;
  isResettingNorth?: boolean;
  onCompassPress: () => void;
  onCompassLongPress: () => void;
  locateAccessibilityLabel: string;
  heading?: number;
  compassRotation: SharedValue<number>;
}

function usePositionAge() {
  const userPosition = useMapStore((s) => s.userPosition);
  const [, setTick] = useState(0);

  const ageMs = userPosition ? Date.now() - userPosition.timestamp : 0;
  const shouldShow = userPosition != null && ageMs >= POSITION_AGE_VISIBLE_THRESHOLD_MS;
  const isStale = ageMs >= GPS_STALE_THRESHOLD_MS;

  useEffect(() => {
    if (!shouldShow) return;
    const interval = setInterval(() => setTick((tick) => tick + 1), 30_000);
    return () => clearInterval(interval);
  }, [shouldShow]);

  if (!shouldShow || !userPosition) return null;

  return { label: formatTimeDelta(ageMs), isStale };
}

export default function MapSheetControls({
  activeData,
  onLocate,
  isFollowActive,
  onFollowToggle,
  isCompassActive,
  isResettingNorth = false,
  onCompassPress,
  onCompassLongPress,
  locateAccessibilityLabel,
  heading,
  compassRotation,
}: MapSheetControlsProps) {
  const colors = useThemeColors();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
  const positionAge = usePositionAge();
  const isRefreshing = useMapStore((s) => s.isRefreshing);
  const showDistanceMarkers = useMapStore((s) => s.showDistanceMarkers);
  const showPOIs = useMapStore((s) => s.showPOIs);
  const showWaypoints = useMapStore((s) => s.showWaypoints);
  const toggleDistanceMarkers = useMapStore((s) => s.toggleDistanceMarkers);
  const togglePOIs = useMapStore((s) => s.togglePOIs);
  const toggleWaypoints = useMapStore((s) => s.toggleWaypoints);
  const units = useSettingsStore((s) => s.units);
  const currentHorizon = usePanelStore((s) => s.horizon);
  const setHorizon = usePanelStore((s) => s.setHorizon);
  const climbZoomScope = usePanelStore((s) => s.climbZoomScope);
  const setClimbZoomScope = usePanelStore((s) => s.setClimbZoomScope);
  const isDisplayMenuOpen = usePanelStore((s) => s.isHorizonPopoverOpen);
  const setDisplayMenuOpen = usePanelStore((s) => s.setHorizonPopoverOpen);
  const isPanelExpanded = usePanelStore((s) => s.isExpanded);
  const panelTab = usePanelStore((s) => s.panelTab);
  const [isScrubOverlayVisible, setScrubOverlayVisible] = useState(false);
  const previewIndex = useSharedValue(-1);
  const activePillPulse = useSharedValue(1);
  const scrubDidActivateRef = React.useRef(false);

  const iconSize = 24;
  const locateIconOpacity = isFollowActive ? 1 : 0.72;
  const displayControlMetrics = getMapDisplayMenuMetrics({
    screenHeight,
    screenWidth,
    safeTop,
    safeBottom,
    isPanelExpanded,
  });

  const compassDialStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${compassRotation.value}deg` }],
  }));
  const hasActivePill = isCompassActive || isFollowActive;

  React.useEffect(() => {
    if (hasActivePill) {
      activePillPulse.value = 1;
      activePillPulse.value = withRepeat(
        withSequence(
          withTiming(0.72, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      return;
    }

    cancelAnimation(activePillPulse);
    activePillPulse.value = 1;
  }, [activePillPulse, hasActivePill]);

  const activePillContentStyle = useAnimatedStyle(() => ({
    opacity: activePillPulse.value,
  }));

  const activeAccessibilityLabel = isFollowActive
    ? "Following my location"
    : locateAccessibilityLabel;
  const activeIconColor = colors.textPrimary;
  const isMapNorthUp = heading === undefined || isNorthUp(heading);
  const shouldUseNorthUpCompassVisual = isMapNorthUp || isResettingNorth;
  const compassAccessibilityLabel = isCompassActive
    ? "Heading follow on"
    : isMapNorthUp
      ? "Compass"
      : "Reset map north";
  const compassAccessibilityHint = isCompassActive
    ? "Tap to stop heading follow and reset north. Long press to stop heading follow."
    : isMapNorthUp
      ? "Long press to follow phone heading."
      : "Tap to rotate the map back to north up. Long press to follow phone heading.";
  const locateIcon = (
    <LocateFixed size={iconSize} color={activeIconColor} opacity={locateIconOpacity} />
  );
  const compassIconColor = isCompassActive
    ? colors.textPrimary
    : shouldUseNorthUpCompassVisual
      ? colors.textPrimary
      : colors.accent;
  const compassIconOpacity = isCompassActive ? 1 : shouldUseNorthUpCompassVisual ? 0.72 : 0.82;
  const compassNorthColor = colors.destructive;
  const compassTickColor = colors.textTertiary;
  const compassTickAngles = [90, 180, 270];
  const formatHorizonChoice = React.useCallback(
    (km: HorizonKm) => (km === null ? "All" : formatDistance(km * 1000, units).replace(".0", "")),
    [units],
  );
  const hasSegments = !!(activeData?.segments && activeData.segments.length > 0);
  const isClimbsTab = panelTab === "climbs";
  const effectiveClimbScope = getEffectiveClimbScope(climbZoomScope, hasSegments);
  const bucketChoices = React.useMemo(
    () =>
      isClimbsTab
        ? buildClimbScopeChoices(hasSegments)
        : buildHorizonBucketChoices(formatHorizonChoice),
    [formatHorizonChoice, hasSegments, isClimbsTab],
  );
  const selectedBucketValue = isClimbsTab ? effectiveClimbScope : currentHorizon;
  const currentBucketLabel = isClimbsTab
    ? SCOPE_LABELS[effectiveClimbScope]
    : formatHorizonChoice(currentHorizon);
  const selectedBucketIndex = getSelectedBucketIndex(bucketChoices, selectedBucketValue);
  const scrubChipPositions = React.useMemo(
    () => getScrubChipPositions(bucketChoices),
    [bucketChoices],
  );
  const scrubAnchorPosition = React.useMemo(
    () => getScrubAnchorPosition(bucketChoices, scrubChipPositions, selectedBucketIndex),
    [bucketChoices, scrubChipPositions, selectedBucketIndex],
  );
  const scrubClusterLeft =
    (displayControlMetrics.buttonCenterX ?? screenWidth / 2) -
    scrubAnchorPosition.x -
    SCRUB_CHIP_SIZE / 2;
  const scrubClusterTop =
    displayControlMetrics.controlsTop +
    displayControlMetrics.buttonCenterY -
    scrubAnchorPosition.y -
    SCRUB_CHIP_SIZE / 2;
  const scrubPositionXs = React.useMemo(
    () => scrubChipPositions.map((position) => position.x),
    [scrubChipPositions],
  );
  const scrubPositionYs = React.useMemo(
    () => scrubChipPositions.map((position) => position.y),
    [scrubChipPositions],
  );

  const resetPreviewIndex = React.useCallback(() => {
    previewIndex.value = -1;
  }, [previewIndex]);

  const toggleDisplayMenu = () => {
    if (scrubDidActivateRef.current) {
      return;
    }
    setDisplayMenuOpen(!isDisplayMenuOpen);
  };
  const closeDisplayMenu = () => setDisplayMenuOpen(false);

  const handleBucketSelect = React.useCallback(
    (choice: BucketChoice) => {
      resetPreviewIndex();
      if (choice.type === "climbScope") {
        setClimbZoomScope(choice.value);
      } else {
        setHorizon(choice.value);
      }
    },
    [resetPreviewIndex, setClimbZoomScope, setHorizon],
  );

  const beginScrubOverlay = React.useCallback(() => {
    scrubDidActivateRef.current = true;
    setDisplayMenuOpen(false);
    setScrubOverlayVisible(true);
  }, [setDisplayMenuOpen]);

  const clearScrubPressGuard = React.useCallback(() => {
    setTimeout(() => {
      scrubDidActivateRef.current = false;
    }, 250);
  }, []);

  const hideScrubOverlay = React.useCallback(() => {
    previewIndex.value = -1;
    setScrubOverlayVisible(false);
    clearScrubPressGuard();
  }, [clearScrubPressGuard, previewIndex]);

  const commitScrubIndex = React.useCallback(
    (index: number) => {
      setScrubOverlayVisible(false);
      clearScrubPressGuard();
      if (index >= 0) {
        const choice = bucketChoices[index];
        if (!choice) return;
        if (choice.type === "climbScope") {
          setClimbZoomScope(choice.value);
        } else {
          setHorizon(choice.value);
        }
      }
    },
    [bucketChoices, clearScrubPressGuard, setClimbZoomScope, setHorizon],
  );

  const menuButtonHorizonGesture = React.useMemo(() => {
    const choiceCount = bucketChoices.length;
    const startIndex = selectedBucketIndex;

    return Gesture.Pan()
      .activateAfterLongPress(350)
      .minDistance(0)
      .onStart((event) => {
        const touchedIndex = scrubIndexFromAbsolutePoint(
          event.absoluteX,
          event.absoluteY,
          scrubClusterLeft,
          scrubClusterTop,
          scrubPositionXs,
          scrubPositionYs,
          choiceCount,
        );
        previewIndex.value = touchedIndex >= 0 ? touchedIndex : startIndex;
        runOnJS(beginScrubOverlay)();
      })
      .onUpdate((event) => {
        const nextIndex = scrubIndexFromAbsolutePoint(
          event.absoluteX,
          event.absoluteY,
          scrubClusterLeft,
          scrubClusterTop,
          scrubPositionXs,
          scrubPositionYs,
          choiceCount,
        );
        if (nextIndex >= 0 && previewIndex.value !== nextIndex) {
          previewIndex.value = nextIndex;
        }
      })
      .onEnd((event) => {
        const touchedIndex = scrubIndexFromAbsolutePoint(
          event.absoluteX,
          event.absoluteY,
          scrubClusterLeft,
          scrubClusterTop,
          scrubPositionXs,
          scrubPositionYs,
          choiceCount,
        );
        const selectedIndex = touchedIndex >= 0 ? touchedIndex : previewIndex.value;
        runOnJS(commitScrubIndex)(selectedIndex);
      })
      .onFinalize(() => {
        previewIndex.value = -1;
        runOnJS(hideScrubOverlay)();
      });
  }, [
    beginScrubOverlay,
    bucketChoices.length,
    commitScrubIndex,
    hideScrubOverlay,
    previewIndex,
    scrubClusterLeft,
    scrubClusterTop,
    scrubPositionXs,
    scrubPositionYs,
    selectedBucketIndex,
  ]);

  const handleDistanceMarkersToggle = () => {
    toggleDistanceMarkers();
  };
  const handlePOIsToggle = () => {
    togglePOIs();
  };
  const handleWaypointsToggle = () => {
    toggleWaypoints();
  };

  return (
    <View className="absolute inset-0" pointerEvents="box-none">
      {isDisplayMenuOpen && (
        <Pressable
          className="absolute left-0 right-0"
          style={{
            top: -displayControlMetrics.controlsTop,
            height: screenHeight,
            backgroundColor: MAP_DISPLAY_BACKDROP_COLOR,
            zIndex: MAP_DISPLAY_BACKDROP_Z_INDEX,
            elevation: MAP_DISPLAY_BACKDROP_Z_INDEX,
          }}
          onPress={closeDisplayMenu}
          accessibilityLabel="Close map display menu"
          accessibilityRole="button"
        />
      )}
      {isScrubOverlayVisible && (
        <View
          className="absolute left-0 right-0"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            top: -displayControlMetrics.controlsTop,
            height: screenHeight,
            backgroundColor: MAP_DISPLAY_BACKDROP_COLOR,
            zIndex: MAP_DISPLAY_BACKDROP_Z_INDEX,
            elevation: MAP_DISPLAY_BACKDROP_Z_INDEX,
          }}
        />
      )}
      {isDisplayMenuOpen && (
        <MapDisplayPopover
          bucketChoices={bucketChoices}
          selectedBucketValue={selectedBucketValue}
          previewIndex={previewIndex}
          onResetPreview={resetPreviewIndex}
          onBucketSelect={handleBucketSelect}
          onClose={closeDisplayMenu}
          showDistanceMarkers={showDistanceMarkers}
          onDistanceMarkersToggle={handleDistanceMarkersToggle}
          showPOIs={showPOIs}
          onPOIsToggle={handlePOIsToggle}
          showWaypoints={showWaypoints}
          onWaypointsToggle={handleWaypointsToggle}
        />
      )}
      {isScrubOverlayVisible && (
        <ZoomBucketScrubOverlay
          bucketChoices={bucketChoices}
          selectedBucketValue={selectedBucketValue}
          previewIndex={previewIndex}
          clusterLeft={scrubClusterLeft}
          clusterTop={scrubClusterTop - displayControlMetrics.controlsTop}
        />
      )}

      <View
        className="absolute left-4 bottom-4 items-center gap-3"
        style={{ zIndex: MAP_CONTROLS_Z_INDEX, elevation: MAP_CONTROLS_Z_INDEX }}
      >
        <View className="relative overflow-visible items-center">
          <TouchableOpacity
            activeOpacity={1}
            className={cn(
              "w-[52px] h-[52px] rounded-full items-center justify-center shadow-md border",
              isCompassActive ? "bg-white border-gray-300" : "bg-surface/95 border-border-subtle",
            )}
            onPress={() => {
              onCompassPress();
            }}
            onLongPress={() => {
              onCompassLongPress();
            }}
            delayLongPress={350}
            accessibilityLabel={compassAccessibilityLabel}
            accessibilityHint={compassAccessibilityHint}
            accessibilityRole="button"
            accessibilityState={{ selected: isCompassActive }}
          >
            <View
              className="relative items-center justify-center"
              style={{ width: 52, height: 52 }}
              pointerEvents="none"
            >
              <Animated.View
                className="absolute items-center justify-start"
                style={[{ width: 50, height: 50, top: 1, left: 1 }, compassDialStyle]}
                pointerEvents="none"
              >
                <View
                  className="absolute items-center justify-center"
                  style={{
                    width: 50,
                    height: 50,
                    transform: [{ rotate: `${COMPASS_ICON_NORTH_OFFSET_DEGREES}deg` }],
                  }}
                >
                  <Compass
                    size={25}
                    color={compassIconColor}
                    strokeWidth={1.65}
                    opacity={compassIconOpacity}
                  />
                </View>
                <Text
                  className="text-[10px] font-barlow-bold text-destructive"
                  style={{ lineHeight: 12, color: compassNorthColor }}
                >
                  N
                </Text>
                {compassTickAngles.map((angle) => (
                  <View
                    key={angle}
                    className="absolute items-center justify-start"
                    style={{
                      width: 50,
                      height: 50,
                      top: 0,
                      left: 0,
                      transform: [{ rotate: `${angle}deg` }],
                    }}
                  >
                    <View
                      className="rounded-full"
                      style={{
                        width: 3,
                        height: 3,
                        marginTop: 4,
                        backgroundColor: compassTickColor,
                        opacity: 0.4,
                      }}
                    />
                  </View>
                ))}
              </Animated.View>
            </View>
          </TouchableOpacity>
          {isCompassActive && (
            <View
              pointerEvents="none"
              className="absolute rounded-full px-2 py-0.5 bg-surface/95 border border-accent/40 shadow-sm"
              style={{
                top: -10,
                right: 0,
                flexWrap: "nowrap",
                zIndex: 2,
                elevation: 2,
              }}
            >
              <Animated.View className="flex-row items-center" style={activePillContentStyle}>
                <Navigation size={11} color={colors.accent} />
                <Text
                  numberOfLines={1}
                  className="text-[11px] font-barlow-semibold text-accent ml-1"
                >
                  Heading
                </Text>
              </Animated.View>
            </View>
          )}
        </View>

        <MapControls onBeforeOpen={closeDisplayMenu} />
      </View>

      <View
        className="absolute right-4 bottom-4 items-end gap-3"
        style={{ zIndex: MAP_CONTROLS_Z_INDEX, elevation: MAP_CONTROLS_Z_INDEX }}
      >
        <View className="relative overflow-visible items-center">
          {positionAge && !isRefreshing && (
            <View className="absolute right-[60px] items-end gap-1" style={{ top: 16 }}>
              <View className="rounded-full bg-surface/95 border border-border-subtle px-1.5 py-0.5">
                <Text
                  className="text-[10px] font-barlow-semibold"
                  style={{ color: positionAge.isStale ? colors.warning : colors.textTertiary }}
                >
                  {positionAge.label}
                </Text>
              </View>
            </View>
          )}
          <TouchableOpacity
            activeOpacity={1}
            className={cn(
              "w-[52px] h-[52px] rounded-full items-center justify-center shadow-md border",
              "bg-surface/95 border-border-subtle",
            )}
            onPress={() => {
              onLocate();
            }}
            onLongPress={() => {
              onFollowToggle();
            }}
            delayLongPress={350}
            accessibilityLabel={activeAccessibilityLabel}
            accessibilityHint={
              isFollowActive
                ? "Long press to stop following. Tap to cycle map focus between your location and route endpoints. Panning exits follow mode."
                : "Tap to cycle map focus between your location and route endpoints. Long press to follow GPS."
            }
            accessibilityRole="button"
            accessibilityState={{ selected: isFollowActive }}
          >
            {locateIcon}
          </TouchableOpacity>
          {isFollowActive && (
            <View
              pointerEvents="none"
              className="absolute rounded-full px-2 py-0.5 bg-surface/95 border border-accent/40 shadow-sm"
              style={{ top: -10, right: 0, zIndex: 2, elevation: 2 }}
            >
              <Animated.View className="flex-row items-center" style={activePillContentStyle}>
                <Bike size={11} color={colors.accent} />
                <Text
                  numberOfLines={1}
                  className="text-[11px] font-barlow-semibold text-accent ml-1"
                >
                  Following
                </Text>
              </Animated.View>
            </View>
          )}
        </View>

        <View className="relative overflow-visible items-end">
          <MapDisplayBucketPill label={currentBucketLabel} />
          <View className="flex-row gap-2" accessibilityLabel="Map display controls">
            <DisplayCandidateButton icon="layers" isSelected={false} isInactive />
            <DisplayCandidateButton
              icon="sliders"
              onPress={toggleDisplayMenu}
              gesture={menuButtonHorizonGesture}
              isSelected={isDisplayMenuOpen}
              accessibilityHint="Tap to toggle map display options. Touch and hold, then drag to quickly choose a zoom bucket."
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function MapDisplayBucketPill({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View
      pointerEvents="none"
      className="absolute items-center"
      style={{ top: -10, right: 0, width: MAP_BUTTON_SIZE, zIndex: 2, elevation: 2 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="flex-row items-center justify-center rounded-full px-2.5 py-0.5 bg-surface/95 border border-accent/40 shadow-sm">
        <Ruler size={11} color={colors.accent} />
        <Text numberOfLines={1} className="text-[11px] font-barlow-semibold text-accent ml-1">
          {label}
        </Text>
      </View>
    </View>
  );
}

function ZoomBucketScrubOverlay({
  bucketChoices,
  selectedBucketValue,
  previewIndex,
  clusterLeft,
  clusterTop,
}: {
  bucketChoices: readonly BucketChoice[];
  selectedBucketValue: HorizonKm | ClimbZoomScope;
  previewIndex: SharedValue<number>;
  clusterLeft: number;
  clusterTop: number;
}) {
  const positions = React.useMemo(() => getScrubChipPositions(bucketChoices), [bucketChoices]);
  const bounds = React.useMemo(() => getScrubClusterBounds(positions), [positions]);

  return (
    <View
      className="absolute inset-0"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ zIndex: MAP_DISPLAY_OVERLAY_Z_INDEX, elevation: MAP_DISPLAY_OVERLAY_Z_INDEX }}
    >
      <View
        className="absolute rounded-2xl bg-surface border border-border-subtle shadow-md"
        style={{
          left: clusterLeft - SCRUB_PANEL_PADDING,
          top: clusterTop - SCRUB_PANEL_PADDING,
          width: bounds.width + SCRUB_PANEL_PADDING * 2,
          height: bounds.height + SCRUB_PANEL_PADDING * 2,
          borderWidth: StyleSheet.hairlineWidth,
        }}
      >
        {bucketChoices.map((choice, index) => {
          const selected = choice.value === selectedBucketValue;
          const label = choice.label;
          const position = positions[index] ?? { x: SCRUB_COLUMN_X, y: index * SCRUB_CHIP_PITCH };
          return (
            <View
              key={choice.key}
              className="absolute"
              style={{
                left: position.x + SCRUB_PANEL_PADDING,
                top: position.y + SCRUB_PANEL_PADDING,
              }}
            >
              <HorizonBucketButton
                index={index}
                previewIndex={previewIndex}
                selected={selected}
                highlightSelectedWhenIdle={false}
                selectedEmphasis="strong"
                label={label}
                onPress={() => undefined}
                accessibilityLabel={
                  choice.type === "horizon" && choice.value !== null
                    ? `Show next ${label}`
                    : `Show ${label}`
                }
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DisplayCandidateButton({
  icon,
  onPress,
  gesture,
  isSelected,
  isInactive = false,
  accessibilityHint,
}: {
  icon: "layers" | "sliders";
  onPress?: () => void;
  gesture?: React.ComponentProps<typeof GestureDetector>["gesture"];
  isSelected: boolean;
  isInactive?: boolean;
  accessibilityHint?: string;
}) {
  const colors = useThemeColors();
  const Icon = icon === "layers" ? Layers : SlidersHorizontal;
  const label = icon === "layers" ? "Layers" : "Map display controls";

  const button = (
    <TouchableOpacity
      activeOpacity={isInactive ? 1 : 0.85}
      className={cn(
        "w-[52px] h-[52px] rounded-full items-center justify-center shadow-md border",
        isSelected ? "bg-accent border-accent" : "bg-surface/95 border-border-subtle",
        isInactive && "opacity-50",
      )}
      onPress={onPress}
      disabled={isInactive}
      accessibilityLabel={label}
      accessibilityHint={
        isInactive
          ? "Reserved for future map layers."
          : (accessibilityHint ?? "Toggles map display options.")
      }
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, expanded: isInactive ? undefined : isSelected }}
    >
      <Icon size={23} color={isSelected ? colors.accentForeground : colors.textPrimary} />
    </TouchableOpacity>
  );

  if (!gesture || isInactive) return button;

  return <GestureDetector gesture={gesture}>{button}</GestureDetector>;
}

function MapDisplayPopover({
  bucketChoices,
  selectedBucketValue,
  previewIndex,
  onResetPreview,
  onBucketSelect,
  onClose,
  showDistanceMarkers,
  onDistanceMarkersToggle,
  showPOIs,
  onPOIsToggle,
  showWaypoints,
  onWaypointsToggle,
}: {
  bucketChoices: readonly BucketChoice[];
  selectedBucketValue: HorizonKm | ClimbZoomScope;
  previewIndex: SharedValue<number>;
  onResetPreview: () => void;
  onBucketSelect: (choice: BucketChoice) => void;
  onClose: () => void;
  showDistanceMarkers: boolean;
  onDistanceMarkersToggle: () => void;
  showPOIs: boolean;
  onPOIsToggle: () => void;
  showWaypoints: boolean;
  onWaypointsToggle: () => void;
}) {
  const colors = useThemeColors();
  const { height: screenHeight } = useWindowDimensions();
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
  const [isExpanded, setIsExpanded] = useState(false);
  const isPanelExpanded = usePanelStore((s) => s.isExpanded);
  const panelTab = usePanelStore((s) => s.panelTab);
  const setPanelTabKeepingPopoverOpen = usePanelStore((s) => s.setPanelTabKeepingPopoverOpen);
  const bucketMenuHeight = getBucketMenuHeight(bucketChoices.length);
  const { menuTop } = getMapDisplayMenuMetrics({
    screenHeight,
    safeTop,
    safeBottom,
    isPanelExpanded,
    collapsedCenterHeight: bucketMenuHeight,
  });
  const topDismissHeight = Math.max(0, menuTop);
  const bottomDismissTop = Math.max(0, menuTop + MENU_HEIGHT);
  const groupWidth = isExpanded ? 220 : 94;
  const currentPathMode: PathMode =
    panelTab === "weather" ? "weather" : panelTab === "climbs" ? "climbs" : "segments";
  const handlePathModeSelect = (mode: PathMode) => {
    if (mode === "weather" || mode === "climbs") {
      setPanelTabKeepingPopoverOpen(mode);
      return;
    }
    if (mode === "segments") setPanelTabKeepingPopoverOpen("profile");
  };
  const handleHorizonIndexSelect = React.useCallback(
    (index: number) => {
      onResetPreview();
      const choice = bucketChoices[index];
      if (choice) onBucketSelect(choice);
    },
    [bucketChoices, onBucketSelect, onResetPreview],
  );
  const dismissPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          (gesture.dx > 18 && gesture.dx > Math.abs(gesture.dy)) ||
          (Math.abs(gesture.dy) > 18 && Math.abs(gesture.dy) > Math.abs(gesture.dx)),
        onPanResponderRelease: (_, gesture) => {
          if (
            gesture.dx > 36 ||
            gesture.vx > 0.35 ||
            Math.abs(gesture.dy) > 36 ||
            Math.abs(gesture.vy) > 0.35
          ) {
            onClose();
          }
        },
      }),
    [onClose],
  );
  const horizonColumnGesture = React.useMemo(() => {
    const choiceCount = bucketChoices.length;
    return Gesture.Pan()
      .minDistance(6)
      .onUpdate((event) => {
        const nextIndex = horizonIndexFromMenuLocalY(event.y, true, choiceCount);
        if (previewIndex.value !== nextIndex) {
          previewIndex.value = nextIndex;
        }
      })
      .onEnd((event) => {
        const selectedIndex =
          previewIndex.value >= 0
            ? previewIndex.value
            : horizonIndexFromMenuLocalY(event.y, true, choiceCount);
        runOnJS(handleHorizonIndexSelect)(selectedIndex);
      })
      .onFinalize(() => {
        previewIndex.value = -1;
      });
  }, [bucketChoices.length, handleHorizonIndexSelect, previewIndex]);

  return (
    <View
      className="absolute bottom-0 right-4 top-0"
      pointerEvents="box-none"
      style={{ zIndex: MAP_DISPLAY_OVERLAY_Z_INDEX, elevation: MAP_DISPLAY_OVERLAY_Z_INDEX }}
    >
      <Pressable
        className="absolute right-0"
        style={{ top: 0, width: HORIZON_BUCKET_COLUMN_WIDTH, height: topDismissHeight }}
        onPress={onClose}
        accessibilityLabel="Close map display menu"
        accessibilityRole="button"
      />
      <Pressable
        className="absolute right-0"
        style={{
          top: bottomDismissTop,
          width: HORIZON_BUCKET_COLUMN_WIDTH,
          bottom: 0,
        }}
        onPress={onClose}
        accessibilityLabel="Close map display menu"
        accessibilityRole="button"
      />
      <View style={{ top: menuTop }} accessibilityRole="menu" accessibilityLabel="Map display menu">
        <TouchableOpacity
          activeOpacity={0.8}
          className="absolute w-[48px] h-[48px] rounded-full bg-surface/95 border border-border-subtle items-center justify-center shadow-sm"
          style={{
            left: -52,
            top: "50%",
            marginTop: -24,
            zIndex: MAP_DISPLAY_HANDLE_Z_INDEX,
            elevation: MAP_DISPLAY_HANDLE_Z_INDEX,
          }}
          onPress={() => setIsExpanded((current) => !current)}
          accessibilityLabel={
            isExpanded ? "Collapse map display labels" : "Expand map display labels"
          }
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
        >
          <TriangleHandle expanded={isExpanded} />
        </TouchableOpacity>

        <View className="flex-row items-center gap-2">
          <View className="items-center justify-center gap-2" {...dismissPanResponder.panHandlers}>
            <View
              className="rounded-2xl bg-surface border border-border-subtle overflow-hidden shadow-md"
              style={{ width: groupWidth, borderWidth: StyleSheet.hairlineWidth }}
            >
              <MenuSectionLabel label="PATH LINE" />
              <PathModeRow
                label="Segments"
                icon="segments"
                selected={currentPathMode === "segments"}
                onPress={() => handlePathModeSelect("segments")}
                expanded={isExpanded}
              />
              <PathModeRow
                label="Weather"
                icon="weather"
                selected={currentPathMode === "weather"}
                onPress={() => handlePathModeSelect("weather")}
                expanded={isExpanded}
              />
              <PathModeRow
                label="Climbs"
                icon="climbs"
                selected={currentPathMode === "climbs"}
                onPress={() => handlePathModeSelect("climbs")}
                expanded={isExpanded}
              />
              <PathModeRow label="Surface" icon="surface" disabled expanded={isExpanded} />
              <PathModeRow label="Descends" icon="descends" disabled expanded={isExpanded} />
            </View>

            <View
              className="rounded-2xl bg-surface border border-border-subtle overflow-hidden shadow-md"
              style={{ width: groupWidth, borderWidth: StyleSheet.hairlineWidth }}
            >
              <MenuSectionLabel label="MAP DISPLAY" />
              <MapDisplayToggleRow
                icon={<DistanceMarkerIcon active={showDistanceMarkers} />}
                label="Markers"
                value={showDistanceMarkers}
                onPress={onDistanceMarkersToggle}
                expanded={isExpanded}
              />
              <MapDisplayToggleRow
                icon={<Utensils size={19} color={showPOIs ? colors.accent : colors.textTertiary} />}
                label="POIs"
                value={showPOIs}
                onPress={onPOIsToggle}
                expanded={isExpanded}
              />
              <MapDisplayToggleRow
                icon={
                  <MapPin size={19} color={showWaypoints ? colors.accent : colors.textTertiary} />
                }
                label="Waypoints"
                value={showWaypoints}
                onPress={onWaypointsToggle}
                expanded={isExpanded}
              />
              <MapDisplayToggleRow
                icon={<WeatherGlyph />}
                label="Weather markers"
                value={false}
                disabled
                expanded={isExpanded}
              />
            </View>
          </View>

          <View
            className="items-center gap-2 rounded-2xl bg-surface border border-border-subtle p-2 shadow-md"
            style={{ borderWidth: StyleSheet.hairlineWidth }}
          >
            <GestureDetector gesture={horizonColumnGesture}>
              <View className="items-center gap-2">
                {bucketChoices.map((choice, index) => {
                  const selected = choice.value === selectedBucketValue;
                  const label = choice.label;
                  return (
                    <HorizonBucketButton
                      key={choice.key}
                      index={index}
                      previewIndex={previewIndex}
                      selected={selected}
                      label={label}
                      onPress={() => onBucketSelect(choice)}
                      accessibilityLabel={
                        choice.type === "horizon" && choice.value !== null
                          ? `Show next ${label}`
                          : `Show ${label}`
                      }
                    />
                  );
                })}
              </View>
            </GestureDetector>
          </View>
        </View>
      </View>
    </View>
  );
}

function MenuSectionLabel({ label }: { label: string }) {
  return (
    <View className="h-[22px] items-center justify-center border-b border-border-subtle bg-raised">
      <Text className="text-[10px] font-barlow-bold tracking-[1px] text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}

function HorizonBucketButton({
  index,
  previewIndex,
  selected,
  highlightSelectedWhenIdle = true,
  selectedEmphasis = "subtle",
  label,
  onPress,
  accessibilityLabel,
}: {
  index: number;
  previewIndex: SharedValue<number>;
  selected: boolean;
  highlightSelectedWhenIdle?: boolean;
  selectedEmphasis?: "subtle" | "strong";
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const colors = useThemeColors();
  const animatedStyle = useAnimatedStyle(() => {
    const hasPreview = previewIndex.value >= 0;
    const isPreviewed = hasPreview
      ? previewIndex.value === index
      : highlightSelectedWhenIdle && selected;
    const isSelected = selected && !isPreviewed;
    const selectedBackground =
      selectedEmphasis === "strong" ? `${colors.positive}40` : `${colors.positive}1A`;
    return {
      backgroundColor: isPreviewed
        ? colors.accent
        : isSelected
          ? selectedBackground
          : colors.surfaceRaised,
      borderColor: isPreviewed ? colors.accent : isSelected ? colors.positive : colors.borderSubtle,
    };
  }, [
    colors.accent,
    colors.borderSubtle,
    colors.positive,
    colors.surfaceRaised,
    highlightSelectedWhenIdle,
    index,
    selected,
    selectedEmphasis,
  ]);
  const animatedTextStyle = useAnimatedStyle(() => {
    const hasPreview = previewIndex.value >= 0;
    const isPreviewed = hasPreview
      ? previewIndex.value === index
      : highlightSelectedWhenIdle && selected;
    const isSelected = selected && !isPreviewed;
    return {
      color: isPreviewed
        ? colors.accentForeground
        : isSelected
          ? colors.positive
          : colors.textTertiary,
    };
  }, [
    colors.accentForeground,
    colors.positive,
    colors.textTertiary,
    highlightSelectedWhenIdle,
    index,
    selected,
    selectedEmphasis,
  ]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Animated.View
        className="w-[48px] h-[48px] rounded-full items-center justify-center border"
        style={animatedStyle}
      >
        <AnimatedText
          className="text-[13px] font-barlow-sc-semibold"
          style={animatedTextStyle}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
        >
          {label}
        </AnimatedText>
      </Animated.View>
    </TouchableOpacity>
  );
}

function MapDisplayToggleRow({
  icon,
  label,
  value,
  onPress,
  disabled = false,
  expanded,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onPress?: () => void;
  disabled?: boolean;
  expanded: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={disabled ? 1 : 0.75}
      className="min-h-[48px] flex-row items-center justify-between px-2 py-1"
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <View className="flex-row items-center flex-1 min-w-0 pr-2">
        <View className="w-[30px] items-center">{icon}</View>
        {expanded && (
          <Text
            className={cn(
              "flex-1 text-[13px] font-barlow-semibold ml-2",
              disabled ? "text-muted-foreground" : "text-foreground",
            )}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
      </View>
      <SwitchGlyph value={value} disabled={disabled} />
    </TouchableOpacity>
  );
}

function TriangleHandle({ expanded }: { expanded: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      style={
        expanded
          ? {
              width: 0,
              height: 0,
              borderTopWidth: 7,
              borderBottomWidth: 7,
              borderLeftWidth: 10,
              borderTopColor: "transparent",
              borderBottomColor: "transparent",
              borderLeftColor: colors.textSecondary,
            }
          : {
              width: 0,
              height: 0,
              borderTopWidth: 7,
              borderBottomWidth: 7,
              borderRightWidth: 10,
              borderTopColor: "transparent",
              borderBottomColor: "transparent",
              borderRightColor: colors.textSecondary,
            }
      }
    />
  );
}

function DistanceMarkerIcon({ active }: { active: boolean }) {
  const colors = useThemeColors();
  const fill = active ? colors.textPrimary : colors.textTertiary;
  return (
    <Svg width={28} height={28} viewBox="0 0 28 28">
      <Path
        d="M4 6h18a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-8l-4 4v-4H4a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z"
        fill={fill}
      />
      <SvgText x="13" y="16" fill="#FFFFFF" fontSize="9" fontWeight="700" textAnchor="middle">
        10
      </SvgText>
    </Svg>
  );
}

function PathModeRow({
  label,
  icon = "segments",
  selected = false,
  disabled = false,
  onPress,
  expanded,
}: {
  label: string;
  icon?: PathMode;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  expanded: boolean;
}) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      activeOpacity={disabled ? 1 : 0.75}
      className={cn(
        "min-h-[48px] flex-row items-center justify-between px-2 py-1",
        disabled && "opacity-60",
      )}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityLabel={
        disabled ? `${label} path line mode unavailable` : `${label} path line mode`
      }
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
    >
      <View className="flex-row items-center flex-1 min-w-0 pr-2">
        <View className="w-[30px] items-center">
          <PathModeIcon mode={icon} selected={selected} disabled={disabled} />
        </View>
        {expanded && (
          <Text
            className={cn(
              "flex-1 text-[13px] font-barlow-semibold ml-2",
              selected ? "text-accent" : disabled ? "text-muted-foreground" : "text-foreground",
            )}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
      </View>
      <View
        className={cn(
          "w-[18px] h-[18px] rounded-full border items-center justify-center",
          selected ? "border-accent" : disabled ? "border-border" : "border-muted-foreground",
        )}
      >
        {selected && (
          <View
            className="w-[8px] h-[8px] rounded-full"
            style={{ backgroundColor: colors.accent }}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

function WeatherGlyph() {
  const colors = useThemeColors();
  return (
    <View className="relative w-[30px] h-[26px] items-center justify-center">
      <Sun
        size={14}
        color={colors.starred}
        strokeWidth={2.2}
        style={{ position: "absolute", left: 3, top: 0 }}
      />
      <Cloud
        size={23}
        color={colors.info}
        strokeWidth={2.2}
        style={{ position: "absolute", left: 6, top: 7 }}
      />
    </View>
  );
}

function PathModeIcon({
  mode,
  selected,
  disabled,
}: {
  mode: PathMode;
  selected: boolean;
  disabled: boolean;
}) {
  const colors = useThemeColors();
  const inactiveColor = disabled ? colors.textTertiary : colors.textSecondary;
  const iconColor = selected ? colors.accent : inactiveColor;
  if (mode === "segments") {
    return <SegmentPathIcon color={iconColor} disabled={disabled} />;
  }
  if (mode === "weather") {
    return <WeatherGlyph />;
  }
  if (mode === "surface") return <Grip size={21} color={inactiveColor} strokeWidth={2} />;

  const Arrow = mode === "climbs" ? ArrowUpRight : ArrowDownRight;
  const arrowColor = mode === "climbs" ? colors.destructive : colors.positive;
  const mountainPosition = mode === "climbs" ? { right: 4, bottom: 4 } : { left: 3, top: 6 };
  const arrowPosition = mode === "climbs" ? { left: 3, top: 3 } : { right: 1, top: 3 };
  return (
    <View className="relative w-[30px] h-[30px]">
      <View className="absolute" style={mountainPosition}>
        <Mountain
          size={15}
          color={disabled ? colors.textTertiary : colors.warning}
          strokeWidth={2}
        />
      </View>
      <View className="absolute" style={arrowPosition}>
        <Arrow size={14} color={disabled ? colors.textTertiary : arrowColor} strokeWidth={2.8} />
      </View>
    </View>
  );
}

function SegmentPathIcon({ color, disabled }: { color: string; disabled: boolean }) {
  const colors = useThemeColors();
  const nodeOpacity = disabled ? 0.55 : 1;
  return (
    <View className="relative w-[30px] h-[30px] items-center justify-center">
      <Route size={22} color={color} strokeWidth={2} />
      <View
        className="absolute w-[7px] h-[7px] rounded-full border border-surface"
        style={{ left: 7, top: 5, backgroundColor: colors.positive, opacity: nodeOpacity }}
      />
      <View
        className="absolute w-[7px] h-[7px] rounded-full border border-surface"
        style={{ right: 7, bottom: 5, backgroundColor: colors.destructive, opacity: nodeOpacity }}
      />
    </View>
  );
}

function SwitchGlyph({ value, disabled }: { value: boolean; disabled?: boolean }) {
  return (
    <View
      className={cn(
        "w-[42px] h-[24px] rounded-full p-0.5 justify-center",
        value ? "bg-accent" : "bg-muted",
        disabled && "opacity-60",
      )}
    >
      <View
        className={cn(
          "w-[20px] h-[20px] rounded-full bg-background shadow-sm",
          value ? "self-end" : "self-start",
        )}
      />
    </View>
  );
}
