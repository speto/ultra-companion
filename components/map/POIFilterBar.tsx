import React, { useMemo, useCallback, useState } from "react";
import {
  Modal,
  Pressable,
  UIManager,
  View,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  Clock,
  Droplets,
  Flag,
  Tent,
  Toilet,
  UtensilsCrossed,
  SlidersHorizontal,
  X,
  Star,
} from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useThemeColors } from "@/theme";
import { usePoiStore } from "@/store/poiStore";
import { POI_CATEGORIES } from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";
import type { FoodAvailabilityMode } from "@/store/poiStore";
import type { POICategory } from "@/types";

const WATER_COLOR = POI_CATEGORIES.find((c) => c.key === "water")!.color;
const FOOD_COLOR = POI_CATEGORIES.find((c) => c.key === "groceries")!.color;
const REST_COLOR = POI_CATEGORIES.find((c) => c.key === "shelter")!.color;
const WC_COLOR = POI_CATEGORIES.find((c) => c.key === "toilet_shower")!.color;
type NativeDateTimePickerConfig = { NativeProps?: Record<string, unknown> };
const NATIVE_DATETIME_PICKER_CONFIG = UIManager.getViewManagerConfig?.("RNDateTimePicker") as
  | NativeDateTimePickerConfig
  | null
  | undefined;
const HAS_NATIVE_DATETIME_PICKER = Boolean(
  NATIVE_DATETIME_PICKER_CONFIG?.NativeProps &&
  ("date" in NATIVE_DATETIME_PICKER_CONFIG.NativeProps ||
    "value" in NATIVE_DATETIME_PICKER_CONFIG.NativeProps),
);

interface POIFilterBarProps {
  routeIds: string[];
}

const WATER_CATEGORIES: POICategory[] = ["water", "cemetery"];
const FOOD_CATEGORIES: POICategory[] = ["groceries", "bakery", "gas_station"];
const REST_CATEGORIES: POICategory[] = ["shelter", "bus_stop", "sports", "school"];
const WC_CATEGORIES: POICategory[] = ["toilet_shower"];
const PRIMARY_GROUPS = [WATER_CATEGORIES, FOOD_CATEGORIES, REST_CATEGORIES, WC_CATEGORIES];

const SHEET_SECTIONS: Array<{ label: string; rows: POICategory[][] }> = [
  { label: "Water", rows: [["water", "cemetery"]] },
  { label: "Food", rows: [["groceries", "bakery", "gas_station"]] },
  {
    label: "Rest",
    rows: [
      ["shelter", "bus_stop"],
      ["sports", "school"],
    ],
  },
  { label: "WC", rows: [["toilet_shower"]] },
];

