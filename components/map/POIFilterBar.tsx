import React, { useMemo, useState, useCallback } from "react";
import { View, TouchableOpacity, Pressable, Modal, ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import {
  Clock,
  Droplets,
  ShowerHead,
  UtensilsCrossed,
  Moon,
  SlidersHorizontal,
  X,
} from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useThemeColors } from "@/theme";
import { usePoiStore } from "@/store/poiStore";
import { POI_CATEGORIES } from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";
import type { POICategory } from "@/types";

type RuntimeThemeColors = ReturnType<typeof useThemeColors>;

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
  const toggleShowOpenOnly = usePoiStore((s) => s.toggleShowOpenOnly);
  const setAllCategories = usePoiStore((s) => s.setAllCategories);

  const [moreVisible, setMoreVisible] = useState(false);

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
      if (isExactMatch(targetCategories)) {
        setAllCategories(true);
      } else {
        setEnabledCategories(targetCategories);
      }
    },
    [isExactMatch, setAllCategories, setEnabledCategories],
  );

  const handleSheetToggle = useCallback(
    (category: POICategory) => {
      if (!isCategoryFilterActive) {
        setEnabledCategories([category]);
      } else {
        if (enabledSet.has(category)) {
          const next = enabledCategories.filter((c) => c !== category);
          if (next.length === 0) {
            setAllCategories(true);
          } else {
            setEnabledCategories(next);
          }
        } else {
          setEnabledCategories([...enabledCategories, category]);
        }
      }
    },
    [isCategoryFilterActive, enabledSet, enabledCategories, setEnabledCategories, setAllCategories],
  );

  // POI count for hasPois check
  const hasPois = useMemo(() => {
    for (const routeId of routeIds) {
      if ((allPois[routeId]?.length ?? 0) > 0) return true;
    }
    return false;
  }, [routeIds, allPois]);

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
          icon={<Droplets size={14} color={waterEnabled ? WATER_COLOR : colors.textTertiary} />}
          label="Water"
          accessibilityLabel={getQuickAccessibilityLabel("Water", waterEnabled)}
        />

        <FilterChip
          active={foodEnabled}
          onPress={() => handleQuickToggle(FOOD_CATEGORIES)}
          icon={
            <UtensilsCrossed size={14} color={foodEnabled ? FOOD_COLOR : colors.textTertiary} />
          }
          label="Food"
          accessibilityLabel={getQuickAccessibilityLabel("Food", foodEnabled)}
        />

        <FilterChip
          active={restEnabled}
          onPress={() => handleQuickToggle(REST_CATEGORIES)}
          icon={<Moon size={14} color={restEnabled ? REST_COLOR : colors.textTertiary} />}
          label="Rest"
          accessibilityLabel={getQuickAccessibilityLabel("Rest", restEnabled)}
        />

        <FilterChip
          active={wcEnabled}
          onPress={() => handleQuickToggle(["toilet_shower"])}
          icon={<ShowerHead size={14} color={wcEnabled ? WC_COLOR : colors.textTertiary} />}
          label="WC"
          accessibilityLabel={getQuickAccessibilityLabel("WC", wcEnabled)}
        />

        <FilterChip
          active={moreVisible || isCustomFilterActive}
          onPress={() => setMoreVisible((v) => !v)}
          icon={
            <SlidersHorizontal
              size={14}
              color={moreVisible || isCustomFilterActive ? colors.accent : colors.textTertiary}
            />
          }
          label="Categories"
          accessibilityLabel="Open category filters"
          accessibilityRoleOverride="button"
        />

        <View className="w-[1px] h-6 bg-border mx-0.5" />

        <FilterChip
          active={showOpenOnly}
          onPress={toggleShowOpenOnly}
          icon={<Clock size={14} color={showOpenOnly ? colors.positive : colors.textTertiary} />}
          label="Open"
          accessibilityLabel={showOpenOnly ? "Turn off open now filter" : "Show only open POIs"}
          activeTone="positive"
        />

        {isCategoryFilterActive && (
          <FilterChip
            active={false}
            onPress={() => setAllCategories(true)}
            icon={<X size={14} color={colors.textTertiary} />}
            label="Clear"
            accessibilityLabel="Clear category filters"
            accessibilityRoleOverride="button"
          />
        )}
      </ScrollView>

      {moreVisible && (
        <MoreFilterSheet
          enabledSet={enabledSet}
          isCategoryFilterActive={isCategoryFilterActive}
          handleToggleLeaf={handleSheetToggle}
          colors={colors}
          onClose={() => setMoreVisible(false)}
          setAllCategories={setAllCategories}
          enabledCategories={enabledCategories}
        />
      )}
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
  activeTone?: "accent" | "positive";
  accessibilityLabel: string;
  accessibilityCheckedState?: boolean | "mixed";
  accessibilityRoleOverride?: "button" | "switch";
}) {
  const accessibilityRole = accessibilityRoleOverride ?? "switch";
  return (
    <TouchableOpacity
      className={cn(
        "flex-row items-center px-3 min-h-[48px] rounded-full border",
        active
          ? activeTone === "positive"
            ? "bg-positive/10 border-positive/30"
            : "bg-accent/10 border-accent/30"
          : "border-transparent bg-muted",
      )}
      onPress={onPress}
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
          "ml-1.5 text-[12px] font-barlow-medium",
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

function MoreFilterSheet({
  enabledSet,
  isCategoryFilterActive,
  handleToggleLeaf,
  colors,
  onClose,
  setAllCategories,
  enabledCategories,
}: {
  enabledSet: Set<POICategory>;
  isCategoryFilterActive: boolean;
  handleToggleLeaf: (cat: POICategory) => void;
  colors: RuntimeThemeColors;
  onClose: () => void;
  setAllCategories: (enabled: boolean) => void;
  enabledCategories: POICategory[];
}) {
  const handleReset = () => {
    setAllCategories(true);
  };

  const getLeafAccessibilityLabel = (key: POICategory, label: string) => {
    if (!isCategoryFilterActive) return `Show only ${label}`;
    if (enabledSet.has(key)) {
      return enabledCategories.length === 1 ? `Clear ${label} filter` : `Hide ${label}`;
    }
    return `Add ${label} to filter`;
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          onPress={onClose}
          accessibilityLabel="Close filters"
        />
        <View
          className="rounded-t-2xl border-t border-border"
          style={{ backgroundColor: colors.surface }}
        >
          <View className="flex-row items-center justify-between px-4 pt-4 pb-4">
            <View className="flex-1 min-h-[48px] justify-center">
              <Text className="text-lg font-barlow-semibold text-foreground">Categories</Text>
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
                          <IconComp
                            size={16}
                            color={isEnabled ? meta.color : colors.textTertiary}
                          />
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
      </View>
    </Modal>
  );
}
