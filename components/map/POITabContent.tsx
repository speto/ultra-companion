import React, { useMemo, useState, useCallback, useDeferredValue } from "react";
import {
  View,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput as RNTextInput,
  Linking,
} from "react-native";
import Animated, { useAnimatedStyle, interpolate, Extrapolation } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Star, MapPin, Clock, ChevronLeft, Phone, Search } from "lucide-react-native";
import { useThemeColors } from "@/theme";
import { useSettingsStore } from "@/store/settingsStore";
import { useRouteStore } from "@/store/routeStore";
import { usePoiStore } from "@/store/poiStore";
import { usePanelStore } from "@/store/panelStore";
import { useEtaStore } from "@/store/etaStore";
import { useActiveRouteData } from "@/hooks/useActiveRouteData";
import { POI_CATEGORIES, POI_BEHIND_THRESHOLD_M } from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";
import { ohStatusColorKey } from "@/constants/poiHelpers";
import { formatDistance, formatDuration, formatETA } from "@/utils/formatters";
import { horizonWindow } from "@/utils/horizon";
import { getOpeningHoursStatus, isOpenAt, getDaySchedules } from "@/services/openingHoursParser";
import POIFilterBar from "@/components/map/POIFilterBar";
import {
  buildAppleMapsUrl,
  buildGoogleMapsUrl,
  buildMapyActionLabel,
  buildMapyUrl,
  buildPhoneUrl,
  shouldPromoteMapy,
} from "@/utils/poiActions";
import type { ActiveRouteData, POI, PlaceViewModel } from "@/types";
import { usePlaceStore } from "@/store/placeStore";
import { useStarredStore } from "@/store/starredStore";
import PlaceListItem from "@/components/place/PlaceListItem";
import { isFoodShopCategory } from "@/utils/placeAdapter";

interface POITabContentProps {
  activeData: ActiveRouteData | null;
  sheetTranslateY?: SharedValue<number>;
  compactOffset?: number;
}

