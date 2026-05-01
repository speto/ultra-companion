import React, { useEffect, useMemo } from "react";
import { View, TouchableOpacity, TextInput as RNTextInput } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { Check, Mountain, Pencil } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { ListDivider } from "@/components/ui/list-divider";
import { useSettingsStore } from "@/store/settingsStore";
import { useEtaStore } from "@/store/etaStore";
import { useThemeColors } from "@/theme";
import {
  CLIMB_DIFFICULTY_LABELS,
  climbDifficultyColor,
  getClimbDifficulty,
} from "@/constants/climbHelpers";
import { formatDistance, formatElevation, formatETA } from "@/utils/formatters";
import type { Climb } from "@/types";

interface ClimbListItemProps {
  climb: Climb;
  currentDistAlongRoute: number | null;
  isPast: boolean;
  isSelected?: boolean;
  onPress: (climb: Climb) => void;
  onEdit?: (climb: Climb) => void;
  isEditing?: boolean;
  editName?: string;
  onEditNameChange?: (name: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEditIntentStart?: () => void;
  ordinal?: { current: number; total: number } | null;
  snappedPositionPresent?: boolean;
  showDivider?: boolean;
}

function ClimbListItem({
  climb,
  currentDistAlongRoute,
  isPast,
  isSelected = false,
  onPress,
  onEdit,
  isEditing = false,
  editName = "",
  onEditNameChange,
  onSaveEdit,
  onCancelEdit,
  onSaveEditIntentStart,
  ordinal,
  snappedPositionPresent = false,
  showDivider = true,
}: ClimbListItemProps) {
  const colors = useThemeColors();
  const units = useSettingsStore((s) => s.units);
  const getETAToDistance = useEtaStore((s) => s.getETAToDistance);
  const etaRouteId = useEtaStore((s) => s.routeId);
  const etaCacheVersion = useEtaStore((s) => s.cacheVersion);
  const etaCachedPointsLength = useEtaStore((s) => s.cachedPoints?.length ?? 0);
  const etaCumulativeTimeLength = useEtaStore((s) => s.cumulativeTime?.length ?? 0);
  const etaCacheKey = `${etaRouteId ?? ""}:${etaCacheVersion}:${etaCachedPointsLength}:${etaCumulativeTimeLength}`;

  const difficulty = getClimbDifficulty(climb.difficultyScore);
  const difficultyLabel = CLIMB_DIFFICULTY_LABELS[difficulty];
  const diffColor = climbDifficultyColor(climb.difficultyScore);
  const climbName = climb.name ?? "Unnamed climb";

  const distAhead =
    currentDistAlongRoute != null ? climb.startDistanceMeters - currentDistAlongRoute : null;
  const startText = formatDistance(climb.startDistanceMeters, units);
  const etaResult = useMemo(() => {
    void etaCacheKey;
    return getETAToDistance(climb.startDistanceMeters);
  }, [climb.startDistanceMeters, etaCacheKey, getETAToDistance]);
  const etaPrimaryText = etaResult ? formatETA(etaResult.eta) : "--:--";

  useEffect(() => {
    if (!__DEV__ || !isSelected) return;
    const isUpcoming =
      currentDistAlongRoute == null || climb.startDistanceMeters > currentDistAlongRoute;
    if (!isUpcoming) return;
    const etaMissing = distAhead != null && distAhead > 0 && etaResult == null;
    if (!etaMissing) return;
    const missingInputs = [
      !snappedPositionPresent ? "snappedPosition" : null,
      etaRouteId == null ? "etaRouteId" : null,
      etaCachedPointsLength === 0 ? "etaCachedPoints" : null,
      etaCumulativeTimeLength === 0 ? "etaCumulativeTime" : null,
    ].filter(Boolean);
    console.info(
      `[climb-values] missing=eta climb=${climb.id} snappedPosition=${snappedPositionPresent} currentDist=${currentDistAlongRoute ?? "null"} etaRouteId=${etaRouteId ?? "null"} etaCachedPoints=${etaCachedPointsLength} etaCumulativeTime=${etaCumulativeTimeLength} etaVersion=${etaCacheVersion} targetStart=${Math.round(climb.startDistanceMeters)} absentInputs=${missingInputs.join(",") || "none"}`,
    );
  }, [
    climb.id,
    climb.startDistanceMeters,
    currentDistAlongRoute,
    distAhead,
    etaCachedPointsLength,
    etaCacheVersion,
    etaCumulativeTimeLength,
    etaResult,
    etaRouteId,
    isSelected,
    snappedPositionPresent,
  ]);

  const metrics = [
    { key: "start", value: startText },
    { key: "eta", value: etaPrimaryText },
    {
      key: "gain",
      value: formatElevation(climb.totalAscentMeters, units),
    },
    {
      key: "length",
      value: formatDistance(climb.lengthMeters, units),
    },
    {
      key: "avg",
      value: `${climb.averageGradientPercent}%`,
    },
    {
      key: "max",
      value: `${climb.maxGradientPercent}%`,
    },
  ];

  const handleEditPress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onEdit?.(climb);
  };

