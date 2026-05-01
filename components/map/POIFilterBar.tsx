import React, { Suspense, useMemo, useCallback, useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import {
  Clock,
  Droplets,
  Flag,
  ShoppingCart,
  Tent,
  Toilet,
  SlidersHorizontal,
  Star,
} from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useThemeColors } from "@/theme";
import { usePoiStore } from "@/store/poiStore";
import { POI_CATEGORIES } from "@/constants";
import type { FoodAvailabilityMode } from "@/store/poiStore";
import type { POICategory } from "@/types";

const POIFilterSheet = React.lazy(() => import("./POIFilterSheet"));

const WATER_COLOR = POI_CATEGORIES.find((c) => c.key === "water")!.color;
const FOOD_COLOR = POI_CATEGORIES.find((c) => c.key === "groceries")!.color;
const REST_COLOR = POI_CATEGORIES.find((c) => c.key === "shelter")!.color;
const WC_COLOR = POI_CATEGORIES.find((c) => c.key === "toilet_shower")!.color;

interface POIFilterBarProps {
  routeIds: string[];
}

const WATER_CATEGORIES: POICategory[] = ["water", "cemetery"];
const FOOD_CATEGORIES: POICategory[] = ["groceries", "bakery", "gas_station"];
const EAT_DRINK_CATEGORIES: POICategory[] = ["coffee", "restaurant", "bar_pub"];
const FOOD_AVAILABILITY_CATEGORIES: POICategory[] = [...FOOD_CATEGORIES, ...EAT_DRINK_CATEGORIES];
const REST_CATEGORIES: POICategory[] = ["shelter", "bus_stop", "camp_site", "sports", "school"];
const WC_CATEGORIES: POICategory[] = ["toilet_shower"];
const PRIMARY_GROUPS = [WATER_CATEGORIES, FOOD_CATEGORIES, REST_CATEGORIES, WC_CATEGORIES];
const HELP_CATEGORIES: POICategory[] = [
  "pharmacy",
  "hospital_er",
  "defibrillator",
  "emergency_phone",
  "ambulance_station",
];
const REPAIR_CATEGORIES: POICategory[] = ["bike_shop", "repair_station", "pump_air"];
const ESCAPE_CATEGORIES: POICategory[] = ["train_station"];
const MORE_ONLY_CATEGORIES = [
  ...EAT_DRINK_CATEGORIES,
  ...HELP_CATEGORIES,
  ...REPAIR_CATEGORIES,
  ...ESCAPE_CATEGORIES,
];