export default function POITabContent({
  activeData,
  sheetTranslateY,
  compactOffset,
}: POITabContentProps) {
  const colors = useThemeColors();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const snappedPosition = useRouteStore((s) => s.snappedPosition);
  const starredKeys = useStarredStore((s) => s.starredKeys);
  const selectedPOI = usePoiStore((s) => s.selectedPOI);
  const setSelectedPOI = usePoiStore((s) => s.setSelectedPOI);
  const allPois = usePoiStore((s) => s.pois);
  const enabledCategories = usePoiStore((s) => s.enabledCategories);
  const showOpenOnly = usePoiStore((s) => s.showOpenOnly);
  const showSavedOnly = usePoiStore((s) => s.showSavedOnly);
  const foodAvailabilityMode = usePoiStore((s) => s.foodAvailabilityMode);
  const foodAvailabilityCustomTime = usePoiStore((s) => s.foodAvailabilityCustomTime);
  const getETAToPOI = useEtaStore((s) => s.getETAToPOI);
  const isExpanded = usePanelStore((s) => s.isExpanded);
  const horizon = usePanelStore((s) => s.horizon);

  const [searchQuery, setSearchQuery] = useState("");

  const routeIds = useMemo(() => activeData?.routeIds ?? [], [activeData?.routeIds]);
  const segments = activeData?.segments ?? null;
  const segmentNameByRouteId = useMemo(
    () => new Map((segments ?? []).map((segment) => [segment.routeId, segment.routeName])),
    [segments],
  );
  const currentDist = snappedPosition?.distanceAlongRouteMeters ?? null;
  const horizonEndDist = useMemo(() => {
    if (currentDist == null || !activeData) return null;
    return horizonWindow(currentDist, horizon, activeData.totalDistanceMeters).endDist;
  }, [currentDist, horizon, activeData]);

  const allPlaces = usePlaceStore((s) => s.places);
  const selectedPlace = usePlaceStore((s) => s.selectedPlace);
  const setSelectedPlace = usePlaceStore((s) => s.setSelectedPlace);

  const totalPOICount = usePoiStore((s) => {
    let count = 0;
    for (const routeId of routeIds) {
      count += s.pois[routeId]?.length ?? 0;
    }
    return count;
  });

  // --- Expanded: full place list with search + filters ---
  const visiblePlaces = useMemo(() => {
    const startedAt = __DEV__ ? Date.now() : 0;
    const getStitchedVisible = usePlaceStore.getState().getStitchedVisiblePlaces;
    let result: PlaceViewModel[];
    if (segments) {
      result = getStitchedVisible(segments, routeIds);
    } else if (routeIds.length > 0) {
      result = usePlaceStore.getState().getVisiblePlaces(routeIds[0]);
    } else {
      result = [];
    }

    if (__DEV__) {
      console.info(
        `[poi-filter] visiblePlaces=${result.length} derived in ${Date.now() - startedAt}ms`,
      );
    }
    return result;
    // allPois/enabledCategories/showOpenOnly/starredKeys/allPlaces are reactivity triggers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isExpanded,
    routeIds,
    segments,
    allPois,
    enabledCategories,
    showOpenOnly,
    showSavedOnly,
    foodAvailabilityMode,
    starredKeys,
    allPlaces,
  ]);
  const sortedPlaces = useMemo(() => {
    if (currentDist == null) {
      return [...visiblePlaces].sort(
        (a, b) => a.effectiveDistanceAlongRouteMeters - b.effectiveDistanceAlongRouteMeters,
      );
    }
    return visiblePlaces
      .filter(
        (p) =>
          p.effectiveDistanceAlongRouteMeters >= currentDist - POI_BEHIND_THRESHOLD_M &&
          (horizonEndDist == null || p.effectiveDistanceAlongRouteMeters <= horizonEndDist),
      )
      .sort((a, b) => a.effectiveDistanceAlongRouteMeters - b.effectiveDistanceAlongRouteMeters);
  }, [visiblePlaces, currentDist, horizonEndDist]);

  const availabilityFilteredPlaces = useMemo(
    () =>
      filterByFoodAvailability(
        sortedPlaces,
        foodAvailabilityMode,
        foodAvailabilityCustomTime,
        getETAToPOI,
      ),
    [foodAvailabilityCustomTime, foodAvailabilityMode, getETAToPOI, sortedPlaces],
  );

  const searchFilteredPlaces = useMemo(() => {
    if (!searchQuery.trim()) return availabilityFilteredPlaces;
    const q = searchQuery.trim().toLowerCase();
    return availabilityFilteredPlaces.filter((p) => p.name?.toLowerCase().includes(q));
  }, [availabilityFilteredPlaces, searchQuery]);

  const deferredSearchFilteredPlaces = useDeferredValue(searchFilteredPlaces);
  const deferredAvailabilityFilteredPlaces = useDeferredValue(availabilityFilteredPlaces);

  const handlePlacePress = useCallback(
    (place: PlaceViewModel) => {
      setSelectedPlace(place);
    },
    [setSelectedPlace],
  );

  const renderItem = useCallback(
    ({ item }: { item: PlaceViewModel }) => (
      <PlaceListItem
        place={item}
        currentDistAlongRoute={currentDist}
        segmentName={segmentNameByRouteId.get(item.routeId) ?? null}
        showAbsoluteDistance={segments != null}
        onPress={handlePlacePress}
      />
    ),
    [currentDist, segmentNameByRouteId, segments, handlePlacePress],
  );

  const searchAnimatedStyle = useAnimatedStyle(() => {
    if (!sheetTranslateY || !compactOffset) {
      return {
        height: isExpanded ? 48 : 0,
        opacity: isExpanded ? 1 : 0,
        overflow: "hidden",
      };
    }

    const height = interpolate(
      sheetTranslateY.value,
      [0, compactOffset],
      [48, 0],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      sheetTranslateY.value,
      [0, compactOffset * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    );

    return { height, opacity, overflow: "hidden" };
  });

  // Show inline detail when a place is selected
  if (selectedPlace?.entityType === "downloadedPoi") {
    const poi = selectedPOI ?? (selectedPlace.raw as POI | undefined);
    if (poi) {
      return (
        <InlinePOIDetail
          poi={poi}
          onBack={() => {
            setSelectedPlace(null);
            setSelectedPOI(null);
          }}
        />
      );
    }
  }

  // Empty state — no downloaded POI data at all
  if (totalPOICount === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <MapPin size={24} color={colors.textTertiary} />
        <Text className="text-[13px] text-muted-foreground font-barlow-medium mt-2">
          No POIs on this route
        </Text>
        <Text className="text-[11px] text-muted-foreground mt-1">
          Fetch POI data from the route detail screen
        </Text>
      </View>
    );
  }

  const listData = isExpanded ? deferredSearchFilteredPlaces : deferredAvailabilityFilteredPlaces;

  return (
    <View className="flex-1">
      <Animated.View style={searchAnimatedStyle}>
        <View
          className="flex-row items-center px-4 py-2"
          style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, height: 48 }}
        >
          <Search size={16} color={colors.textTertiary} />
          <RNTextInput
            className="flex-1 ml-2 text-[15px] font-barlow text-foreground"
            placeholder="Search by name..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search POIs"
          />
        </View>
      </Animated.View>

      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }}>
        <POIFilterBar routeIds={routeIds} />
      </View>

      {listData.length > 0 ? (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.placeId}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: isExpanded ? 8 : safeBottom }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={3}
          removeClippedSubviews={true}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <MapPin size={20} color={colors.textTertiary} />
          <Text className="text-[12px] text-muted-foreground font-barlow-medium mt-2">
            No POIs match filters
          </Text>
        </View>
      )}
    </View>
  );
}

