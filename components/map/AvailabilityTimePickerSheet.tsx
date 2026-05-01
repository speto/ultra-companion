import React, { useState } from "react";
import { Modal, Pressable, UIManager, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/theme";

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

export default function AvailabilityTimePickerSheet({
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
              style={{
                width: 32,
                height: 4,
                backgroundColor: colors.textTertiary,
                opacity: 0.5,
              }}
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
