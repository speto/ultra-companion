import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, TouchableOpacity } from "react-native";
import {
  NestableDraggableFlatList,
  ScaleDecorator,
  RenderItemParams,
} from "react-native-draggable-flatlist";
import { Text } from "@/components/ui/text";
import { ArrowDown, ArrowUp, Clock3, Flag, GripVertical, Star, X } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/theme";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useSettingsStore } from "@/store/settingsStore";
import { useEtaStore } from "@/store/etaStore";
import { usePoiStore } from "@/store/poiStore";
import { useStarredStore } from "@/store/starredStore";
import { useWaypointStore } from "@/store/waypointStore";
import { computeRouteETA } from "@/services/etaCalculator";
import { formatDistance, formatElevation, formatDuration } from "@/utils/formatters";
import { getSegmentControlVisibility } from "@/utils/collectionEditMode";
import { SEGMENT_COLORS_DARK, SEGMENT_COLORS_LIGHT } from "@/constants";
import SegmentCard, { type SegmentCardMetadataItem } from "./SegmentCard";
import type { CollectionSegmentWithRoute, RoutePoint, UnitSystem } from "@/types";

/** A position slot: one or more variants grouped together */
interface PositionGroup {
  key: string;
  position: number;
  variants: CollectionSegmentWithRoute[];
}

interface RouteMetadataCounts {
  waypointCount: number;
  starredCount: number;
}

interface SegmentListProps {
  segmentsWithRoutes: CollectionSegmentWithRoute[];
  pointsByRouteId: Record<string, RoutePoint[]>;
  onSelectVariant: (routeId: string) => void;
  onReorder: (orderedPositions: { routeId: string; position: number }[]) => Promise<void>;
  onRemove: (routeId: string) => void;
  isEditing: boolean;
}

function groupByPosition(segments: CollectionSegmentWithRoute[]): PositionGroup[] {
  const map = new Map<number, CollectionSegmentWithRoute[]>();
  for (const sw of segments) {
    const pos = sw.segment.position;
    if (!map.has(pos)) map.set(pos, []);
    map.get(pos)!.push(sw);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pos, variants]) => ({
      key: `pos-${pos}`,
      position: pos,
      variants,
    }));
}

/** Single segment row — shows name, stats, and riding time */
function SegmentRowContent({
  sw,
  isSelected,
  hasVariants,
  posIdx,
  ridingTime,
  waypointCount,
  starredCount,
  drag,
  onSelectVariant,
  onRemove,
  isEditing,
  units,
}: {
  sw: CollectionSegmentWithRoute;
  isSelected: boolean;
  hasVariants: boolean;
  posIdx: number;
  ridingTime: number | null;
  waypointCount: number;
  starredCount: number;
  drag?: () => void;
  onSelectVariant: (routeId: string) => void;
  onRemove: (routeId: string) => void;
  isEditing: boolean;
  units: UnitSystem;
}) {
  const colors = useThemeColors();
  const { colorScheme } = useColorScheme();
  const router = useRouter();
  const { showLeftControls, showRemove, showChevron } = getSegmentControlVisibility(isEditing);
  const segmentColor = (colorScheme === "dark" ? SEGMENT_COLORS_DARK : SEGMENT_COLORS_LIGHT)[
    posIdx % SEGMENT_COLORS_LIGHT.length
  ];
  const handleSelect = useCallback(() => {
    onSelectVariant(sw.route.id);
  }, [onSelectVariant, sw.route.id]);
  const handleRemove = useCallback(() => {
    onRemove(sw.route.id);
  }, [onRemove, sw.route.id]);
  const handleOpenRoute = useCallback(() => {
    router.push(`/route/${sw.route.id}`);
  }, [router, sw.route.id]);
  const metadataItems = useMemo<SegmentCardMetadataItem[]>(() => {
    const items: SegmentCardMetadataItem[] = [
      {
        label: formatElevation(sw.route.totalAscentMeters, units),
        icon: <ArrowUp size={11} color={colors.textTertiary} />,
      },
      {
        label: formatElevation(sw.route.totalDescentMeters, units),
        icon: <ArrowDown size={11} color={colors.textTertiary} />,
      },
    ];
    if (ridingTime != null) {
      items.push({
        label: formatDuration(ridingTime),
        icon: <Clock3 size={11} color={colors.textTertiary} />,
      });
    }
    if (waypointCount > 0) {
      items.push({
        label: String(waypointCount),
        icon: <Flag size={11} color={colors.textTertiary} />,
      });
    }
    if (starredCount > 0) {
      items.push({
        label: String(starredCount),
        icon: <Star size={11} color={colors.starred} />,
      });
    }
    return items;
  }, [
    colors.starred,
    colors.textTertiary,
    ridingTime,
    starredCount,
    sw.route.totalAscentMeters,
    sw.route.totalDescentMeters,
    units,
    waypointCount,
  ]);
  const action = showRemove ? (
    <View className="flex-row items-center">
      {(isSelected || hasVariants) && (
        <TouchableOpacity
          className="w-[48px] h-[48px] items-center justify-center"
          onPress={handleRemove}
          hitSlop={4}
        >
          <X size={16} color={colors.destructive} />
        </TouchableOpacity>
      )}
    </View>
  ) : undefined;

  return (
    <View className="flex-row items-center">
      {/* Left: drag handle or radio button */}
      {showLeftControls &&
        (isSelected && drag ? (
          <TouchableOpacity
            onLongPress={drag}
            delayLongPress={150}
            className="w-[48px] h-[48px] items-center justify-center -ml-2"
          >
            <GripVertical size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            className="w-[48px] h-[48px] items-center justify-center -ml-2"
            onPress={handleSelect}
            disabled={isSelected || !hasVariants}
          >
            <View
              className="w-[18px] h-[18px] rounded-full border-2 items-center justify-center"
              style={{ borderColor: isSelected ? colors.accent : colors.textTertiary }}
            >
              {isSelected && (
                <View
                  className="w-[10px] h-[10px] rounded-full"
                  style={{ backgroundColor: colors.accent }}
                />
              )}
            </View>
          </TouchableOpacity>
        ))}

      <View className="flex-1">
        <SegmentCard
          title={sw.route.name}
          subtitle={formatDistance(sw.route.totalDistanceMeters, units)}
          metadataItems={metadataItems}
          color={segmentColor}
          index={hasVariants ? undefined : posIdx + 1}
          onPress={handleOpenRoute}
          action={showChevron ? undefined : action}
        />
      </View>
    </View>
  );
}

