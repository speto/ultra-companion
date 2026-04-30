import React from "react";
import { View, TextInput as RNTextInput } from "react-native";
import { Search } from "lucide-react-native";
import { useThemeColors } from "@/theme";

interface PanelSearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
}

export default function PanelSearchInput({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
}: PanelSearchInputProps) {
  const colors = useThemeColors();

  return (
    <View
      className="flex-row items-center px-4 py-2"
      style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, height: 48 }}
    >
      <Search size={16} color={colors.textTertiary} />
      <RNTextInput
        className="flex-1 ml-2 text-[15px] font-barlow text-foreground"
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}
