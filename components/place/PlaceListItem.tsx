import React, { useCallback, useMemo } from "react";
import { Linking, Pressable, View, TouchableOpacity } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { Text } from "@/components/ui/text";
import { ListDivider } from "@/components/ui/list-divider";
import {
  Clock,
  ExternalLink as ExternalMapIcon,
  Flag,
  MapPin,
  Phone,
  Star,
} from "lucide-react-native";
import { useThemeColors } from "@/theme";
import { useSettingsStore } from "@/store/settingsStore";
import { useStarredStore } from "@/store/starredStore";
import { POI_CATEGORIES } from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";
import { getWaypointCategoryMeta, WAYPOINT_ICON_MAP } from "@/constants/waypointCategories";
import { ohStatusColorKey } from "@/constants/poiHelpers";
import { formatDistance, formatDuration, formatETA, formatElevation } from "@/utils/formatters";
import { getDaySchedules, getOpeningHoursStatus, isOpenAt } from "@/services/openingHoursParser";
import { useEtaStore } from "@/store/etaStore";
import { isFoodShopCategory } from "@/utils/placeAdapter";
import {
  buildPhoneUrl,
  getPoiAddress,
  getPoiExtraDetailFields,
  getPoiPhone,
  hasExpandablePoiDetails,
} from "@/utils/poiActions";
import { openPoiInMaps } from "@/services/poiMapLink";
import type { PlaceViewModel, POI } from "@/types";

interface PlaceListItemProps {
  place: PlaceViewModel;
  currentDistAlongRoute: number | null;
  onPress: (place: PlaceViewModel) => void;
  expanded?: boolean;
  onToggleExpansion?: (place: PlaceViewModel) => void;
  segmentName?: string | null;
  showAbsoluteDistance?: boolean;
  showDivider?: boolean;
}