const SegmentRow = React.memo(SegmentRowContent);

export default function SegmentList({
  segmentsWithRoutes,
  pointsByRouteId,
  onSelectVariant,
  onReorder,
  onRemove,
  isEditing,
}: SegmentListProps) {
  const colors = useThemeColors();
  const units = useSettingsStore((s) => s.units);
  const powerConfig = useEtaStore((s) => s.powerConfig);
  const poisByRoute = usePoiStore((s) => s.pois);
  const starredKeys = useStarredStore((s) => s.starredKeys);
  const waypointsByRoute = useWaypointStore((s) => s.waypoints);

  // Local order state for drag reordering
  const serverGroups = useMemo(() => groupByPosition(segmentsWithRoutes), [segmentsWithRoutes]);
  const [localGroups, setLocalGroups] = useState<PositionGroup[]>(serverGroups);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalGroups(serverGroups);
  }, [serverGroups]);

  const ridingTimeByRouteId = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const sw of segmentsWithRoutes) {
      const routeId = sw.route.id;
      if (map.has(routeId)) continue;
      const points = pointsByRouteId[routeId];
      if (!points || points.length < 2) {
        map.set(routeId, null);
        continue;
      }
      const cumulative = computeRouteETA(points, powerConfig);
      map.set(routeId, cumulative[cumulative.length - 1] ?? null);
    }
    return map;
  }, [pointsByRouteId, powerConfig, segmentsWithRoutes]);

  const metadataCountsByRouteId = useMemo(() => {
    const map = new Map<string, RouteMetadataCounts>();
    for (const sw of segmentsWithRoutes) {
      const routeId = sw.route.id;
      if (map.has(routeId)) continue;
      const routeWaypoints = waypointsByRoute[routeId] ?? [];
      const starredWaypointCount = routeWaypoints.filter((waypoint) =>
        starredKeys.has(`routeWaypoint:${waypoint.id}`),
      ).length;
      const starredPoiCount = (poisByRoute[routeId] ?? []).filter((poi) =>
        starredKeys.has(`downloadedPoi:${poi.id}`),
      ).length;
      map.set(routeId, {
        waypointCount: routeWaypoints.length,
        starredCount: starredWaypointCount + starredPoiCount,
      });
    }
    return map;
  }, [poisByRoute, segmentsWithRoutes, starredKeys, waypointsByRoute]);

  const hasOrderChanged = useMemo(() => {
    if (localGroups.length !== serverGroups.length) return false;
    return localGroups.some((g, i) => g.position !== serverGroups[i]?.position);
  }, [localGroups, serverGroups]);

  const handleSaveOrder = useCallback(async () => {
    setIsSaving(true);
    const updates: { routeId: string; position: number }[] = [];
    localGroups.forEach((group, newPos) => {
      for (const sw of group.variants) {
        updates.push({ routeId: sw.route.id, position: newPos });
      }
    });
    await onReorder(updates);
    setIsSaving(false);
  }, [localGroups, onReorder]);

  const handleDragEnd = useCallback(({ data }: { data: PositionGroup[] }) => {
    setLocalGroups(data);
  }, []);

  const renderGroup = useCallback(
    ({
      group,
      drag,
      isDragging,
      decorate,
      index,
    }: {
      group: PositionGroup;
      index: number;
      drag?: () => void;
      isDragging: boolean;
      decorate: boolean;
    }) => {
      const posIdx = index;
      const hasVariants = group.variants.length > 1;

      const content = (
        <View
          className="mb-2"
          style={
            isDragging
              ? { backgroundColor: colors.surfaceRaised, borderRadius: 12, opacity: 0.9 }
              : undefined
          }
        >
          {hasVariants && (
            <Text className="text-[11px] text-muted-foreground font-barlow-semibold uppercase tracking-wide ml-1 mb-1">
              {posIdx + 1}. Choose variant
            </Text>
          )}

          {hasVariants ? (
            <View className="rounded-xl overflow-hidden border border-border">
              {group.variants.map((sw, vIdx) => {
                const isSelected = sw.segment.isSelected;
                const metadataCounts = metadataCountsByRouteId.get(sw.route.id);
                return (
                  <View key={sw.route.id}>
                    {vIdx > 0 && (
                      <View
                        className="mx-3"
                        style={{ height: 1, backgroundColor: colors.border }}
                      />
                    )}
                    <SegmentRow
                      sw={sw}
                      isSelected={isSelected}
                      hasVariants
                      posIdx={posIdx}
                      ridingTime={ridingTimeByRouteId.get(sw.route.id) ?? null}
                      waypointCount={metadataCounts?.waypointCount ?? 0}
                      starredCount={metadataCounts?.starredCount ?? 0}
                      onSelectVariant={onSelectVariant}
                      onRemove={onRemove}
                      isEditing={isEditing}
                      units={units}
                    />
                  </View>
                );
              })}
            </View>
          ) : (
            group.variants.map((sw) => {
              const metadataCounts = metadataCountsByRouteId.get(sw.route.id);
              return (
                <SegmentRow
                  key={sw.route.id}
                  sw={sw}
                  isSelected={sw.segment.isSelected}
                  hasVariants={false}
                  posIdx={posIdx}
                  ridingTime={ridingTimeByRouteId.get(sw.route.id) ?? null}
                  waypointCount={metadataCounts?.waypointCount ?? 0}
                  starredCount={metadataCounts?.starredCount ?? 0}
                  drag={drag}
                  onSelectVariant={onSelectVariant}
                  onRemove={onRemove}
                  isEditing={isEditing}
                  units={units}
                />
              );
            })
          )}
        </View>
      );

      return decorate ? <ScaleDecorator>{content}</ScaleDecorator> : content;
    },
    [
      colors,
      isEditing,
      metadataCountsByRouteId,
      onRemove,
      onSelectVariant,
      ridingTimeByRouteId,
      units,
    ],
  );

  const renderItem = useCallback(
    ({ item: group, getIndex, drag, isActive: isDragging }: RenderItemParams<PositionGroup>) =>
      renderGroup({ group, index: getIndex() ?? 0, drag, isDragging, decorate: true }),
    [renderGroup],
  );

  if (localGroups.length === 0) {
    return (
      <View className="items-center py-6">
        <Text className="text-[15px] text-muted-foreground">No segments added yet</Text>
      </View>
    );
  }

  return (
    <View>
      {isEditing ? (
        <NestableDraggableFlatList
          data={localGroups}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          onDragEnd={handleDragEnd}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={3}
        />
      ) : (
        localGroups.map((group, index) => (
          <View key={group.key}>
            {renderGroup({ group, index, isDragging: false, decorate: false })}
          </View>
        ))
      )}
      {isEditing && hasOrderChanged && (
        <Button
          className="mt-2"
          onPress={handleSaveOrder}
          disabled={isSaving}
          label={isSaving ? "Saving..." : "Save Order"}
        />
      )}
    </View>
  );
}