export default function POIFilterBar({ routeIds }: POIFilterBarProps) {
  const colors = useThemeColors();
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
  const restEnabled = groupActive(REST_CATEGORIES);

  const hasPartialPrimaryGroup = useMemo(() => {
    if (!isCategoryFilterActive) return false;
    return PRIMARY_GROUPS.some((group) => {
      const selectedCount = group.filter((category) => enabledSet.has(category)).length;
      return selectedCount > 0 && selectedCount < group.length;
    });
  }, [enabledSet, isCategoryFilterActive]);
  const moreActive = hasPartialPrimaryGroup || foodAvailabilityMode === "custom";
  const foodAvailabilityPillLabel =
    foodEnabled && foodAvailabilityMode !== "off"
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
    if (!foodEnabled) {
      addGroup(FOOD_CATEGORIES);
      setFoodAvailabilityMode("eta");
    } else if (foodAvailabilityMode === "off") {
      addGroup(FOOD_CATEGORIES);
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
  }, [addGroup, foodAvailabilityMode, foodEnabled, setFoodAvailabilityMode]);

  const getQuickAccessibilityLabel = (label: string, isActive: boolean) => {
    if (!isCategoryFilterActive) return `Show ${label} POIs`;
    if (isActive) return `Clear ${label} filter`;
    return `Add ${label} filter`;
  };

  if (!hasPois) return null;

  return (
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
          icon={
            <UtensilsCrossed size={16} color={foodEnabled ? FOOD_COLOR : colors.textTertiary} />
          }
          label="Food"
          statusPillMode={foodAvailabilityMode !== "off" ? foodAvailabilityMode : null}
          statusPillLabel={foodAvailabilityPillLabel}
          accessibilityLabel={getFoodAccessibilityLabel(foodEnabled, foodAvailabilityMode)}
          accessibilityHint={getFoodAccessibilityHint(foodEnabled, foodAvailabilityMode)}
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
          onPress={() => router.push("/poi-filters")}
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

export function POIFilterSheetContent({ onClose }: { onClose: () => void }) {
  const colors = useThemeColors();
  const { height } = useWindowDimensions();
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const enabledCategories = usePoiStore((s) => s.enabledCategories);
  const setEnabledCategories = usePoiStore((s) => s.setEnabledCategories);
  const foodAvailabilityMode = usePoiStore((s) => s.foodAvailabilityMode);
  const setFoodAvailabilityMode = usePoiStore((s) => s.setFoodAvailabilityMode);
  const foodAvailabilityCustomTime = usePoiStore((s) => s.foodAvailabilityCustomTime);
  const setFoodAvailabilityCustomTime = usePoiStore((s) => s.setFoodAvailabilityCustomTime);
  const showSavedOnly = usePoiStore((s) => s.showSavedOnly);
  const setShowSavedOnly = usePoiStore((s) => s.setShowSavedOnly);
  const setAllCategories = usePoiStore((s) => s.setAllCategories);

  const enabledSet = useMemo(() => new Set(enabledCategories), [enabledCategories]);
  const isCategoryFilterActive = enabledCategories.length < POI_CATEGORIES.length;
  const hasActiveFilters =
    isCategoryFilterActive || showSavedOnly || foodAvailabilityMode !== "off";

  const ensureFoodScope = useCallback(() => {
    if (!isCategoryFilterActive) {
      setEnabledCategories(FOOD_CATEGORIES);
      return;
    }
    setEnabledCategories([...new Set([...enabledCategories, ...FOOD_CATEGORIES])]);
  }, [enabledCategories, isCategoryFilterActive, setEnabledCategories]);

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

  const clearAvailability = useCallback(() => {
    setFoodAvailabilityMode("off");
  }, [setFoodAvailabilityMode]);

  const chooseCustomTime = useCallback(() => {
    setTimePickerOpen(true);
  }, []);

  const applyCustomTime = useCallback(
    (date: Date) => {
      const next = new Date();
      next.setHours(date.getHours(), date.getMinutes(), 0, 0);
      if (next.getTime() < Date.now()) next.setDate(next.getDate() + 1);
      ensureFoodScope();
      setFoodAvailabilityCustomTime(next.toISOString());
      setFoodAvailabilityMode("custom");
      setTimePickerOpen(false);
    },
    [ensureFoodScope, setFoodAvailabilityCustomTime, setFoodAvailabilityMode],
  );

  const handleAvailabilityPress = useCallback(
    (mode: Exclude<FoodAvailabilityMode, "off">) => {
      if (foodAvailabilityMode === mode) {
        clearAvailability();
        return;
      }
      if (mode === "custom") {
        chooseCustomTime();
        return;
      }
      ensureFoodScope();
      setFoodAvailabilityMode(mode);
    },
    [
      chooseCustomTime,
      clearAvailability,
      ensureFoodScope,
      foodAvailabilityMode,
      setFoodAvailabilityMode,
    ],
  );

  const handleReset = useCallback(() => {
    setAllCategories(true);
    setShowSavedOnly(false);
    setFoodAvailabilityMode("off");
  }, [setAllCategories, setFoodAvailabilityMode, setShowSavedOnly]);

  const getLeafAccessibilityLabel = (key: POICategory, label: string) => {
    if (!isCategoryFilterActive) return `Show only ${label}`;
    if (enabledSet.has(key)) {
      return enabledCategories.length === 1 ? `Clear ${label} filter` : `Hide ${label}`;
    }
    return `Add ${label} to filter`;
  };

  return (
    <View style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3">
        <View className="flex-1 min-h-[48px] justify-center">
          <Text className="text-lg font-barlow-semibold text-foreground">More filters</Text>
        </View>
        <View className="flex-row items-center">
          {hasActiveFilters && (
            <TouchableOpacity
              onPress={handleReset}
              className="min-h-[48px] px-3 items-center justify-center mr-2"
              accessibilityLabel="Clear POI filters"
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

      <ScrollView
        style={{ maxHeight: height * 0.66 }}
        contentContainerClassName="px-4 pt-1 pb-3"
        showsVerticalScrollIndicator={false}
      >
        {SHEET_SECTIONS.map((section) => (
          <View key={section.label} className="mb-4">
            <Text className="mb-2 text-[12px] font-barlow-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {section.rows.flat().map((key) => {
                const meta = POI_CATEGORIES.find((c) => c.key === key);
                if (!meta) return null;
                const isEnabled = isCategoryFilterActive && enabledSet.has(key);
                const IconComp = POI_ICON_MAP[meta.iconName];
                return (
                  <CategoryFilterButton
                    key={key}
                    label={meta.label}
                    icon={
                      IconComp && (
                        <IconComp size={16} color={isEnabled ? meta.color : colors.textTertiary} />
                      )
                    }
                    active={isEnabled}
                    onPress={() => handleToggleLeaf(key)}
                    accessibilityLabel={getLeafAccessibilityLabel(key, meta.label)}
                  />
                );
              })}
            </View>
            {section.label === "Food" && (
              <FoodAvailabilityControl
                mode={foodAvailabilityMode}
                customTime={foodAvailabilityCustomTime}
                onPress={handleAvailabilityPress}
              />
            )}
          </View>
        ))}
      </ScrollView>
      <AvailabilityTimePickerSheet
        visible={timePickerOpen}
        value={foodAvailabilityCustomTime}
        onApply={applyCustomTime}
        onClose={() => setTimePickerOpen(false)}
      />
    </View>
  );
}

