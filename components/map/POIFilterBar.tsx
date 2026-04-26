import React, { useMemo, useState, useCallback } from "react";
import { View, TouchableOpacity, Pressable, Modal } from "react-native";
import { Text } from "@/components/ui/text";
import { Clock, Droplets, UtensilsCrossed, Moon, SlidersHorizontal } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useThemeColors } from "@/theme";
import { usePoiStore } from "@/store/poiStore";
import { usePlaceStore } from "@/store/placeStore";
import { POI_CATEGORIES } from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";
import type { POICategory } from "@/types";

type RuntimeThemeColors = ReturnType<typeof useThemeColors>;

const WATER_COLOR = POI_CATEGORIES.find((c) => c.key === "water")!.color;
const FOOD_COLOR = POI_CATEGORIES.find((c) => c.key === "groceries")!.color;
const SLEEP_COLOR = POI_CATEGORIES.find((c) => c.key === "shelter")!.color;

interface POIFilterBarProps {
  routeIds: string[];
}

/** Food-like categories toggled by the quick Food control */
const FOOD_CATEGORIES: POICategory[] = ["groceries", "bakery", "gas_station"];

/** Sleep/rest categories toggled by the quick Sleep control */
const SLEEP_CATEGORIES: POICategory[] = ["shelter", "bus_stop", "sports", "school"];

/** Groups for the More sheet */
const CATEGORY_GROUPS = [
  {
    label: "Critical",
    keys: ["water", "groceries", "bakery", "gas_station"] as POICategory[],
  },
  {
    label: "Services",
    keys: ["toilet_shower", "shelter", "bus_stop"] as POICategory[],
  },
  { label: "Other", keys: ["sports", "cemetery", "school"] as POICategory[] },
];

