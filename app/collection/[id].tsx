import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { View, useWindowDimensions, ActivityIndicator, Alert, Pressable } from "react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { serializeCollectionToGPX } from "@/services/gpxSerializer";
import { shareGPXFile } from "@/utils/gpxExportShare";
import { Camera, MapView as MapboxMapView } from "@rnmapbox/maps";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/theme";
import { useCollectionStore } from "@/store/collectionStore";
import { useRouteStore } from "@/store/routeStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useClimbStore } from "@/store/climbStore";
import { useWaypointStore } from "@/store/waypointStore";
import type {
  Collection,
  CollectionSegmentWithRoute,
  RouteWaypoint,
  StitchedCollection,
} from "@/types";
import { useMapStyle } from "@/hooks/useMapStyle";
import { formatDistance, formatElevation } from "@/utils/formatters";
import { computeBounds } from "@/utils/geo";
import { profileSegmentsFromStitchedSegments } from "@/utils/profileSegments";
import { getStitchedStarredPOIsForCollection, stitchCollection } from "@/services/stitchingService";
import ElevationProfile from "@/components/elevation/ElevationProfile";
import RouteLayer from "@/components/map/RouteLayer";
import StatBox from "@/components/common/StatBox";
import SegmentList from "@/components/collection/SegmentList";
import AddSegmentSheet from "@/components/collection/AddSegmentSheet";
import CollectionOfflineSection from "@/components/collection/CollectionOfflineSection";
import { StartPickerSheet } from "@/components/map/WeatherPanel";
import { getWaypointCategoryMeta, WAYPOINT_ICON_MAP } from "@/constants/waypointCategories";
import { getMapInspectHref } from "@/utils/mapInspect";
import { Maximize2 } from "lucide-react-native";
import { useColorScheme } from "nativewind";

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const cameraRef = useRef<Camera>(null);
  const colors = useThemeColors();
  const { colorScheme } = useColorScheme();
  const mapStyle = useMapStyle();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [segmentsWithRoutes, setSegmentsWithRoutes] = useState<CollectionSegmentWithRoute[]>([]);
  const [stitched, setStitched] = useState<StitchedCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const collections = useCollectionStore((s) => s.collections);
  const getCollectionSegmentsWithRoutes = useCollectionStore(
    (s) => s.getCollectionSegmentsWithRoutes,
  );
  const addSegment = useCollectionStore((s) => s.addSegment);
  const removeSegment = useCollectionStore((s) => s.removeSegment);
  const selectVariant = useCollectionStore((s) => s.selectVariant);
  const setActiveCollection = useCollectionStore((s) => s.setActiveCollection);
  const deleteCollection = useCollectionStore((s) => s.deleteCollection);
  const updateCollectionPlanning = useCollectionStore((s) => s.updateCollectionPlanning);
  const visibleRoutePoints = useRouteStore((s) => s.visibleRoutePoints);
  const importRoute = useRouteStore((s) => s.importRoute);
  const units = useSettingsStore((s) => s.units);
  const loadWaypoints = useWaypointStore((s) => s.loadWaypoints);
  const waypointsByRoute = useWaypointStore((s) => s.waypoints);
  const loadData = useCallback(async () => {
    if (!id) return;
    const collectionData = collections.find((c) => c.id === id);
    setCollection(collectionData ?? null);

    const segs = await getCollectionSegmentsWithRoutes(id);
    setSegmentsWithRoutes(segs);

    if (segs.length > 0) {
      try {
        const s = await stitchCollection(id);
        // Also load points for unselected variants (for ETA display)
        const { getRoutePoints } = await import("@/db/database");
        const unselectedRouteIds = segs
          .filter((sw) => !sw.segment.isSelected && !s.pointsByRouteId[sw.route.id])
          .map((sw) => sw.route.id);
        const unselectedPoints = await Promise.all(
          unselectedRouteIds.map((rid) => getRoutePoints(rid)),
        );
        for (let i = 0; i < unselectedRouteIds.length; i++) {
          s.pointsByRouteId[unselectedRouteIds[i]] = unselectedPoints[i];
        }
        setStitched(s);
        // Inject per-segment points for mini map RouteLayer rendering
        const currentPoints = {
          ...useRouteStore.getState().visibleRoutePoints,
          ...s.pointsByRouteId,
        };
        useRouteStore.setState({ visibleRoutePoints: currentPoints });
      } catch {
        setStitched(null);
      }
    } else {
      setStitched(null);
    }
    setLoading(false);
  }, [id, collections, getCollectionSegmentsWithRoutes]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const screenOptions = useMemo(
    () => ({ title: collection?.name ?? "Collection" }),
    [collection?.name],
  );

  const bounds = useMemo(() => {
    if (!stitched?.points.length) return null;
    return computeBounds(stitched.points);
  }, [stitched]);

  // Fit mini map camera when bounds change (defaultSettings only applies on mount)
  useEffect(() => {
    if (!bounds) return;
    cameraRef.current?.setCamera({
      bounds: {
        ne: bounds.ne,
        sw: bounds.sw,
        paddingLeft: 40,
        paddingRight: 40,
        paddingTop: 40,
        paddingBottom: 40,
      },
      animationDuration: 300,
    });
  }, [bounds]);

  // Get route points for each selected segment (for mini map RouteLayer)
  const selectedSegmentRoutes = useMemo(() => {
    return segmentsWithRoutes.filter((sw) => sw.segment.isSelected).map((sw) => sw.route);
  }, [segmentsWithRoutes]);

  const existingRouteIds = useMemo(
    () => new Set(segmentsWithRoutes.map((sw) => sw.route.id)),
    [segmentsWithRoutes],
  );

  const handleAddSegment = useCallback(
    async (routeId: string) => {
      if (!id) return;
      setShowAddSheet(false);
      setIsBusy(true);
      try {
        await addSegment(id, routeId);
        await loadData();
      } finally {
        setIsBusy(false);
      }
    },
    [id, addSegment, loadData],
  );

  const handleImportRoute = useCallback(async () => {
    setIsBusy(true);
    try {
      await importRoute();
      await loadData();
    } finally {
      setIsBusy(false);
    }
  }, [importRoute, loadData]);
  const handleRemoveSegment = useCallback(
    async (routeId: string) => {
      if (!id) return;
      Alert.alert("Remove Segment", "Remove this segment from the collection?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setIsBusy(true);
            try {
              await removeSegment(id, routeId);
              await loadData();
            } finally {
              setIsBusy(false);
            }
          },
        },
      ]);
    },
    [id, removeSegment, loadData],
  );

  const handleSelectVariant = useCallback(
    async (routeId: string) => {
      if (!id) return;
      setIsBusy(true);
      try {
        await selectVariant(id, routeId);
        await loadData();
      } finally {
        setIsBusy(false);
      }
    },
    [id, selectVariant, loadData],
  );

  const handleReorder = useCallback(
    async (positions: { routeId: string; position: number }[]) => {
      if (!id) return;
      setIsBusy(true);
      try {
        const { updateSegmentPositions } = await import("@/db/database");
        await updateSegmentPositions(id, positions);
        await loadData();
      } finally {
        setIsBusy(false);
      }
    },
    [id, loadData],
  );

  const handleSetActive = useCallback(async () => {
    if (!id) return;
    setIsBusy(true);
    await setActiveCollection(id);
    setIsBusy(false);
  }, [id, setActiveCollection]);

  const handleDelete = useCallback(() => {
    if (!id || !collection) return;
    Alert.alert("Delete Collection", `Delete "${collection.name}"? Routes will not be deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteCollection(id);
          router.back();
        },
      },
    ]);
  }, [id, collection, deleteCollection, router]);

  const handleApplyPlannedStart = useCallback(
    async (value: number | null) => {
      if (!id) return;
      await updateCollectionPlanning(id, { plannedStartMs: value });
      setCollection((current) => (current ? { ...current, plannedStartMs: value } : current));
      setShowStartPicker(false);
    },
    [id, updateCollectionPlanning],
  );

  const handleExportGPX = async () => {
    if (!collection || !stitched) return;
    try {
      const starredPOIs = await getStitchedStarredPOIsForCollection(stitched.segments);
      const gpx = serializeCollectionToGPX(collection.name, stitched, {
        routeWaypoints: collectionWaypoints.map((waypoint) => ({
          ...waypoint,
          distanceAlongRouteMeters: waypoint.effectiveDist,
        })),
        // Duplicate real-world POIs across selected routes intentionally remain separate exports.
        poisAsWaypoints: starredPOIs,
      });
      await shareGPXFile(gpx, collection.name);
    } catch (error) {
      Alert.alert("Export Failed", error instanceof Error ? error.message : "Unknown error");
    }
  };

  // Load climbs for all segments
  const loadClimbs = useClimbStore((s) => s.loadClimbs);
  const getClimbsForDisplay = useClimbStore((s) => s.getClimbsForDisplay);
  const allClimbs = useClimbStore((s) => s.climbs);

  useEffect(() => {
    if (stitched) {
      for (const seg of stitched.segments) {
        loadClimbs(seg.routeId);
      }
    }
  }, [stitched, loadClimbs]);

  useEffect(() => {
    if (!stitched) return;
    for (const seg of stitched.segments) {
      loadWaypoints(seg.routeId);
    }
  }, [stitched, loadWaypoints]);

  const collectionClimbs = useMemo(() => {
    if (!stitched) return [];
    const routeIds = stitched.segments.map((s) => s.routeId);
    return getClimbsForDisplay(routeIds, stitched.segments);
    // allClimbs is a reactivity trigger: getClimbsForDisplay reads store via get() and is not itself reactive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stitched, getClimbsForDisplay, allClimbs]);

  const collectionWaypoints = useMemo(() => {
    if (!stitched) return [];
    return stitched.segments
      .flatMap((seg) => {
        const waypoints = waypointsByRoute[seg.routeId] ?? [];
        return waypoints.map((waypoint) =>
          Object.assign({}, waypoint, {
            effectiveDist: waypoint.distanceAlongRouteMeters + seg.distanceOffsetMeters,
            segmentName: seg.routeName,
          }),
        );
      })
      .sort((a, b) => a.effectiveDist - b.effectiveDist);
  }, [stitched, waypointsByRoute]);

  // Segment boundaries for elevation profile
  const segmentBoundaries = useMemo(() => {
    if (!stitched?.segments || stitched.segments.length <= 1) return undefined;
    return stitched.segments.slice(1).map((seg) => ({
      distanceMeters: seg.distanceOffsetMeters,
      label: seg.routeName,
    }));
  }, [stitched]);

  const profileSegments = useMemo(
    () => profileSegmentsFromStitchedSegments(stitched?.segments, colorScheme),
    [stitched?.segments, colorScheme],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!collection) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-[17px] text-muted-foreground">Collection not found</Text>
      </View>
    );
  }

  const chartWidth = screenWidth - 32;
  const chartHeight = 220;

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <NestableScrollContainer
        className="flex-1 bg-background"
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        {/* Mini map */}
        {selectedSegmentRoutes.length > 0 && (
          <View className="h-[250px] mx-4 mt-4 rounded-xl overflow-hidden relative">
            <MapboxMapView
              style={{ flex: 1 }}
              {...mapStyle.props}
              compassEnabled={false}
              scaleBarEnabled={false}
              rotateEnabled={false}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
            >
              <Camera
                ref={cameraRef}
                defaultSettings={
                  bounds
                    ? {
                        bounds: {
                          ne: bounds.ne,
                          sw: bounds.sw,
                          paddingLeft: 40,
                          paddingRight: 40,
                          paddingTop: 40,
                          paddingBottom: 40,
                        },
                      }
                    : undefined
                }
              />
              {selectedSegmentRoutes.map((route) => {
                const points = visibleRoutePoints[route.id];
                if (!points) return null;
                return (
                  <RouteLayer
                    key={`${route.id}-${mapStyle.styleKey}`}
                    route={{ ...route, isActive: true }}
                    points={points}
                  />
                );
              })}
            </MapboxMapView>
            <Pressable
              className="absolute bottom-2 right-2 w-[52px] h-[52px] bg-background/90 rounded-full items-center justify-center shadow-sm"
              onPress={() => router.push(getMapInspectHref("collection", id))}
              accessibilityLabel="Expand collection map"
              accessibilityRole="button"
            >
              <Maximize2 size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
        )}

        {/* Stats */}
        {stitched && (
          <View className="flex-row px-4 mt-3 mb-3 gap-3">
            <StatBox label="Distance" value={formatDistance(stitched.totalDistanceMeters, units)} />
            <StatBox
              label="Ascent"
              value={"↑ " + formatElevation(stitched.totalAscentMeters, units)}
            />
            <StatBox
              label="Descent"
              value={"↓ " + formatElevation(stitched.totalDescentMeters, units)}
            />
          </View>
        )}

        <View className="px-4 mt-2 mb-4">
          <Text className="text-[22px] font-barlow-semibold text-foreground mb-3">Plan</Text>
          <View className="rounded-xl overflow-hidden border border-border bg-surface">
            <PlanRow
              label="Start time"
              value={formatPlanStart(collection.plannedStartMs)}
              onPress={() => setShowStartPicker(true)}
            />
          </View>
        </View>

        {/* Segments */}
        <View className="flex-row items-center justify-between px-4 mt-2 mb-3">
          <Text className="text-[22px] font-barlow-semibold text-foreground">Segments</Text>
          <Button
            variant="ghost"
            onPress={() => setIsEditing(!isEditing)}
            label={isEditing ? "Done" : "Edit Segments"}
          />
        </View>
        {isEditing && (
          <View className="px-4 mt-3 gap-3">
            <Button variant="secondary" onPress={() => setShowAddSheet(true)} label="Add Segment" />
            <Button variant="secondary" onPress={handleImportRoute} label="Import Route" />
          </View>
        )}
        <View className="px-4">
          <SegmentList
            segmentsWithRoutes={segmentsWithRoutes}
            pointsByRouteId={stitched?.pointsByRouteId ?? {}}
            onSelectVariant={handleSelectVariant}
            onReorder={handleReorder}
            onRemove={handleRemoveSegment}
            isEditing={isEditing}
          />
        </View>

        {/* Elevation Profile */}
        {stitched && stitched.points.length > 0 && (
          <>
            <Text className="text-[22px] font-barlow-semibold text-foreground px-4 mt-4 mb-3">
              Elevation Profile
            </Text>
            <View className="mx-4 rounded-xl overflow-hidden bg-surface">
              <ElevationProfile
                points={stitched.points}
                units={units}
                width={chartWidth}
                height={chartHeight}
                segmentBoundaries={segmentBoundaries}
                profileSegments={profileSegments}
                climbs={collectionClimbs}
              />
            </View>
          </>
        )}

        {collectionWaypoints.length > 0 && (
          <View className="mt-4">
            <View className="flex-row items-baseline justify-between px-4 mb-2">
              <Text className="text-[22px] font-barlow-semibold text-foreground">Waypoints</Text>
              <Text className="text-[12px] text-muted-foreground font-barlow-sc-medium">
                {collectionWaypoints.length}
              </Text>
            </View>
            <View className="mx-4 rounded-xl overflow-hidden border border-border bg-surface">
              {collectionWaypoints.map((waypoint) => (
                <CollectionWaypointRow
                  key={`${waypoint.routeId}:${waypoint.id}`}
                  waypoint={waypoint}
                  units={units}
                />
              ))}
            </View>
          </View>
        )}

        {/* Offline */}
        {stitched && stitched.segments.length > 0 && (
          <CollectionOfflineSection stitched={stitched} />
        )}

        {/* Actions */}
        <View className="px-4 mt-6 gap-3">
          <Button
            onPress={handleExportGPX}
            disabled={!stitched || stitched.points.length === 0}
            label="Export GPX"
            variant="secondary"
          />
          <Button
            onPress={handleSetActive}
            disabled={collection.isActive || segmentsWithRoutes.length === 0}
            label={collection.isActive ? "Active" : "Set Active"}
          />
          <Button variant="destructive" onPress={handleDelete} label="Delete Collection" />
        </View>
      </NestableScrollContainer>

      <AddSegmentSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onAdd={handleAddSegment}
        existingRouteIds={existingRouteIds}
      />

      <StartPickerSheet
        visible={showStartPicker}
        startMs={collection.plannedStartMs}
        title="Planned Start"
        accessibilityContextLabel="planned start"
        onApply={handleApplyPlannedStart}
        onClose={() => setShowStartPicker(false)}
      />

      {isBusy && (
        <View className="absolute inset-0 items-center justify-center z-40 bg-background/60">
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}
    </>
  );
}

function formatPlanStart(startMs: number | null): string {
  if (startMs == null) return "Now";
  const date = new Date(startMs);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const tomorrowStart = todayStart + 24 * 3600_000;
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (dayStart === todayStart) return `Today ${time}`;
  if (dayStart === tomorrowStart) return `Tomorrow ${time}`;
  return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

function PlanRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      className="min-h-[56px] flex-row items-center justify-between px-3 py-2.5 border-b border-border/60 last:border-b-0"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text className="text-[14px] font-barlow-medium text-foreground">{label}</Text>
      <Text
        className="text-[14px] font-barlow-sc-semibold text-muted-foreground ml-3"
        numberOfLines={1}
      >
        {value}
      </Text>
    </Pressable>
  );
}

const CollectionWaypointRow = React.memo(function CollectionWaypointRow({
  waypoint,
  units,
}: {
  waypoint: RouteWaypoint & { effectiveDist: number; segmentName: string };
  units: "metric" | "imperial";
}) {
  const meta = getWaypointCategoryMeta(waypoint.type);
  const IconComp = WAYPOINT_ICON_MAP[meta.iconName];

  return (
    <View
      className="flex-row items-center px-3 py-2.5 min-h-[56px] border-b border-border/60 last:border-b-0"
      accessibilityLabel={waypoint.name ?? meta.label}
    >
      <View
        className="w-[32px] h-[32px] rounded-full items-center justify-center"
        style={{ backgroundColor: `${meta.color}1A` }}
      >
        {IconComp && <IconComp size={16} color={meta.color} />}
      </View>

      <View className="flex-1 ml-2.5">
        <Text className="text-[14px] font-barlow-medium text-foreground" numberOfLines={1}>
          {waypoint.name ?? meta.label}
        </Text>
        <Text
          className="mt-0.5 text-[11px] text-muted-foreground font-barlow-medium"
          numberOfLines={1}
        >
          {meta.label} · {waypoint.segmentName}
        </Text>
      </View>

      <View className="items-end ml-2">
        <Text className="text-[14px] font-barlow-sc-semibold text-foreground">
          {formatDistance(waypoint.effectiveDist, units)}
        </Text>
        {waypoint.distanceFromRouteMeters > 0 && (
          <Text className="text-[10px] text-muted-foreground font-barlow-sc-medium">
            {formatDistance(waypoint.distanceFromRouteMeters, units)} off route
          </Text>
        )}
      </View>
    </View>
  );
});
