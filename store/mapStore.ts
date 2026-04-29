import { create } from "zustand";
import { createMMKV, type MMKV } from "react-native-mmkv";
import { DEFAULT_MAP_CENTER, DEFAULT_ZOOM } from "@/constants";
import { requestLocationPermission, getCurrentPosition } from "@/services/gps";
import type { UserPosition } from "@/types";

let storage: MMKV | null = null;
function getStorage(): MMKV {
  if (!storage) storage = createMMKV({ id: "map-camera" });
  return storage;
}

function defaultCamera(): { center: [number, number]; zoom: number } {
  return {
    center: [DEFAULT_MAP_CENTER.longitude, DEFAULT_MAP_CENTER.latitude],
    zoom: DEFAULT_ZOOM,
  };
}

function readPersistedCamera(): { center: [number, number]; zoom: number } {
  try {
    const raw = getStorage().getString("camera");
    if (raw) return JSON.parse(raw);
  } catch {
    return defaultCamera();
  }
  return defaultCamera();
}

function readPersistedBoolean(key: string, defaultValue: boolean): boolean {
  try {
    const raw = getStorage().getString(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    return defaultValue;
  }
  return defaultValue;
}

interface MapState {
  center: [number, number]; // [longitude, latitude] — Mapbox convention
  zoom: number;
  followUser: boolean;
  showDistanceMarkers: boolean;
  userPosition: UserPosition | null;
  isRefreshing: boolean;

  setCenter: (center: [number, number]) => void;
  setFollowUser: (follow: boolean) => void;
  toggleDistanceMarkers: () => void;
  setUserPosition: (position: UserPosition | null) => void;
  refreshPosition: () => Promise<UserPosition | null>;
  persistCamera: (center: [number, number], zoom: number) => void;
}

const persisted = readPersistedCamera();

export const useMapStore = create<MapState>((set, get) => ({
  center: persisted.center,
  zoom: persisted.zoom,
  followUser: readPersistedBoolean("followUser", false),
  showDistanceMarkers: readPersistedBoolean("showDistanceMarkers", false),
  userPosition: null,
  isRefreshing: false,

  setCenter: (center) => set({ center }),
  setFollowUser: (followUser) => {
    try {
      getStorage().set("followUser", String(followUser));
    } catch (error) {
      console.warn("Failed to persist follow GPS preference:", error);
    }
    set({ followUser });
  },
  toggleDistanceMarkers: () => {
    const next = !get().showDistanceMarkers;
    try {
      getStorage().set("showDistanceMarkers", String(next));
    } catch (error) {
      console.warn("Failed to persist distance marker preference:", error);
    }
    set({ showDistanceMarkers: next });
  },
  setUserPosition: (userPosition) => set({ userPosition }),

  persistCamera: (center, zoom) => {
    set({ center, zoom });
    try {
      getStorage().set("camera", JSON.stringify({ center, zoom }));
    } catch (error) {
      console.warn("Failed to persist map camera:", error);
    }
  },

  refreshPosition: async () => {
    if (get().isRefreshing) return null;
    set({ isRefreshing: true });
    try {
      const granted = await requestLocationPermission();
      if (!granted) return null;
      const position = await getCurrentPosition();
      if (position) {
        set({ userPosition: position });
      }
      return position;
    } finally {
      set({ isRefreshing: false });
    }
  },
}));
