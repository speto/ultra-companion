import { create } from "zustand";
import { createMMKV, type MMKV } from "react-native-mmkv";
import type { UnitSystem } from "@/types";

export type WaypointMapIconStyle = "clean" | "bordered";

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

function readWaypointMapIconStyle(): WaypointMapIconStyle {
  const value = readString("waypointMapIconStyle");
  return value === "clean" || value === "bordered" ? value : "bordered";
}

interface SettingsState {
  units: UnitSystem;
  setUnits: (units: UnitSystem) => void;
  waypointMapIconStyle: WaypointMapIconStyle;
  setWaypointMapIconStyle: (style: WaypointMapIconStyle) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  units: (readString("units") as UnitSystem) ?? "metric",
  waypointMapIconStyle: readWaypointMapIconStyle(),

  setUnits: (units) => {
    try {
      getStorage().set("units", units);
    } catch {}
    set({ units });
  },

  setWaypointMapIconStyle: (waypointMapIconStyle) => {
    try {
      getStorage().set("waypointMapIconStyle", waypointMapIconStyle);
    } catch {}
    set({ waypointMapIconStyle });
  },
}));
