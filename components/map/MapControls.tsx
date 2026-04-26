import React, { useEffect, useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Text } from "@/components/ui/text";
import { Locate, LocateFixed, Menu, Compass } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useSharedValue,
} from "react-native-reanimated";
import { cn } from "@/lib/cn";
import { useThemeColors } from "@/theme";
import { useMapStore } from "@/store/mapStore";
import { isNorthUp } from "@/utils/mapHeading";
import { formatTimeDelta } from "@/utils/formatters";
import { POSITION_AGE_VISIBLE_THRESHOLD_MS, GPS_STALE_THRESHOLD_MS } from "@/constants";

interface MapControlsProps {
  onLocate: () => void;
  heading?: number;
  onResetNorth?: () => void;
}

function usePositionAge() {
  const userPosition = useMapStore((s) => s.userPosition);
  const [, setTick] = useState(0);

  const ageMs = userPosition ? Date.now() - userPosition.timestamp : 0;
  const shouldShow = userPosition != null && ageMs >= POSITION_AGE_VISIBLE_THRESHOLD_MS;
  const isStale = ageMs >= GPS_STALE_THRESHOLD_MS;

  useEffect(() => {
    if (!shouldShow) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [shouldShow]);

  if (!shouldShow || !userPosition) return null;

  return { label: formatTimeDelta(ageMs), isStale };
}

export default function MapControls({ onLocate, heading, onResetNorth }: MapControlsProps) {
  const colors = useThemeColors();
  const { top: safeTop } = useSafeAreaInsets();
  const router = useRouter();
  const positionAge = usePositionAge();

  const followUser = useMapStore((s) => s.followUser);
  const isRefreshing = useMapStore((s) => s.isRefreshing);

  const locateColor = followUser ? colors.accentForeground : colors.textPrimary;
  const iconSize = positionAge ? 20 : 24;

  const pulse = useSharedValue(0);

  useEffect(() => {
    if (isRefreshing) {
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
  }, [isRefreshing]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: isRefreshing ? 0.4 + pulse.value * 0.6 : 1,
  }));

  const locateIcon = (
    <Animated.View style={pulseStyle}>
      {followUser ? (
        <LocateFixed size={iconSize} color={locateColor} />
      ) : (
        <Locate size={iconSize} color={locateColor} />
      )}
    </Animated.View>
  );

  const topControlOffset = safeTop + 12;
  const secondaryControlOffset = topControlOffset + 64;

  return (
    <>
      {/* Menu — top-left */}
      <View className="absolute left-4" style={{ top: topControlOffset }}>
        <TouchableOpacity
          className="w-[52px] h-[52px] rounded-xl items-center justify-center shadow-md bg-surface/95 border border-border-subtle"
          onPress={() => router.push("/menu")}
          accessibilityLabel="Open menu"
        >
          <Menu size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Navigation controls — below the status area, not in the top-right corner */}
      <View className="absolute right-4 items-center gap-3" style={{ top: secondaryControlOffset }}>
        {heading !== undefined && onResetNorth !== undefined && !isNorthUp(heading) && (
          <TouchableOpacity
            className="w-[52px] h-[52px] rounded-xl items-center justify-center shadow-md bg-surface/95 border border-border-subtle"
            onPress={onResetNorth}
            accessibilityLabel="Reset map north"
            accessibilityRole="button"
          >
            <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
              <Compass size={24} color={colors.textPrimary} />
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          className={cn(
            "w-[52px] min-h-[52px] rounded-xl items-center justify-center shadow-md",
            followUser ? "bg-primary" : "bg-surface/95 border border-border-subtle",
            positionAge ? "py-2" : "",
          )}
          onPress={onLocate}
          accessibilityLabel="Center on my location"
        >
          {locateIcon}
          {positionAge && !isRefreshing && (
            <Text
              className="text-[10px] font-barlow-semibold mt-1"
              style={{
                color: positionAge.isStale
                  ? colors.warning
                  : followUser
                    ? colors.accentForeground
                    : colors.textTertiary,
              }}
            >
              {positionAge.label}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );
}