function PlaceListItem({
  place,
  currentDistAlongRoute,
  onPress,
  expanded = false,
  onToggleExpansion,
  segmentName = null,
  showAbsoluteDistance = false,
  showDivider = true,
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
  const toggleStarred = useStarredStore((s) => s.toggleStarred);
  const starredAccessibilityLabel = isWaypoint
    ? isStarred
      ? "Unsave waypoint"
      : "Save waypoint"
    : isStarred
      ? "Unsave POI"
      : "Save POI";
  const handleStarPress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      toggleStarred(place.entityType, place.entityId);
    },
    [place.entityId, place.entityType, toggleStarred],
  );

  // ETA (only for downloaded POIs)
  const getETAToPOI = useEtaStore((s) => s.getETAToPOI);
  const etaRouteId = useEtaStore((s) => s.routeId);
  const etaCacheVersion = useEtaStore((s) => s.cacheVersion);
  const etaCachedPointsLength = useEtaStore((s) => s.cachedPoints?.length ?? 0);
  const etaCumulativeTimeLength = useEtaStore((s) => s.cumulativeTime?.length ?? 0);
  const etaCacheKey = `${etaRouteId ?? ""}:${etaCacheVersion}:${etaCachedPointsLength}:${etaCumulativeTimeLength}`;
  const poiForETA = place.raw && place.entityType === "downloadedPoi" ? (place.raw as POI) : null;
  const etaResult = useMemo(() => {
    void etaCacheKey;
    return poiForETA ? getETAToPOI(poiForETA) : null;
  }, [etaCacheKey, poiForETA, getETAToPOI]);

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
    : [!ohStatus ? offRouteText : null];
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

    const arrivalTime = formatETA(etaResult.eta);

    const tag = place.openingHours;
    if (!tag) {
      return { label: `Hours unknown · ${arrivalTime}`, color: colors.textTertiary };
    }

    const openAtEta = isOpenAt(tag, etaResult.eta);
    if (openAtEta == null) {
      return { label: `Hours unknown · ${arrivalTime}`, color: colors.textTertiary };
    }

    const statusAtEta = getOpeningHoursStatus(tag, etaResult.eta);
    if (openAtEta) {
      return {
        label: `${statusAtEta?.closingSoon ? "Tight" : "Open"} at ${arrivalTime}`,
        color: statusAtEta?.closingSoon ? colors.warning : colors.positive,
      };
    }

    return {
      label: `Closed at ${arrivalTime}`,
      color: colors.textTertiary,
    };
  }, [colors, etaResult, isWaypoint, place.category, place.openingHours]);

  const openingHoursRaw = poiForETA?.tags.opening_hours ?? null;
  const daySchedules = useMemo(
    () => (openingHoursRaw ? getDaySchedules(openingHoursRaw) : null),
    [openingHoursRaw],
  );
  const address = useMemo(() => (poiForETA ? getPoiAddress(poiForETA) : null), [poiForETA]);
  const phone = useMemo(() => (poiForETA ? getPoiPhone(poiForETA) : null), [poiForETA]);
  const phoneUrl = useMemo(() => (phone ? buildPhoneUrl(phone) : null), [phone]);
  const extraDetailFields = useMemo(
    () => (poiForETA ? getPoiExtraDetailFields(poiForETA) : []),
    [poiForETA],
  );
  const hasExpandedInlineDetails = Boolean(
    (daySchedules?.length && ohStatus?.detail !== "24/7") ||
    address ||
    phone ||
    extraDetailFields.length > 0,
  );
  const canExpand = Boolean(
    poiForETA && hasExpandablePoiDetails(poiForETA) && hasExpandedInlineDetails,
  );
  const isExpanded = canExpand && expanded;

  const handleRowPress = useCallback(() => {
    onPress(place);
    if (canExpand) onToggleExpansion?.(place);
  }, [canExpand, onPress, onToggleExpansion, place]);

  const handleMapPress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (poiForETA) void openPoiInMaps(poiForETA);
    },
    [poiForETA],
  );

  const handlePhonePress = useCallback(
    (event?: GestureResponderEvent) => {
      event?.stopPropagation();
      if (phoneUrl) void Linking.openURL(phoneUrl);
    },
    [phoneUrl],
  );

  return (
    <View className="relative">
      <Pressable
        className={`px-4 pt-3 ${isExpanded ? "pb-0" : "pb-3"}`}
        onPress={handleRowPress}
        accessibilityLabel={place.name ?? meta?.label ?? (isWaypoint ? "Waypoint" : "POI")}
        accessibilityRole={canExpand ? "button" : undefined}
        accessibilityState={canExpand ? { expanded: isExpanded } : undefined}
      >
        <View className="flex-row items-center">
          <View
            className="w-[32px] h-[32px] rounded-full items-center justify-center"
            style={{ backgroundColor: displayColor + "1A" }}
          >
            {IconComp && <IconComp size={18} color={displayColor} />}
          </View>

          <View className="flex-1 ml-3">
            <View className="flex-row items-center">
              <TouchableOpacity
                className="w-[32px] h-[32px] items-center justify-center -ml-2 mr-0.5"
                hitSlop={8}
                onPress={handleStarPress}
                activeOpacity={0.7}
                accessibilityLabel={starredAccessibilityLabel}
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
                {place.name ?? meta?.label ?? "Unnamed"}
              </Text>
            </View>
            <View className="flex-row items-center mt-1">
              {ohStatus && (
                <View className="flex-row items-center">
                  <Clock size={11} color={ohColor} />
                  <Text className="ml-1 text-[12px] font-barlow-medium" style={{ color: ohColor }}>
                    {ohStatus.label}
                    {ohStatus.detail ? ` · ${ohStatus.detail}` : ""}
                    {metadataText ? ` · ${metadataText}` : ""}
                  </Text>
                </View>
              )}
              {!ohStatus && metadataText && (
                <Text className="text-[11px] text-muted-foreground/60 font-barlow">
                  {metadataText}
                </Text>
              )}
            </View>
            {etaAvailability && (
              <View className="flex-row items-center mt-1">
                <Flag size={11} color={etaAvailability.color} />
                <Text
                  className="ml-1 text-[11px] font-barlow-semibold"
                  style={{ color: etaAvailability.color }}
                >
                  {etaAvailability.label}
                </Text>
              </View>
            )}
          </View>

          <View className="flex-row items-center ml-2">
            <View className="items-end">
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
            {poiForETA && (
              <TouchableOpacity
                className="ml-3 h-[48px] w-[48px] items-center justify-center rounded-full bg-accent/10"
                onPress={handleMapPress}
                activeOpacity={0.72}
                accessibilityLabel={`Open ${place.name ?? meta?.label ?? "POI"} in external map app`}
                accessibilityRole="button"
              >
                <ExternalMapIcon size={19} color={colors.accent} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Pressable>

      {isExpanded && poiForETA && (
        <View className="ml-[60px] mr-4 mt-2 border-l border-border-subtle pl-3 pb-4">
          {daySchedules && ohStatus?.detail !== "24/7" && (
            <View className="pt-1">
              {daySchedules.map((ds) => (
                <View key={ds.label} className="flex-row items-center">
                  <Text className="w-[60px] text-[12px] font-barlow-medium text-muted-foreground">
                    {ds.label}
                  </Text>
                  <Text className="text-[12px] font-barlow-sc-medium text-muted-foreground">
                    {ds.hours}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {address && (
            <View className="mt-2 flex-row items-center">
              <MapPin size={13} color={colors.textSecondary} />
              <Text
                selectable
                className="ml-1.5 flex-1 text-[13px] font-barlow text-muted-foreground"
              >
                {address}
              </Text>
            </View>
          )}
          {phone && phoneUrl && (
            <View className="mt-1 min-h-[48px] flex-row items-center py-2">
              <Phone size={13} color={colors.textSecondary} />
              <Text
                selectable
                className="ml-1.5 text-[13px] font-barlow-semibold text-accent"
                onPress={handlePhonePress}
                accessibilityRole="button"
                accessibilityLabel={`Call ${phone}`}
              >
                {phone}
              </Text>
            </View>
          )}
          {phone && !phoneUrl && (
            <View className="mt-2 flex-row items-center">
              <Phone size={13} color={colors.textSecondary} />
              <Text className="ml-1.5 text-[13px] font-barlow text-muted-foreground">{phone}</Text>
            </View>
          )}
          {extraDetailFields.map((field) => (
            <View key={`${field.label}:${field.value}`} className="mt-2 flex-row">
              <Text className="w-[82px] text-[12px] font-barlow-semibold text-muted-foreground">
                {field.label}
              </Text>
              <Text className="flex-1 text-[12px] font-barlow-medium text-foreground">
                {field.value}
              </Text>
            </View>
          ))}
          {poiForETA.source === "google" && (
            <Text className="mt-2 text-[10px] font-barlow text-muted-foreground" numberOfLines={1}>
              Powered by Google
            </Text>
          )}
        </View>
      )}
      {showDivider ? <ListDivider className="absolute bottom-0 left-[60px] right-0" /> : null}
    </View>
  );
}

export default React.memo(PlaceListItem);
