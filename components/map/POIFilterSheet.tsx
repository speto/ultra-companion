import React, { Suspense, useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Clock, X } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { POI_CATEGORIES } from "@/constants";
import { POI_ICON_MAP } from "@/constants/poiIcons";
import { cn } from "@/lib/cn";
import { usePoiStore, type FoodAvailabilityMode } from "@/store/poiStore";
import { useThemeColors } from "@/theme";
import type { POICategory } from "@/types";

const AvailabilityTimePickerSheet = React.lazy(() => import("./AvailabilityTimePickerSheet"));

const SPRING_CONFIG = { damping: 28, stiffness: 300, overshootClamping: true };
const SHEET_TRANSLATE_Y = 420;

const FOOD_CATEGORIES: POICategory[] = ["groceries", "bakery", "gas_station"];
const EAT_DRINK_CATEGORIES: POICategory[] = ["coffee", "restaurant", "bar_pub"];
const FOOD_AVAILABILITY_CATEGORIES: POICategory[] = [...FOOD_CATEGORIES, ...EAT_DRINK_CATEGORIES];

const SHEET_SECTIONS: Array<{ label: string; rows: POICategory[][] }> = [
  { label: "Water", rows: [["water", "cemetery"]] },
  {
    label: "Rest",
    rows: [
      ["shelter", "bus_stop", "camp_site"],
      ["sports", "school"],
    ],
  },
  { label: "WC", rows: [["toilet_shower"]] },
  {
    label: "Help",
    rows: [
      ["pharmacy", "hospital_er"],
      ["defibrillator", "emergency_phone", "ambulance_station"],
    ],
  },
  { label: "Repair", rows: [["bike_shop", "repair_station", "pump_air"]] },
  { label: "Escape / Transport", rows: [["train_station"]] },
];

export default function POIFilterSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const { bottom } = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [isRendered, setIsRendered] = useState(visible);
  const translateY = useSharedValue(SHEET_TRANSLATE_Y);
  const dragStartY = useSharedValue(0);

  React.useEffect(() => {
    if (visible) {
      setIsRendered(true);
      translateY.value = withSpring(0, SPRING_CONFIG);
    } else {
      translateY.value = withSpring(SHEET_TRANSLATE_Y, SPRING_CONFIG, () => {
        runOnJS(setIsRendered)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are refs, not deps
  }, [visible]);

  const panGesture = Gesture.Pan()
    .activeOffsetY([-5, 5])
    .onStart(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateY.value = Math.max(0, dragStartY.value + event.translationY);
    })
    .onEnd((event) => {
      const shouldClose = event.translationY > 80 || event.velocityY > 300;
      if (shouldClose) {
        translateY.value = withSpring(SHEET_TRANSLATE_Y, SPRING_CONFIG, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: translateY.value < SHEET_TRANSLATE_Y ? 1 - translateY.value / SHEET_TRANSLATE_Y : 0,
  }));

  if (!isRendered) return null;

  return (
    <Modal
      visible={isRendered}
      transparent
      presentationStyle="overFullScreen"
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1" pointerEvents={visible ? "auto" : "none"}>
        <Animated.View
          className="absolute inset-0 bg-black/40"
          style={backdropStyle}
          pointerEvents="auto"
        >
          <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close POI filters" />
        </Animated.View>

        <Animated.View
          className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-border bg-surface pt-3"
          style={[{ paddingBottom: bottom + 12, maxHeight: height * 0.86 }, animatedStyle]}
          pointerEvents="auto"
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View>
              <View className="items-center pb-1" accessible={false}>
                <View
                  className="rounded-full"
                  style={{
                    width: 36,
                    height: 4,
                    backgroundColor: colors.textTertiary,
                    opacity: 0.5,
                  }}
                />
              </View>
            </Animated.View>
          </GestureDetector>
          <POIFilterSheetContent onClose={onClose} />
        </Animated.View>
      </View>
    </Modal>
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
      setEnabledCategories(FOOD_AVAILABILITY_CATEGORIES);
      return;
    }
    setEnabledCategories([...new Set([...enabledCategories, ...FOOD_AVAILABILITY_CATEGORIES])]);
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

  const getLeafAccessibilityLabel = useCallback(
    (key: POICategory, label: string) => {
      if (!isCategoryFilterActive) return `Show only ${label}`;
      if (enabledSet.has(key)) {
        return enabledCategories.length === 1 ? `Clear ${label} filter` : `Hide ${label}`;
      }
      return `Add ${label} to filter`;
    },
    [enabledCategories.length, enabledSet, isCategoryFilterActive],
  );

  const renderCategoryFilterButton = useCallback(
    (key: POICategory) => {
      const meta = POI_CATEGORIES.find((category) => category.key === key);
      if (!meta) return null;
      const isEnabled = isCategoryFilterActive && enabledSet.has(key);
      const IconComp = POI_ICON_MAP[meta.iconName];
      return (
        <CategoryFilterButton
          key={key}
          label={meta.label}
          icon={IconComp && <IconComp size={16} color={isEnabled ? meta.color : colors.textTertiary} />}
          active={isEnabled}
          onPress={() => handleToggleLeaf(key)}
          accessibilityLabel={getLeafAccessibilityLabel(key, meta.label)}
        />
      );
    },
    [
      colors.textTertiary,
      enabledSet,
      getLeafAccessibilityLabel,
      handleToggleLeaf,
      isCategoryFilterActive,
    ],
  );

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
        <FoodEatDrinkFilterGroup
          renderCategoryButton={renderCategoryFilterButton}
          availabilityControl={
            <FoodAvailabilityControl
              mode={foodAvailabilityMode}
              customTime={foodAvailabilityCustomTime}
              onPress={handleAvailabilityPress}
            />
          }
        />
        {SHEET_SECTIONS.map((section) => (
          <View key={section.label} className="mb-4">
            <Text className="mb-2 text-[12px] font-barlow-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {section.rows.flat().map(renderCategoryFilterButton)}
            </View>
          </View>
        ))}
      </ScrollView>
      {timePickerOpen && (
        <Suspense fallback={null}>
          <AvailabilityTimePickerSheet
            visible={timePickerOpen}
            value={foodAvailabilityCustomTime}
            onApply={applyCustomTime}
            onClose={() => setTimePickerOpen(false)}
          />
        </Suspense>
      )}
    </View>
  );
}

function FoodEatDrinkFilterGroup({
  renderCategoryButton,
  availabilityControl,
}: {
  renderCategoryButton: (key: POICategory) => React.ReactNode;
  availabilityControl: React.ReactNode;
}) {
  return (
    <View className="mb-4">
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text className="mb-2 text-[12px] font-barlow-semibold uppercase tracking-wider text-muted-foreground">
            Food / Supplies
          </Text>
          <View className="flex-row flex-wrap gap-2">{FOOD_CATEGORIES.map(renderCategoryButton)}</View>
        </View>
        <View className="flex-1">
          <Text className="mb-2 text-[12px] font-barlow-semibold uppercase tracking-wider text-muted-foreground">
            Eat / Drink
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {EAT_DRINK_CATEGORIES.map(renderCategoryButton)}
          </View>
        </View>
      </View>
      {availabilityControl}
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
    { mode: "eta", label: "ETA" },
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
        "min-h-[48px] flex-1 flex-row items-center justify-center rounded-lg border px-2 py-2",
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

function formatTimeForChip(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
