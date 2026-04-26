import React, { useEffect, useState, useMemo, useRef } from "react";
import { View, ActivityIndicator, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Camera, MapView as MapboxMapView } from "@rnmapbox/maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Maximize } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/theme";
import { useMapStyle } from "@/hooks/useMapStyle";
import { useRouteStore } from "@/store/routeStore";
import { parseMapInspectParams } from "@/utils/mapInspect";
import { computeBounds } from "@/utils/geo";
import { stitchCollection } from "@/services/stitchingService";
import RouteLayer from "@/components/map/RouteLayer";
import { INACTIVE_ROUTE_COLOR } from "@/constants";
import type { Route, RouteWithPoints, StitchedCollection, StitchedSegmentInfo } from "@/types";

function routeFromStitchedSegment(segment: StitchedSegmentInfo): Route {
  return {
    id: segment.routeId,
    name: segment.routeName,
    fileName: "",
    color: INACTIVE_ROUTE_COLOR,
    isActive: true,
    isVisible: true,
    totalDistanceMeters: segment.segmentDistanceMeters,
    totalAscentMeters: segment.segmentAscentMeters,
    totalDescentMeters: segment.segmentDescentMeters,
    pointCount: segment.endPointIndex - segment.startPointIndex + 1,
    createdAt: "",
  };
}

export default function MapInspectScreen() {
  const { type, id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const mapStyle = useMapStyle();
  const cameraRef = useRef<Camera>(null);

  const params = parseMapInspectParams(type, id);

  const [route, setRoute] = useState<RouteWithPoints | null>(null);
  const [stitched, setStitched] = useState<StitchedCollection | null>(null);
  const [loading, setLoading] = useState(true);

  const getRouteDetail = useRouteStore((s) => s.getRouteDetail);

  useEffect(() => {
    if (!params.isValid || !params.id) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        if (params.type === "route") {
          const detail = await getRouteDetail(params.id!);
          setRoute(detail);
        } else if (params.type === "collection") {
          const s = await stitchCollection(params.id!);
          // Load points for selected segments
          const { getRoutePoints } = await import("@/db/database");
          const selectedRouteIds = s.segments.map((seg) => seg.routeId);
          const points = await Promise.all(selectedRouteIds.map((rid) => getRoutePoints(rid)));
          for (let i = 0; i < selectedRouteIds.length; i++) {
            s.pointsByRouteId[selectedRouteIds[i]] = points[i];
          }
          setStitched(s);
        }
      } catch (e) {
        console.warn("Failed to load map inspect data:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.isValid, params.id, params.type, getRouteDetail]);

  const bounds = useMemo(() => {
    if (params.type === "route" && route?.points.length) {
      return computeBounds(route.points);
    }
    if (params.type === "collection" && stitched?.points.length) {
      return computeBounds(stitched.points);
    }
    return null;
  }, [params.type, route, stitched]);

  const fitRoute = () => {
    if (!bounds) return;
    cameraRef.current?.setCamera({
      bounds: {
        ne: bounds.ne,
        sw: bounds.sw,
        paddingLeft: 40,
        paddingRight: 40,
        paddingTop: insets.top + 40,
        paddingBottom: insets.bottom + 40,
      },
      animationDuration: 300,
    });
  };

  if (!params.isValid) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-[17px] text-muted-foreground">Invalid parameters</Text>
        <Pressable
          className="mt-4 px-6 py-3 bg-secondary rounded-full"
          onPress={() => router.back()}
        >
          <Text className="text-foreground font-barlow-medium">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (params.type === "route" && !route) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-[17px] text-muted-foreground">Route not found</Text>
        <Pressable
          className="mt-4 px-6 py-3 bg-secondary rounded-full"
          onPress={() => router.back()}
        >
          <Text className="text-foreground font-barlow-medium">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (params.type === "collection" && !stitched) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-[17px] text-muted-foreground">Collection not found</Text>
        <Pressable
          className="mt-4 px-6 py-3 bg-secondary rounded-full"
          onPress={() => router.back()}
        >
          <Text className="text-foreground font-barlow-medium">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <MapboxMapView
        style={{ flex: 1 }}
        {...mapStyle.props}
        compassEnabled={false}
        scaleBarEnabled={false}
        rotateEnabled={true}
        scrollEnabled={true}
        zoomEnabled={true}
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
                    paddingTop: insets.top + 40,
                    paddingBottom: insets.bottom + 40,
                  },
                }
              : undefined
          }
        />
        {params.type === "route" && route && (
          <RouteLayer
            key={mapStyle.styleKey}
            route={{ ...route, isActive: true }}
            points={route.points}
          />
        )}
        {params.type === "collection" && stitched && (
          <>
            {stitched.segments.map((seg) => {
              const points = stitched.pointsByRouteId[seg.routeId];
              if (!points) return null;
              return (
                <RouteLayer
                  key={`${seg.routeId}-${mapStyle.styleKey}`}
                  route={routeFromStitchedSegment(seg)}
                  points={points}
                />
              );
            })}
          </>
        )}
      </MapboxMapView>

      {/* Controls */}
      <View className="absolute left-4 pointer-events-box-none" style={{ top: insets.top + 12 }}>
        <Pressable
          className="w-[52px] h-[52px] bg-background/90 rounded-full items-center justify-center shadow-sm pointer-events-auto"
          onPress={() => router.back()}
          accessibilityLabel="Close map"
          accessibilityRole="button"
        >
          <X size={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View
        className="absolute right-4 gap-3 pointer-events-box-none"
        style={{ bottom: insets.bottom + 24 }}
      >
        <Pressable
          className="w-[52px] h-[52px] bg-background/90 rounded-full items-center justify-center shadow-sm pointer-events-auto"
          onPress={fitRoute}
          accessibilityLabel="Fit route"
          accessibilityRole="button"
        >
          <Maximize size={24} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}
