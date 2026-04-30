import React from "react";
import { TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Menu } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useThemeColors } from "@/theme";

interface MapControlsProps {
  className?: string;
  onBeforeOpen?: () => void;
}

export default function MapControls({ className, onBeforeOpen }: MapControlsProps) {
  const colors = useThemeColors();
  const router = useRouter();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      className={cn(
        "w-[52px] h-[52px] rounded-full items-center justify-center shadow-md border bg-surface/95 border-border-subtle",
        className,
      )}
      onPress={() => {
        onBeforeOpen?.();
        router.push("/menu");
      }}
      accessibilityLabel="Open menu"
      accessibilityHint="Opens the main app menu."
      accessibilityRole="button"
    >
      <Menu size={23} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}
