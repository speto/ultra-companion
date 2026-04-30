import React, { useState } from "react";
import {
  View,
  Pressable,
  FlatList,
  StyleSheet,
  Modal,
  UIManager,
  useWindowDimensions,
  type ListRenderItem,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import DateTimePicker from "@react-native-community/datetimepicker";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { ListDivider } from "@/components/ui/list-divider";
import { Text } from "@/components/ui/text";
import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  Snowflake,
  CloudLightning,
  Wind,
  ArrowUp,
  RefreshCw,
  Clock3,
  ListFilter,
  CalendarClock,
  Ruler,
  Thermometer,
  Flame,
  AlertTriangle,
  Umbrella,
} from "lucide-react-native";
import { useThemeColors } from "@/theme";
import {
  resolveEffectiveWeatherStart,
  useWeatherStore,
  type WeatherFetchContext,
} from "@/store/weatherStore";
import { usePanelStore } from "@/store/panelStore";
import { useRouteStore } from "@/store/routeStore";
import { useCollectionStore } from "@/store/collectionStore";
import { useEtaStore } from "@/store/etaStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useOfflineStore } from "@/store/offlineStore";
import { cn } from "@/lib/cn";
import { formatTimeAgo } from "@/utils/formatters";
import { displayTemperatureC, temperatureGradientColor } from "@/utils/temperatureOverlay";
import {
  getWeatherInfo,
  getWeatherRisk,
  type ConditionColorRole,
  type WeatherRiskInfo,
  type WeatherSeverity,
} from "@/utils/weatherCodes";
import { classifyWind } from "@/services/weatherService";
import type {
  ActiveRouteData,
  HorizonKm,
  StitchedSegmentInfo,
  WeatherPoint,
  WeatherTimelineMetricKey,
  WeatherTemperatureDisplayMode,
  WindRelative,
} from "@/types";
import { horizonToMeters } from "@/utils/horizon";
import { OPEN_METEO_MAX_FORECAST_HOURS } from "@/constants";

const SPRING_CONFIG = { damping: 28, stiffness: 300, overshootClamping: true };
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
const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  Snowflake,
  CloudLightning,
};

const TEMPERATURE_LABEL_CHANGE_C = 3;
const MAX_TEMPERATURE_STRIP_LABELS = 5;
const TEMPERATURE_STRIP_LABEL_WIDTH = 76;
const TEMPERATURE_STRIP_LABEL_GAP = 8;
const FORECAST_PRESET_MATCH_TOLERANCE_MS = 5 * 60_000;
const FORECAST_CUSTOM_MINUTE_INTERVAL = 15;
const FORECAST_CUSTOM_INTERVAL_MS = FORECAST_CUSTOM_MINUTE_INTERVAL * 60_000;
const FORECAST_START_HORIZON_MS = OPEN_METEO_MAX_FORECAST_HOURS * 3600_000;
const FORECAST_START_HORIZON_DAYS = OPEN_METEO_MAX_FORECAST_HOURS / 24;
const WEATHER_TOOLBAR_HORIZONTAL_PADDING = 24;
const WEATHER_TOOLBAR_GAP_WIDTH = 8;
const WEATHER_CHIP_BASE_WIDTH = 46;
const WEATHER_CHIP_LABEL_CHAR_WIDTH = 7.2;
const WEATHER_REFRESH_LABEL = "Refresh";

type TemperatureStripSample = WeatherPoint;
type TimelineListItem =
  | { type: "weather"; key: string; point: WeatherPoint }
  | { type: "section"; key: string; label: string };
type WeatherSampleMode = "all" | "hourly" | "distance";

const WEATHER_SAMPLE_MODES: readonly WeatherSampleMode[] = ["all", "hourly", "distance"];
const WEATHER_TIMELINE_METRICS: readonly WeatherTimelineMetricKey[] = [
  "precipitation",
  "humidity",
  "gusts",
];
const DEFAULT_WEATHER_TIMELINE_METRICS: readonly WeatherTimelineMetricKey[] = [
  "precipitation",
  "gusts",
];
const WEATHER_TIMELINE_HORIZONTAL_PADDING = 12;
const WEATHER_TIMELINE_CONDITION_GAP = 8;
const WEATHER_TIMELINE_TIME_WIDTH = 44;
const WEATHER_TIMELINE_TEMP_WIDTH = 36;
const WEATHER_TIMELINE_WIND_WIDTH = 58;
const WEATHER_TIMELINE_METRIC_WIDTH: Record<WeatherTimelineMetricKey, number> = {
  precipitation: 62,
  humidity: 34,
  gusts: 50,
};
const WEATHER_TIMELINE_GRID_PADDING_STYLE = {
  paddingLeft: WEATHER_TIMELINE_HORIZONTAL_PADDING,
  paddingRight: WEATHER_TIMELINE_HORIZONTAL_PADDING,
};
const WEATHER_TIMELINE_CONDITION_COLUMN_STYLE = {
  marginLeft: WEATHER_TIMELINE_CONDITION_GAP,
};
const WEATHER_TIMELINE_METRIC_LABEL: Record<WeatherTimelineMetricKey, string> = {
  precipitation: "Rain",
  humidity: "",
  gusts: "Gust",
};
const WEATHER_TIMELINE_METRIC_SHEET_LABEL: Record<WeatherTimelineMetricKey, string> = {
  precipitation: "Precipitation",
  humidity: "Humidity",
  gusts: "Gusts",
};

function normalizeWeatherTimelineMetrics(
  metrics: readonly WeatherTimelineMetricKey[],
): WeatherTimelineMetricKey[] {
  const normalized = WEATHER_TIMELINE_METRICS.filter((metric) => metrics.includes(metric));
  return normalized.length > 0 ? normalized : [...DEFAULT_WEATHER_TIMELINE_METRICS];
}

function toggleWeatherTimelineMetric(
  metrics: readonly WeatherTimelineMetricKey[],
  metric: WeatherTimelineMetricKey,
): WeatherTimelineMetricKey[] {
  const normalized = normalizeWeatherTimelineMetrics(metrics);
  if (normalized.includes(metric)) {
    if (normalized.length === 1) return normalized;
    return normalized.filter((item) => item !== metric);
  }

  return WEATHER_TIMELINE_METRICS.filter((item) => item === metric || normalized.includes(item));
}

function hasMeaningfulRouteDistance(distanceMeters: number): boolean {
  return Number.isFinite(distanceMeters) && distanceMeters > 50;
}

function conditionColor(
  role: ConditionColorRole,
  colors: ReturnType<typeof useThemeColors>,
): string {
  switch (role) {
    case "sun":
      return colors.starred;
    case "night":
      return colors.info;
    case "rain":
      return colors.info;
    case "ice":
    case "cold":
      return colors.info;
    case "storm":
      return colors.warning;
    case "heat":
      return colors.destructive;
    case "fog":
    case "cloud":
      return colors.info;
    default:
      return colors.textSecondary;
  }
}

function humidityColor(percent: number, colors: ReturnType<typeof useThemeColors>): string {
  if (percent >= 70) return colors.info;
  if (percent <= 40) return colors.warning;
  return colors.textSecondary;
}

function severityColor(
  severity: WeatherSeverity,
  colors: ReturnType<typeof useThemeColors>,
): string {
  switch (severity) {
    case "danger":
      return colors.destructive;
    case "warning":
    case "caution":
      return colors.warning;
    case "info":
      return colors.info;
  }
}

function WeatherIcon({ point, size }: { point: WeatherPoint; size: number }) {
  const colors = useThemeColors();
  const info = getWeatherInfo(point.weatherCode, point.isDay);
  const Icon = ICON_MAP[info.icon] ?? Cloud;
  return <Icon size={size} color={conditionColor(info.colorRole, colors)} />;
}

function HumidityIcon({ color, size = 19 }: { color: string; size?: number }) {
  const stroke = 1.75;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.5 6.5c1.2-.8 2.4-.8 3.6 0"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 6.5c1.2-.8 2.4-.8 3.6 0 1.2.8 2.5.8 3.9 0"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 2.8c-1.8 2.2-2.7 3.7-2.7 4.9 0 1.6 1.2 2.8 2.7 2.8s2.7-1.2 2.7-2.8c0-1.2-.9-2.7-2.7-4.9Z"
        stroke={color}
        strokeWidth={stroke}
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M2.5 13c1.4-.9 2.8-.9 4.2 0 1.4.9 2.8.9 4.2 0 1.4-.9 2.8-.9 4.2 0 1.4.9 2.8.9 4.4 0"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2.5 19c1.1-.7 2.2-.7 3.3 0"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M11 19c1.1-.7 2.2-.7 3.3 0 1.2.8 2.5.8 3.9 0 1.1-.7 2.2-.7 3.3 0"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8 15.6c-1.5 1.9-2.3 3.1-2.3 4.1 0 1.3 1 2.4 2.3 2.4s2.3-1.1 2.3-2.4c0-1-.8-2.2-2.3-4.1Z"
        stroke={color}
        strokeWidth={stroke}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function CompactConditionTitle({ label }: { label: string }) {
  const [firstWord, ...remainingWords] = label.split(" ");
  const secondLine = remainingWords.join(" ");

  if (!secondLine) {
    return (
      <Text
        className="text-[12px] font-barlow-semibold text-foreground ml-1.5 flex-shrink"
        numberOfLines={1}
      >
        {label}
      </Text>
    );
  }

  return (
    <View className="ml-1.5 flex-shrink min-w-0">
      <Text
        className="text-[11px] font-barlow-semibold text-foreground"
        numberOfLines={1}
        style={{ lineHeight: 11 }}
      >
        {firstWord}
      </Text>
      <Text
        className="text-[11px] font-barlow-semibold text-foreground"
        numberOfLines={1}
        style={{ lineHeight: 11 }}
      >
        {secondLine}
      </Text>
    </View>
  );
}

function gustSeverityColor(
  gustKmh: number,
  windKmh: number,
  colors: ReturnType<typeof useThemeColors>,
): string {
  const diff = gustKmh - windKmh;
  if (gustKmh >= 55 || diff >= 30) return colors.destructive;
  if (gustKmh >= 45 || diff >= 20) return colors.destructive;
  if (gustKmh >= 35 || diff >= 12) return colors.warning;
  return colors.textSecondary;
}

function windColor(rel: WindRelative | null, colors: ReturnType<typeof useThemeColors>): string {
  if (!rel) return colors.textTertiary;
  switch (rel) {
    case "headwind":
      return colors.destructive;
    case "tailwind":
      return colors.positive;
    default:
      return colors.warning;
  }
}

function windArrowRotation(windDirectionDeg: number, routeBearingDeg: number | null): number {
  if (routeBearingDeg == null) return (windDirectionDeg + 180) % 360;
  return (windDirectionDeg + 180 - routeBearingDeg + 360) % 360;
}

function isPrecipitationCode(code: number): boolean {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 71 && code <= 77) ||
    (code >= 80 && code <= 86) ||
    code === 95 ||
    code === 96 ||
    code === 99
  );
}

