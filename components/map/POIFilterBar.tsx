import React, { useMemo, useCallback } from "react";
import { Alert, View, TouchableOpacity, ScrollView } from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import {
  Clock,
  Droplets,
  Bed,
  ShowerHead,
  UtensilsCrossed,
  SlidersHorizontal,
  X,
  Star,
} from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useThemeColors } from "@/theme";
import { usePoiStore } from "@/store/poiStore";
import { useStarredStore } from "@/store/starredStore";
import { POI_CATEGORIES } from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";
import type { POICategory } from "@/types";

const WATER_COLOR = POI_CATEGORIES.find((c) => c.key === "water")!.color;
const FOOD_COLOR = POI_CATEGORIES.find((c) => c.key === "groceries")!.color;
const REST_COLOR = POI_CATEGORIES.find((c) => c.key === "shelter")!.color;
const WC_COLOR = POI_CATEGORIES.find((c) => c.key === "toilet_shower")!.color;

interface POIFilterBarProps {
  routeIds: string[];
}

/** Water-like categories toggled by the quick Water control */
const WATER_CATEGORIES: POICategory[] = ["water", "cemetery"];

/** Food-like categories toggled by the quick Food control */
const FOOD_CATEGORIES: POICategory[] = ["groceries", "bakery", "gas_station"];

/** Sleep/rest categories toggled by the quick Rest control */
const REST_CATEGORIES: POICategory[] = ["shelter", "bus_stop", "sports", "school"];

/** Groups for the category sheet */
const CATEGORY_GROUPS = [
  {
    label: "Water",
    keys: WATER_CATEGORIES,
  },
  {
    label: "Food",
    keys: ["groceries", "bakery", "gas_station"] as POICategory[],
  },
  {
    label: "Rest",
    keys: ["shelter", "bus_stop", "sports", "school"] as POICategory[],
  },
  {
    label: "WC",
    keys: ["toilet_shower"] as POICategory[],
  },
];

