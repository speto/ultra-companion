import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Pressable,
  Alert,
} from "react-native";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { serializeRouteToGPX } from "@/services/gpxSerializer";
import { shareGPXFile } from "@/utils/gpxExportShare";
import { Camera, MapView as MapboxMapView } from "@rnmapbox/maps";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/theme";
import { useRouteStore } from "@/store/routeStore";
import { useSettingsStore } from "@/store/settingsStore";
import { usePoiStore } from "@/store/poiStore";
import { useStarredStore } from "@/store/starredStore";
import { useClimbStore } from "@/store/climbStore";
import type { RouteWithPoints, Climb, RouteWaypoint } from "@/types";
import { useMapStyle } from "@/hooks/useMapStyle";
import { formatDistance, formatElevation } from "@/utils/formatters";
import { computeElevationProgress, computeBounds } from "@/utils/geo";
import ElevationProfile from "@/components/elevation/ElevationProfile";
import RouteLayer from "@/components/map/RouteLayer";
import StatBox from "@/components/common/StatBox";
import DataSection from "@/components/route/DataSection";
import { getMapInspectHref } from "@/utils/mapInspect";
import { Maximize2 } from "lucide-react-native";
import { useWaypointStore } from "@/store/waypointStore";
import { getWaypointCategoryMeta, WAYPOINT_ICON_MAP } from "@/constants/waypointCategories";