type PrecipitationDisplay = {
  amountLabel: string | null;
  probabilityLabel: string | null;
  accessibilityLabel: string;
};

function precipitationDisplay(point: WeatherPoint): PrecipitationDisplay | null {
  const probability = Math.round(point.precipitationProbability);
  const hasAmount = point.precipitationMm >= 0.1;
  const hasChance = probability > 0;
  if (!hasAmount && !hasChance && !isPrecipitationCode(point.weatherCode)) return null;
  if (hasAmount && hasChance) {
    const amountLabel = `${point.precipitationMm.toFixed(1)}mm`;
    const probabilityLabel = `${probability}%`;
    return {
      amountLabel,
      probabilityLabel,
      accessibilityLabel: `${amountLabel} ${probabilityLabel}`,
    };
  }
  if (hasAmount) {
    const amountLabel = `${point.precipitationMm.toFixed(1)}mm`;
    return { amountLabel, probabilityLabel: null, accessibilityLabel: amountLabel };
  }
  if (hasChance) {
    const probabilityLabel = `${probability}%`;
    return { amountLabel: null, probabilityLabel, accessibilityLabel: probabilityLabel };
  }
  return null;
}

function formatHour(isoTime: string | null | undefined): string {
  if (!isoTime) return "--:--";
  const d = new Date(isoTime);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTemp(tempC: number): string {
  return `${Math.round(tempC)}°`;
}

function formatStartLabel(startMs: number | null): string {
  if (startMs == null) return "Now";
  const date = new Date(startMs);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrow = today + 24 * 3600_000;
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (dateDay === today) return `Today ${time}`;
  if (dateDay === tomorrow) return `Tomorrow ${time}`;
  return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

function weatherSampleModeLabel(mode: WeatherSampleMode): string {
  switch (mode) {
    case "all":
      return "All";
    case "hourly":
      return "Hourly";
    case "distance":
      return "10km";
  }
}

function estimateToolbarChipWidth(label: string): number {
  return WEATHER_CHIP_BASE_WIDTH + label.length * WEATHER_CHIP_LABEL_CHAR_WIDTH;
}

function nextWeatherSampleMode(mode: WeatherSampleMode): WeatherSampleMode {
  const nextIndex = (WEATHER_SAMPLE_MODES.indexOf(mode) + 1) % WEATHER_SAMPLE_MODES.length;
  return WEATHER_SAMPLE_MODES[nextIndex];
}

function buildContext(
  activeData: ActiveRouteData | null,
  forecastStartOverride?: { hasOverride: boolean; overrideStartMs: number | null },
): WeatherFetchContext | null {
  if (!activeData?.points.length) return null;
  const cumulativeTime = useEtaStore.getState().cumulativeTime;
  if (!cumulativeTime) return null;
  const activeCollection = useCollectionStore.getState().collections.find((c) => c.isActive);
  const { forecastStartOverrideMs, hasForecastStartOverride } = useWeatherStore.getState();
  const effectiveForecastStartOverride = forecastStartOverride ?? {
    hasOverride: hasForecastStartOverride,
    overrideStartMs: forecastStartOverrideMs,
  };
  const collectionPlannedStartMs =
    activeData.type === "collection" ? (activeCollection?.plannedStartMs ?? null) : null;
  const plannedStartMs = resolveEffectiveWeatherStart({
    hasOverride: effectiveForecastStartOverride.hasOverride,
    overrideStartMs: effectiveForecastStartOverride.overrideStartMs,
    collectionPlannedStartMs,
  });
  const snapped = useRouteStore.getState().snappedPosition;
  const isValidSnap =
    plannedStartMs == null &&
    snapped?.routeId === activeData.id &&
    snapped.distanceFromRouteMeters <= 1000;

  const settings = useSettingsStore.getState();

  return {
    routeId: activeData.id,
    points: activeData.points,
    fromIndex: isValidSnap ? snapped.pointIndex : 0,
    cumulativeTime,
    plannedStartMs,
    refreshMode: settings.weatherRefreshMode,
  };
}

type WeatherStatusTone = "neutral" | "warning" | "error";

function statusContent(input: {
  fetchStatus: string;
  lastSuccessfulFetchAtMs: number | null;
  lastFailedFetchAtMs: number | null;
  lastError: string | null;
  lastRefreshOutcome: string;
  lastRefreshMessage: string | null;
  isConnected: boolean;
  refreshMode: string;
}): { base: string; suffix: string | null; suffixTone: WeatherStatusTone } {
  if (input.fetchStatus === "fetching") {
    return { base: "Updating weather...", suffix: null, suffixTone: "neutral" };
  }
  if (!input.lastSuccessfulFetchAtMs) {
    const base = input.refreshMode === "manual" ? "Manual refresh" : "Weather unavailable";
    if (input.fetchStatus === "error" && input.lastError) {
      return { base, suffix: readableWeatherError(input.lastError), suffixTone: "error" };
    }
    if (input.lastRefreshOutcome === "unavailable" && input.lastRefreshMessage) {
      return { base, suffix: input.lastRefreshMessage, suffixTone: "warning" };
    }
    return { base, suffix: null, suffixTone: "neutral" };
  }
  const age = formatTimeAgo(input.lastSuccessfulFetchAtMs);
  const base =
    input.refreshMode === "manual" ? `Manual refresh · updated ${age}` : `Updated ${age}`;

  if (!input.isConnected) {
    return { base, suffix: "Offline", suffixTone: "warning" };
  }

  const hasCurrentFailure =
    input.fetchStatus === "error" ||
    input.lastRefreshOutcome === "error" ||
    (input.lastFailedFetchAtMs != null &&
      input.lastFailedFetchAtMs >= input.lastSuccessfulFetchAtMs);
  if (hasCurrentFailure) {
    const reason = input.lastError ?? input.lastRefreshMessage;
    return {
      base,
      suffix: reason ? `Update failed · ${readableWeatherError(reason)}` : "Update failed",
      suffixTone: "error",
    };
  }

  if (input.lastRefreshOutcome === "unavailable") {
    return {
      base,
      suffix: input.lastRefreshMessage ?? "Refresh unavailable",
      suffixTone: "warning",
    };
  }

  if (input.lastRefreshOutcome === "skipped-fresh") {
    return {
      base,
      suffix: input.lastRefreshMessage ?? "Already up to date",
      suffixTone: "warning",
    };
  }

  return { base, suffix: null, suffixTone: "neutral" };
}

function readableWeatherError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("offline")) return "Offline";
  if (lower.includes("no weather forecasts")) return "No forecast data";
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("request")) {
    return "Network error";
  }
  return "Refresh failed";
}

function severityLabel(severity: WeatherSeverity): string {
  switch (severity) {
    case "danger":
      return "Danger";
    case "warning":
      return "Warning";
    case "caution":
      return "Caution";
    case "info":
      return "Info";
  }
}

function weatherRiskPresentation(
  risk: WeatherRiskInfo,
  colors: ReturnType<typeof useThemeColors>,
): {
  color: string;
  Icon: React.ComponentType<{ size: number; color: string }>;
} {
  const hazard = risk.hazard.toLowerCase();
  if (hazard.includes("cold") || hazard.includes("freezing")) {
    return { color: colors.info, Icon: Snowflake };
  }
  if (hazard.includes("heat")) {
    return { color: colors.destructive, Icon: Flame };
  }
  if (hazard.includes("thunder")) {
    return {
      color: risk.severity === "danger" ? colors.destructive : colors.warning,
      Icon: CloudLightning,
    };
  }
  if (hazard.includes("rain") || hazard.includes("wet")) {
    return {
      color: risk.severity === "caution" ? colors.info : colors.warning,
      Icon: CloudRain,
    };
  }
  if (hazard.includes("wind")) {
    return { color: colors.warning, Icon: Wind };
  }
  return { color: severityColor(risk.severity, colors), Icon: AlertTriangle };
}