export default function POIFilterBar({ routeIds }: POIFilterBarProps) {
  const colors = useThemeColors();
  const allPois = usePoiStore((s) => s.pois);
  const enabledCategories = usePoiStore((s) => s.enabledCategories);
  const setEnabledCategories = usePoiStore((s) => s.setEnabledCategories);
  const showOpenOnly = usePoiStore((s) => s.showOpenOnly);
  const foodAvailabilityMode = usePoiStore((s) => s.foodAvailabilityMode);
  const setFoodAvailabilityMode = usePoiStore((s) => s.setFoodAvailabilityMode);
  const foodAvailabilityCustomTime = usePoiStore((s) => s.foodAvailabilityCustomTime);
  const showSavedOnly = usePoiStore((s) => s.showSavedOnly);
  const toggleShowSavedOnly = usePoiStore((s) => s.toggleShowSavedOnly);
  const setAllCategories = usePoiStore((s) => s.setAllCategories);
  const starredKeys = useStarredStore((s) => s.starredKeys);
  const enabledSet = useMemo(() => new Set(enabledCategories), [enabledCategories]);
  const isCategoryFilterActive = enabledCategories.length < POI_CATEGORIES.length;

  const isExactMatch = useCallback(
    (targetCategories: POICategory[]) => {
      return (
        isCategoryFilterActive &&
        enabledCategories.length === targetCategories.length &&
        targetCategories.every((c) => enabledSet.has(c))
      );
    },
    [isCategoryFilterActive, enabledCategories, enabledSet],
  );

  const handleQuickToggle = useCallback(
    (targetCategories: POICategory[]) => {
      const startedAt = Date.now();
      const label = targetCategories.join(",");
      if (isExactMatch(targetCategories)) {
        setAllCategories(true);
      } else {
        setEnabledCategories(targetCategories);
      }

      if (__DEV__) {
        requestAnimationFrame(() => {
          console.info(`[poi-filter] ${label} tap -> next frame in ${Date.now() - startedAt}ms`);
        });
      }
    },
    [isExactMatch, setAllCategories, setEnabledCategories],
  );

  // POI count for hasPois check
  const hasPois = useMemo(() => {
    for (const routeId of routeIds) {
      if ((allPois[routeId]?.length ?? 0) > 0) return true;
    }
    return false;
  }, [routeIds, allPois]);

  const hasStarredPois = useMemo(() => {
    const starredPoiIds = new Set(
      [...starredKeys]
        .filter((key) => key.startsWith("downloadedPoi:"))
        .map((key) => key.slice("downloadedPoi:".length)),
    );
    if (starredPoiIds.size === 0) return false;

    for (const routeId of routeIds) {
      if ((allPois[routeId] ?? []).some((poi) => starredPoiIds.has(poi.id))) return true;
    }
    return false;
  }, [routeIds, allPois, starredKeys]);
  const waterEnabled = isExactMatch(WATER_CATEGORIES);
  const wcEnabled = isExactMatch(["toilet_shower"]);
  const foodEnabled = isExactMatch(FOOD_CATEGORIES);
  const restEnabled = isExactMatch(REST_CATEGORIES);

  const isCustomFilterActive =
    isCategoryFilterActive && !waterEnabled && !wcEnabled && !foodEnabled && !restEnabled;

  const getQuickAccessibilityLabel = (label: string, isActive: boolean) => {
    if (!isCategoryFilterActive) return `Show only ${label}`;
    if (isActive) return `Clear ${label} filter`;
    return `Switch to ${label} filter`;
  };

  const foodAvailabilityLabel = getFoodAvailabilityLabel(
    foodAvailabilityMode,
    foodAvailabilityCustomTime,
  );

  const cycleFoodAvailability = useCallback(() => {
    if (foodAvailabilityMode === "off") setFoodAvailabilityMode("now");
    else if (foodAvailabilityMode === "now") setFoodAvailabilityMode("eta");
    else setFoodAvailabilityMode("off");
  }, [foodAvailabilityMode, setFoodAvailabilityMode]);

  if (!hasPois) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="items-center px-3 py-1.5 gap-2"
      >
        <FilterChip
          active={waterEnabled}
          onPress={() => handleQuickToggle(WATER_CATEGORIES)}
          icon={<Droplets size={18} color={waterEnabled ? WATER_COLOR : colors.textTertiary} />}
          label="Water"
          accessibilityLabel={getQuickAccessibilityLabel("Water", waterEnabled)}
        />

        <FilterChip
          active={foodEnabled}
          onPress={() => handleQuickToggle(FOOD_CATEGORIES)}
          icon={
            <UtensilsCrossed size={18} color={foodEnabled ? FOOD_COLOR : colors.textTertiary} />
          }
          label="Food"
          accessibilityLabel={getQuickAccessibilityLabel("Food", foodEnabled)}
        />

        {foodEnabled && (
          <FilterChip
            active={foodAvailabilityMode !== "off"}
            onPress={cycleFoodAvailability}
            icon={
              <Clock
                size={18}
                color={foodAvailabilityMode !== "off" ? colors.positive : colors.textTertiary}
              />
            }
            label={foodAvailabilityLabel}
            accessibilityLabel={
              foodAvailabilityMode === "off"
                ? "Filter food by availability"
                : `Food availability filter ${foodAvailabilityLabel}`
            }
            activeTone="positive"
          />
        )}
        <FilterChip
          active={restEnabled}
          onPress={() => handleQuickToggle(REST_CATEGORIES)}
          icon={<Bed size={18} color={restEnabled ? REST_COLOR : colors.textTertiary} />}
          label="Rest"
          accessibilityLabel={getQuickAccessibilityLabel("Rest", restEnabled)}
        />

        <FilterChip
          active={wcEnabled}
          onPress={() => handleQuickToggle(["toilet_shower"])}
          icon={<ShowerHead size={18} color={wcEnabled ? WC_COLOR : colors.textTertiary} />}
          label="WC"
          accessibilityLabel={getQuickAccessibilityLabel("WC", wcEnabled)}
        />
        {(hasStarredPois || showSavedOnly) && (
          <FilterChip
            active={showSavedOnly}
            onPress={toggleShowSavedOnly}
            icon={
              <Star
                size={18}
                color={showSavedOnly ? colors.starred : colors.textTertiary}
                fill={showSavedOnly ? colors.starred : "none"}
              />
            }
            label="Saved"
            accessibilityLabel={showSavedOnly ? "Show all POIs" : "Show only saved POIs"}
            activeTone="starred"
          />
        )}
        <FilterChip
          active={isCustomFilterActive || (!foodEnabled && showOpenOnly)}
          onPress={() => {
            router.push("/poi-filters");
          }}
          icon={
            <SlidersHorizontal
              size={18}
              color={
                isCustomFilterActive || (!foodEnabled && showOpenOnly)
                  ? colors.accent
                  : colors.textTertiary
              }
            />
          }
          label="More"
          accessibilityLabel="Open category filters"
          accessibilityRoleOverride="button"
        />

        {isCategoryFilterActive && (
          <FilterChip
            active={false}
            onPress={() => setAllCategories(true)}
            icon={<X size={18} color={colors.textTertiary} />}
            label="Clear"
            accessibilityLabel="Clear category filters"
            accessibilityRoleOverride="button"
          />
        )}
      </ScrollView>
    </>
  );
}

