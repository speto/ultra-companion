import React, { useCallback, useMemo } from "react";
import { FlatList, View, type ListRenderItem } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { MapPin } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import PlaceListItem from "@/components/place/PlaceListItem";
import { POI_BEHIND_THRESHOLD_M, SEGMENT_COLORS_DARK, SEGMENT_COLORS_LIGHT } from "@/constants";
import { useEtaStore } from "@/store/etaStore";
import { usePanelStore } from "@/store/panelStore";
import { usePlaceStore } from "@/store/placeStore";
import { useRouteStore } from "@/store/routeStore";
import { useThemeColors } from "@/theme";
import { horizonWindow } from "@/utils/horizon";
import InlineWaypointDetail from "./InlineWaypointDetail";
import type { ActiveRouteData, PlaceViewModel, StitchedSegmentInfo } from "@/types";

interface WaypointsTabContentProps {
  activeData: ActiveRouteData | null;
}

const DISTANCE_BUCKET_M = 100;
const SEGMENT_SECTION_TINT_ALPHA = "1A";

type WaypointListDataItem =
  | { type: "place"; key: string; place: PlaceViewModel }
  | { type: "day"; key: string; label: string }
  | { type: "section"; key: string; label: string; color?: string };

export default function WaypointsTabContent({ activeData }: WaypointsTabContentProps) {
  const colors = useThemeColors();
  const { colorScheme } = useColorScheme();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const snappedPosition = useRouteStore((s) => s.snappedPosition);
  const horizon = usePanelStore((s) => s.horizon);
  const getETAToDistance = useEtaStore((s) => s.getETAToDistance);
  const etaRouteId = useEtaStore((s) => s.routeId);
  const etaCacheVersion = useEtaStore((s) => s.cacheVersion);
  const etaCachedPointsLength = useEtaStore((s) => s.cachedPoints?.length ?? 0);
  const etaCumulativeTimeLength = useEtaStore((s) => s.cumulativeTime?.length ?? 0);
  const etaCacheKey = `${etaRouteId ?? ""}:${etaCacheVersion}:${etaCachedPointsLength}:${etaCumulativeTimeLength}`;
  const allPlaces = usePlaceStore((s) => s.places);
  const selectedPlace = usePlaceStore((s) => s.selectedPlace);
  const setSelectedPlace = usePlaceStore((s) => s.setSelectedPlace);

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
  const horizonEndDist = useMemo(() => {
    if (bucketedCurrentDist == null || !activeData) return null;
    return horizonWindow(bucketedCurrentDist, horizon, activeData.totalDistanceMeters).endDist;
  }, [bucketedCurrentDist, horizon, activeData]);

  const waypoints = useMemo(() => {
    const result: PlaceViewModel[] = [];

    if (segments) {
      for (const seg of segments) {
        for (const place of allPlaces[seg.routeId] ?? []) {
          if (place.entityType !== "routeWaypoint") continue;
          result.push({
            ...place,
            effectiveDistanceAlongRouteMeters:
              place.rawDistanceAlongRouteMeters + seg.distanceOffsetMeters,
          });
        }
      }
    } else {
      for (const routeId of routeIds) {
        for (const place of allPlaces[routeId] ?? []) {
          if (place.entityType === "routeWaypoint") result.push(place);
        }
      }
    }

    return result
      .filter(
        (place) =>
          bucketedCurrentDist == null ||
          (place.effectiveDistanceAlongRouteMeters >=
            bucketedCurrentDist - POI_BEHIND_THRESHOLD_M &&
            (horizonEndDist == null || place.effectiveDistanceAlongRouteMeters <= horizonEndDist)),
      )
      .sort((a, b) => a.effectiveDistanceAlongRouteMeters - b.effectiveDistanceAlongRouteMeters);
  }, [segments, routeIds, allPlaces, bucketedCurrentDist, horizonEndDist]);

  const handleWaypointPress = useCallback(
    (place: PlaceViewModel) => {
      setSelectedPlace(place);
    },
    [setSelectedPlace],
  );
  const listData = useMemo<WaypointListDataItem[]>(() => {
    void etaCacheKey;
    const segmentColors = colorScheme === "dark" ? SEGMENT_COLORS_DARK : SEGMENT_COLORS_LIGHT;
    const items: WaypointListDataItem[] = [];
    let currentSegmentId: string | null = null;
    let hasSeenRouteSegment = false;
    let currentDayKey: string | null = null;
    const dayKeyCounts = new Map<string, number>();

    const pushDayHeader = (etaDate: Date | null | undefined) => {
      if (!etaDate || Number.isNaN(etaDate.getTime())) return;
      const dayKey = etaDayKey(etaDate);
      if (dayKey === currentDayKey) return;
      if (currentDayKey === null) {
        dayKeyCounts.set(dayKey, (dayKeyCounts.get(dayKey) ?? 0) + 1);
        currentDayKey = dayKey;
        return;
      }
      const occurrence = dayKeyCounts.get(dayKey) ?? 0;
      dayKeyCounts.set(dayKey, occurrence + 1);
      items.push({
        type: "day",
        key: occurrence === 0 ? `waypoint-day-${dayKey}` : `waypoint-day-${dayKey}-${occurrence + 1}`,
        label: etaDayLabel(etaDate),
      });
      currentDayKey = dayKey;
    };

    for (const place of waypoints) {
      const etaResult = getETAToDistance(place.effectiveDistanceAlongRouteMeters);
      pushDayHeader(etaResult?.eta);

      const segment = segmentForDistance(place.effectiveDistanceAlongRouteMeters, segments);
      if (segment && segment.routeId !== currentSegmentId) {
        if (hasSeenRouteSegment) {
          items.push({
            type: "section",
            key: `waypoint-segment-${segment.position}-${segment.routeId}`,
            label: segmentDividerLabel(segment),
            color: segmentColors[segment.position % SEGMENT_COLORS_LIGHT.length],
          });
        }
        currentSegmentId = segment.routeId;
        hasSeenRouteSegment = true;
      }

      items.push({ type: "place", key: `waypoint-place-${place.placeId}`, place });
    }

    return items;
  }, [colorScheme, etaCacheKey, getETAToDistance, segments, waypoints]);

  const keyExtractor = useCallback((item: WaypointListDataItem) => item.key, []);
  const renderItem = useCallback<ListRenderItem<WaypointListDataItem>>(
    ({ item, index }) => {
      if (item.type === "day") return <TimelineDayHeader label={item.label} />;
      if (item.type === "section") {
        return <TimelineSectionHeader label={item.label} color={item.color} />;
      }

      const nextItem = listData[index + 1];
      return (
        <PlaceListItem
          place={item.place}
          currentDistAlongRoute={bucketedCurrentDist}
          segmentName={segmentNameByRouteId.get(item.place.routeId) ?? null}
          showAbsoluteDistance
          onPress={handleWaypointPress}
          showDivider={nextItem?.type === "place"}
        />
      );
    },
    [bucketedCurrentDist, handleWaypointPress, listData, segmentNameByRouteId],
  );

  if (selectedPlace?.entityType === "routeWaypoint") {
    return <InlineWaypointDetail place={selectedPlace} onBack={() => setSelectedPlace(null)} />;
  }

  if (waypoints.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <MapPin size={24} color={colors.textTertiary} />
        <Text className="text-[13px] text-muted-foreground font-barlow-medium mt-2 text-center">
          No waypoints in this view
        </Text>
        <Text className="text-[11px] text-muted-foreground mt-1 text-center">
          Imported GPX waypoints appear here when they fall inside the current horizon.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between px-3 py-1.5">
        <Text className="text-[11px] font-barlow-semibold text-muted-foreground">
          {waypoints.length} waypoint{waypoints.length === 1 ? "" : "s"}
        </Text>
      </View>
      <FlatList
        data={listData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: safeBottom }}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={3}
        removeClippedSubviews={true}
      />
    </View>
  );
}

