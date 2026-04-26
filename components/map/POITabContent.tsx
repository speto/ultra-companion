import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput as RNTextInput,
  Linking,
} from "react-native";
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

interface POITabContentProps {
  activeData: ActiveRouteData | null;
}

export default function POITabContent({ activeData }: POITabContentProps) {
  const colors = useThemeColors();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const snappedPosition = useRouteStore((s) => s.snappedPosition);
  const getStarredPOIs = usePoiStore((s) => s.getStarredPOIs);
  const starredKeys = useStarredStore((s) => s.starredKeys);
  const selectedPOI = usePoiStore((s) => s.selectedPOI);
  const setSelectedPOI = usePoiStore((s) => s.setSelectedPOI);
  const allPois = usePoiStore((s) => s.pois);
  const enabledCategories = usePoiStore((s) => s.enabledCategories);
  const showOpenOnly = usePoiStore((s) => s.showOpenOnly);
  const cumulativeTime = useEtaStore((s) => s.cumulativeTime);
  const isExpanded = usePanelStore((s) => s.isExpanded);
  const horizon = usePanelStore((s) => s.horizon);

  const [searchQuery, setSearchQuery] = useState("");

  const routeIds = useMemo(() => activeData?.routeIds ?? [], [activeData?.routeIds]);
  const routePoints = activeData?.points ?? null;
  const segments = activeData?.segments ?? null;
  const segmentNameByRouteId = useMemo(
    () => new Map((segments ?? []).map((segment) => [segment.routeId, segment.routeName])),
    [segments],
  );
  const currentDist = snappedPosition?.distanceAlongRouteMeters ?? null;
  const currentIdx = snappedPosition?.pointIndex ?? null;
  const horizonEndDist = useMemo(() => {
    if (currentDist == null || !activeData) return null;
    return horizonWindow(currentDist, horizon, activeData.totalDistanceMeters).endDist;
  }, [currentDist, horizon, activeData]);

  const starredUpcoming = useMemo(() => {
    if (routeIds.length === 0) return [];
    const allStarred: (POI & { effectiveDist: number; ridingTimeSeconds: number | null })[] = [];
    for (const routeId of routeIds) {
      const pois = getStarredPOIs(routeId);
      const offset = segments?.find((s) => s.routeId === routeId)?.distanceOffsetMeters ?? 0;
      for (const poi of pois) {
        const effDist = poi.distanceAlongRouteMeters + offset;
        let ridingTime: number | null = null;
        if (
          currentIdx != null &&
          cumulativeTime &&
          routePoints &&
          currentDist != null &&
          effDist > currentDist
        ) {
          let poiIdx = currentIdx;
          for (let i = currentIdx; i < routePoints.length; i++) {
            if (routePoints[i].distanceFromStartMeters >= effDist) {
              poiIdx = i;
              break;
            }
            poiIdx = i;
          }
          const seconds = cumulativeTime[poiIdx] - cumulativeTime[currentIdx];
          if (seconds > 0) ridingTime = seconds;
        }
        allStarred.push({ ...poi, effectiveDist: effDist, ridingTimeSeconds: ridingTime });
      }
    }
    allStarred.sort((a, b) => a.effectiveDist - b.effectiveDist);
    if (currentDist == null) return allStarred;
    return allStarred.filter(
      (p) =>
        p.effectiveDist >= currentDist - POI_BEHIND_THRESHOLD_M &&
        (horizonEndDist == null || p.effectiveDist <= horizonEndDist),
    );
    // starredKeys is a reactivity trigger: getStarredPOIs reads from starredStore via get().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeIds,
    segments,
    getStarredPOIs,
    starredKeys,
    currentDist,
    currentIdx,
    horizonEndDist,
    cumulativeTime,
    routePoints,
  ]);

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
    if (!isExpanded) return [];
    const getStitchedVisible = usePlaceStore.getState().getStitchedVisiblePlaces;
    if (segments) {
      return getStitchedVisible(segments, routeIds);
    }
    // Single route
    if (routeIds.length > 0) {
      const result = usePlaceStore.getState().getVisiblePlaces(routeIds[0]);
      return result;
    }
    return [];
    // allPois/enabledCategories/showOpenOnly/starredKeys/allPlaces are reactivity triggers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isExpanded,
    routeIds,
    segments,
    allPois,
    enabledCategories,
    showOpenOnly,
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

  const filteredPlaces = useMemo(() => {
    if (!searchQuery.trim()) return sortedPlaces;
    const q = searchQuery.trim().toLowerCase();
    return sortedPlaces.filter((p) => p.name?.toLowerCase().includes(q));
  }, [sortedPlaces, searchQuery]);

  const handlePlacePress = useCallback(
    (place: PlaceViewModel) => {
      setSelectedPlace(place);
    },
    [setSelectedPlace],
  );

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

  // --- Expanded mode: full POI list with search + filters ---
  if (isExpanded) {
    return (
      <View className="flex-1">
        {/* Search */}
        <View
          className="flex-row items-center px-4 py-2"
          style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }}
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

        {/* Category filters */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }}>
          <POIFilterBar routeIds={routeIds} />
        </View>

        {/* Full place list */}
        <FlatList
          data={filteredPlaces}
          keyExtractor={(item) => item.placeId}
          renderItem={({ item }) => (
            <PlaceListItem
              place={item}
              currentDistAlongRoute={currentDist}
              segmentName={segmentNameByRouteId.get(item.routeId) ?? null}
              showAbsoluteDistance={segments != null}
              onPress={handlePlacePress}
            />
          )}
          contentContainerStyle={{ paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }

  // --- Compact mode: starred POIs only ---
  return (
    <View className="flex-1">
      {starredUpcoming.length > 0 ? (
        <>
          <View className="flex-row items-center justify-between px-3 py-1.5">
            <Text className="text-[11px] font-barlow-semibold text-muted-foreground">
              {starredUpcoming.length} starred ahead
            </Text>
          </View>
          <FlatList
            data={starredUpcoming}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CompactPOIRow
                poi={item}
                effectiveDist={item.effectiveDist}
                currentDist={currentDist}
                ridingTimeSeconds={item.ridingTimeSeconds}
                onPress={() => {
                  const raw = usePoiStore
                    .getState()
                    .pois[item.routeId]?.find((p) => p.id === item.id);
                  setSelectedPOI(raw ?? item);
                }}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: safeBottom }}
          />
        </>
      ) : (
        <View className="flex-1 items-center justify-center">
          <Star size={20} color={colors.textTertiary} />
          <Text className="text-[12px] text-muted-foreground font-barlow-medium mt-2">
            No starred POIs ahead
          </Text>
        </View>
      )}
    </View>
  );
}