export default function POIFilterBar({ routeIds }: POIFilterBarProps) {
  const colors = useThemeColors();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetRequested, setSheetRequested] = useState(false);
  const allPois = usePoiStore((s) => s.pois);
  const enabledCategories = usePoiStore((s) => s.enabledCategories);
  const setEnabledCategories = usePoiStore((s) => s.setEnabledCategories);
  const foodAvailabilityMode = usePoiStore((s) => s.foodAvailabilityMode);
  const setFoodAvailabilityMode = usePoiStore((s) => s.setFoodAvailabilityMode);
  const foodAvailabilityCustomTime = usePoiStore((s) => s.foodAvailabilityCustomTime);
  const showSavedOnly = usePoiStore((s) => s.showSavedOnly);
  const toggleShowSavedOnly = usePoiStore((s) => s.toggleShowSavedOnly);
  const setAllCategories = usePoiStore((s) => s.setAllCategories);

  const enabledSet = useMemo(() => new Set(enabledCategories), [enabledCategories]);
  const isCategoryFilterActive = enabledCategories.length < POI_CATEGORIES.length;

  const groupActive = useCallback(
    (targetCategories: POICategory[]) =>
      isCategoryFilterActive && targetCategories.some((category) => enabledSet.has(category)),
    [enabledSet, isCategoryFilterActive],
  );

  const waterEnabled = groupActive(WATER_CATEGORIES);
  const wcEnabled = groupActive(WC_CATEGORIES);
  const foodEnabled = groupActive(FOOD_CATEGORIES);
  const foodAvailabilityScopeEnabled = groupActive(FOOD_AVAILABILITY_CATEGORIES);
  const restEnabled = groupActive(REST_CATEGORIES);

  const hasPartialPrimaryGroup = useMemo(() => {
    if (!isCategoryFilterActive) return false;
    return PRIMARY_GROUPS.some((group) => {
      const selectedCount = group.filter((category) => enabledSet.has(category)).length;
      return selectedCount > 0 && selectedCount < group.length;
    });
  }, [enabledSet, isCategoryFilterActive]);
  const hasMoreOnlyCategory =
    isCategoryFilterActive && MORE_ONLY_CATEGORIES.some((category) => enabledSet.has(category));
  const moreActive =
    hasPartialPrimaryGroup || hasMoreOnlyCategory || foodAvailabilityMode === "custom";
  const foodAvailabilityPillLabel =
    foodAvailabilityScopeEnabled && foodAvailabilityMode !== "off"
      ? getFoodAvailabilityButtonPillLabel(foodAvailabilityMode, foodAvailabilityCustomTime)
      : null;

  const hasPois = useMemo(() => {
    for (const routeId of routeIds) {
      if ((allPois[routeId]?.length ?? 0) > 0) return true;
    }
    return false;
  }, [routeIds, allPois]);

  const removeGroup = useCallback(
    (targetCategories: POICategory[]) => {
      const target = new Set(targetCategories);
      const next = enabledCategories.filter((category) => !target.has(category));
      if (next.length === 0) setAllCategories(true);
      else setEnabledCategories(next);
    },
    [enabledCategories, setAllCategories, setEnabledCategories],
  );

  const addGroup = useCallback(
    (targetCategories: POICategory[]) => {
      if (!isCategoryFilterActive) {
        setEnabledCategories(targetCategories);
        return;
      }
      setEnabledCategories([...new Set([...enabledCategories, ...targetCategories])]);
    },
    [enabledCategories, isCategoryFilterActive, setEnabledCategories],
  );

  const handleQuickToggle = useCallback(
    (targetCategories: POICategory[]) => {
      const isActive = groupActive(targetCategories);
      if (isActive) removeGroup(targetCategories);
      else addGroup(targetCategories);
    },
    [addGroup, groupActive, removeGroup],
  );

  const cycleFoodAvailability = useCallback(() => {
    const startedAt = Date.now();
    if (!foodAvailabilityScopeEnabled) {
      addGroup(FOOD_AVAILABILITY_CATEGORIES);
      setFoodAvailabilityMode("eta");
    } else if (foodAvailabilityMode === "off") {
      addGroup(FOOD_AVAILABILITY_CATEGORIES);
      setFoodAvailabilityMode("eta");
    } else if (foodAvailabilityMode === "eta") {
      setFoodAvailabilityMode("now");
    } else {
      setFoodAvailabilityMode("off");
    }

    if (__DEV__) {
      requestAnimationFrame(() => {
        console.info(`[poi-filter] food long press -> next frame in ${Date.now() - startedAt}ms`);
      });
    }
  }, [addGroup, foodAvailabilityMode, foodAvailabilityScopeEnabled, setFoodAvailabilityMode]);

  const getQuickAccessibilityLabel = (label: string, isActive: boolean) => {
    if (!isCategoryFilterActive) return `Show ${label} POIs`;
    if (isActive) return `Clear ${label} filter`;
    return `Add ${label} filter`;
  };

  const openSheet = useCallback(() => {
    setSheetRequested(true);
    setSheetOpen(true);
  }, []);

  if (!hasPois) return null;

  return (
    <>
      <View className="flex-row items-center justify-between px-3 py-1.5 gap-1">
        <PrimaryChipSlot>
          <FilterChip
            active={waterEnabled}
            onPress={() => handleQuickToggle(WATER_CATEGORIES)}
            icon={<Droplets size={16} color={waterEnabled ? WATER_COLOR : colors.textTertiary} />}
            label="Water"
            accessibilityLabel={getQuickAccessibilityLabel("Water", waterEnabled)}
          />
        </PrimaryChipSlot>
        <PrimaryChipSlot elevated={Boolean(foodAvailabilityPillLabel)}>
          <FilterChip
            active={foodEnabled}
            onPress={() => handleQuickToggle(FOOD_CATEGORIES)}
            onLongPress={cycleFoodAvailability}
            icon={<ShoppingCart size={16} color={foodEnabled ? FOOD_COLOR : colors.textTertiary} />}
            label="Food"
            statusPillMode={foodAvailabilityMode !== "off" ? foodAvailabilityMode : null}
            statusPillLabel={foodAvailabilityPillLabel}
            accessibilityLabel={getFoodAccessibilityLabel(
              foodEnabled,
              foodAvailabilityScopeEnabled,
              foodAvailabilityMode,
            )}
            accessibilityHint={getFoodAccessibilityHint(
              foodEnabled,
              foodAvailabilityScopeEnabled,
              foodAvailabilityMode,
            )}
            accessibilityRoleOverride="button"
          />
        </PrimaryChipSlot>
        <PrimaryChipSlot>
          <FilterChip
            active={restEnabled}
            onPress={() => handleQuickToggle(REST_CATEGORIES)}
            icon={<Tent size={16} color={restEnabled ? REST_COLOR : colors.textTertiary} />}
            label="Rest"
            accessibilityLabel={getQuickAccessibilityLabel("Rest", restEnabled)}
          />
        </PrimaryChipSlot>
        <PrimaryChipSlot>
          <FilterChip
            active={wcEnabled}
            onPress={() => handleQuickToggle(WC_CATEGORIES)}
            icon={<Toilet size={16} color={wcEnabled ? WC_COLOR : colors.textTertiary} />}
            label="WC"
            accessibilityLabel={getQuickAccessibilityLabel("WC", wcEnabled)}
          />
        </PrimaryChipSlot>
        <PrimaryChipSlot>
          <FilterChip
            active={showSavedOnly}
            onPress={toggleShowSavedOnly}
            icon={
              <Star
                size={16}
                color={showSavedOnly ? colors.starred : colors.textTertiary}
                fill={showSavedOnly ? colors.starred : "none"}
              />
            }
            label="Saved"
            accessibilityLabel={showSavedOnly ? "Show POIs for current filters" : "Show saved POIs"}
            activeTone="starred"
          />
        </PrimaryChipSlot>
        <PrimaryChipSlot>
          <FilterChip
            active={moreActive}
            onPress={openSheet}
            icon={
              <SlidersHorizontal
                size={16}
                color={moreActive ? colors.accent : colors.textSecondary}
              />
            }
            label="More"
            accessibilityLabel="Open more POI filters"
            accessibilityRoleOverride="button"
          />
        </PrimaryChipSlot>
      </View>
      {sheetRequested && (
        <Suspense fallback={null}>
          <POIFilterSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

function PrimaryChipSlot({
  children,
  elevated = false,
}: {
  children: React.ReactNode;
  elevated?: boolean;
}) {
  return (
    <View
      className="flex-1 min-w-0 items-center justify-center"
      style={elevated ? { position: "relative", zIndex: 20, elevation: 8 } : undefined}
    >
      {children}
    </View>
  );
}

function FilterChip({
  active,
  onPress,
  icon,
  label,
  activeTone = "accent",
  accessibilityLabel,
  accessibilityHint,
  accessibilityRoleOverride,
  onLongPress,
  statusPillLabel,
  statusPillMode,
}: {
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  icon: React.ReactNode;
  label: string;
  activeTone?: "accent" | "starred";
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityRoleOverride?: "button" | "switch";
  statusPillLabel?: string | null;
  statusPillMode?: FoodAvailabilityMode | null;
}) {
  const accessibilityRole = accessibilityRoleOverride ?? "switch";
  const StatusIcon = statusPillMode === "eta" ? Flag : Clock;
  return (
    <TouchableOpacity
      className={cn(
        "relative max-w-full min-h-[40px] flex-row items-center justify-center rounded-full border px-2 py-2 overflow-visible",
        active
          ? activeTone === "starred"
            ? "bg-starred/10 border-starred/30"
            : "bg-accent/10 border-accent/30"
          : "border-transparent bg-muted",
      )}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
      activeOpacity={0.7}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      accessibilityState={
        accessibilityRole === "switch" ? { checked: active } : { selected: active }
      }
    >
      {icon}
      <Text
        className={cn(
          "ml-1 min-w-0 flex-shrink text-[12px] font-barlow-semibold",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.86}
      >
        {label}
      </Text>
      {statusPillLabel && (
        <View
          pointerEvents="none"
          className="absolute left-0 right-0 items-center"
          style={{ top: -10, zIndex: 30, elevation: 10 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View className="flex-row items-center rounded-full border border-accent bg-accent px-2 py-0.5 shadow-sm">
            <StatusIcon size={11} color="white" />
            <Text
              numberOfLines={1}
              className="ml-1 text-[11px] font-barlow-semibold text-white"
              style={{ maxWidth: 38 }}
            >
              {statusPillLabel}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

function getFoodAccessibilityLabel(
  foodEnabled: boolean,
  foodAvailabilityScopeEnabled: boolean,
  mode: FoodAvailabilityMode,
) {
  if (!foodEnabled && !foodAvailabilityScopeEnabled) return "Food filter off";
  if (!foodEnabled && mode === "eta") return "Food and eat drink availability on, open at ETA";
  if (!foodEnabled && mode === "now") return "Food and eat drink availability on, open now";
  if (!foodEnabled && mode === "custom") return "Food and eat drink availability on, custom time";
  if (!foodEnabled) return "Food filter off, eat drink filter on";
  if (mode === "eta") return "Food filter on, open at ETA";
  if (mode === "now") return "Food filter on, open now";
  if (mode === "custom") return "Food filter on, custom availability time";
  return "Food filter on, all food";
}

function getFoodAccessibilityHint(
  foodEnabled: boolean,
  foodAvailabilityScopeEnabled: boolean,
  mode: FoodAvailabilityMode,
) {
  if (!foodEnabled && !foodAvailabilityScopeEnabled) {
    return "Double tap to show all food. Long press to show food and eat drink open at ETA.";
  }
  if (!foodEnabled) {
    return "Double tap to show food supplies. Long press to cycle food and eat drink availability.";
  }
  if (mode === "eta") return "Double tap to hide food. Long press to show food open now.";
  if (mode === "now") return "Double tap to hide food. Long press to clear food availability.";
  if (mode === "custom") return "Double tap to hide food. Long press to show food open at ETA.";
  return "Double tap to hide food. Long press to show food open at ETA.";
}

export function getFoodAvailabilityStatusLabel(
  mode: FoodAvailabilityMode,
  customTime: string | null,
) {
  if (mode === "now") return "Showing food open now";
  if (mode === "eta") return "Showing food open at ETA";
  if (mode === "custom" && customTime)
    return `Showing food open at ${formatTimeForChip(new Date(customTime))}`;
  if (mode === "custom") return "Showing food at custom time";
  return "Showing all food";
}

export function getFoodAvailabilityStatusPillLabel(
  mode: Exclude<FoodAvailabilityMode, "off">,
  customTime: string | null,
) {
  if (mode === "now") return "Open now";
  if (mode === "eta") return "Open at ETA";
  if (customTime) return `Open at ${formatTimeForChip(new Date(customTime))}`;
  return "Custom time";
}

function getFoodAvailabilityButtonPillLabel(
  mode: Exclude<FoodAvailabilityMode, "off">,
  customTime: string | null,
) {
  if (mode === "now") return "Now";
  if (mode === "eta") return "ETA";
  if (customTime) return formatTimeForChip(new Date(customTime));
  return "Time";
}

function formatTimeForChip(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