  const handleSavePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onSaveEdit?.();
  };

  return (
    <TouchableOpacity
      className="px-4 relative justify-center"
      style={[
        { height: 72 },
        isSelected ? { backgroundColor: `${diffColor}12` } : undefined,
        isPast ? { opacity: 0.4 } : undefined,
      ]}
      onPress={() => onPress(climb)}
      accessibilityLabel={
        ordinal ? `Climb ${ordinal.current} of ${ordinal.total}, ${climbName}` : climbName
      }
    >
      <View className="flex-row items-center">
        <View className="flex-1 min-w-0">
          {isEditing ? (
            <View className="flex-row items-center">
              <RNTextInput
                className="flex-1 min-w-0 text-[15px] font-barlow-semibold text-foreground border-b border-accent"
                value={editName}
                onChangeText={onEditNameChange}
                placeholder="Climb name"
                placeholderTextColor={colors.textTertiary}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focus input when editing starts
                autoFocus
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={onSaveEdit}
                onBlur={onCancelEdit}
              />
              <TouchableOpacity
                className="w-[32px] h-[32px] items-center justify-center ml-1"
                hitSlop={8}
                onPressIn={onSaveEditIntentStart}
                onPress={handleSavePress}
                accessibilityLabel="Save climb name"
                accessibilityRole="button"
              >
                <Check size={16} color={colors.accent} />
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-row items-center">
              <Text
                className="text-[15px] font-barlow-semibold text-foreground flex-shrink"
                numberOfLines={1}
              >
                {climbName}
              </Text>
              {ordinal && (
                <Text className="ml-2 text-[13px] font-barlow-medium text-muted-foreground">
                  {ordinal.current}/{ordinal.total}
                </Text>
              )}
              {onEdit && (
                <TouchableOpacity
                  className="w-[32px] h-[32px] items-center justify-center ml-0.5"
                  hitSlop={8}
                  onPress={handleEditPress}
                  accessibilityLabel="Edit climb name"
                  accessibilityRole="button"
                >
                  <Pencil size={12} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
        <View className="flex-row items-center ml-2 flex-shrink-0">
          <Mountain size={14} color={diffColor} />
          <Text className="ml-1 text-[13px] font-barlow-semibold" style={{ color: diffColor }}>
            {difficultyLabel} · {Math.round(climb.difficultyScore)}
          </Text>
        </View>
      </View>
      <View className="flex-row mt-1.5">
        {metrics.map((metric) => (
          <MetricValue key={metric.key} value={metric.value} />
        ))}
      </View>
      {showDivider ? <ListDivider className="absolute bottom-0 left-4 right-0" /> : null}
    </TouchableOpacity>
  );
}

export default React.memo(ClimbListItem);

function MetricValue({ value }: { value: string }) {
  return (
    <View className="flex-1 min-w-0 items-center px-0.5">
      <Text
        className="text-[13px] font-barlow-sc-semibold text-foreground text-center"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
    </View>
  );
}