function WeatherChip({
  active,
  onPress,
  icon,
  label,
  labelLines,
  badgeText,
  accessibilityLabel,
  accessibilityRoleOverride = "switch",
  disabled = false,
  tone = "accent",
  className,
}: {
  active: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  label?: string;
  labelLines?: readonly string[];
  badgeText?: string;
  accessibilityLabel: string;
  accessibilityRoleOverride?: "button" | "switch";
  disabled?: boolean;
  tone?: "accent" | "warning";
  className?: string;
}) {
  return (
    <Pressable
      className={cn(
        "flex-row items-center px-3 py-2 min-h-[40px] rounded-full border min-w-0",
        active
          ? tone === "warning"
            ? "bg-warning/10 border-warning/30"
            : "bg-accent/10 border-accent/30"
          : "border-transparent bg-muted",
        disabled && "opacity-50",
        className,
      )}
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={({ pressed }) =>
        pressed && !disabled ? { opacity: 0.72, transform: [{ scale: 0.98 }] } : undefined
      }
      accessibilityRole={accessibilityRoleOverride}
      accessibilityState={
        accessibilityRoleOverride === "switch" ? { checked: active, disabled } : { disabled }
      }
      accessibilityLabel={accessibilityLabel}
    >
      {icon}
      {labelLines ? (
        <View className="ml-1.5 min-w-0 flex-shrink justify-center">
          {labelLines.map((line) => (
            <Text
              key={line}
              className={cn(
                "text-[11px] font-barlow-semibold",
                active ? "text-foreground" : "text-muted-foreground",
              )}
              style={{ lineHeight: 11, includeFontPadding: false }}
              numberOfLines={1}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : label ? (
        <Text
          className={cn(
            "ml-1.5 text-[14px] font-barlow-semibold",
            "min-w-0 flex-shrink",
            active ? "text-foreground" : "text-muted-foreground",
          )}
          numberOfLines={1}
        >
          {label}
        </Text>
      ) : null}
      {badgeText && (
        <View className="ml-1.5 bg-background/50 px-1.5 py-0.5 rounded-md">
          <Text className="text-[10px] font-barlow-sc-medium text-foreground">{badgeText}</Text>
        </View>
      )}
    </Pressable>
  );
}

function WeatherRiskBadge({ risk }: { risk: WeatherRiskInfo }) {
  const colors = useThemeColors();
  const { color, Icon } = weatherRiskPresentation(risk, colors);
  return (
    <View className="h-[30px] w-[34px] items-center justify-center" accessible={false}>
      <Svg width={34} height={30} viewBox="0 0 34 30" style={StyleSheet.absoluteFill}>
        <Path
          d="M17 2.8c.9 0 1.8.5 2.3 1.3l11.1 19c.9 1.6-.3 3.6-2.2 3.6H5.8c-1.9 0-3.1-2-2.2-3.6l11.1-19c.5-.8 1.3-1.3 2.3-1.3Z"
          fill={`${color}1F`}
          stroke={`${color}99`}
          strokeLinejoin="round"
          strokeWidth={1.6}
        />
      </Svg>
      <View className="mt-1.5">
        <Icon size={15} color={color} />
      </View>
    </View>
  );
}

function WeatherMetricIcon({
  metric,
  color,
  size = 12,
}: {
  metric: WeatherTimelineMetricKey;
  color: string;
  size?: number;
}) {
  switch (metric) {
    case "precipitation":
      return <Umbrella size={size} color={color} />;
    case "humidity":
      return <HumidityIcon size={size} color={color} />;
    case "gusts":
      return <Wind size={size} color={color} />;
  }
}

function WeatherHeaderCell({
  label,
  icon,
  className,
  style,
}: {
  label: string;
  icon: React.ReactNode;
  className?: string;
  style?: Pick<ViewStyle, "width" | "marginLeft">;
}) {
  return (
    <View
      className={cn("min-w-0 items-center px-0.5 py-1.5", className)}
      style={style}
      accessible={false}
    >
      <View className="flex-row items-center justify-center min-w-0">
        {icon ? (
          <View className={cn("items-center", label ? "w-[13px] mr-0.5" : "")}>{icon}</View>
        ) : null}
        {label ? (
          <Text
            className="text-[10px] text-muted-foreground font-barlow-medium text-center"
            numberOfLines={1}
          >
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function WeatherMetricHeader({
  visibleMetrics,
  onOpenSettings,
}: {
  visibleMetrics: readonly WeatherTimelineMetricKey[];
  onOpenSettings: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      className="flex-row items-center bg-surface"
      style={[
        WEATHER_TIMELINE_GRID_PADDING_STYLE,
        {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.borderSubtle,
          borderBottomColor: colors.borderSubtle,
        },
      ]}
      accessibilityRole="header"
      accessibilityLabel="Weather timeline metrics"
      accessibilityHint="Long press to configure visible weather metrics."
      accessibilityActions={[{ name: "activate", label: "Configure weather timeline metrics" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "activate") {
          onOpenSettings();
        }
      }}
      onLongPress={onOpenSettings}
      delayLongPress={420}
    >
      <WeatherHeaderCell
        label=""
        icon={
          <View className="flex-row items-center">
            <Clock3 size={10} color={colors.textTertiary} />
            <Ruler size={10} color={colors.textTertiary} />
          </View>
        }
        className="items-start pr-0.5"
        style={{ width: WEATHER_TIMELINE_TIME_WIDTH }}
      />
      <WeatherHeaderCell
        label="Temp"
        icon={<Thermometer size={11} color={colors.textTertiary} />}
        style={{ width: WEATHER_TIMELINE_TEMP_WIDTH }}
      />
      <WeatherHeaderCell
        label=""
        icon={null}
        className="flex-1"
        style={WEATHER_TIMELINE_CONDITION_COLUMN_STYLE}
      />
      {visibleMetrics.map((metric) => (
        <WeatherHeaderCell
          key={metric}
          label={WEATHER_TIMELINE_METRIC_LABEL[metric]}
          icon={<WeatherMetricIcon metric={metric} color={colors.textTertiary} size={11} />}
          style={{ width: WEATHER_TIMELINE_METRIC_WIDTH[metric] }}
        />
      ))}
      <WeatherHeaderCell
        label="Wind"
        icon={<Wind size={11} color={colors.textTertiary} />}
        style={{ width: WEATHER_TIMELINE_WIND_WIDTH }}
      />
    </Pressable>
  );
}

function WeatherMetricsSheet({
  visible,
  visibleMetrics,
  onToggleMetric,
  onClose,
}: {
  visible: boolean;
  visibleMetrics: readonly WeatherTimelineMetricKey[];
  onToggleMetric: (metric: WeatherTimelineMetricKey) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const { bottom } = useSafeAreaInsets();
  const [isRendered, setIsRendered] = useState(visible);
  const translateY = useSharedValue(320);
  const dragStartY = useSharedValue(0);

  React.useEffect(() => {
    if (visible) {
      setIsRendered(true);
      translateY.value = withSpring(0, SPRING_CONFIG);
    } else {
      translateY.value = withSpring(320, SPRING_CONFIG, () => {
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
        translateY.value = withSpring(320, SPRING_CONFIG, () => {
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
    opacity: translateY.value < 320 ? 1 - translateY.value / 320 : 0,
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
          <Pressable className="flex-1" onPress={onClose} />
        </Animated.View>

        <Animated.View
          className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-2xl px-4 pt-3"
          style={[{ paddingBottom: bottom + 16 }, animatedStyle]}
          pointerEvents="auto"
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View>
              <View className="items-center pb-2">
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
                <Text className="text-[22px] font-barlow-semibold text-foreground">
                  Timeline Metrics
                </Text>
                <Pressable
                  className="min-h-[48px] px-3 items-center justify-center"
                  onPress={onClose}
                  style={({ pressed }) =>
                    pressed ? { opacity: 0.72, transform: [{ scale: 0.98 }] } : undefined
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Close weather timeline metric settings"
                >
                  <Text className="text-[15px] font-barlow-semibold text-accent">Done</Text>
                </Pressable>
              </View>
            </Animated.View>
          </GestureDetector>

          <View className="gap-2 mt-1">
            {WEATHER_TIMELINE_METRICS.map((metric) => {
              const checked = visibleMetrics.includes(metric);
              const disabled = checked && visibleMetrics.length === 1;
              return (
                <Pressable
                  key={metric}
                  className={cn(
                    "min-h-[56px] flex-row items-center rounded-xl border border-border bg-card px-3",
                    disabled && "opacity-60",
                  )}
                  onPress={() => onToggleMetric(metric)}
                  disabled={disabled}
                  style={({ pressed }) =>
                    pressed && !disabled
                      ? { opacity: 0.72, transform: [{ scale: 0.99 }] }
                      : undefined
                  }
                  accessibilityRole="switch"
                  accessibilityState={{ checked, disabled }}
                  accessibilityLabel={`Show ${WEATHER_TIMELINE_METRIC_SHEET_LABEL[metric]} in weather timeline`}
                >
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-muted mr-3">
                    <WeatherMetricIcon
                      metric={metric}
                      color={checked ? colors.accent : colors.textTertiary}
                      size={18}
                    />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text
                      className="text-[16px] font-barlow-semibold text-foreground"
                      numberOfLines={1}
                    >
                      {WEATHER_TIMELINE_METRIC_SHEET_LABEL[metric]}
                    </Text>
                    <Text
                      className="text-[12px] font-barlow-medium text-muted-foreground"
                      numberOfLines={1}
                    >
                      {metric === "precipitation"
                        ? "Amount and probability"
                        : metric === "humidity"
                          ? "Relative humidity"
                          : "Wind gust speed"}
                    </Text>
                  </View>
                  <View
                    className="h-6 w-11 rounded-full justify-center px-0.5"
                    style={{
                      backgroundColor: checked ? colors.accent : colors.border,
                    }}
                    accessible={false}
                  >
                    <View
                      className="h-5 w-5 rounded-full bg-surface"
                      style={{ transform: [{ translateX: checked ? 20 : 0 }] }}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text className="mt-2 px-1 text-[12px] font-barlow-medium text-muted-foreground text-center">
            At least one optional metric stays visible for quick weather scanning.
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const WeatherRow = React.memo(function WeatherRow({
  point,
  temperatureMode,
  visibleMetrics,
}: {
  point: WeatherPoint;
  temperatureMode: WeatherTemperatureDisplayMode;
  visibleMetrics: readonly WeatherTimelineMetricKey[];
}) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const windRel =
    point.routeBearingDeg != null
      ? classifyWind(point.windDirectionDeg, point.routeBearingDeg)
      : null;
  const rotation = windArrowRotation(point.windDirectionDeg, point.routeBearingDeg);
  const wColor = windColor(windRel, colors);
  const displayTempC = displayTemperatureC(point, temperatureMode);
  const tColor = temperatureGradientColor(displayTempC);
  const info = getWeatherInfo(point.weatherCode, point.isDay);
  const precip = precipitationDisplay(point);
  const risk = getWeatherRisk(point);
  const riskVisual = risk ? weatherRiskPresentation(risk, colors) : null;
  const canExpand = Boolean(risk);
  const isExpanded = canExpand && expanded;
  const rowTime = point.etaTime ?? point.time;
  const distanceLabel = hasMeaningfulRouteDistance(point.routeDistanceMeters)
    ? formatWholeDistanceKm(point.routeDistanceMeters)
    : null;
  const sustainedWindKmh = Math.round(point.windSpeedKmh);
  const gustWindKmh = Math.round(point.windGustKmh);
  const showPrecipitation = visibleMetrics.includes("precipitation");
  const hasGust = Number.isFinite(point.windGustKmh);
  const gustColor = gustSeverityColor(gustWindKmh, sustainedWindKmh, colors);
  const humidityPercent = Math.round(point.relativeHumidityPercent);
  const hasHumidity = Number.isFinite(point.relativeHumidityPercent);
  const hColor = humidityColor(humidityPercent, colors);
  const precipColor = precip ? colors.info : colors.textTertiary;
  const phaseLabel = point.phase === "post-finish" ? "after finish forecast" : "route forecast";
  const accessibilityActionLabel = canExpand
    ? isExpanded
      ? "tap to collapse warning details"
      : "tap for warning details"
    : null;
  const optionalAccessibility = [
    showPrecipitation && precip ? `precipitation ${precip.accessibilityLabel}` : null,
    visibleMetrics.includes("humidity") && hasHumidity
      ? `humidity ${humidityPercent} percent`
      : null,
    visibleMetrics.includes("gusts") && hasGust ? `gusts ${gustWindKmh} kilometers per hour` : null,
  ].filter(Boolean);
  const accessibilityLabel = `${formatHour(rowTime)}${distanceLabel ? `, ${distanceLabel}` : ""} ${phaseLabel}, ${info.label}, ${formatTemp(displayTempC)}${optionalAccessibility.length > 0 ? `, ${optionalAccessibility.join(", ")}` : ""}${risk ? `, ${severityLabel(risk.severity)} ${risk.hazard}` : ""}, wind ${sustainedWindKmh} kilometers per hour${accessibilityActionLabel ? `, ${accessibilityActionLabel}` : ""}`;

  return (
    <Pressable
      className="py-0.5 relative"
      style={WEATHER_TIMELINE_GRID_PADDING_STYLE}
      onPress={canExpand ? () => setExpanded((current) => !current) : undefined}
      disabled={!canExpand}
      hitSlop={canExpand ? { top: 6, bottom: 6, left: 0, right: 0 } : undefined}
      accessibilityRole={canExpand ? "button" : undefined}
      accessibilityState={canExpand ? { expanded: isExpanded } : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <View className="min-h-[36px] flex-row items-center">
        <View
          className="pr-0.5 self-stretch justify-center"
          style={{ width: WEATHER_TIMELINE_TIME_WIDTH }}
        >
          <Text
            className="text-[15px] font-barlow-sc-semibold text-foreground"
            numberOfLines={1}
            style={{ lineHeight: 15 }}
          >
            {formatHour(rowTime)}
          </Text>
          {distanceLabel && (
            <Text
              className="text-[12px] font-barlow-sc-semibold text-muted-foreground"
              numberOfLines={1}
              style={{ lineHeight: 12 }}
            >
              {distanceLabel}
            </Text>
          )}
        </View>
        <Text
          className="text-[21px] font-barlow-sc-semibold text-right"
          style={{ width: WEATHER_TIMELINE_TEMP_WIDTH, color: tColor }}
        >
          {formatTemp(displayTempC)}
        </Text>
        <View
          className="flex-1 flex-row items-center min-w-0"
          style={WEATHER_TIMELINE_CONDITION_COLUMN_STYLE}
        >
          <WeatherIcon point={point} size={23} />
          <CompactConditionTitle label={info.label} />
          {risk && (
            <View className="ml-1.5 flex-shrink-0">
              <WeatherRiskBadge risk={risk} />
            </View>
          )}
        </View>
        {visibleMetrics.map((metric) => {
          if (metric === "precipitation") {
            return (
              <View
                key={metric}
                className="h-[30px] items-center justify-center flex-shrink-0 px-0.5"
                style={{ width: WEATHER_TIMELINE_METRIC_WIDTH.precipitation }}
              >
                {precip ? (
                  precip.amountLabel && precip.probabilityLabel ? (
                    <>
                      <Text
                        className="text-[15px] font-barlow-sc-semibold text-center"
                        style={{ color: precipColor, lineHeight: 15, includeFontPadding: false }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.78}
                      >
                        {precip.amountLabel}
                      </Text>
                      <Text
                        className="text-[12px] font-barlow-sc-semibold text-center"
                        style={{ color: precipColor, lineHeight: 12, includeFontPadding: false }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.78}
                      >
                        {precip.probabilityLabel}
                      </Text>
                    </>
                  ) : (
                    <Text
                      className="text-[15px] font-barlow-sc-semibold text-center"
                      style={{ color: precipColor, lineHeight: 15, includeFontPadding: false }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                    >
                      {precip.amountLabel ?? precip.probabilityLabel}
                    </Text>
                  )
                ) : null}
              </View>
            );
          }

          if (metric === "humidity") {
            return (
              <View
                key={metric}
                className="h-[24px] items-center justify-center flex-shrink-0 px-0.5"
                style={{ width: WEATHER_TIMELINE_METRIC_WIDTH.humidity }}
              >
                {hasHumidity ? (
                  <Text
                    className="text-[12px] font-barlow-sc-semibold text-center"
                    style={{ color: hColor, lineHeight: 14, includeFontPadding: false }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.86}
                  >
                    {humidityPercent}%
                  </Text>
                ) : null}
              </View>
            );
          }

          return (
            <View
              key={metric}
              className="items-center justify-center flex-shrink-0 px-0.5"
              style={{ width: WEATHER_TIMELINE_METRIC_WIDTH.gusts }}
            >
              {hasGust ? (
                <>
                  <Text
                    className="text-[17px] font-barlow-sc-semibold text-center"
                    style={{ color: gustColor, lineHeight: 18, includeFontPadding: false }}
                    numberOfLines={1}
                  >
                    {gustWindKmh}
                  </Text>
                  <Text
                    className="text-[10px] font-barlow-medium text-muted-foreground text-center"
                    style={{ lineHeight: 10, includeFontPadding: false }}
                    numberOfLines={1}
                  >
                    km/h
                  </Text>
                </>
              ) : null}
            </View>
          );
        })}
        <View
          className="flex-row items-center justify-end"
          style={{ width: WEATHER_TIMELINE_WIND_WIDTH }}
        >
          <View style={{ transform: [{ rotate: `${rotation}deg` }] }}>
            <ArrowUp size={16} color={wColor} />
          </View>
          <Text className="text-[21px] font-barlow-sc-semibold ml-1" style={{ color: wColor }}>
            {sustainedWindKmh}
          </Text>
          <Text className="text-[10px] font-barlow-medium ml-0.5 text-muted-foreground">km/h</Text>
        </View>
      </View>
      {isExpanded && risk && riskVisual && (
        <View className="pt-1 pb-1.5">
          <View className="flex-row items-start">
            <View className="w-[72px]" />
            <View className="flex-1 min-w-0 items-center px-1">
              <View className="max-w-full flex-row items-center justify-center min-w-0">
                <riskVisual.Icon size={18} color={riskVisual.color} />
                <Text
                  className="text-[17px] font-barlow-sc-semibold ml-2 flex-shrink min-w-0 text-center"
                  style={{ color: riskVisual.color }}
                  numberOfLines={1}
                >
                  {risk.hazard}
                </Text>
              </View>
              <Text
                className="text-[13px] font-barlow-medium text-muted-foreground mt-0.5 text-center"
                numberOfLines={3}
              >
                {`${risk.impact} ${risk.action}`}
              </Text>
            </View>
            <View className="w-[72px]" />
          </View>
        </View>
      )}
      <ListDivider className="absolute bottom-0 left-3 right-0" />
    </Pressable>
  );
});

function TimelineSectionHeader({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View
      className="px-3 pt-2.5 pb-1.5 bg-surface"
      style={{
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderSubtle,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
      }}
      accessibilityRole="header"
    >
      <View className="flex-row items-center">
        <View className="h-[1px] flex-1" style={{ backgroundColor: colors.border }} />
        <Text className="mx-2 text-[11px] font-barlow-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </Text>
        <View className="h-[1px] flex-1" style={{ backgroundColor: colors.border }} />
      </View>
    </View>
  );
}

export function StartPickerSheet({
  visible,
  startMs,
  title = "Forecast Start",
  accessibilityContextLabel = "forecast start",
  maxStartMs,
  helperText,
  onApply,
  onClose,
}: {
  visible: boolean;
  startMs: number | null;
  title?: string;
  accessibilityContextLabel?: string;
  maxStartMs?: number;
  helperText?: string;
  onApply: (value: number | null) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const { bottom } = useSafeAreaInsets();
  const [isRendered, setIsRendered] = useState(visible);
  const [customMode, setCustomMode] = useState(false);
  const [draftDate, setDraftDate] = useState(
    new Date(clampPickerStartMs(startMs ?? Date.now(), maxStartMs)),
  );
  const translateY = useSharedValue(400);
  const dragStartY = useSharedValue(0);

  const handleCancel = React.useCallback(() => {
    if (customMode) {
      setCustomMode(false);
      return;
    }
    onClose();
  }, [customMode, onClose]);

  React.useEffect(() => {
    if (visible) {
      setCustomMode(false);
      setDraftDate(new Date(clampPickerStartMs(startMs ?? Date.now(), maxStartMs)));
      setIsRendered(true);
      translateY.value = withSpring(0, SPRING_CONFIG);
    } else {
      translateY.value = withSpring(400, SPRING_CONFIG, () => {
        runOnJS(setIsRendered)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are refs, not deps
  }, [visible, startMs, maxStartMs]);

  const panGesture = Gesture.Pan()
    .activeOffsetY([-5, 5])
    .onStart(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      const newY = dragStartY.value + event.translationY;
      translateY.value = Math.max(0, newY);
    })
    .onEnd((event) => {
      const shouldClose = event.translationY > 80 || event.velocityY > 300;
      if (shouldClose) {
        if (customMode) {
          runOnJS(handleCancel)();
          translateY.value = withSpring(0, SPRING_CONFIG);
        } else {
          translateY.value = withSpring(400, SPRING_CONFIG, () => {
            runOnJS(handleCancel)();
          });
        }
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: translateY.value < 400 ? 1 - translateY.value / 400 : 0,
  }));

  const presetRows = [
    [10, 6, 4, 2, "now"],
    [8, 5, 3, 1, "custom"],
  ] as const;
  const nowMs = Date.now();
  const maxStartDate = maxStartMs == null ? undefined : new Date(maxStartMs);
  const isNowSelected = startMs == null;
  const isPresetSelected = (hours: number) =>
    startMs != null &&
    Math.abs(startMs - (nowMs + hours * 3600_000)) <= FORECAST_PRESET_MATCH_TOLERANCE_MS;

  if (!isRendered) return null;

  return (
    <Modal
      visible={isRendered}
      transparent
      presentationStyle="overFullScreen"
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <View className="flex-1" pointerEvents={visible ? "auto" : "none"}>
        <Animated.View
          className="absolute inset-0 bg-black/40"
          style={backdropStyle}
          pointerEvents="auto"
        >
          <Pressable className="flex-1" onPress={handleCancel} />
        </Animated.View>

        <Animated.View
          className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-2xl px-4 pt-3"
          style={[{ paddingBottom: bottom + 16 }, animatedStyle]}
          pointerEvents="auto"
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View>
              <View className="items-center pb-2">
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
                <Text className="text-[22px] font-barlow-semibold text-foreground">{title}</Text>
                <Pressable
                  className="min-h-[48px] px-3 items-center justify-center"
                  onPress={handleCancel}
                  style={({ pressed }) =>
                    pressed ? { opacity: 0.72, transform: [{ scale: 0.98 }] } : undefined
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel ${accessibilityContextLabel} change`}
                >
                  <Text className="text-[15px] font-barlow-semibold text-accent">Cancel</Text>
                </Pressable>
              </View>
            </Animated.View>
          </GestureDetector>
          {!customMode ? (
            <>
              <View className="gap-2 mt-1 px-1">
                {presetRows.map((row) => (
                  <View key={row.join("-")} className="flex-row justify-center gap-2">
                    {row.map((preset) => {
                      if (preset === "now") {
                        return (
                          <Button
                            key="now"
                            variant="secondary"
                            onPress={() => onApply(null)}
                            className={
                              isNowSelected
                                ? "h-14 w-[56px] px-1 border-accent bg-accent"
                                : "h-14 w-[56px] px-1"
                            }
                            accessibilityState={{ selected: isNowSelected }}
                            accessibilityLabel={`Set ${accessibilityContextLabel} to now`}
                          >
                            <Text
                              className={
                                isNowSelected
                                  ? "text-[15px] font-barlow-medium text-accent-foreground text-center"
                                  : "text-[15px] font-barlow-medium text-accent text-center"
                              }
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.9}
                            >
                              Now
                            </Text>
                          </Button>
                        );
                      }

                      if (preset === "custom") {
                        return (
                          <Button
                            key="custom"
                            variant="secondary"
                            onPress={() => {
                              setDraftDate(
                                new Date(clampPickerStartMs(startMs ?? Date.now(), maxStartMs)),
                              );
                              setCustomMode(true);
                            }}
                            className="h-14 w-[56px] px-1"
                            accessibilityLabel={`Choose ${accessibilityContextLabel} date and time`}
                          >
                            <CalendarClock size={21} color={colors.accent} />
                          </Button>
                        );
                      }

                      const presetMs = nowMs + preset * 3600_000;
                      const presetDisabled = maxStartMs != null && presetMs > maxStartMs;
                      const selected = isPresetSelected(preset);
                      return (
                        <Button
                          key={preset}
                          variant="secondary"
                          onPress={() =>
                            onApply(clampPickerStartMs(Date.now() + preset * 3600_000, maxStartMs))
                          }
                          className={
                            selected
                              ? "h-14 w-[56px] px-1 border-accent bg-accent"
                              : "h-14 w-[56px] px-1"
                          }
                          disabled={presetDisabled}
                          accessibilityState={{ selected, disabled: presetDisabled }}
                          accessibilityLabel={`Set ${accessibilityContextLabel} plus ${preset} hours`}
                        >
                          <Text
                            className={
                              selected
                                ? "text-[15px] font-barlow-medium text-accent-foreground text-center"
                                : "text-[15px] font-barlow-medium text-accent text-center"
                            }
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.9}
                          >
                            +{preset}h
                          </Text>
                        </Button>
                      );
                    })}
                  </View>
                ))}
              </View>
              {helperText && (
                <Text className="mt-2 px-1 text-[12px] font-barlow-medium text-muted-foreground text-center">
                  {helperText}
                </Text>
              )}
            </>
          ) : (
            <>
              {HAS_NATIVE_DATETIME_PICKER ? (
                <View className="h-[236px] rounded-xl overflow-hidden bg-card border border-border">
                  <DateTimePicker
                    value={draftDate}
                    mode="datetime"
                    display="spinner"
                    minuteInterval={FORECAST_CUSTOM_MINUTE_INTERVAL}
                    minimumDate={new Date()}
                    maximumDate={maxStartDate}
                    onChange={(_, date) => {
                      if (date) {
                        setDraftDate(new Date(clampPickerStartMs(date.getTime(), maxStartMs)));
                      }
                    }}
                    style={{ alignSelf: "stretch", height: 236 }}
                  />
                </View>
              ) : (
                <View className="min-h-[120px] rounded-xl bg-card border border-border items-center justify-center px-4">
                  <Text className="text-[14px] text-muted-foreground text-center">
                    Rebuild the app to enable the native date picker.
                  </Text>
                </View>
              )}
              {helperText && (
                <Text className="mt-2 px-1 text-[12px] font-barlow-medium text-muted-foreground text-center">
                  {helperText}
                </Text>
              )}
              <View className="flex-row justify-end gap-2 mt-3">
                <Button
                  variant="secondary"
                  label="Back"
                  onPress={() => setCustomMode(false)}
                  className="h-12 px-4"
                />
                <Button
                  label="Use time"
                  onPress={() => onApply(clampPickerStartMs(draftDate.getTime(), maxStartMs))}
                  className="h-12 px-5"
                  disabled={!HAS_NATIVE_DATETIME_PICKER}
                />
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function ActionStatusBar({
  activeData,
  sampleMode,
  onCycleSampleMode,
  warningCount,
}: {
  activeData: ActiveRouteData | null;
  sampleMode: WeatherSampleMode;
  onCycleSampleMode: () => void;
  warningCount: number;
}) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const fetchStatus = useWeatherStore((s) => s.fetchStatus);
  const lastSuccessfulFetchAtMs = useWeatherStore((s) => s.lastSuccessfulFetchAtMs);
  const lastFailedFetchAtMs = useWeatherStore((s) => s.lastFailedFetchAtMs);
  const lastError = useWeatherStore((s) => s.lastError);
  const lastRefreshOutcome = useWeatherStore((s) => s.lastRefreshOutcome);
  const lastRefreshMessage = useWeatherStore((s) => s.lastRefreshMessage);
  const refreshWeatherNow = useWeatherStore((s) => s.refreshWeatherNow);
  const recordManualRefreshUnavailable = useWeatherStore((s) => s.recordManualRefreshUnavailable);
  const forecastStartOverrideMs = useWeatherStore((s) => s.forecastStartOverrideMs);
  const hasForecastStartOverride = useWeatherStore((s) => s.hasForecastStartOverride);
  const setForecastStartOverride = useWeatherStore((s) => s.setForecastStartOverride);
  const isConnected = useOfflineStore((s) => s.isConnected);
  const refreshMode = useSettingsStore((s) => s.weatherRefreshMode);
  const temperatureMode = useSettingsStore((s) => s.weatherTemperatureDisplayMode);
  const setTemperatureMode = useSettingsStore((s) => s.setWeatherTemperatureDisplayMode);
  const activeCollection = useCollectionStore((s) => s.collections.find((c) => c.isActive));
  const [pickerOpen, setPickerOpen] = useState(false);
  const refreshRotation = useSharedValue(0);
  const sampleModeLabel = weatherSampleModeLabel(sampleMode);
  const nextSampleModeLabel = weatherSampleModeLabel(nextWeatherSampleMode(sampleMode));
  const sampleModeActive = sampleMode !== "all";
  const weatherForecastStartLimitMs = forecastStartLimitMs();
  const collectionPlannedStartMs =
    activeData?.type === "collection" ? (activeCollection?.plannedStartMs ?? null) : null;
  const startMs = resolveEffectiveWeatherStart({
    hasOverride: hasForecastStartOverride,
    overrideStartMs: forecastStartOverrideMs,
    collectionPlannedStartMs,
  });
  const startLabel = formatStartLabel(startMs);
  const availableToolbarWidth = Math.max(width - WEATHER_TOOLBAR_HORIZONTAL_PADDING, 0);
  const estimatedToolbarWidthWithRefreshLabel =
    estimateToolbarChipWidth(sampleModeLabel) +
    estimateToolbarChipWidth("Feels like") +
    estimateToolbarChipWidth(startLabel) +
    estimateToolbarChipWidth(WEATHER_REFRESH_LABEL) +
    WEATHER_TOOLBAR_GAP_WIDTH * 3;
  const showRefreshLabel = availableToolbarWidth >= estimatedToolbarWidthWithRefreshLabel;

  const status = statusContent({
    fetchStatus,
    lastSuccessfulFetchAtMs,
    lastFailedFetchAtMs,
    lastError,
    lastRefreshOutcome,
    lastRefreshMessage,
    isConnected,
    refreshMode,
  });
  const statusSuffixColor =
    status.suffixTone === "error"
      ? colors.destructive
      : status.suffixTone === "warning"
        ? colors.warning
        : colors.textSecondary;

  React.useEffect(() => {
    if (fetchStatus === "fetching") {
      refreshRotation.value = 0;
      refreshRotation.value = withRepeat(
        withTiming(360, { duration: 900, easing: Easing.linear }),
        -1,
        false,
      );
      return;
    }

    cancelAnimation(refreshRotation);
    refreshRotation.value = 0;
  }, [fetchStatus, refreshRotation]);

  const refreshIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${refreshRotation.value}deg` }],
  }));

  const refresh = async () => {
    const context = buildContext(activeData);
    if (context) await refreshWeatherNow(context);
    else recordManualRefreshUnavailable("Weather refresh unavailable");
  };

  const applyStart = async (value: number | null) => {
    const constrainedValue = value == null ? null : clampForecastStartMs(value);
    setForecastStartOverride(constrainedValue);
    setPickerOpen(false);
    const context = buildContext(activeData, {
      hasOverride: true,
      overrideStartMs: constrainedValue,
    });
    if (context) await refreshWeatherNow(context);
    else recordManualRefreshUnavailable("Weather refresh unavailable");
  };

  return (
    <View
      className="py-1"
      style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
    >
      <View className="px-3">
        <View className="max-w-full flex-row items-center justify-center gap-2">
          <WeatherChip
            active={sampleModeActive}
            onPress={onCycleSampleMode}
            className="flex-shrink-0"
            icon={
              sampleMode === "hourly" ? (
                <Clock3 size={18} color={colors.accent} />
              ) : sampleMode === "distance" ? (
                <Ruler size={18} color={colors.accent} />
              ) : (
                <ListFilter size={18} color={colors.textTertiary} />
              )
            }
            label={sampleModeLabel}
            accessibilityRoleOverride="button"
            accessibilityLabel={`Weather row mode, ${sampleModeLabel}. Tap for ${nextSampleModeLabel}`}
          />
          <WeatherChip
            active={temperatureMode === "feels-like"}
            onPress={() =>
              setTemperatureMode(temperatureMode === "feels-like" ? "actual" : "feels-like")
            }
            className="flex-shrink-0 pl-3 pr-3.5"
            icon={
              <Thermometer
                size={18}
                color={temperatureMode === "feels-like" ? colors.accent : colors.textTertiary}
              />
            }
            label="Feels like"
            accessibilityLabel="Toggle feels-like temperature"
          />
          <WeatherChip
            active={startMs != null}
            accessibilityRoleOverride="button"
            onPress={() => setPickerOpen(true)}
            className="flex-shrink min-w-0"
            icon={
              <CalendarClock
                size={18}
                color={startMs != null ? colors.accent : colors.textTertiary}
              />
            }
            label={startLabel}
            accessibilityLabel={`Set forecast start, current ${startLabel}`}
          />
          <WeatherChip
            active={false}
            accessibilityRoleOverride="button"
            onPress={refresh}
            className="flex-shrink-0"
            icon={
              <Animated.View style={refreshIconStyle}>
                <RefreshCw
                  size={18}
                  color={fetchStatus === "fetching" ? colors.textTertiary : colors.accent}
                />
              </Animated.View>
            }
            label={showRefreshLabel ? WEATHER_REFRESH_LABEL : undefined}
            accessibilityLabel={fetchStatus === "fetching" ? "Updating weather" : "Refresh weather"}
            disabled={fetchStatus === "fetching"}
          />
        </View>
      </View>
      <View className="flex-row items-center px-3 pt-1">
        <View className="flex-1 flex-row min-w-0">
          <Text
            className="text-[11px] font-barlow-medium flex-shrink"
            style={{ color: colors.textSecondary, lineHeight: 13, includeFontPadding: false }}
            numberOfLines={1}
          >
            {status.base}
          </Text>
          {status.suffix && (
            <Text
              className="text-[11px] font-barlow-medium flex-shrink"
              style={{ color: statusSuffixColor, lineHeight: 13, includeFontPadding: false }}
              numberOfLines={1}
            >
              {` · ${status.suffix}`}
            </Text>
          )}
        </View>
        {warningCount > 0 && (
          <View className="flex-row items-center ml-2">
            <AlertTriangle size={13} color={colors.warning} />
            <Text
              className="text-[11px] font-barlow-sc-semibold ml-1"
              style={{ color: colors.warning }}
            >
              {warningCount}
            </Text>
          </View>
        )}
      </View>
      <StartPickerSheet
        visible={pickerOpen}
        startMs={startMs}
        maxStartMs={weatherForecastStartLimitMs}
        helperText={`Up to ${FORECAST_START_HORIZON_DAYS} days ahead`}
        onApply={applyStart}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

function isRenderableWeatherPoint(point: WeatherPoint | null | undefined): point is WeatherPoint {
  return Boolean(
    point && Number.isFinite(point.temperatureC) && Number.isFinite(point.windSpeedKmh),
  );
}

function weatherPointKey(point: WeatherPoint, index: number): string {
  const timeKey = point.etaTime ?? point.time ?? "weather";
  const distanceKey = point.routeDistanceMeters ?? "unknown-distance";
  return `${timeKey}-${distanceKey}-${index}`;
}

function uniqueRouteSamples(timeline: WeatherPoint[]): WeatherPoint[] {
  const seenDistances = new Set<number>();
  const samples: WeatherPoint[] = [];

  for (const point of timeline) {
    const distanceKey = Math.round(point.routeDistanceMeters / 100);
    if (seenDistances.has(distanceKey)) continue;
    seenDistances.add(distanceKey);
    samples.push(point);
  }

  return samples;
}

function routeScopeEndMeters(
  samples: TemperatureStripSample[],
  routeLengthMeters: number | null,
): number {
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];

  if (
    routeLengthMeters != null &&
    Number.isFinite(routeLengthMeters) &&
    routeLengthMeters > firstSample.routeDistanceMeters
  ) {
    return firstSample.distanceAlongRouteM + routeLengthMeters - firstSample.routeDistanceMeters;
  }

  return lastSample.distanceAlongRouteM;
}

function interpolateTemperatureSample(
  samples: TemperatureStripSample[],
  distanceMeters: number,
): TemperatureStripSample {
  const firstSample = samples[0];

  if (distanceMeters <= firstSample.distanceAlongRouteM) {
    return { ...firstSample, distanceAlongRouteM: distanceMeters };
  }

  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1];
    const next = samples[index];
    if (distanceMeters > next.distanceAlongRouteM) continue;

    const distanceDelta = next.distanceAlongRouteM - previous.distanceAlongRouteM;
    const progress =
      distanceDelta > 0 ? (distanceMeters - previous.distanceAlongRouteM) / distanceDelta : 0;

    return {
      ...next,
      distanceAlongRouteM: distanceMeters,
      routeDistanceMeters:
        previous.routeDistanceMeters +
        (next.routeDistanceMeters - previous.routeDistanceMeters) * progress,
      temperatureC: previous.temperatureC + (next.temperatureC - previous.temperatureC) * progress,
      apparentTemperatureC:
        previous.apparentTemperatureC +
        (next.apparentTemperatureC - previous.apparentTemperatureC) * progress,
    };
  }

  const lastSample = samples[samples.length - 1];
  return { ...lastSample, distanceAlongRouteM: distanceMeters };
}

function focusTemperatureSamples(
  timeline: WeatherPoint[],
  horizon: HorizonKm,
  routeLengthMeters: number | null,
): TemperatureStripSample[] {
  const routeSamples: TemperatureStripSample[] = uniqueRouteSamples(
    timeline
      .filter(
        (point) =>
          point.phase === "route" &&
          Number.isFinite(point.temperatureC) &&
          Number.isFinite(point.distanceAlongRouteM) &&
          Number.isFinite(point.routeDistanceMeters),
      )
      .sort((a, b) => a.distanceAlongRouteM - b.distanceAlongRouteM),
  );

  if (routeSamples.length === 0) return [];

  const firstSample = routeSamples[0];
  const routeEndMeters = routeScopeEndMeters(routeSamples, routeLengthMeters);
  const scopedEndMeters = Math.max(
    firstSample.distanceAlongRouteM,
    horizon === null ? routeEndMeters : Math.min(horizon * 1_000, routeEndMeters),
  );

  if (scopedEndMeters <= firstSample.distanceAlongRouteM) return [];

  const focusedSamples = routeSamples.filter(
    (point) =>
      point.distanceAlongRouteM >= firstSample.distanceAlongRouteM &&
      point.distanceAlongRouteM <= scopedEndMeters,
  );

  if (focusedSamples[0] !== firstSample) {
    focusedSamples.unshift(firstSample);
  }

  const finalSample = focusedSamples[focusedSamples.length - 1];
  if (!finalSample || finalSample.distanceAlongRouteM < scopedEndMeters) {
    focusedSamples.push(interpolateTemperatureSample(routeSamples, scopedEndMeters));
  }

  return focusedSamples.length >= 2 ? focusedSamples : [];
}

function interpolateSampleBetween(
  start: TemperatureStripSample,
  end: TemperatureStripSample,
  temperatureC: number,
  temperatureMode: WeatherTemperatureDisplayMode,
): TemperatureStripSample {
  const startTemperatureC = displayTemperatureC(start, temperatureMode);
  const endTemperatureC = displayTemperatureC(end, temperatureMode);
  const temperatureDelta = endTemperatureC - startTemperatureC;
  const progress =
    temperatureDelta !== 0 ? (temperatureC - startTemperatureC) / temperatureDelta : 0;

  return {
    ...end,
    distanceAlongRouteM:
      start.distanceAlongRouteM + (end.distanceAlongRouteM - start.distanceAlongRouteM) * progress,
    routeDistanceMeters:
      start.routeDistanceMeters + (end.routeDistanceMeters - start.routeDistanceMeters) * progress,
    temperatureC: start.temperatureC + (end.temperatureC - start.temperatureC) * progress,
    apparentTemperatureC:
      start.apparentTemperatureC +
      (end.apparentTemperatureC - start.apparentTemperatureC) * progress,
  };
}

function temperatureStripLabels(
  samples: TemperatureStripSample[],
  temperatureMode: WeatherTemperatureDisplayMode,
): TemperatureStripSample[] {
  const labels: TemperatureStripSample[] = [samples[0]];
  let lastLabelTemperature = Math.round(displayTemperatureC(samples[0], temperatureMode));

  for (let index = 1; index < samples.length; index++) {
    const start = samples[index - 1];
    const end = samples[index];
    const direction = Math.sign(
      Math.round(displayTemperatureC(end, temperatureMode)) - lastLabelTemperature,
    );

    if (direction === 0) continue;

    while (
      labels.length < MAX_TEMPERATURE_STRIP_LABELS - 1 &&
      Math.abs(Math.round(displayTemperatureC(end, temperatureMode)) - lastLabelTemperature) >=
        TEMPERATURE_LABEL_CHANGE_C
    ) {
      const targetTemperature = lastLabelTemperature + direction * TEMPERATURE_LABEL_CHANGE_C;
      const label = interpolateSampleBetween(start, end, targetTemperature, temperatureMode);

      if (
        label.distanceAlongRouteM > start.distanceAlongRouteM &&
        label.distanceAlongRouteM < end.distanceAlongRouteM
      ) {
        labels.push(label);
      }

      lastLabelTemperature = targetTemperature;
    }
  }

  const finalSample = samples[samples.length - 1];
  const lastLabel = labels[labels.length - 1];
  if (Math.abs(lastLabel.distanceAlongRouteM - finalSample.distanceAlongRouteM) > 1) {
    labels.push(finalSample);
  }

  return labels;
}

function temperatureStripProgress(
  sample: TemperatureStripSample,
  firstSample: TemperatureStripSample,
  totalDistance: number,
): number {
  if (totalDistance <= 0) return 0;
  return Math.max(
    0,
    Math.min(1, (sample.distanceAlongRouteM - firstSample.distanceAlongRouteM) / totalDistance),
  );
}

function temperatureStripGradientStops(
  samples: TemperatureStripSample[],
  temperatureMode: WeatherTemperatureDisplayMode,
) {
  const firstSample = samples[0];
  const finalSample = samples[samples.length - 1];
  const totalDistance = finalSample.distanceAlongRouteM - firstSample.distanceAlongRouteM;

  if (totalDistance <= 0) return [];

  const stops = samples.map((sample) => ({
    progress: temperatureStripProgress(sample, firstSample, totalDistance),
    color: temperatureGradientColor(displayTemperatureC(sample, temperatureMode)),
  }));

  if (stops[0]?.progress !== 0) {
    stops.unshift({
      progress: 0,
      color: temperatureGradientColor(displayTemperatureC(firstSample, temperatureMode)),
    });
  }
  if (stops[stops.length - 1]?.progress !== 1) {
    stops.push({
      progress: 1,
      color: temperatureGradientColor(displayTemperatureC(finalSample, temperatureMode)),
    });
  }

  const deduped: typeof stops = [];
  for (const stop of stops) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.progress - stop.progress) < 0.0001) {
      previous.color = stop.color;
      continue;
    }
    deduped.push(stop);
  }

  return deduped;
}

function selectFittingTemperatureLabels(
  labels: TemperatureStripSample[],
  firstSample: TemperatureStripSample,
  totalDistance: number,
  stripWidth: number,
  temperatureMode: WeatherTemperatureDisplayMode,
): TemperatureStripSample[] {
  if (labels.length <= 2 || stripWidth <= 0) return labels;

  const maxInteriorLabels = Math.max(
    0,
    Math.floor(
      (stripWidth - TEMPERATURE_STRIP_LABEL_WIDTH * 2) /
        (TEMPERATURE_STRIP_LABEL_WIDTH + TEMPERATURE_STRIP_LABEL_GAP),
    ),
  );
  if (maxInteriorLabels === 0) return [labels[0], labels[labels.length - 1]];

  const accepted: { start: number; end: number; label: TemperatureStripSample }[] = [];
  const addLabel = (label: TemperatureStripSample): boolean => {
    const progress = temperatureStripProgress(label, firstSample, totalDistance);
    const center = progress * stripWidth;
    const start =
      progress <= 0.08
        ? 0
        : progress >= 0.92
          ? stripWidth - TEMPERATURE_STRIP_LABEL_WIDTH
          : center - TEMPERATURE_STRIP_LABEL_WIDTH / 2;
    const end = start + TEMPERATURE_STRIP_LABEL_WIDTH;
    const collides = accepted.some(
      (entry) =>
        start < entry.end + TEMPERATURE_STRIP_LABEL_GAP &&
        end > entry.start - TEMPERATURE_STRIP_LABEL_GAP,
    );
    if (collides) return false;
    accepted.push({ start, end, label });
    return true;
  };

  addLabel(labels[0]);
  addLabel(labels[labels.length - 1]);

  const interior = labels.slice(1, -1).sort((a, b) => {
    const firstTemperatureC = displayTemperatureC(labels[0], temperatureMode);
    const aTempDelta = Math.abs(displayTemperatureC(a, temperatureMode) - firstTemperatureC);
    const bTempDelta = Math.abs(displayTemperatureC(b, temperatureMode) - firstTemperatureC);
    return bTempDelta - aTempDelta;
  });

  for (const label of interior) {
    if (accepted.length >= maxInteriorLabels + 2) break;
    addLabel(label);
  }

  return accepted
    .map((entry) => entry.label)
    .sort((a, b) => a.distanceAlongRouteM - b.distanceAlongRouteM);
}

function formatDistanceKm(distanceMeters: number): string {
  const roundedKm = Math.round((distanceMeters / 1_000) * 10) / 10;
  if (Math.abs(roundedKm - Math.round(roundedKm)) < 0.05) {
    return `${Math.round(roundedKm)} km`;
  }
  return `${roundedKm.toFixed(1)} km`;
}

function formatWholeDistanceKm(distanceMeters: number): string {
  return `${Math.round(distanceMeters / 1_000)} km`;
}

function forecastStartLimitMs(nowMs = Date.now()): number {
  return (
    Math.floor((nowMs + FORECAST_START_HORIZON_MS) / FORECAST_CUSTOM_INTERVAL_MS) *
    FORECAST_CUSTOM_INTERVAL_MS
  );
}

function roundForecastStartMs(valueMs: number, nowMs = Date.now()): number {
  const rounded = Math.round(valueMs / FORECAST_CUSTOM_INTERVAL_MS) * FORECAST_CUSTOM_INTERVAL_MS;
  if (rounded >= nowMs) return rounded;
  return Math.ceil(nowMs / FORECAST_CUSTOM_INTERVAL_MS) * FORECAST_CUSTOM_INTERVAL_MS;
}

function clampPickerStartMs(
  valueMs: number,
  maxStartMs: number | undefined,
  nowMs = Date.now(),
): number {
  const rounded = roundForecastStartMs(valueMs, nowMs);
  return maxStartMs == null ? rounded : Math.min(rounded, maxStartMs);
}

function clampForecastStartMs(valueMs: number, nowMs = Date.now()): number {
  return clampPickerStartMs(valueMs, forecastStartLimitMs(nowMs), nowMs);
}

function segmentForDistance(
  distanceMeters: number,
  segments: StitchedSegmentInfo[] | null | undefined,
): StitchedSegmentInfo | null {
  if (!segments || segments.length <= 1 || !Number.isFinite(distanceMeters)) return null;
  return (
    segments.find((segment, index) => {
      const start = segment.distanceOffsetMeters;
      const end = start + segment.segmentDistanceMeters;
      return distanceMeters >= start && (distanceMeters < end || index === segments.length - 1);
    }) ?? null
  );
}

function segmentDividerLabel(segment: StitchedSegmentInfo): string {
  return `Segment ${segment.position + 1} · ${segment.routeName}`;
}

function temperatureStripAccessibilityLabel(
  samples: TemperatureStripSample[],
  temperatureMode: WeatherTemperatureDisplayMode,
): string {
  const finalSample = samples[samples.length - 1];
  const displayDistanceMeters = finalSample.distanceAlongRouteM - samples[0].distanceAlongRouteM;
  const startTemperatureLabel = formatTemp(displayTemperatureC(samples[0], temperatureMode));
  const endTemperatureLabel = formatTemp(displayTemperatureC(finalSample, temperatureMode));
  const prefix = temperatureMode === "feels-like" ? "Feels-like temperature" : "Temperature";
  return `${prefix} over ${formatDistanceKm(displayDistanceMeters)}, ${startTemperatureLabel} to ${endTemperatureLabel}`;
}

function FocusTemperatureStrip({
  timeline,
  horizon,
  routeLengthMeters,
  temperatureMode,
}: {
  timeline: WeatherPoint[];
  horizon: HorizonKm;
  routeLengthMeters: number | null;
  temperatureMode: WeatherTemperatureDisplayMode;
}) {
  const colors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const samples = React.useMemo(
    () => focusTemperatureSamples(timeline, horizon, routeLengthMeters),
    [timeline, horizon, routeLengthMeters],
  );

  if (samples.length < 2) return null;

  const gradientStops = temperatureStripGradientStops(samples, temperatureMode);
  const firstSample = samples[0];
  const finalSample = samples[samples.length - 1];
  const totalDistance = finalSample.distanceAlongRouteM - firstSample.distanceAlongRouteM;
  const labels = selectFittingTemperatureLabels(
    temperatureStripLabels(samples, temperatureMode),
    firstSample,
    totalDistance,
    screenWidth - 24,
    temperatureMode,
  );

  if (gradientStops.length < 2 || totalDistance <= 0) return null;

  return (
    <View
      className="px-3 py-2 bg-surface"
      style={{
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
      accessibilityLabel={temperatureStripAccessibilityLabel(samples, temperatureMode)}
    >
      <View style={{ position: "relative" }}>
        <View
          className="h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: colors.borderSubtle }}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient
                id="weather-temperature-strip-gradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                {gradientStops.map((stop) => (
                  <Stop
                    key={`${Math.round(stop.progress * 10_000)}-${stop.color}`}
                    offset={`${stop.progress * 100}%`}
                    stopColor={stop.color}
                  />
                ))}
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#weather-temperature-strip-gradient)" />
          </Svg>
        </View>
      </View>
      <View className="mt-1.5" style={{ height: 16, position: "relative" }}>
        {labels.map((point) => {
          const labelDistance = point.distanceAlongRouteM - samples[0].distanceAlongRouteM;
          const progress = temperatureStripProgress(point, firstSample, totalDistance);
          const displayTempC = displayTemperatureC(point, temperatureMode);
          const labelStyle: TextStyle =
            progress <= 0.08
              ? { left: 0, textAlign: "left" as const }
              : progress >= 0.92
                ? { right: 0, textAlign: "right" as const }
                : { left: `${progress * 100}%`, marginLeft: -38, textAlign: "center" as const };
          const labelKey = [
            point.etaTime ?? point.time,
            Math.round(point.distanceAlongRouteM),
            Math.round(displayTempC),
          ].join("-");

          return (
            <Text
              key={labelKey}
              className="text-[11px] font-barlow-sc-semibold"
              style={{
                position: "absolute",
                width: 76,
                color: temperatureGradientColor(displayTempC),
                ...labelStyle,
              }}
              numberOfLines={1}
            >
              {formatTemp(displayTempC)} · {formatDistanceKm(labelDistance)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function TimelineList({
  timeline,
  horizon,
  currentDistanceMeters,
  segments,
  sampleMode,
  isExpanded,
  temperatureMode,
  visibleMetrics,
}: {
  timeline: WeatherPoint[];
  horizon: HorizonKm;
  currentDistanceMeters: number;
  segments: StitchedSegmentInfo[] | null;
  sampleMode: WeatherSampleMode;
  isExpanded: boolean;
  temperatureMode: WeatherTemperatureDisplayMode;
  visibleMetrics: readonly WeatherTimelineMetricKey[];
}) {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const listData = React.useMemo<TimelineListItem[]>(() => {
    const renderableTimeline = timeline.filter(isRenderableWeatherPoint);
    const horizonMeters = horizonToMeters(horizon);
    const items: TimelineListItem[] = [];
    let routeIndex = 0;
    let postFinishIndex = 0;
    let hasPostFinishHeader = false;
    let currentSegmentId: string | null = null;
    let hasSeenRouteSegment = false;

    for (const point of renderableTimeline) {
      if (point.phase === "route") {
        const sampleKinds = point.sampleKinds ?? [point.sampleKind];
        const matchesHourly = sampleKinds.includes("hourly");
        const matchesDistance = sampleKinds.includes("distance");
        const isFilterableRouteSample = matchesHourly || matchesDistance;
        if (sampleMode === "hourly" && isFilterableRouteSample && !matchesHourly) continue;
        if (sampleMode === "distance" && isFilterableRouteSample && !matchesDistance) continue;
        if (horizonMeters != null) {
          const distanceFromCurrent = (point.distanceAlongRouteM ?? 0) - currentDistanceMeters;
          if (distanceFromCurrent < 0 || distanceFromCurrent > horizonMeters) continue;
        }

        const segment = segmentForDistance(point.routeDistanceMeters, segments);
        if (segment && segment.routeId !== currentSegmentId) {
          if (hasSeenRouteSegment) {
            items.push({
              type: "section",
              key: `segment-${segment.position}-${segment.routeId}`,
              label: segmentDividerLabel(segment),
            });
          }
          currentSegmentId = segment.routeId;
          hasSeenRouteSegment = true;
        }

        items.push({
          type: "weather",
          key: `route-${weatherPointKey(point, routeIndex)}`,
          point,
        });
        routeIndex += 1;
        continue;
      }

      if (point.phase === "post-finish") {
        if (!hasPostFinishHeader) {
          items.push({
            type: "section",
            key: "post-finish-section",
            label: "Finish · after-route forecast",
          });
          hasPostFinishHeader = true;
        }

        items.push({
          type: "weather",
          key: `post-finish-${weatherPointKey(point, postFinishIndex)}`,
          point,
        });
        postFinishIndex += 1;
      }
    }

    return items;
  }, [currentDistanceMeters, horizon, sampleMode, segments, timeline]);

  const renderItem = React.useCallback<ListRenderItem<TimelineListItem>>(
    ({ item }) => {
      if (item.type === "section") return <TimelineSectionHeader label={item.label} />;
      return (
        <WeatherRow
          point={item.point}
          temperatureMode={temperatureMode}
          visibleMetrics={visibleMetrics}
        />
      );
    },
    [temperatureMode, visibleMetrics],
  );

  return (
    <FlatList
      className="flex-1"
      data={listData}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      scrollEnabled={isExpanded}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: isExpanded ? safeBottom + 12 : 0 }}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={3}
      removeClippedSubviews={true}
    />
  );
}

export default function WeatherPanel({ activeData }: { activeData: ActiveRouteData | null }) {
  const colors = useThemeColors();
  const timeline = useWeatherStore((s) => s.timeline);
  const fetchStatus = useWeatherStore((s) => s.fetchStatus);
  const horizon = usePanelStore((s) => s.horizon);
  const isExpanded = usePanelStore((s) => s.isExpanded);
  const setIsExpanded = usePanelStore((s) => s.setIsExpanded);
  const temperatureMode = useSettingsStore((s) => s.weatherTemperatureDisplayMode);
  const configuredMetrics = useSettingsStore((s) => s.weatherTimelineMetrics);
  const setWeatherTimelineMetrics = useSettingsStore((s) => s.setWeatherTimelineMetrics);
  const [sampleMode, setSampleMode] = useState<WeatherSampleMode>("all");
  const [metricsSheetOpen, setMetricsSheetOpen] = useState(false);
  const current = timeline.length > 0 ? timeline[0] : null;
  const visibleMetrics = React.useMemo(
    () => normalizeWeatherTimelineMetrics(configuredMetrics),
    [configuredMetrics],
  );
  const warningCount = React.useMemo(
    () =>
      timeline.filter((point) => isRenderableWeatherPoint(point) && getWeatherRisk(point)).length,
    [timeline],
  );
  const cycleSampleMode = React.useCallback(() => {
    setSampleMode((currentMode) => nextWeatherSampleMode(currentMode));
  }, []);
  const toggleMetric = React.useCallback(
    (metric: WeatherTimelineMetricKey) => {
      setWeatherTimelineMetrics(toggleWeatherTimelineMetric(visibleMetrics, metric));
    },
    [setWeatherTimelineMetrics, visibleMetrics],
  );
  const expandSwipeGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-28, 28])
        .onEnd((event) => {
          const isMostlyVertical =
            Math.abs(event.translationY) > Math.abs(event.translationX) * 1.2;
          const isUpward = event.translationY < -24 || event.velocityY < -350;
          if (!isExpanded && isMostlyVertical && isUpward) {
            runOnJS(setIsExpanded)(true);
          }
        }),
    [isExpanded, setIsExpanded],
  );

  return (
    <View className="flex-1">
      <GestureDetector gesture={expandSwipeGesture}>
        <View>
          <ActionStatusBar
            activeData={activeData}
            sampleMode={sampleMode}
            onCycleSampleMode={cycleSampleMode}
            warningCount={warningCount}
          />
          {!current ? (
            <View className="items-center justify-center py-6 px-4">
              <Wind size={24} color={colors.textTertiary} />
              <Text className="text-[13px] text-muted-foreground font-barlow-medium mt-2">
                {fetchStatus === "fetching" ? "Updating weather..." : "Weather unavailable"}
              </Text>
              <Text className="text-[11px] text-muted-foreground mt-1 text-center">
                Refresh when online to cache route forecast data.
              </Text>
            </View>
          ) : (
            <>
              <FocusTemperatureStrip
                timeline={timeline}
                horizon={horizon}
                routeLengthMeters={activeData?.totalDistanceMeters ?? null}
                temperatureMode={temperatureMode}
              />
            </>
          )}
        </View>
      </GestureDetector>
      {current && (
        <View className="flex-1">
          <WeatherMetricHeader
            visibleMetrics={visibleMetrics}
            onOpenSettings={() => setMetricsSheetOpen(true)}
          />
          <TimelineList
            timeline={timeline}
            horizon={horizon}
            currentDistanceMeters={current?.distanceAlongRouteM ?? 0}
            segments={activeData?.segments ?? null}
            sampleMode={sampleMode}
            isExpanded={isExpanded}
            temperatureMode={temperatureMode}
            visibleMetrics={visibleMetrics}
          />
        </View>
      )}
      <WeatherMetricsSheet
        visible={metricsSheetOpen}
        visibleMetrics={visibleMetrics}
        onToggleMetric={toggleMetric}
        onClose={() => setMetricsSheetOpen(false)}
      />
    </View>
  );
}
