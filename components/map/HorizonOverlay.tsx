import React from "react";
import { View, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/theme";
import { usePanelStore } from "@/store/panelStore";
import { useSettingsStore } from "@/store/settingsStore";
import { HORIZON_CHOICES, type ClimbZoomScope, type HorizonKm } from "@/types";
import { formatDistance } from "@/utils/formatters";
import type { ActiveRouteData } from "@/types";

/** Scope choices for the climbs tab. Segment is conditionally included. */
const CLIMB_SCOPE_CHOICES_WITH_SEGMENT: ClimbZoomScope[] = ["climb", "segment", "all"];
const CLIMB_SCOPE_CHOICES_NO_SEGMENT: ClimbZoomScope[] = ["climb", "all"];

const SCOPE_LABELS: Record<ClimbZoomScope, string> = {
  climb: "Climb",
  segment: "Segment",
  all: "All",
};

const HORIZON_OVERLAY_STACK_INDEX = 20;
const horizonOverlayLayerStyle = {
  zIndex: HORIZON_OVERLAY_STACK_INDEX,
  elevation: HORIZON_OVERLAY_STACK_INDEX,
};

interface HorizonOverlayProps {
  activeData?: ActiveRouteData | null;
}

/** Dismissible horizon selector popover aligned above the compact map panel.
 *  On the Climbs tab, shows Climb | Segment | All (Segment hidden when no
 *  collection segments). On other tabs, shows numeric horizon distances. */
export default function HorizonOverlay({ activeData }: HorizonOverlayProps) {
  const colors = useThemeColors();
  const panelTab = usePanelStore((s) => s.panelTab);
  const currentHorizon = usePanelStore((s) => s.horizon);
  const setHorizon = usePanelStore((s) => s.setHorizon);
  const climbZoomScope = usePanelStore((s) => s.climbZoomScope);
  const setClimbZoomScope = usePanelStore((s) => s.setClimbZoomScope);
  const isPopoverOpen = usePanelStore((s) => s.isHorizonPopoverOpen);
  const setPopoverOpen = usePanelStore((s) => s.setHorizonPopoverOpen);
  const units = useSettingsStore((s) => s.units);

  const isClimbsTab = panelTab === "climbs";
  const hasSegments = !!(activeData?.segments && activeData.segments.length > 0);
  const scopeChoices = isClimbsTab
    ? hasSegments
      ? CLIMB_SCOPE_CHOICES_WITH_SEGMENT
      : CLIMB_SCOPE_CHOICES_NO_SEGMENT
    : null;
  const effectiveClimbScope =
    !hasSegments && climbZoomScope === "segment" ? "climb" : climbZoomScope;

  const handleHorizonSelect = (km: HorizonKm) => {
    setHorizon(km);
  };

  const handleScopeSelect = (scope: ClimbZoomScope) => {
    setClimbZoomScope(scope);
  };

  const dismiss = () => {
    setPopoverOpen(false);
  };

  const positionStyle = { top: -60, ...horizonOverlayLayerStyle };

  const formatHorizonChoice = (km: HorizonKm) =>
    km === null ? "All" : formatDistance(km * 1000, units).replace(".0", "");

  // --- Collapsed state ---
  if (!isPopoverOpen) {
    if (isClimbsTab) {
      const selectedLabel = SCOPE_LABELS[effectiveClimbScope];
      return (
        <View
          className="absolute left-0 right-0 items-center pointer-events-box-none"
          style={positionStyle}
        >
          <TouchableOpacity
            onPress={() => setPopoverOpen(true)}
            accessibilityLabel={`Map scope: ${selectedLabel}. Tap to change.`}
            accessibilityRole="button"
            className="rounded-2xl items-center justify-center pointer-events-auto"
            style={{
              minWidth: 72,
              height: 48,
              paddingHorizontal: 16,
              backgroundColor: colors.surfaceRaised,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 6,
              elevation: 8,
            }}
          >
            <Text className="font-barlow-sc-semibold text-[13px]" style={{ color: colors.accent }}>
              {selectedLabel}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    const selectedLabel = formatHorizonChoice(currentHorizon);
    return (
      <View
        className="absolute left-0 right-0 items-center pointer-events-box-none"
        style={positionStyle}
      >
        <TouchableOpacity
          onPress={() => setPopoverOpen(true)}
          accessibilityLabel={`Horizon: ${selectedLabel}. Tap to change.`}
          accessibilityRole="button"
          className="rounded-2xl items-center justify-center pointer-events-auto"
          style={{
            minWidth: 72,
            height: 48,
            paddingHorizontal: 16,
            backgroundColor: colors.surfaceRaised,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 6,
            elevation: 8,
          }}
        >
          <Text className="font-barlow-sc-semibold text-[13px]" style={{ color: colors.accent }}>
            {selectedLabel}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Expanded state ---
  if (isClimbsTab && scopeChoices) {
    return (
      <Pressable
        onPress={dismiss}
        style={[StyleSheet.absoluteFillObject, horizonOverlayLayerStyle]}
        className="pointer-events-auto"
      >
        <View
          className="absolute left-0 right-0 items-center pointer-events-box-none"
          style={positionStyle}
        >
          <View
            className="flex-row rounded-2xl pointer-events-auto"
            style={{
              backgroundColor: colors.surfaceRaised,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              padding: 6,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 6,
              elevation: 8,
            }}
          >
            {scopeChoices.map((scope) => {
              const isActive = effectiveClimbScope === scope;
              const label = SCOPE_LABELS[scope];
              return (
                <TouchableOpacity
                  key={scope}
                  onPress={() => handleScopeSelect(scope)}
                  accessibilityLabel={`Map scope: ${label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  className="rounded-full items-center justify-center"
                  style={{
                    minWidth: 48,
                    height: 48,
                    paddingHorizontal: 14,
                    backgroundColor: isActive ? colors.accent : "transparent",
                  }}
                >
                  <Text
                    className="font-barlow-sc-semibold text-[13px]"
                    style={{
                      color: isActive ? colors.accentForeground : colors.textSecondary,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Pressable>
    );
  }

  // Numeric horizon choices (Profile, Weather, POIs)
  return (
    <Pressable
      onPress={dismiss}
      style={[StyleSheet.absoluteFillObject, horizonOverlayLayerStyle]}
      className="pointer-events-auto"
    >
      <View
        className="absolute left-0 right-0 items-center pointer-events-box-none"
        style={positionStyle}
      >
        <View
          className="flex-row rounded-2xl pointer-events-auto"
          style={{
            backgroundColor: colors.surfaceRaised,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            padding: 6,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 6,
            elevation: 8,
          }}
        >
          {HORIZON_CHOICES.map((km) => {
            const isActive = km === currentHorizon;
            const choiceLabel = formatHorizonChoice(km);
            const accessibilityLabel =
              km === null ? "Show whole route" : `Show next ${choiceLabel}`;
            return (
              <TouchableOpacity
                key={km === null ? "whole" : String(km)}
                onPress={() => handleHorizonSelect(km)}
                accessibilityLabel={accessibilityLabel}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                className="rounded-full items-center justify-center"
                style={{
                  minWidth: 48,
                  height: 48,
                  paddingHorizontal: 14,
                  backgroundColor: isActive ? colors.accent : "transparent",
                }}
              >
                <Text
                  className="font-barlow-sc-semibold text-[13px]"
                  style={{
                    color: isActive ? colors.accentForeground : colors.textSecondary,
                  }}
                >
                  {choiceLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
}
