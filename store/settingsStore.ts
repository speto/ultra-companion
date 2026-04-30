import { create } from "zustand";
import { createMMKV, type MMKV } from "react-native-mmkv";
import type { ClimbGraphSize, UnitSystem } from "@/types";

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
  climbGraphSize: ClimbGraphSize;
  showClimbSearch: boolean;
  climbGraphSwipeHintSeen: boolean;
  setUnits: (units: UnitSystem) => void;
  setClimbGraphSize: (size: ClimbGraphSize) => void;
  setShowClimbSearch: (show: boolean) => void;
  setClimbGraphSwipeHintSeen: (seen: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  units: (readString("units") as UnitSystem) ?? "metric",
  climbGraphSize: readClimbGraphSize(),
  showClimbSearch: readBoolean("showClimbSearch", true),
  climbGraphSwipeHintSeen: readBoolean("climbGraphSwipeHintSeen", false),

  setUnits: (units) => {
    try {
      getStorage().set("units", units);
    } catch {}
    set({ units });
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
}));
