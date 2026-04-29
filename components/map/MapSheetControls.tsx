import React, { useEffect, useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { Bike, Compass, LocateFixed, Navigation } from "lucide-react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { GPS_STALE_THRESHOLD_MS, POSITION_AGE_VISIBLE_THRESHOLD_MS } from "@/constants";
import { cn } from "@/lib/cn";
import { useMapStore } from "@/store/mapStore";
import { useThemeColors } from "@/theme";
import { formatTimeDelta } from "@/utils/formatters";
import { isNorthUp } from "@/utils/mapHeading";

interface MapSheetControlsProps {
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
  const positionAge = usePositionAge();
  const isRefreshing = useMapStore((s) => s.isRefreshing);

  const iconSize = 24;
  const pulse = useSharedValue(0);
  const shouldPulse = isRefreshing && !isFollowActive;
  const locateIconOpacity = isFollowActive ? 1 : 0.72;

  useEffect(() => {
    if (shouldPulse) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(0, { duration: 300 });
    }
    // pulse is a Reanimated SharedValue with a stable ref; reading .value should not be a dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPulse]);

  const pulseStyle = useAnimatedStyle(
    () => ({
      opacity: locateIconOpacity * (shouldPulse ? 0.4 + pulse.value * 0.6 : 1),
    }),
    [locateIconOpacity, shouldPulse],
  );

  const compassDialStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${compassRotation.value}deg` }],
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
    <Animated.View style={pulseStyle}>
      <LocateFixed size={iconSize} color={activeIconColor} />
    </Animated.View>
  );
  const compassIconColor = isCompassActive
    ? colors.textPrimary
    : shouldUseNorthUpCompassVisual
      ? colors.textPrimary
      : colors.accent;
  const compassIconOpacity = isCompassActive
    ? 1
    : shouldUseNorthUpCompassVisual
      ? 0.72
      : 0.82;
  const compassNorthColor = colors.destructive;
  const compassTickColor = colors.textTertiary;
  const compassTickAngles = [90, 180, 270];

  return (
    <>
      <View className="relative overflow-visible items-center">
        <TouchableOpacity
          activeOpacity={1}
          className={cn(
            "w-[52px] h-[52px] rounded-full items-center justify-center shadow-md border",
            isCompassActive ? "bg-white border-gray-300" : "bg-surface/95 border-border-subtle",
          )}
          onPress={onCompassPress}
          onLongPress={onCompassLongPress}
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
            <Compass
              size={25}
              color={compassIconColor}
              strokeWidth={1.65}
              opacity={compassIconOpacity}
            />
            <Animated.View
              className="absolute items-center justify-start"
              style={[{ width: 50, height: 50, top: 1, left: 1 }, compassDialStyle]}
              pointerEvents="none"
            >
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
            className="absolute flex-row flex-nowrap items-center rounded-full px-2 py-0.5 bg-surface/95 border border-accent/40 shadow-sm"
            style={{ top: -10, right: -8, minWidth: 78, flexWrap: "nowrap", zIndex: 2, elevation: 2 }}
          >
            <Navigation size={11} color={colors.accent} />
            <Text numberOfLines={1} className="text-[11px] font-barlow-semibold text-accent ml-1">
              Heading
            </Text>
          </View>
        )}
      </View>

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
          onPress={onLocate}
          onLongPress={onFollowToggle}
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
            className="absolute flex-row items-center rounded-full px-2 py-0.5 bg-surface/95 border border-accent/40 shadow-sm"
            style={{ top: -10, right: -8, minWidth: 86, zIndex: 2, elevation: 2 }}
          >
            <Bike size={11} color={colors.accent} />
            <Text className="text-[11px] font-barlow-semibold text-accent ml-1">Following</Text>
          </View>
        )}
      </View>
    </>
  );
}
