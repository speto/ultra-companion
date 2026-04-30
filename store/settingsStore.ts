import { create } from "zustand";
import { createMMKV, type MMKV } from "react-native-mmkv";
import type {
  ClimbGraphSize,
  UnitSystem,
  WeatherRefreshMode,
  WeatherTemperatureDisplayMode,
} from "@/types";

let storage: MMKV | null = null;

function getStorage(): MMKV {
  if (!storage) {
    storage = createMMKV({ id: "settings" });
  }
  return storage;
}

function readString(key: string): string | undefined {
  try {
    return getStorage().getString(key);
  } catch {
    return undefined;
  }
}

function readNumber(key: string, fallback: number): number {
  const raw = readString(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(key: string, fallback: boolean): boolean {
  const raw = readString(key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function readClimbGraphSize(): ClimbGraphSize {
  const raw = readString("climbGraphSize");
  if (raw === "small" || raw === "medium" || raw === "large") return raw;
  return "small";
}

interface SettingsState {
  units: UnitSystem;
  defaultRoadSpeedKmh: number;
  defaultOffroadSpeedKmh: number;
  weatherRefreshMode: WeatherRefreshMode;
  weatherTemperatureDisplayMode: WeatherTemperatureDisplayMode;
  climbGraphSize: ClimbGraphSize;
  showClimbSearch: boolean;
  climbGraphSwipeHintSeen: boolean;
  hideClimbValueHeadersOnScroll: boolean;
  setUnits: (units: UnitSystem) => void;
  setDefaultRoadSpeedKmh: (speed: number) => void;
  setDefaultOffroadSpeedKmh: (speed: number) => void;
  setWeatherRefreshMode: (mode: WeatherRefreshMode) => void;
  setWeatherTemperatureDisplayMode: (mode: WeatherTemperatureDisplayMode) => void;
  setClimbGraphSize: (size: ClimbGraphSize) => void;
  setShowClimbSearch: (show: boolean) => void;
  setClimbGraphSwipeHintSeen: (seen: boolean) => void;
  setHideClimbValueHeadersOnScroll: (hide: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  units: (readString("units") as UnitSystem) ?? "metric",
  defaultRoadSpeedKmh: readNumber("defaultRoadSpeedKmh", 22),
  defaultOffroadSpeedKmh: readNumber("defaultOffroadSpeedKmh", 14),
  weatherRefreshMode: (readString("weatherRefreshMode") as WeatherRefreshMode) ?? "automatic",
  weatherTemperatureDisplayMode:
    (readString("weatherTemperatureDisplayMode") as WeatherTemperatureDisplayMode) ?? "actual",
  climbGraphSize: readClimbGraphSize(),
  showClimbSearch: readBoolean("showClimbSearch", true),
  climbGraphSwipeHintSeen: readBoolean("climbGraphSwipeHintSeen", false),
  hideClimbValueHeadersOnScroll: readBoolean("hideClimbValueHeadersOnScroll", false),

  setUnits: (units) => {
    try {
      getStorage().set("units", units);
    } catch {}
    set({ units });
  },

  setDefaultRoadSpeedKmh: (defaultRoadSpeedKmh) => {
    try {
      getStorage().set("defaultRoadSpeedKmh", String(defaultRoadSpeedKmh));
    } catch {}
    set({ defaultRoadSpeedKmh });
  },

  setDefaultOffroadSpeedKmh: (defaultOffroadSpeedKmh) => {
    try {
      getStorage().set("defaultOffroadSpeedKmh", String(defaultOffroadSpeedKmh));
    } catch {}
    set({ defaultOffroadSpeedKmh });
  },

  setWeatherRefreshMode: (weatherRefreshMode) => {
    try {
      getStorage().set("weatherRefreshMode", weatherRefreshMode);
    } catch {}
    set({ weatherRefreshMode });
  },

  setWeatherTemperatureDisplayMode: (weatherTemperatureDisplayMode) => {
    try {
      getStorage().set("weatherTemperatureDisplayMode", weatherTemperatureDisplayMode);
    } catch {}
    set({ weatherTemperatureDisplayMode });
  },

  setClimbGraphSize: (climbGraphSize) => {
    try {
      getStorage().set("climbGraphSize", climbGraphSize);
    } catch {}
    set({ climbGraphSize });
  },

  setShowClimbSearch: (showClimbSearch) => {
    try {
      getStorage().set("showClimbSearch", String(showClimbSearch));
    } catch {}
    set({ showClimbSearch });
  },

  setClimbGraphSwipeHintSeen: (climbGraphSwipeHintSeen) => {
    try {
      getStorage().set("climbGraphSwipeHintSeen", String(climbGraphSwipeHintSeen));
    } catch {}
    set({ climbGraphSwipeHintSeen });
  },

  setHideClimbValueHeadersOnScroll: (hideClimbValueHeadersOnScroll) => {
    try {
      getStorage().set("hideClimbValueHeadersOnScroll", String(hideClimbValueHeadersOnScroll));
    } catch {}
    set({ hideClimbValueHeadersOnScroll });
  },
}));