function segmentForDistance(
  distanceMeters: number,
  segments: StitchedSegmentInfo[] | null | undefined,
): StitchedSegmentInfo | null {
  if (!segments || segments.length <= 1 || !Number.isFinite(distanceMeters)) return null;
  return (
    segments.find((segment, index) => {
      const start = segment.distanceOffsetMeters;
      const end = start + segment.segmentDistanceMeters;
      return distanceMeters >= start && (distanceMeters < end || index === segments.length - 1);
    }) ?? null
  );
}

function segmentDividerLabel(segment: StitchedSegmentInfo): string {
  return `Segment ${segment.position + 1} · ${segment.routeName}`;
}

function etaDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function etaDayLabel(date: Date): string {
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function TimelineSectionHeader({ label, color }: { label: string; color?: string }) {
  const tintColor = color ? `${color}${SEGMENT_SECTION_TINT_ALPHA}` : undefined;
  return (
    <View className="px-3 pt-1.5 pb-1 bg-surface items-center" accessibilityRole="header">
      {color ? (
        <View
          className="rounded-full border px-2.5 py-0.5"
          style={{ backgroundColor: tintColor, borderColor: color }}
        >
          <Text
            className="text-[10px] font-barlow-sc-semibold uppercase tracking-wide"
            style={{ color }}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      ) : (
        <Text
          className="text-[10px] font-barlow-medium uppercase tracking-wide text-muted-foreground"
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </View>
  );
}

function TimelineDayHeader({ label }: { label: string }) {
  return (
    <View className="px-3 pt-2 pb-0.5 bg-surface items-center" accessibilityRole="header">
      <Text className="text-[11px] font-barlow-semibold text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
