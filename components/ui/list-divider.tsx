import { StyleSheet, View, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";
import { useThemeColors } from "@/theme";

interface ListDividerProps extends ViewProps {
  inset?: "none" | "content" | "icon";
}

function ListDivider({ className, inset = "none", style, ...props }: ListDividerProps) {
  const colors = useThemeColors();
  const insetClass = inset === "content" ? "ml-4" : inset === "icon" ? "ml-[60px]" : "";

  return (
    <View
      className={cn(insetClass, className)}
      style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }, style]}
      {...props}
    />
  );
}

export { ListDivider };
