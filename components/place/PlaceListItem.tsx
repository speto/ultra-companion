import React, { useMemo } from "react";
import { View, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { Clock, Star } from "lucide-react-native";
import { useThemeColors } from "@/theme";
import { useSettingsStore } from "@/store/settingsStore";
import { useStarredStore } from "@/store/starredStore";
import { POI_CATEGORIES } from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";
import { getWaypointCategoryMeta, WAYPOINT_ICON_MAP } from "@/constants/waypointCategories";
import { ohStatusColorKey } from "@/constants/poiHelpers";
import { formatDistance, formatDuration, formatETA, formatElevation } from "@/utils/formatters";
import { getOpeningHoursStatus, isOpenAt } from "@/services/openingHoursParser";
import { useEtaStore } from "@/store/etaStore";
import { isFoodShopCategory } from "@/utils/placeAdapter";
import type { PlaceViewModel } from "@/types";

interface PlaceListItemProps {
  place: PlaceViewModel;
  currentDistAlongRoute: number | null;
  onPress: (place: PlaceViewModel) => void;
  segmentName?: string | null;
  showAbsoluteDistance?: boolean;
}

export default function PlaceListItem({
  place,
  currentDistAlongRoute,
  onPress,
  segmentName = null,
  showAbsoluteDistance = false,
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

  const isStarred = useStarredStore((s) =>
    s.starredKeys.has(`${place.entityType}:${place.entityId}`),
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

  const categoryLabel = meta?.label ?? (isWaypoint ? "Waypoint" : "POI");
  const elevationText =
    isWaypoint && place.elevationMeters != null
      ? formatElevation(place.elevationMeters, units)
      : null;
  const offRouteThreshold = isWaypoint ? 0 : 50;
  const offRouteText =
    place.distanceFromRouteMeters > offRouteThreshold
      ? `${formatDistance(place.distanceFromRouteMeters, units)} off route`
      : null;

  const metadataParts = isWaypoint
    ? [categoryLabel, segmentName, elevationText, offRouteText]
    : [segmentName, !ohStatus ? offRouteText : null];
  const metadataText = metadataParts.filter(Boolean).join(" · ");

  const absoluteDistance = formatDistance(place.effectiveDistanceAlongRouteMeters, units);
  const shouldShowAbsoluteDistance = showAbsoluteDistance || isWaypoint;
  const rightPrimaryText =
    distAhead != null
      ? formatDistance(Math.abs(distAhead), units)
      : shouldShowAbsoluteDistance
        ? absoluteDistance
        : null;
  const directionText = distAhead != null ? (distAhead >= 0 ? "ahead" : "behind") : null;
  const rightSecondaryText = useMemo(() => {
    if (etaResult && etaResult.ridingTimeSeconds > 0) {
      return `~${formatDuration(etaResult.ridingTimeSeconds)} · ${formatETA(etaResult.eta)}`;
    }

    const parts = [directionText];
    if (distAhead != null && shouldShowAbsoluteDistance) {
      parts.push(`at ${absoluteDistance}`);
    }
    return parts.filter(Boolean).join(" · ") || null;
  }, [absoluteDistance, directionText, distAhead, etaResult, shouldShowAbsoluteDistance]);

  const etaAvailability = useMemo(() => {
    if (isWaypoint || !isFoodShopCategory(place.category) || !etaResult) return null;

    const tag = place.openingHours;
    if (!tag) {
      return { label: "Hours unknown", color: colors.textTertiary };
    }

    const openAtEta = isOpenAt(tag, etaResult.eta);
    if (openAtEta == null) {
      return { label: "Hours unknown", color: colors.textTertiary };
    }

    const statusAtEta = getOpeningHoursStatus(tag, etaResult.eta);
    if (openAtEta) {
      const label = statusAtEta?.closingSoon ? "Tight" : "Open on arrival";
      const detail = statusAtEta?.detail ? ` · ${statusAtEta.detail}` : "";
      return {
        label: `${label}${detail}`,
        color: statusAtEta?.closingSoon ? colors.warning : colors.positive,
      };
    }

    return {
      label: statusAtEta?.detail
        ? `Closed on arrival · ${statusAtEta.detail}`
        : "Closed on arrival",
      color: colors.textTertiary,
    };
  }, [colors, etaResult, isWaypoint, place.category, place.openingHours]);

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
        </View>
        <View className="flex-row items-center mt-1">
          {ohStatus && (
            <View className="flex-row items-center">
              <View className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: ohColor }} />
              <Text className="ml-1 text-[12px] font-barlow-medium" style={{ color: ohColor }}>
                {ohStatus.label}
                {ohStatus.detail ? ` · ${ohStatus.detail}` : ""}
                {metadataText ? ` · ${metadataText}` : ""}
              </Text>
            </View>
          )}
          {!ohStatus && metadataText && (
            <Text className="text-[11px] text-muted-foreground/60 font-barlow">{metadataText}</Text>
          )}
        </View>
        {etaAvailability && (
          <View className="flex-row items-center mt-1">
            <Clock size={11} color={etaAvailability.color} />
            <Text
              className="ml-1 text-[11px] font-barlow-semibold"
              style={{ color: etaAvailability.color }}
            >
              {etaAvailability.label}
            </Text>
          </View>
        )}
      </View>

      <View className="items-end ml-2">
        {rightPrimaryText && (
          <Text className="text-[15px] font-barlow-sc-semibold text-foreground">
            {rightPrimaryText}
          </Text>
        )}
        {rightSecondaryText ? (
          <Text className="text-[11px] text-muted-foreground font-barlow-sc-medium">
            {rightSecondaryText}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
