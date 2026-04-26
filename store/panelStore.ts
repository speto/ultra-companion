import { create } from "zustand";
import { createMMKV, type MMKV } from "react-native-mmkv";
import type { ClimbZoomScope, HorizonKm, PanelTab } from "@/types";
import { HORIZON_CHOICES } from "@/types";

let storage: MMKV | null = null;

function getStorage(): MMKV {
  if (!storage) {
    storage = createMMKV({ id: "panel" });
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

function writeString(key: string, value: string): void {
  try {
    getStorage().set(key, value);
  } catch {}
}

interface PanelState {
  /** Global horizon distance (km or null for whole route) */
  horizon: HorizonKm;
  /** Set global horizon for all panel tabs and map fitting */
  setHorizon: (km: HorizonKm) => void;
  /** Get active global horizon */
  activeHorizon: () => HorizonKm;
  /** Increments when an explicit UI horizon selection should fit the camera */
  horizonFitRequestId: number;

  /** Whether the horizon selector popover is currently open */
  isHorizonPopoverOpen: boolean;
  /** Open/close the horizon selector popover */
  setHorizonPopoverOpen: (open: boolean) => void;
  /** Update horizon from map zoom level (skips if popover is open) */
  setHorizonFromZoom: (km: HorizonKm) => void;
  /** Sync horizon from programmatic camera moves (no fit request, no popover guard) */
  setHorizonFromCamera: (km: HorizonKm) => void;

  /** Which tab is active in the bottom panel */
  panelTab: PanelTab;
  setPanelTab: (tab: PanelTab) => void;

  /** Whether the bottom sheet is in expanded mode */
  isExpanded: boolean;
  setIsExpanded: (isExpanded: boolean) => void;

  /** Climb-specific map scope: climb bounds, collection segment, or full route */
  climbZoomScope: ClimbZoomScope;
  /** Set climb map scope and request camera refit */
  setClimbZoomScope: (scope: ClimbZoomScope) => void;
  /** Increments when a climb scope change should fit the camera */
  climbScopeFitRequestId: number;
}

const PANEL_TABS: ReadonlySet<PanelTab> = new Set([
  "profile",
  "weather",
  "climbs",
  "pois",
  "waypoints",
]);

function readPanelTab(): PanelTab {
  const raw = readString("panelTab");
  if (raw && PANEL_TABS.has(raw as PanelTab)) return raw as PanelTab;
  return "profile";
}

const VALID_CLIMB_ZOOM_SCOPES: ReadonlySet<ClimbZoomScope> = new Set(["climb", "segment", "all"]);

function readClimbZoomScope(): ClimbZoomScope {
  const raw = readString("climbZoomScope");
  if (raw && VALID_CLIMB_ZOOM_SCOPES.has(raw as ClimbZoomScope)) return raw as ClimbZoomScope;
  return "climb";
}

function isValidHorizon(value: unknown): value is HorizonKm {
  return (
    value === null ||
    (typeof value === "number" && (HORIZON_CHOICES as readonly (number | null)[]).includes(value))
  );
}

function readHorizon(): HorizonKm {
  const rawGlobal = readString("horizon");
  if (rawGlobal) {
    try {
      const parsed = JSON.parse(rawGlobal) as unknown;
      if (isValidHorizon(parsed)) return parsed;
    } catch {
      // Fall through to default
    }
  }
  return 50;
}

function persistHorizon(horizon: HorizonKm): void {
  writeString("horizon", JSON.stringify(horizon));
}

export const usePanelStore = create<PanelState>((set, get) => ({
  horizon: readHorizon(),

  setHorizon: (km) => {
    persistHorizon(km);
    set((state) => ({
      horizon: km,
      isHorizonPopoverOpen: false,
      horizonFitRequestId: state.horizonFitRequestId + 1,
    }));
  },

  activeHorizon: () => {
    return get().horizon;
  },

  horizonFitRequestId: 0,

  isHorizonPopoverOpen: false,
  setHorizonPopoverOpen: (open) => {
    if (get().isHorizonPopoverOpen === open) return;
    set({ isHorizonPopoverOpen: open });
  },
  setHorizonFromZoom: (km) => {
    if (get().isHorizonPopoverOpen) return;
    if (get().horizon === km) return;
    persistHorizon(km);
    set({ horizon: km });
  },
  setHorizonFromCamera: (km) => {
    if (get().horizon === km) return;
    persistHorizon(km);
    set({ horizon: km });
  },

  panelTab: readPanelTab(),

  setPanelTab: (panelTab) => {
    try {
      getStorage().set("panelTab", panelTab);
    } catch {}
    set({ panelTab, isHorizonPopoverOpen: false });
  },

  isExpanded: false,
  setIsExpanded: (isExpanded) => {
    if (get().isExpanded === isExpanded) return;
    set({ isExpanded });
  },

  climbZoomScope: readClimbZoomScope(),
  setClimbZoomScope: (scope) => {
    try {
      getStorage().set("climbZoomScope", scope);
    } catch {}
    set((state) => ({
      climbZoomScope: scope,
      isHorizonPopoverOpen: false,
      climbScopeFitRequestId: state.climbScopeFitRequestId + 1,
    }));
  },
  climbScopeFitRequestId: 0,
}));
