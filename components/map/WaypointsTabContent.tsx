import React, { useCallback, useMemo } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapPin } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import PlaceListItem from "@/components/place/PlaceListItem";
import { POI_BEHIND_THRESHOLD_M } from "@/constants";
import { usePanelStore } from "@/store/panelStore";
import { usePlaceStore } from "@/store/placeStore";
import { useRouteStore } from "@/store/routeStore";
import { useThemeColors } from "@/theme";
import { horizonWindow } from "@/utils/horizon";
import InlineWaypointDetail from "./InlineWaypointDetail";
import type { ActiveRouteData, PlaceViewModel } from "@/types";

interface WaypointsTabContentProps {
  activeData: ActiveRouteData | null;
}

export default function WaypointsTabContent({ activeData }: WaypointsTabContentProps) {
  const colors = useThemeColors();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const snappedPosition = useRouteStore((s) => s.snappedPosition);
  const horizon = usePanelStore((s) => s.horizon);
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
  const horizonEndDist = useMemo(() => {
    if (currentDist == null || !activeData) return null;
    return horizonWindow(currentDist, horizon, activeData.totalDistanceMeters).endDist;
  }, [currentDist, horizon, activeData]);

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
          currentDist == null ||
          (place.effectiveDistanceAlongRouteMeters >= currentDist - POI_BEHIND_THRESHOLD_M &&
            (horizonEndDist == null || place.effectiveDistanceAlongRouteMeters <= horizonEndDist)),
      )
      .sort((a, b) => a.effectiveDistanceAlongRouteMeters - b.effectiveDistanceAlongRouteMeters);
  }, [segments, routeIds, allPlaces, currentDist, horizonEndDist]);

  const handleWaypointPress = useCallback(
    (place: PlaceViewModel) => {
      setSelectedPlace(place);
    },
    [setSelectedPlace],
  );
  const keyExtractor = useCallback((item: PlaceViewModel) => item.placeId, []);
  const renderItem = useCallback(
    ({ item }: { item: PlaceViewModel }) => (
      <PlaceListItem
        place={item}
        currentDistAlongRoute={currentDist}
        segmentName={segmentNameByRouteId.get(item.routeId) ?? null}
        showAbsoluteDistance
        onPress={handleWaypointPress}
      />
    ),
    [currentDist, handleWaypointPress, segmentNameByRouteId],
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
        data={waypoints}
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
