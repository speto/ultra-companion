import { router } from "expo-router";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { POIFilterSheetContent } from "@/components/map/POIFilterBar";
import { useThemeColors } from "@/theme";

export default function POIFiltersScreen() {
  const colors = useThemeColors();
  const { bottom } = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const close = () => router.back();

  return (
    <View className="flex-1 justify-end bg-black/40">
      <Pressable
        className="absolute inset-0"
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close POI filters"
      />
      <View
        className="rounded-t-2xl border-t border-border bg-surface pt-3"
        style={{ paddingBottom: bottom + 12, maxHeight: height * 0.86 }}
      >
        <View className="items-center pb-1" accessible={false}>
          <View
            className="rounded-full"
            style={{ width: 36, height: 4, backgroundColor: colors.textTertiary, opacity: 0.5 }}
          />
        </View>
        <POIFilterSheetContent onClose={close} />
      </View>
    </View>
  );
}
