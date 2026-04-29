import React, { useCallback, useMemo } from "react";
import { View, TouchableOpacity } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { Text } from "@/components/ui/text";
import { Star } from "lucide-react-native";
import { useThemeColors } from "@/theme";
import { useSettingsStore } from "@/store/settingsStore";
import { useStarredStore } from "@/store/starredStore";
import { POI_CATEGORIES } from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";
import { ohStatusColorKey } from "@/constants/poiHelpers";
import { formatDistance, formatDuration, formatETA } from "@/utils/formatters";
import { getOpeningHoursStatus } from "@/services/openingHoursParser";
import { useEtaStore } from "@/store/etaStore";
import type { POI } from "@/types";

interface POIListItemProps {
  poi: POI;
  currentDistAlongRoute: number | null;
  onPress: (poi: POI) => void;
}

export default function POIListItem({ poi, currentDistAlongRoute, onPress }: POIListItemProps) {
  const colors = useThemeColors();
  const units = useSettingsStore((s) => s.units);

  const catMeta = POI_CATEGORIES.find((c) => c.key === poi.category);
  const IconComp = catMeta ? POI_ICON_MAP[catMeta.iconName] : null;

  const isStarred = useStarredStore((s) => s.starredKeys.has(`downloadedPoi:${poi.id}`));
  const toggleStarred = useStarredStore((s) => s.toggleStarred);
  const getETAToPOI = useEtaStore((s) => s.getETAToPOI);
  const handleStarPress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      toggleStarred("downloadedPoi", poi.id);
    },
    [poi.id, toggleStarred],
  );

  const distAhead =
    currentDistAlongRoute != null ? poi.distanceAlongRouteMeters - currentDistAlongRoute : null;

  const etaResult = useMemo(() => getETAToPOI(poi), [poi, getETAToPOI]);

  const ohStatus = useMemo(() => {
    const tag = poi.tags?.opening_hours;
    return tag ? getOpeningHoursStatus(tag) : null;
  }, [poi.tags?.opening_hours]);

  const ohColor = useMemo(() => {
    const key = ohStatusColorKey(ohStatus);
    return key ? colors[key] : undefined;
  }, [ohStatus, colors]);

  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3 border-b border-border"
      onPress={() => onPress(poi)}
      accessibilityLabel={poi.name ?? catMeta?.label ?? "POI"}
    >
      <View
        className="w-[32px] h-[32px] rounded-full items-center justify-center"
        style={{ backgroundColor: (catMeta?.color ?? colors.textTertiary) + "1A" }}
      >
        {IconComp && <IconComp size={18} color={catMeta?.color ?? colors.textPrimary} />}
      </View>

      <View className="flex-1 ml-3">
        <View className="flex-row items-center">
          <TouchableOpacity
            className="w-[32px] h-[32px] items-center justify-center -ml-2 mr-0.5"
            hitSlop={8}
            onPress={handleStarPress}
            activeOpacity={0.7}
            accessibilityLabel={isStarred ? "Unsave POI" : "Save POI"}
            accessibilityRole="switch"
            accessibilityState={{ checked: isStarred }}
          >
            <Star
              size={17}
              color={isStarred ? colors.starred : colors.textTertiary}
              fill={isStarred ? colors.starred : "none"}
            />
          </TouchableOpacity>
          <Text
            className="text-[15px] font-barlow-medium text-foreground flex-shrink"
            numberOfLines={1}
          >
            {poi.name ?? catMeta?.label ?? "Unnamed"}
          </Text>
        </View>
        <View className="flex-row items-center mt-1">
          {ohStatus && (
            <View className="flex-row items-center">
              <View className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: ohColor }} />
              <Text className="ml-1 text-[12px] font-barlow-medium" style={{ color: ohColor }}>
                {ohStatus.label}
                {ohStatus.detail ? ` · ${ohStatus.detail}` : ""}
              </Text>
            </View>
          )}
          {ohStatus && poi.distanceFromRouteMeters > 50 && (
            <Text className="text-[11px] text-muted-foreground/60 font-barlow ml-2">
              {Math.round(poi.distanceFromRouteMeters)} m off
            </Text>
          )}
          {!ohStatus && poi.distanceFromRouteMeters > 50 && (
            <Text className="text-[11px] text-muted-foreground/60 font-barlow">
              {Math.round(poi.distanceFromRouteMeters)} m off route
            </Text>
          )}
        </View>
      </View>

      <View className="items-end ml-2">
        {distAhead != null && (
          <Text className="text-[15px] font-barlow-sc-semibold text-foreground">
            {distAhead >= 0
              ? formatDistance(distAhead, units)
              : `-${formatDistance(Math.abs(distAhead), units)}`}
          </Text>
        )}
        {etaResult && etaResult.ridingTimeSeconds > 0 ? (
          <Text className="text-[11px] text-muted-foreground font-barlow-sc-medium">
            ~{formatDuration(etaResult.ridingTimeSeconds)} · {formatETA(etaResult.eta)}
          </Text>
        ) : distAhead != null ? (
          <Text className="text-[11px] text-muted-foreground font-barlow">
            {distAhead >= 0 ? "ahead" : "behind"}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
