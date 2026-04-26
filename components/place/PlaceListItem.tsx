import React, { useMemo } from "react";
import { View, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { Star } from "lucide-react-native";
import { useThemeColors } from "@/theme";
import { useSettingsStore } from "@/store/settingsStore";
import { usePoiStore } from "@/store/poiStore";
import { POI_CATEGORIES } from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";
import { getWaypointCategoryMeta, WAYPOINT_ICON_MAP } from "@/constants/waypointCategories";
import { ohStatusColorKey } from "@/constants/poiHelpers";
import { formatDistance, formatDuration, formatETA } from "@/utils/formatters";
import { getOpeningHoursStatus } from "@/services/openingHoursParser";
import { useEtaStore } from "@/store/etaStore";
import type { PlaceViewModel } from "@/types";

interface PlaceListItemProps {
  place: PlaceViewModel;
  currentDistAlongRoute: number | null;
  onPress: (place: PlaceViewModel) => void;
}

export default function PlaceListItem({
  place,
  currentDistAlongRoute,
  onPress,
}: PlaceListItemProps) {
  const colors = useThemeColors();
  const units = useSettingsStore((s) => s.units);
  const isWaypoint = place.entityType === "routeWaypoint";

  // Category visual mapping
  const catMeta = !isWaypoint ? POI_CATEGORIES.find((c) => c.key === place.category) : null;
  const wpMeta = isWaypoint ? getWaypointCategoryMeta(place.waypointType) : null;
  const meta = isWaypoint ? wpMeta : catMeta;
  const IconComp = isWaypoint
    ? WAYPOINT_ICON_MAP[wpMeta!.iconName]
    : catMeta
      ? POI_ICON_MAP[catMeta.iconName]
      : null;
  const displayColor = meta?.color ?? colors.textTertiary;

  // Starring (only POIs for now)
  const isStarred = usePoiStore((s) =>
    place.entityType === "downloadedPoi" ? s.starredPOIIds.has(place.entityId) : false,
  );

  // ETA (only for downloaded POIs)
  const getETAToPOI = useEtaStore((s) => s.getETAToPOI);
  const poiForETA = place.raw && place.entityType === "downloadedPoi" ? place.raw : null;
  const etaResult = useMemo(
    () => (poiForETA ? getETAToPOI(poiForETA as any) : null),
    [poiForETA, getETAToPOI],
  );

  const distAhead =
    currentDistAlongRoute != null
      ? place.effectiveDistanceAlongRouteMeters - currentDistAlongRoute
      : null;

  // Opening hours (downloaded POIs only)
  const ohStatus = useMemo(() => {
    const tag = place.openingHours;
    return tag ? getOpeningHoursStatus(tag) : null;
  }, [place.openingHours]);

  const ohColor = useMemo(() => {
    const key = ohStatusColorKey(ohStatus);
    return key ? colors[key] : undefined;
  }, [ohStatus, colors]);

  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3 border-b border-border"
      onPress={() => onPress(place)}
      accessibilityLabel={place.name ?? meta?.label ?? (isWaypoint ? "Waypoint" : "POI")}
    >
      <View
        className="w-[32px] h-[32px] rounded-full items-center justify-center"
        style={{ backgroundColor: displayColor + "1A" }}
      >
        {IconComp && <IconComp size={18} color={displayColor} />}
      </View>

      <View className="flex-1 ml-3">
        <View className="flex-row items-center">
          {isStarred && (
            <Star
              size={12}
              color={colors.warning}
              fill={colors.warning}
              style={{ marginRight: 4 }}
            />
          )}
          <Text
            className="text-[15px] font-barlow-medium text-foreground flex-shrink"
            numberOfLines={1}
          >
            {place.name ?? meta?.label ?? "Unnamed"}
          </Text>
          {isWaypoint && (
            <Text className="ml-1.5 text-[10px] text-muted-foreground/70 font-barlow-sc-medium">
              WP
            </Text>
          )}
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
          {!ohStatus && place.distanceFromRouteMeters > 50 && (
            <Text className="text-[11px] text-muted-foreground/60 font-barlow">
              {Math.round(place.distanceFromRouteMeters)} m off route
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
