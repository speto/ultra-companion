import React, { useMemo, useState, useCallback, useDeferredValue, useEffect, useRef } from "react";
import { View, FlatList } from "react-native";
import Animated, { useAnimatedStyle, interpolate, Extrapolation } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { MapPin } from "lucide-react-native";
import { useThemeColors } from "@/theme";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";
import { usePoiStore } from "@/store/poiStore";
import { usePanelStore } from "@/store/panelStore";
import { useEtaStore } from "@/store/etaStore";
import { POI_CATEGORIES, POI_BEHIND_THRESHOLD_M } from "@/constants";
import { horizonWindow } from "@/utils/horizon";
import POIFilterBar from "@/components/map/POIFilterBar";
import PanelSearchInput from "@/components/map/PanelSearchInput";
import { hasExpandablePoiDetails } from "@/utils/poiActions";
import type { ActiveRouteData, POI, PlaceViewModel } from "@/types";
import { usePlaceStore } from "@/store/placeStore";
import { useStarredStore } from "@/store/starredStore";
import PlaceListItem from "@/components/place/PlaceListItem";
import { filterPlacesByFoodAvailability } from "@/utils/placeAdapter";

const DISTANCE_BUCKET_M = 100;

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
  const allPois = usePoiStore((s) => s.pois);
  const enabledCategories = usePoiStore((s) => s.enabledCategories);
  const showSavedOnly = usePoiStore((s) => s.showSavedOnly);
  const foodAvailabilityMode = usePoiStore((s) => s.foodAvailabilityMode);
  const foodAvailabilityCustomTime = usePoiStore((s) => s.foodAvailabilityCustomTime);
  const showPOIsOnMap = useMapStore((s) => s.showPOIs);
  const getETAToPOI = useEtaStore((s) => s.getETAToPOI);
  const etaRouteId = useEtaStore((s) => s.routeId);
  const etaCacheVersion = useEtaStore((s) => s.cacheVersion);
  const etaCachedPointsLength = useEtaStore((s) => s.cachedPoints?.length ?? 0);
  const etaCumulativeTimeLength = useEtaStore((s) => s.cumulativeTime?.length ?? 0);
  const etaCacheKey = `${etaRouteId ?? ""}:${etaCacheVersion}:${etaCachedPointsLength}:${etaCumulativeTimeLength}`;
  const isExpanded = usePanelStore((s) => s.isExpanded);
  const horizon = usePanelStore((s) => s.horizon);

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPlaceIds, setExpandedPlaceIds] = useState<Set<string>>(() => new Set());
  const listPressedPlaceIdRef = useRef<string | null>(null);
  const starredPoiIds = useMemo(
    () =>
      new Set(
        [...starredKeys]
          .filter((key) => key.startsWith("downloadedPoi:"))
          .map((key) => key.slice("downloadedPoi:".length)),
      ),
    [starredKeys],
  );

  const routeIds = useMemo(() => activeData?.routeIds ?? [], [activeData?.routeIds]);
  const segments = activeData?.segments ?? null;
  const segmentNameByRouteId = useMemo(
    () => new Map((segments ?? []).map((segment) => [segment.routeId, segment.routeName])),
    [segments],
  );
  const currentDist = snappedPosition?.distanceAlongRouteMeters ?? null;
  const currentDistBucket =
    currentDist == null ? null : Math.floor(currentDist / DISTANCE_BUCKET_M);
  const bucketedCurrentDist =
    currentDistBucket == null ? null : currentDistBucket * DISTANCE_BUCKET_M;
  const bucketedHorizonEndDist = useMemo(() => {
    if (bucketedCurrentDist == null || !activeData) return null;
    return horizonWindow(bucketedCurrentDist, horizon, activeData.totalDistanceMeters).endDist;
  }, [bucketedCurrentDist, horizon, activeData]);

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
    // allPois/enabledCategories/starredKeys/allPlaces are reactivity triggers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeIds, segments, allPois, enabledCategories, showSavedOnly, starredKeys, allPlaces]);
  const sortedVisiblePlaces = useMemo(
    () =>
      [...visiblePlaces].sort(
        (a, b) => a.effectiveDistanceAlongRouteMeters - b.effectiveDistanceAlongRouteMeters,
      ),
    [visiblePlaces],
  );

  const slicedPlaces = useMemo(() => {
    if (bucketedCurrentDist == null) return sortedVisiblePlaces;
    return sortedVisiblePlaces.filter(
      (p) =>
        p.effectiveDistanceAlongRouteMeters >= bucketedCurrentDist - POI_BEHIND_THRESHOLD_M &&
        (bucketedHorizonEndDist == null ||
          p.effectiveDistanceAlongRouteMeters <= bucketedHorizonEndDist),
    );
  }, [bucketedCurrentDist, bucketedHorizonEndDist, sortedVisiblePlaces]);

  const availabilityFilteredPlaces = useMemo(() => {
    void etaCacheKey;
    return filterPlacesByFoodAvailability(slicedPlaces, foodAvailabilityMode, {
      customTime: foodAvailabilityCustomTime,
      getETAToPOI,
      starredIds: starredPoiIds,
    });
  }, [
    foodAvailabilityCustomTime,
    foodAvailabilityMode,
    getETAToPOI,
    slicedPlaces,
    etaCacheKey,
    starredPoiIds,
  ]);

  const searchFilteredPlaces = useMemo(() => {
    if (!searchQuery.trim()) return availabilityFilteredPlaces;
    const q = searchQuery.trim().toLowerCase();
    return availabilityFilteredPlaces.filter((p) => p.name?.toLowerCase().includes(q));
  }, [availabilityFilteredPlaces, searchQuery]);

  const deferredSearchFilteredPlaces = useDeferredValue(searchFilteredPlaces);
  const deferredAvailabilityFilteredPlaces = useDeferredValue(availabilityFilteredPlaces);

  const isCategoryFilterActive = enabledCategories.length < POI_CATEGORIES.length;

  const hasSavedOnRoute = useMemo(() => {
    for (const routeId of routeIds) {
      if ((allPois[routeId] ?? []).some((poi) => starredPoiIds.has(poi.id))) return true;
    }
    return false;
  }, [allPois, routeIds, starredPoiIds]);

  const handlePlacePress = useCallback(
    (place: PlaceViewModel) => {
      listPressedPlaceIdRef.current = place.placeId;
      setSelectedPlace(place);
    },
    [setSelectedPlace],
  );

  const handleTogglePlaceExpansion = useCallback((place: PlaceViewModel) => {
    setExpandedPlaceIds((current) => {
      if (current.has(place.placeId)) {
        return new Set([...current].filter((placeId) => placeId !== place.placeId));
      }
      return new Set([...current, place.placeId]);
    });
  }, []);

  useEffect(() => {
    const selectedDownloadedPlace =
      selectedPlace?.entityType === "downloadedPoi" ? selectedPlace : null;
    const selectedPoi = selectedDownloadedPlace?.raw as POI | undefined;
    const poi = selectedPoi ?? selectedPOI;
    if (!poi) return;

    const placeId = selectedDownloadedPlace?.placeId ?? `downloadedPoi:${poi.id}`;
    const listPressedPlaceId = listPressedPlaceIdRef.current;
    if (listPressedPlaceId === placeId) {
      listPressedPlaceIdRef.current = null;
      return;
    }
    if (!hasExpandablePoiDetails(poi)) return;

    setExpandedPlaceIds((current) => {
      if (current.has(placeId)) return current;
      return new Set([...current, placeId]);
    });
  }, [selectedPlace, selectedPOI]);

  const renderItem = useCallback(
    ({ item }: { item: PlaceViewModel }) => (
      <PlaceListItem
        place={item}
        currentDistAlongRoute={bucketedCurrentDist}
        segmentName={segmentNameByRouteId.get(item.routeId) ?? null}
        showAbsoluteDistance={segments != null}
        onPress={handlePlacePress}
        expanded={expandedPlaceIds.has(item.placeId)}
        onToggleExpansion={handleTogglePlaceExpansion}
      />
    ),
    [
      bucketedCurrentDist,
      segmentNameByRouteId,
      segments,
      handlePlacePress,
      expandedPlaceIds,
      handleTogglePlaceExpansion,
    ],
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
  const showEmptySavedCopy = showSavedOnly && !hasSavedOnRoute;
  const statusText = buildPOIStatusText({
    listCount: listData.length,
    showSavedOnly,
    isCategoryFilterActive,
    showPOIsOnMap,
  });

  return (
    <View className="flex-1">
      <Animated.View style={searchAnimatedStyle}>
        <PanelSearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name..."
          accessibilityLabel="Search POIs"
        />
      </Animated.View>

      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }}>
        <POIFilterBar routeIds={routeIds} />
        <View className="px-4 pt-0.5 pb-1.5">
          <View className="flex-row items-center justify-center">
            <Text className="flex-1 text-center text-[12px] font-barlow-medium text-muted-foreground">
              {statusText}
            </Text>
          </View>
        </View>
      </View>

      {showEmptySavedCopy ? (
        <View className="px-6 py-6 items-center">
          <Text className="text-[14px] text-muted-foreground font-barlow-semibold text-center">
            No saved POIs
          </Text>
          <Text className="text-[13px] text-muted-foreground font-barlow-medium text-center mt-2">
            Tap a POI and use the star icon in its detail view to save it here for quick access
            during the ride.
          </Text>
        </View>
      ) : listData.length > 0 ? (
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

function buildPOIStatusText({
  listCount,
  showSavedOnly,
  isCategoryFilterActive,
  showPOIsOnMap,
}: {
  listCount: number;
  showSavedOnly: boolean;
  isCategoryFilterActive: boolean;
  showPOIsOnMap: boolean;
}) {
  const listedLabel = `${listCount.toLocaleString()} ${showSavedOnly ? "saved " : ""}${pluralizePOI(listCount)} listed`;

  if (showSavedOnly) return `${listedLabel} · map showing saved/selected only`;
  if (showPOIsOnMap) return `${listedLabel} · map showing all POIs`;
  if (isCategoryFilterActive) return `${listedLabel} · map showing selected filters`;
  return `${listedLabel} · map showing selected POI only`;
}

function pluralizePOI(count: number) {
  return count === 1 ? "POI" : "POIs";
}