export default function POIFilterBar({ routeIds }: POIFilterBarProps) {
  const colors = useThemeColors();
  const allPlaces = usePlaceStore((s) => s.places);
  const allPois = usePoiStore((s) => s.pois);
  const enabledCategories = usePoiStore((s) => s.enabledCategories);
  const toggleCategory = usePoiStore((s) => s.toggleCategory);
  const showOpenOnly = usePoiStore((s) => s.showOpenOnly);
  const toggleShowOpenOnly = usePoiStore((s) => s.toggleShowOpenOnly);

  const [moreVisible, setMoreVisible] = useState(false);

  const enabledSet = useMemo(() => new Set(enabledCategories), [enabledCategories]);

  // Category counts from downloaded POIs only.
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<POICategory, number>> = {};
    for (const routeId of routeIds) {
      const places = allPlaces[routeId] ?? [];
      for (const place of places) {
        if (place.entityType === "downloadedPoi") {
          counts[place.category as POICategory] = (counts[place.category as POICategory] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [routeIds, allPlaces]);

  // POI count for hasPois check
  const hasPois = useMemo(() => {
    for (const routeId of routeIds) {
      if ((allPois[routeId]?.length ?? 0) > 0) return true;
    }
    return false;
  }, [routeIds, allPois]);

  const waterEnabled = enabledSet.has("water");
  const foodEnabled = FOOD_CATEGORIES.some((c) => enabledSet.has(c));
  const sleepEnabled = SLEEP_CATEGORIES.some((c) => enabledSet.has(c));
  const toggleFood = useCallback(() => {
    const anyOn = FOOD_CATEGORIES.some((c) => enabledSet.has(c));
    for (const cat of FOOD_CATEGORIES) {
      const isOn = enabledSet.has(cat);
      if (anyOn && isOn) toggleCategory(cat);
      if (!anyOn && !isOn) toggleCategory(cat);
    }
  }, [enabledSet, toggleCategory]);

  const toggleSleep = useCallback(() => {
    const anyOn = SLEEP_CATEGORIES.some((c) => enabledSet.has(c));
    for (const cat of SLEEP_CATEGORIES) {
      const isOn = enabledSet.has(cat);
      if (anyOn && isOn) toggleCategory(cat);
      if (!anyOn && !isOn) toggleCategory(cat);
    }
  }, [enabledSet, toggleCategory]);

  if (!hasPois) return null;

  return (
    <>
      <View className="flex-row flex-wrap items-center px-3 py-1.5 gap-2">
        <FilterChip
          active={showOpenOnly}
          onPress={toggleShowOpenOnly}
          icon={<Clock size={14} color={showOpenOnly ? colors.positive : colors.textTertiary} />}
          label="Open now"
          accessibilityLabel={showOpenOnly ? "Show all POIs" : "Show only open POIs"}
        />

        <FilterChip
          active={foodEnabled}
          onPress={toggleFood}
          icon={
            <UtensilsCrossed size={14} color={foodEnabled ? FOOD_COLOR : colors.textTertiary} />
          }
          label="Food"
          count={FOOD_CATEGORIES.reduce((sum, c) => sum + (categoryCounts[c] ?? 0), 0) || undefined}
          accessibilityLabel={`${foodEnabled ? "Hide" : "Show"} food`}
        />
        <FilterChip
          active={sleepEnabled}
          onPress={toggleSleep}
          icon={<Moon size={14} color={sleepEnabled ? SLEEP_COLOR : colors.textTertiary} />}
          label="Sleep"
          count={
            SLEEP_CATEGORIES.reduce((sum, c) => sum + (categoryCounts[c] ?? 0), 0) || undefined
          }
          accessibilityLabel={`${sleepEnabled ? "Hide" : "Show"} sleep/rest stops`}
        />
        <FilterChip
          active={waterEnabled}
          onPress={() => toggleCategory("water")}
          icon={<Droplets size={14} color={waterEnabled ? WATER_COLOR : colors.textTertiary} />}
          label="Water"
          count={categoryCounts.water}
          accessibilityLabel={`${waterEnabled ? "Hide" : "Show"} water`}
        />

        <FilterChip
          active={moreVisible}
          onPress={() => setMoreVisible((v) => !v)}
          icon={
            <SlidersHorizontal
              size={14}
              color={moreVisible ? colors.accent : colors.textTertiary}
            />
          }
          label="More"
          accessibilityLabel="More filters"
          accessibilityRoleOverride="button"
        />
      </View>

      {moreVisible && (
        <MoreFilterSheet
          enabledSet={enabledSet}
          toggleCategory={toggleCategory}
          categoryCounts={categoryCounts}
          colors={colors}
          onClose={() => setMoreVisible(false)}
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
  count,
  accessibilityLabel,
  accessibilityRoleOverride,
}: {
  active: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  accessibilityLabel: string;
  accessibilityRoleOverride?: "button" | "switch";
}) {
  const accessibilityRole = accessibilityRoleOverride ?? "switch";
  return (
    <TouchableOpacity
      className={cn(
        "flex-row items-center px-3 min-h-[48px] rounded-full border",
        active ? "bg-accent/10 border-accent/30" : "border-transparent bg-muted",
      )}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === "button" ? undefined : { checked: active }}
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
      {count != null && count > 0 && (
        <Text
          className={cn(
            "ml-0.5 text-[10px] font-barlow-sc-medium",
            active ? "text-muted-foreground" : "text-muted-foreground/50",
          )}
        >
          {count}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function MoreFilterSheet({
  enabledSet,
  toggleCategory,
  categoryCounts,
  colors,
  onClose,
}: {
  enabledSet: Set<POICategory>;
  toggleCategory: (cat: POICategory) => void;
  categoryCounts: Partial<Record<POICategory, number>>;
  colors: RuntimeThemeColors;
  onClose: () => void;
}) {
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
          <View className="items-center pt-2 pb-1">
            <View
              className="rounded-full"
              style={{ width: 32, height: 4, backgroundColor: colors.textTertiary, opacity: 0.5 }}
            />
          </View>

          <View className="px-4 pb-6 pt-1">
            {CATEGORY_GROUPS.map((group) => (
              <View key={group.label} className="mb-3">
                <Text className="text-[11px] font-barlow-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  {group.label}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {group.keys.map((key) => {
                    const meta = POI_CATEGORIES.find((c) => c.key === key);
                    if (!meta) return null;
                    const isEnabled = enabledSet.has(key);
                    const count = categoryCounts[key] ?? 0;
                    const IconComp = POI_ICON_MAP[meta.iconName];
                    return (
                      <TouchableOpacity
                        key={key}
                        className={cn(
                          "flex-row items-center px-3 py-2.5 min-h-[48px] rounded-xl border",
                          isEnabled ? "border-accent/30 bg-accent/10" : "border-border bg-muted",
                        )}
                        onPress={() => toggleCategory(key)}
                        activeOpacity={0.7}
                        accessibilityLabel={`${isEnabled ? "Hide" : "Show"} ${meta.label}`}
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
                        {count > 0 && (
                          <Text
                            className={cn(
                              "ml-1 text-[11px] font-barlow-sc-medium",
                              isEnabled ? "text-muted-foreground" : "text-muted-foreground/50",
                            )}
                          >
                            {count}
                          </Text>
                        )}
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