function CompactPOIRow({
  poi,
  effectiveDist,
  currentDist,
  ridingTimeSeconds,
  onPress,
}: {
  poi: POI;
  effectiveDist: number;
  currentDist: number | null;
  ridingTimeSeconds: number | null;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const units = useSettingsStore((s) => s.units);

  const catMeta = POI_CATEGORIES.find((c) => c.key === poi.category);
  const IconComp = catMeta ? POI_ICON_MAP[catMeta.iconName] : null;
  const distAhead = currentDist != null ? effectiveDist - currentDist : null;

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
      className="flex-row items-center px-3 py-2"
      onPress={onPress}
      accessibilityLabel={poi.name ?? catMeta?.label ?? "POI"}
    >
      <View
        className="w-[28px] h-[28px] rounded-full items-center justify-center"
        style={{ backgroundColor: (catMeta?.color ?? colors.textTertiary) + "1A" }}
      >
        {IconComp && <IconComp size={15} color={catMeta?.color ?? colors.textPrimary} />}
      </View>

      <View className="flex-1 ml-2.5">
        <Text className="text-[14px] font-barlow-medium text-foreground" numberOfLines={1}>
          {poi.name ?? catMeta?.label ?? "Unnamed"}
        </Text>
        {ohStatus && (
          <View className="flex-row items-center mt-1">
            <View className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: ohColor }} />
            <Text className="ml-1 text-[11px] font-barlow-medium" style={{ color: ohColor }}>
              {ohStatus.label}
              {ohStatus.detail ? ` · ${ohStatus.detail}` : ""}
            </Text>
          </View>
        )}
      </View>

      <View className="items-end ml-2">
        {distAhead != null && (
          <Text className="text-[14px] font-barlow-sc-semibold text-foreground">
            {distAhead >= 0
              ? formatDistance(distAhead, units)
              : `-${formatDistance(Math.abs(distAhead), units)}`}
          </Text>
        )}
        {ridingTimeSeconds != null && (
          <Text className="text-[10px] text-muted-foreground font-barlow-sc-medium">
            ~{formatDuration(ridingTimeSeconds)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
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