function FilterChip({
  active,
  onPress,
  icon,
  label,
  badgeText,
  activeTone = "accent",
  accessibilityLabel,
  accessibilityCheckedState,
  accessibilityRoleOverride,
}: {
  active: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  label: string;
  badgeText?: string;
  activeTone?: "accent" | "positive" | "starred";
  accessibilityLabel: string;
  accessibilityCheckedState?: boolean | "mixed";
  accessibilityRoleOverride?: "button" | "switch";
}) {
  const accessibilityRole = accessibilityRoleOverride ?? "switch";
  return (
    <TouchableOpacity
      className={cn(
        "flex-row items-center px-3 py-2 min-h-[40px] rounded-full border",
        active
          ? activeTone === "positive"
            ? "bg-positive/10 border-positive/30"
            : activeTone === "starred"
              ? "bg-starred/10 border-starred/30"
              : "bg-accent/10 border-accent/30"
          : "border-transparent bg-muted",
      )}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      activeOpacity={0.7}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={
        accessibilityRole === "button"
          ? undefined
          : { checked: accessibilityCheckedState ?? active }
      }
    >
      {icon}
      <Text
        className={cn(
          "ml-1.5 text-[14px] font-barlow-semibold",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
      {badgeText && (
        <View className="ml-1.5 bg-background/50 px-1.5 py-0.5 rounded-md">
          <Text className="text-[10px] font-barlow-sc-medium text-foreground">{badgeText}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function POIFilterSheetContent({ onClose }: { onClose: () => void }) {
  const colors = useThemeColors();
  const enabledCategories = usePoiStore((s) => s.enabledCategories);
  const setEnabledCategories = usePoiStore((s) => s.setEnabledCategories);
  const foodAvailabilityMode = usePoiStore((s) => s.foodAvailabilityMode);
  const setFoodAvailabilityMode = usePoiStore((s) => s.setFoodAvailabilityMode);
  const foodAvailabilityCustomTime = usePoiStore((s) => s.foodAvailabilityCustomTime);
  const setFoodAvailabilityCustomTime = usePoiStore((s) => s.setFoodAvailabilityCustomTime);
  const setAllCategories = usePoiStore((s) => s.setAllCategories);

  const enabledSet = useMemo(() => new Set(enabledCategories), [enabledCategories]);
  const isCategoryFilterActive = enabledCategories.length < POI_CATEGORIES.length;

  const handleToggleLeaf = useCallback(
    (category: POICategory) => {
      if (!isCategoryFilterActive) {
        setEnabledCategories([category]);
      } else if (enabledSet.has(category)) {
        const next = enabledCategories.filter((c) => c !== category);
        if (next.length === 0) setAllCategories(true);
        else setEnabledCategories(next);
      } else {
        setEnabledCategories([...enabledCategories, category]);
      }
    },
    [isCategoryFilterActive, enabledSet, enabledCategories, setEnabledCategories, setAllCategories],
  );

  const handleReset = () => {
    setAllCategories(true);
  };

  const chooseCustomTime = () => {
    Alert.prompt(
      "Availability time",
      "Enter local time as HH:mm",
      (value) => {
        const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (hours > 23 || minutes > 59) return;

        const next = new Date();
        next.setHours(hours, minutes, 0, 0);
        if (next.getTime() < Date.now()) next.setDate(next.getDate() + 1);
        setFoodAvailabilityCustomTime(next.toISOString());
        setFoodAvailabilityMode("custom");
      },
      "plain-text",
      foodAvailabilityCustomTime
        ? formatTimeForChip(new Date(foodAvailabilityCustomTime))
        : "06:30",
      "numbers-and-punctuation",
    );
  };

  const getLeafAccessibilityLabel = (key: POICategory, label: string) => {
    if (!isCategoryFilterActive) return `Show only ${label}`;
    if (enabledSet.has(key)) {
      return enabledCategories.length === 1 ? `Clear ${label} filter` : `Hide ${label}`;
    }
    return `Add ${label} to filter`;
  };
  return (
    <View className="flex-1" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-center justify-between px-4 pt-4 pb-4">
        <View className="flex-1 min-h-[48px] justify-center">
          <Text className="text-lg font-barlow-semibold text-foreground">More filters</Text>
        </View>
        <View className="flex-row items-center">
          {isCategoryFilterActive && (
            <TouchableOpacity
              onPress={handleReset}
              className="min-h-[48px] px-3 items-center justify-center mr-2"
              accessibilityLabel="Clear category filters"
              accessibilityRole="button"
            >
              <Text className="text-sm font-barlow-medium text-accent">Clear</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onClose}
            className="min-h-[48px] w-[48px] items-center justify-center -mr-2"
            accessibilityLabel="Close category filters"
            accessibilityRole="button"
          >
            <X size={24} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      <View className="px-4 pb-6">
        {CATEGORY_GROUPS.map((group) => (
          <View key={group.label} className="mb-3">
            <Text className="text-[11px] font-barlow-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              {group.label}
            </Text>
            {group.label === "Food" && (
              <View className="mb-2">
                <Text className="text-[11px] font-barlow-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Availability
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <AvailabilityChip
                    label="Off"
                    active={foodAvailabilityMode === "off"}
                    onPress={() => setFoodAvailabilityMode("off")}
                  />
                  <AvailabilityChip
                    label="Now"
                    active={foodAvailabilityMode === "now"}
                    onPress={() => setFoodAvailabilityMode("now")}
                  />
                  <AvailabilityChip
                    label="At ETA"
                    active={foodAvailabilityMode === "eta"}
                    onPress={() => setFoodAvailabilityMode("eta")}
                  />
                  <AvailabilityChip
                    label={
                      foodAvailabilityMode === "custom" && foodAvailabilityCustomTime
                        ? formatTimeForChip(new Date(foodAvailabilityCustomTime))
                        : "Time..."
                    }
                    active={foodAvailabilityMode === "custom"}
                    onPress={chooseCustomTime}
                  />
                </View>
              </View>
            )}
            <View className="flex-row flex-wrap gap-2">
              {group.keys.map((key) => {
                const meta = POI_CATEGORIES.find((c) => c.key === key);
                if (!meta) return null;
                const isEnabled = isCategoryFilterActive && enabledSet.has(key);
                const IconComp = POI_ICON_MAP[meta.iconName];
                return (
                  <TouchableOpacity
                    key={key}
                    className={cn(
                      "flex-row items-center px-3 py-2.5 min-h-[48px] rounded-xl border",
                      isEnabled ? "border-accent/30 bg-accent/10" : "border-border bg-muted",
                    )}
                    onPress={() => handleToggleLeaf(key)}
                    activeOpacity={0.7}
                    accessibilityLabel={getLeafAccessibilityLabel(key, meta.label)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: isEnabled }}
                  >
                    {IconComp && (
                      <IconComp size={16} color={isEnabled ? meta.color : colors.textTertiary} />
                    )}
                    <Text
                      className={cn(
                        "ml-1.5 text-[13px] font-barlow-medium",
                        isEnabled ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function AvailabilityChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={cn(
        "flex-row items-center px-3 py-2 min-h-[44px] rounded-xl border",
        active ? "border-positive/30 bg-positive/10" : "border-border bg-muted",
      )}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={`Food availability ${label}`}
    >
      <Clock size={16} color={active ? colors.positive : colors.textTertiary} />
      <Text
        className={cn(
          "ml-1.5 text-[13px] font-barlow-semibold",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function getFoodAvailabilityLabel(mode: string, customTime: string | null) {
  if (mode === "now") return "Now";
  if (mode === "eta") return "At ETA";
  if (mode === "custom" && customTime) return formatTimeForChip(new Date(customTime));
  if (mode === "custom") return "Time";
  return "Open at";
}

function formatTimeForChip(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