function CategoryFilterButton({
  label,
  icon,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      className={cn(
        "min-h-[48px] flex-row items-center rounded-xl border px-3 py-2.5",
        active ? "border-accent/30 bg-accent/10" : "border-border bg-muted",
      )}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
    >
      {icon}
      <Text
        className={cn(
          "ml-1.5 flex-shrink text-[13px] font-barlow-medium",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FoodAvailabilityControl({
  mode,
  customTime,
  onPress,
}: {
  mode: FoodAvailabilityMode;
  customTime: string | null;
  onPress: (mode: Exclude<FoodAvailabilityMode, "off">) => void;
}) {
  const customLabel =
    mode === "custom" && customTime ? formatTimeForChip(new Date(customTime)) : "Time…";
  const segments: Array<{ mode: Exclude<FoodAvailabilityMode, "off">; label: string }> = [
    { mode: "eta", label: "At ETA" },
    { mode: "now", label: "Now" },
    { mode: "custom", label: customLabel },
  ];

  return (
    <View className="mt-3 rounded-xl bg-muted p-1">
      <View className="flex-row items-center">
        {segments.map((segment) => (
          <AvailabilitySegment
            key={segment.mode}
            label={segment.label}
            active={mode === segment.mode}
            onPress={() => onPress(segment.mode)}
          />
        ))}
      </View>
    </View>
  );
}

function AvailabilitySegment({
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
        "min-h-[40px] flex-1 flex-row items-center justify-center rounded-lg border px-2 py-2",
        active ? "border-accent/30 bg-surface" : "border-transparent bg-transparent",
      )}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? `Clear ${label} availability` : `Set availability ${label}`}
    >
      <Clock size={15} color={active ? colors.accent : colors.textTertiary} />
      <Text
        className={cn(
          "ml-1 text-[12px] font-barlow-semibold",
          active ? "text-accent" : "text-muted-foreground",
        )}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function AvailabilityTimePickerSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: string | null;
  onApply: (value: Date) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const { bottom } = useSafeAreaInsets();
  const [draftDate, setDraftDate] = useState(() => new Date(value ?? Date.now()));

  React.useEffect(() => {
    if (visible) setDraftDate(new Date(value ?? Date.now()));
  }, [value, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      presentationStyle="overFullScreen"
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View
          className="rounded-t-2xl border-t border-border bg-surface px-4 pt-3"
          style={{ paddingBottom: bottom + 16 }}
        >
          <View className="items-center pb-2" accessible={false}>
            <View
              className="rounded-full"
              style={{ width: 32, height: 4, backgroundColor: colors.textTertiary, opacity: 0.5 }}
            />
          </View>
          <View className="min-h-[48px] flex-row items-center justify-between">
            <Text className="text-[22px] font-barlow-semibold text-foreground">Food Time</Text>
            <Pressable
              className="min-h-[48px] px-3 items-center justify-center"
              onPress={onClose}
              style={({ pressed }) =>
                pressed ? { opacity: 0.72, transform: [{ scale: 0.98 }] } : undefined
              }
              accessibilityRole="button"
              accessibilityLabel="Cancel food availability time change"
            >
              <Text className="text-[15px] font-barlow-semibold text-accent">Cancel</Text>
            </Pressable>
          </View>
          {HAS_NATIVE_DATETIME_PICKER ? (
            <View className="h-[216px] rounded-xl overflow-hidden bg-card border border-border">
              <DateTimePicker
                value={draftDate}
                mode="time"
                display="spinner"
                minuteInterval={5}
                onChange={(_, date) => {
                  if (date) setDraftDate(date);
                }}
                style={{ alignSelf: "stretch", height: 216 }}
              />
            </View>
          ) : (
            <View className="min-h-[120px] rounded-xl bg-card border border-border items-center justify-center px-4">
              <Text className="text-[14px] text-muted-foreground text-center">
                Rebuild the app to enable the native time picker.
              </Text>
            </View>
          )}
          <Text className="mt-2 px-1 text-[12px] font-barlow-medium text-muted-foreground text-center">
            Uses the next occurrence of the selected local time.
          </Text>
          <View className="flex-row justify-end gap-2 mt-3">
            <Button variant="secondary" label="Cancel" onPress={onClose} className="h-12 px-4" />
            <Button
              label="Use time"
              onPress={() => onApply(draftDate)}
              className="h-12 px-5"
              disabled={!HAS_NATIVE_DATETIME_PICKER}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getFoodAccessibilityLabel(foodEnabled: boolean, mode: FoodAvailabilityMode) {
  if (!foodEnabled) return "Food filter off";
  if (mode === "eta") return "Food filter on, open at ETA";
  if (mode === "now") return "Food filter on, open now";
  if (mode === "custom") return "Food filter on, custom availability time";
  return "Food filter on, all food";
}

function getFoodAccessibilityHint(foodEnabled: boolean, mode: FoodAvailabilityMode) {
  if (!foodEnabled) return "Double tap to show all food. Long press to show food open at ETA.";
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