function filterByFoodAvailability(
  places: PlaceViewModel[],
  mode: string,
  customTime: string | null,
  getETAToPOI: (poi: POI) => { eta: Date } | null,
) {
  if (mode === "off" || mode === "now") return places;

  const customDate = mode === "custom" && customTime ? new Date(customTime) : null;
  if (mode === "custom" && (!customDate || Number.isNaN(customDate.getTime()))) return places;

  return places.filter((place) => {
    if (place.entityType !== "downloadedPoi") return true;
    if (!isFoodShopCategory(place.category)) return true;
    if (!place.openingHours) return true;

    const targetTime = mode === "eta" ? getETAToPOI(place.raw as POI)?.eta : customDate;
    if (!targetTime) return true;

    return isOpenAt(place.openingHours, targetTime) !== false;
  });
}

function InlinePOIDetail({ poi, onBack }: { poi: POI; onBack: () => void }) {
  const colors = useThemeColors();
  const units = useSettingsStore((s) => s.units);
  const snappedPosition = useRouteStore((s) => s.snappedPosition);
  const toggleStarred = useStarredStore((s) => s.toggleStarred);
  const isStarred = useStarredStore((s) => s.starredKeys.has(`downloadedPoi:${poi.id}`));
  const getETAToPOI = useEtaStore((s) => s.getETAToPOI);
  const activeData = useActiveRouteData();

  const catMeta = POI_CATEGORIES.find((c) => c.key === poi.category);
  const IconComp = catMeta ? POI_ICON_MAP[catMeta.iconName] : null;

  const distAhead = useMemo(() => {
    if (!snappedPosition) return null;
    let poiDist = poi.distanceAlongRouteMeters;
    if (activeData?.segments) {
      const seg = activeData.segments.find((s) => s.routeId === poi.routeId);
      if (seg) poiDist += seg.distanceOffsetMeters;
    }
    return poiDist - snappedPosition.distanceAlongRouteMeters;
  }, [poi, snappedPosition, activeData]);

  const etaResult = useMemo(() => getETAToPOI(poi), [poi, getETAToPOI]);

  const openingHoursRaw = poi.tags?.opening_hours;
  const ohStatus = useMemo(
    () => (openingHoursRaw ? getOpeningHoursStatus(openingHoursRaw) : null),
    [openingHoursRaw],
  );
  const ohColor = useMemo(() => {
    const key = ohStatusColorKey(ohStatus);
    return key ? colors[key] : colors.textSecondary;
  }, [ohStatus, colors]);
  const ohText = useMemo(() => {
    if (!ohStatus) return null;
    if (ohStatus.detail === "24/7") return "Open 24/7";
    return ohStatus.detail ? `${ohStatus.label} · ${ohStatus.detail}` : ohStatus.label;
  }, [ohStatus]);

  const daySchedules = useMemo(
    () => (openingHoursRaw ? getDaySchedules(openingHoursRaw) : null),
    [openingHoursRaw],
  );

  const etaOpenStatus = useMemo(() => {
    if (!etaResult || !openingHoursRaw) return null;
    return isOpenAt(openingHoursRaw, etaResult.eta);
  }, [etaResult, openingHoursRaw]);

  const address = useMemo(() => {
    const t = poi.tags;
    if (t.formatted_address) return t.formatted_address;
    const parts: string[] = [];
    if (t["addr:street"]) {
      const num = t["addr:housenumber"] ? ` ${t["addr:housenumber"]}` : "";
      parts.push(`${t["addr:street"]}${num}`);
    }
    if (t["addr:city"]) parts.push(t["addr:city"]);
    return parts.length > 0 ? parts.join(", ") : null;
  }, [poi]);

  const phone = poi.tags?.phone ?? poi.tags?.["contact:phone"] ?? null;
  const phoneUrl = phone ? buildPhoneUrl(phone) : null;
  const mapyIsProminent = shouldPromoteMapy(poi);

  const openUrl = useCallback(async (url: string) => {
    await Linking.openURL(url);
  }, []);

  return (
    <ScrollView className="flex-1 px-3 pt-1">
      {/* Header: back + name + star */}
      <View className="flex-row items-center">
        <TouchableOpacity
          className="w-[32px] h-[32px] items-center justify-center"
          hitSlop={8}
          onPress={onBack}
          accessibilityLabel="Back to POI list"
        >
          <ChevronLeft size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View className="flex-1 mx-1">
          <Text className="text-[16px] font-barlow-semibold text-foreground" numberOfLines={1}>
            {poi.name ?? catMeta?.label ?? "Unnamed"}
          </Text>
          {catMeta && (
            <View className="flex-row items-center mt-1">
              {IconComp && <IconComp size={12} color={catMeta.color} />}
              <Text
                className="ml-1 text-[11px] font-barlow-medium"
                style={{ color: catMeta.color }}
              >
                {catMeta.label}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          className="w-[32px] h-[32px] items-center justify-center"
          hitSlop={8}
          onPress={() => toggleStarred("downloadedPoi", poi.id)}
          accessibilityLabel={isStarred ? "Unstar POI" : "Star POI"}
        >
          <Star
            size={18}
            color={isStarred ? colors.warning : colors.textTertiary}
            fill={isStarred ? colors.warning : "none"}
          />
        </TouchableOpacity>
      </View>

      {/* Distance + ETA */}
      <View className="flex-row items-center mt-2">
        <MapPin size={13} color={colors.textSecondary} />
        <Text className="ml-1.5 text-[13px] text-muted-foreground font-barlow">
          {Math.round(poi.distanceFromRouteMeters)} m off route
        </Text>
        {distAhead != null && (
          <Text className="ml-2 text-[13px] font-barlow-sc-semibold text-foreground">
            {distAhead >= 0
              ? `${formatDistance(distAhead, units)} ahead`
              : `${formatDistance(Math.abs(distAhead), units)} behind`}
          </Text>
        )}
      </View>

      {etaResult && etaResult.ridingTimeSeconds > 0 && (
        <View className="flex-row items-center mt-1">
          <Clock size={13} color={colors.accent} />
          <Text className="ml-1.5 text-[13px] font-barlow-sc-semibold text-foreground">
            ~{formatDuration(etaResult.ridingTimeSeconds)}
          </Text>
          <Text className="ml-1.5 text-[13px] font-barlow-medium text-muted-foreground">
            ETA {formatETA(etaResult.eta)}
          </Text>
        </View>
      )}

      {etaOpenStatus !== null && (
        <Text
          className="text-[12px] font-barlow ml-5 mt-1"
          style={{ color: etaOpenStatus ? colors.positive : colors.destructive }}
        >
          {etaOpenStatus ? "Open when you arrive" : "Closed at ETA"}
        </Text>
      )}

      {/* Opening hours */}
      {ohText && (
        <View className="flex-row items-center mt-2">
          <Clock size={13} color={ohColor} />
          <Text className="ml-1.5 text-[13px] font-barlow" style={{ color: ohColor }}>
            {ohText}
          </Text>
        </View>
      )}

      {daySchedules && ohStatus?.detail !== "24/7" && (
        <View className="ml-5 mt-1">
          {daySchedules.map((ds) => (
            <View key={ds.label} className="flex-row items-center">
              <Text className="text-[12px] text-muted-foreground font-barlow-medium w-[60px]">
                {ds.label}
              </Text>
              <Text className="text-[12px] text-muted-foreground font-barlow-sc-medium">
                {ds.hours}
              </Text>
            </View>
          ))}
        </View>
      )}

      {address && (
        <View className="flex-row items-center mt-2">
          <MapPin size={13} color={colors.textSecondary} />
          <Text className="ml-1.5 text-[13px] text-muted-foreground font-barlow">{address}</Text>
        </View>
      )}

      {phone && (
        <View className="flex-row items-center mt-2">
          <Phone size={13} color={colors.textSecondary} />
          <Text className="ml-1.5 text-[13px] text-muted-foreground font-barlow">{phone}</Text>
        </View>
      )}

      <View className="mt-4">
        <Text className="text-[12px] font-barlow-semibold text-muted-foreground mb-2">Actions</Text>
        <Text className="text-[11px] text-muted-foreground font-barlow mb-2">
          Mapy.com may include online-only place/photos context.
        </Text>
        <View className="gap-2">
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              variant="secondary"
              label="Apple Maps"
              onPress={() => openUrl(buildAppleMapsUrl(poi))}
            />
            <Button
              className="flex-1"
              variant="secondary"
              label="Google Maps"
              onPress={() => openUrl(buildGoogleMapsUrl(poi))}
            />
          </View>
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              variant={mapyIsProminent ? "default" : "secondary"}
              label={buildMapyActionLabel()}
              onPress={() => openUrl(buildMapyUrl(poi))}
            />
            {phoneUrl && (
              <Button
                className="flex-1"
                variant="secondary"
                label="Call"
                onPress={() => openUrl(phoneUrl)}
              />
            )}
          </View>
        </View>
      </View>

      {poi.source === "google" && (
        <Text className="text-[10px] text-muted-foreground font-barlow mt-3">
          Powered by Google
        </Text>
      )}
    </ScrollView>
  );
}
