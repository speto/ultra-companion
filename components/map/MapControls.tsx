import React from "react";
import { View, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Menu } from "lucide-react-native";
import { useThemeColors } from "@/theme";

export default function MapControls() {
  const colors = useThemeColors();
  const { top: safeTop } = useSafeAreaInsets();
  const router = useRouter();

  const topControlOffset = safeTop + 12;

  return (
    <View className="absolute left-4" style={{ top: topControlOffset }}>
      <TouchableOpacity
        className="w-[52px] h-[52px] rounded-xl items-center justify-center shadow-md bg-surface/95 border border-border-subtle"
        onPress={() => router.push("/menu")}
        accessibilityLabel="Open menu"
      >
        <Menu size={22} color={colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}
