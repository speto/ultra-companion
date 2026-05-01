import React from "react";
import { View, TouchableOpacity, ScrollView } from "react-native";
import { MapPin, ChevronLeft, Star } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/theme";
import { useSettingsStore } from "@/store/settingsStore";
import { useRouteStore } from "@/store/routeStore";
import { useStarredStore } from "@/store/starredStore";
import { getWaypointCategoryMeta, WAYPOINT_ICON_MAP } from "@/constants/waypointCategories";
import { formatDistance } from "@/utils/formatters";
import type { PlaceViewModel } from "@/types";

interface InlineWaypointDetailProps {
  place: PlaceViewModel;
  onBack: () => void;
}

export default function InlineWaypointDetail({ place, onBack }: InlineWaypointDetailProps) {
  const colors = useThemeColors();
  const units = useSettingsStore((s) => s.units);
  const snappedPosition = useRouteStore((s) => s.snappedPosition);
  const toggleStarred = useStarredStore((s) => s.toggleStarred);
  const isStarred = useStarredStore((s) => s.starredKeys.has(`routeWaypoint:${place.entityId}`));
  const meta = getWaypointCategoryMeta(place.waypointType);
  const IconComp = WAYPOINT_ICON_MAP[meta.iconName];
  const distAhead =
    snappedPosition != null
      ? place.effectiveDistanceAlongRouteMeters - snappedPosition.distanceAlongRouteMeters
      : null;

  const label = place.name ?? meta.label ?? "Waypoint";

  return (
    <ScrollView className="flex-1 px-3 pt-1">
      <View className="flex-row items-center">
        <TouchableOpacity
          className="w-[32px] h-[32px] items-center justify-center"
          hitSlop={8}
          onPress={onBack}
          accessibilityLabel="Back to waypoint list"
        >
          <ChevronLeft size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View className="flex-1 mx-1">
          <Text className="text-[16px] font-barlow-semibold text-foreground" numberOfLines={1}>
            {label}
          </Text>
          <View className="flex-row items-center mt-1">
            {IconComp && <IconComp size={12} color={meta.color} />}
            <Text className="ml-1 text-[11px] font-barlow-medium" style={{ color: meta.color }}>
              {meta.label}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          className="w-[32px] h-[32px] items-center justify-center"
          hitSlop={8}
          onPress={() => toggleStarred("routeWaypoint", place.entityId)}
          accessibilityLabel={isStarred ? "Unstar waypoint" : "Star waypoint"}
        >
          <Star
            size={18}
            color={isStarred ? colors.starred : colors.textTertiary}
            fill={isStarred ? colors.starred : "none"}
          />
        </TouchableOpacity>
      </View>

      <View className="flex-row items-center mt-2">
        <MapPin size={13} color={colors.textSecondary} />
        <Text className="ml-1.5 text-[13px] text-muted-foreground font-barlow">
          {Math.round(place.distanceFromRouteMeters)} m off route
        </Text>
        {distAhead != null && (
          <Text className="ml-2 text-[13px] font-barlow-sc-semibold text-foreground">
            {distAhead >= 0
              ? `${formatDistance(distAhead, units)} ahead`
              : `${formatDistance(Math.abs(distAhead), units)} behind`}
          </Text>
        )}
      </View>

      {place.elevationMeters != null && (
        <Text className="mt-2 text-[13px] text-muted-foreground font-barlow">
          Elevation {Math.round(place.elevationMeters)} m
        </Text>
      )}

      {place.description && (
        <Text className="mt-3 text-[13px] text-foreground font-barlow leading-5">
          {place.description}
        </Text>
      )}
    </ScrollView>
  );
}