const EMPTY_CLIMBS: Climb[] = [];

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: screenWidth } = useWindowDimensions();
  const cameraRef = useRef<Camera>(null);
  const colors = useThemeColors();
  const mapStyle = useMapStyle();

  const [route, setRoute] = useState<RouteWithPoints | null>(null);
  const [loading, setLoading] = useState(true);

  const getRouteDetail = useRouteStore((s) => s.getRouteDetail);
  const snappedPosition = useRouteStore((s) => s.snappedPosition);
  const units = useSettingsStore((s) => s.units);
  const loadPOIs = usePoiStore((s) => s.loadPOIs);
  const getStarredPOIs = usePoiStore((s) => s.getStarredPOIs);
  const loadStarredItems = useStarredStore((s) => s.loadStarredItems);
  const starredKeys = useStarredStore((s) => s.starredKeys);
  const setSelectedPOI = usePoiStore((s) => s.setSelectedPOI);
  const loadWaypoints = useWaypointStore((s) => s.loadWaypoints);
  const waypointsByRoute = useWaypointStore((s) => s.waypoints);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const detail = await getRouteDetail(id);
      setRoute(detail);
      setLoading(false);
    })();
  }, [id, getRouteDetail]);

  const loadClimbs = useClimbStore((s) => s.loadClimbs);
  const routeClimbs = useClimbStore((s) => (id ? (s.climbs[id] ?? EMPTY_CLIMBS) : EMPTY_CLIMBS));

  useEffect(() => {
    if (id) {
      loadPOIs(id);
      loadStarredItems();
      loadClimbs(id);
      loadWaypoints(id);
    }
  }, [id, loadPOIs, loadStarredItems, loadClimbs, loadWaypoints]);

  const currentPointIndex = useMemo(() => {
    if (snappedPosition?.routeId === id) return snappedPosition.pointIndex;
    return undefined;
  }, [snappedPosition, id]);

  const elevProgress = useMemo(() => {
    if (currentPointIndex == null || !route) return null;
    return computeElevationProgress(route.points, currentPointIndex);
  }, [currentPointIndex, route]);

  const screenOptions = useMemo(() => ({ title: route?.name ?? "Route" }), [route?.name]);

  const chartPOIs = useMemo(() => {
    if (!id) return [];
    return getStarredPOIs(id);
    // starredKeys is a reactivity trigger: getStarredPOIs reads starredStore via get().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, getStarredPOIs, starredKeys]);

  const bounds = useMemo(() => {
    if (!route?.points.length) return null;
    return computeBounds(route.points);
  }, [route]);

  const routeWaypoints = useMemo(() => {
    if (!id) return [];
    return (waypointsByRoute[id] ?? [])
      .slice()
      .sort((a, b) => a.distanceAlongRouteMeters - b.distanceAlongRouteMeters);
  }, [id, waypointsByRoute]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!route) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-[17px] text-muted-foreground">Route not found</Text>
      </View>
    );
  }

  const handleExportGPX = async () => {
    if (!route) return;
    try {
      const gpx = serializeRouteToGPX(route, {
        routeWaypoints,
        poisAsWaypoints: chartPOIs,
      });
      await shareGPXFile(gpx, route.name);
    } catch (error) {
      Alert.alert("Export Failed", error instanceof Error ? error.message : "Unknown error");
    }
  };

  const chartWidth = screenWidth - 32;
  const chartHeight = 220;

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Mini map */}
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
            <RouteLayer
              key={mapStyle.styleKey}
              route={{ ...route, isActive: true }}
              points={route.points}
            />
          </MapboxMapView>
          <Pressable
            className="absolute bottom-2 right-2 w-[52px] h-[52px] bg-background/90 rounded-full items-center justify-center shadow-sm"
            onPress={() => router.push(getMapInspectHref("route", id))}
            accessibilityLabel="Expand route map"
            accessibilityRole="button"
          >
            <Maximize2 size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Stats */}
        <View className="flex-row px-4 mt-3 mb-3 gap-3">
          <StatBox label="Distance" value={formatDistance(route.totalDistanceMeters, units)} />
          <StatBox label="Ascent" value={"↑ " + formatElevation(route.totalAscentMeters, units)} />
          <StatBox
            label="Descent"
            value={"↓ " + formatElevation(route.totalDescentMeters, units)}
          />
        </View>

        {/* Elevation Profile */}
        <Text className="text-[22px] font-barlow-semibold text-foreground px-4 mt-2 mb-3">
          Elevation Profile
        </Text>
        <View className="mx-4 rounded-xl overflow-hidden bg-surface">
          <ElevationProfile
            points={route.points}
            units={units}
            width={chartWidth}
            height={chartHeight}
            currentPointIndex={currentPointIndex}
            pois={chartPOIs}
            onPOIPress={setSelectedPOI}
            climbs={routeClimbs}
          />
        </View>

        {routeWaypoints.length > 0 && (
          <View className="mt-4">
            <View className="flex-row items-baseline justify-between px-4 mb-2">
              <Text className="text-[22px] font-barlow-semibold text-foreground">Waypoints</Text>
              <Text className="text-[12px] text-muted-foreground font-barlow-sc-medium">
                {routeWaypoints.length}
              </Text>
            </View>
            <View className="mx-4 rounded-xl overflow-hidden border border-border bg-surface">
              {routeWaypoints.map((waypoint) => (
                <RouteWaypointRow key={waypoint.id} waypoint={waypoint} units={units} />
              ))}
            </View>
          </View>
        )}

        {/* Data: Map tiles, Google Places, OSM */}
        <DataSection routeId={id!} points={route.points} />

        {/* Progress (if snapped) */}
        {currentPointIndex != null && elevProgress && (
          <View className="mt-2">
            <Text className="text-[22px] font-barlow-semibold text-foreground px-4 mt-2 mb-3">
              Progress
            </Text>
            <View className="flex-row px-4 mb-3 gap-3">
              <StatBox
                label="Completed"
                value={formatDistance(
                  route.points[currentPointIndex].distanceFromStartMeters,
                  units,
                )}
              />
              <StatBox
                label="Remaining"
                value={formatDistance(
                  route.totalDistanceMeters -
                    route.points[currentPointIndex].distanceFromStartMeters,
                  units,
                )}
              />
            </View>
            <View className="flex-row px-4 mb-3 gap-3">
              <StatBox
                label="Ascent done"
                value={"↑ " + formatElevation(elevProgress.ascentDone, units)}
              />
              <StatBox
                label="Ascent left"
                value={"↑ " + formatElevation(elevProgress.ascentRemaining, units)}
              />
            </View>
            <View className="flex-row px-4 mb-3 gap-3">
              <StatBox
                label="Descent done"
                value={"↓ " + formatElevation(elevProgress.descentDone, units)}
              />
              <StatBox
                label="Descent left"
                value={"↓ " + formatElevation(elevProgress.descentRemaining, units)}
              />
            </View>
          </View>
        )}

        {/* Actions */}
        <View className="px-4 mt-6 gap-3">
          <Button onPress={handleExportGPX} label="Export GPX" variant="secondary" />
        </View>
      </ScrollView>
    </>
  );
}

function RouteWaypointRow({
  waypoint,
  units,
}: {
  waypoint: RouteWaypoint;
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
          {meta.label}
        </Text>
      </View>

      <View className="items-end ml-2">
        <Text className="text-[14px] font-barlow-sc-semibold text-foreground">
          {formatDistance(waypoint.distanceAlongRouteMeters, units)}
        </Text>
        {waypoint.distanceFromRouteMeters > 0 && (
          <Text className="text-[10px] text-muted-foreground font-barlow-sc-medium">
            {formatDistance(waypoint.distanceFromRouteMeters, units)} off route
          </Text>
        )}
      </View>
    </View>
  );
}
