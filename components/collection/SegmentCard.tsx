import type { ReactNode } from "react";
import { TouchableOpacity, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/theme";

export interface SegmentCardMetadataItem {
  label: string;
  icon?: ReactNode;
}

interface SegmentCardProps {
  title: string;
  subtitle?: string;
  metadataItems?: SegmentCardMetadataItem[];
  color?: string;
  index?: number;
  isCurrent?: boolean;
  expanded?: boolean;
  onPress?: () => void;
  action?: ReactNode;
  children?: ReactNode;
}

export default function SegmentCard({
  title,
  subtitle,
  metadataItems = [],
  color,
  index,
  isCurrent = false,
  expanded = false,
  onPress,
  action,
  children,
}: SegmentCardProps) {
  const colors = useThemeColors();
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <View className="rounded-xl bg-muted/30 mb-2 overflow-hidden">
      <TouchableOpacity
        className="flex-row items-center px-3 py-2.5"
        style={{ minHeight: 56 }}
        onPress={onPress}
        activeOpacity={onPress ? 0.75 : 1}
        accessibilityRole={onPress ? "button" : undefined}
      >
        <View
          className="rounded-full mr-3"
          style={{ width: 5, height: 32, backgroundColor: color ?? colors.textTertiary }}
        />
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text
              className="font-barlow-semibold text-[14px] text-foreground flex-1 mr-2"
              numberOfLines={1}
            >
              {index != null ? `${index}. ` : ""}
              {title}
            </Text>
            {isCurrent && (
              <Text className="font-barlow-sc-semibold text-[10px] text-accent mr-2">CURRENT</Text>
            )}
          </View>
          {subtitle ? (
            <Text
              className="font-barlow-sc-medium text-[12px] text-muted-foreground mt-0.5"
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
          {metadataItems.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 mt-1.5">
              {metadataItems.map((item) => (
                <View
                  key={item.label}
                  className="flex-row items-center rounded-full bg-background/70 px-2 py-0.5"
                >
                  {item.icon ? <View className="mr-1">{item.icon}</View> : null}
                  <Text className="font-barlow-sc-semibold text-[11px] text-muted-foreground">
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {action ?? (onPress ? <Chevron size={18} color={colors.textTertiary} /> : null)}
      </TouchableOpacity>
      {expanded && children ? <View className="px-2 pb-3">{children}</View> : null}
    </View>
  );
}
