import { create } from "zustand";
import { createMMKV, type MMKV } from "react-native-mmkv";
import type { FetchablePOISource, POI, POICategory, POIFetchStatus, RoutePoint } from "@/types";
import { DEFAULT_CORRIDOR_WIDTH_M, POI_CATEGORIES } from "@/constants";
import { getPOIsForRoute, deletePOIsBySource, deleteDownloadedPOIsForRoute } from "@/db/database";
import { fetchOsmPOIs, fetchGooglePOIs } from "@/services/poiFetcher";
import { isKnownOpenNow } from "@/utils/placeAdapter";
import { usePanelStore } from "./panelStore";
import { useStarredStore } from "./starredStore";

let storage: MMKV | null = null;

function getStorage(): MMKV {
  if (!storage) {
    storage = createMMKV({ id: "poi" });
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

const allPoiCategories = (): POICategory[] => POI_CATEGORIES.map((c) => c.key);

function parseCategories(raw: string | undefined): POICategory[] {
  if (raw === undefined) return allPoiCategories();
  try {
    const valid = new Set<string>(POI_CATEGORIES.map((c) => c.key));
    return (JSON.parse(raw) as string[]).filter((c) => valid.has(c)) as POICategory[];
  } catch {
    return allPoiCategories();
  }
}

function normalizeCategories(categories: POICategory[]): POICategory[] {
  const valid = new Set<string>(POI_CATEGORIES.map((c) => c.key));
  return Array.from(new Set(categories)).filter((c) => valid.has(c)) as POICategory[];
}

export interface ProgressInfo {
  phase: string;
  done: number;
  total: number;
}

export interface SourceInfo {
  status: POIFetchStatus;
  count: number;
  fetchedAt: string | null; // ISO 8601
  error: string | null;
  progress: ProgressInfo | null; // in-memory only; never persisted
}

export const DEFAULT_SOURCE_INFO: SourceInfo = {
  status: "idle",
  count: 0,
  fetchedAt: null,
  error: null,
  progress: null,
};

const SOURCE_INFO_KEY_PREFIX = "sourceInfo_";
const sourceInfoKey = (routeId: string, source: FetchablePOISource) =>
  `${SOURCE_INFO_KEY_PREFIX}${source}_${routeId}`;

function readSourceInfo(routeId: string, source: FetchablePOISource): SourceInfo {
  try {
    const raw = getStorage().getString(sourceInfoKey(routeId, source));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SourceInfo>;
      return { ...DEFAULT_SOURCE_INFO, ...parsed, progress: null };
    }
  } catch {}
  return { ...DEFAULT_SOURCE_INFO };
}

function persistSourceInfo(routeId: string, source: FetchablePOISource, info: SourceInfo): void {
  try {
    const { progress: _progress, ...persisted } = info;
    getStorage().set(sourceInfoKey(routeId, source), JSON.stringify(persisted));
  } catch {}
}

function clearSourceInfo(routeId: string, source: FetchablePOISource): void {
  try {
    getStorage().remove(sourceInfoKey(routeId, source));
  } catch {}
}

/**
 * One-shot cleanup at store init: any persisted "fetching" status is stale
 * (fetches don't survive app restarts), so coerce and write back. After this
 * runs, readers can trust the persisted status.
 */
function normalizePersistedStatuses(): void {
  const s = getStorage();
  try {
    for (const key of s.getAllKeys()) {
      if (!key.startsWith(SOURCE_INFO_KEY_PREFIX)) continue;
      const raw = s.getString(key);
      if (!raw) continue;
      try {
        const info = JSON.parse(raw) as Partial<SourceInfo>;
        if (info.status === "fetching") {
          const fixed = {
            ...info,
            status: (info.count ?? 0) > 0 ? "done" : "idle",
          };
          delete (fixed as Partial<SourceInfo>).progress;
          s.set(key, JSON.stringify(fixed));
        }
      } catch {
        s.remove(key); // drop corrupt entries
      }
    }
  } catch {}
}

normalizePersistedStatuses();

async function refreshPlacesForRoute(routeId: string): Promise<void> {
  const { usePlaceStore } = await import("@/store/placeStore");
  await usePlaceStore.getState().loadPlaces(routeId);
}

async function refreshStarredItems(): Promise<void> {
  await useStarredStore.getState().loadStarredItems();
}

type ScrubMode = "reset" | "remove";

/**
 * Builds the state patch for clearing all per-route POI state. "reset" keeps
 * the sourceInfo[routeId] entry but resets both sources to defaults (used by
 * clearPOIs). "remove" drops the entry entirely (used when the route itself
 * is deleted).
 */
function buildRouteScrubPatch(
  s: {
    pois: Record<string, POI[]>;
    sourceInfo: Record<string, Record<FetchablePOISource, SourceInfo>>;
    selectedPOI: POI | null;
  },
  routeId: string,
  mode: ScrubMode,
) {
  const removed = s.pois[routeId] ?? [];
  const { [routeId]: _currentPois, ...remainingPois } = s.pois;
  const pois = remainingPois;
  const removedIds = new Set((removed ?? []).map((p) => p.id));

  let sourceInfo: typeof s.sourceInfo;
  if (mode === "remove") {
    const { [routeId]: _dropped, ...rest } = s.sourceInfo;
    sourceInfo = rest;
  } else {
    sourceInfo = {
      ...s.sourceInfo,
      [routeId]: { osm: { ...DEFAULT_SOURCE_INFO }, google: { ...DEFAULT_SOURCE_INFO } },
    };
  }

  return {
    pois,
    sourceInfo,
    selectedPOI: removedIds.has(s.selectedPOI?.id ?? "") ? null : s.selectedPOI,
  };
}

interface POIState {
  // POI data per route
  pois: Record<string, POI[]>;

  // Filter state (persisted)
  enabledCategories: POICategory[];
  corridorWidthM: number;
  showOpenOnly: boolean;

  // Fetch state per source per route
  sourceInfo: Record<string, Record<FetchablePOISource, SourceInfo>>; // routeId -> source -> info

  // UI state
  selectedPOI: POI | null;

  // Actions
  loadPOIs: (routeId: string) => Promise<void>;
  fetchSource: (
    routeId: string,
    source: FetchablePOISource,
    routePoints: RoutePoint[],
  ) => Promise<void>;
  clearSource: (routeId: string, source: FetchablePOISource) => Promise<void>;
  toggleCategory: (category: POICategory) => void;
  setCorridorWidth: (widthM: number) => void;
  setAllCategories: (enabled: boolean) => void;
  toggleShowOpenOnly: () => void;
  setShowOpenOnly: (show: boolean) => void;
  setEnabledCategories: (categories: POICategory[]) => void;
  getStarredPOIs: (routeId: string) => POI[];
  clearPOIs: (routeId: string) => Promise<void>;
  cleanupRouteState: (routeId: string) => void;
  setSelectedPOI: (poi: POI | null) => void;

  // Computed helpers
  getVisiblePOIs: (routeId: string) => POI[];
  getNextPOIPerCategory: (
    routeId: string,
    currentDistAlongRoute: number,
  ) => Partial<Record<POICategory, POI>>;
}

export const usePoiStore = create<POIState>((set, get) => ({
  pois: {},
  enabledCategories: parseCategories(readString("enabledCategories")),
  corridorWidthM: Number(readString("corridorWidthM")) || DEFAULT_CORRIDOR_WIDTH_M,
  showOpenOnly: readString("showOpenOnly") === "true",
  sourceInfo: {},
  selectedPOI: null,

  loadPOIs: async (routeId) => {
    // Read from DB to derive counts. Merge with in-memory sourceInfo so we
    // never clobber an active "fetching" or surfaced "error" status — only
    // fall back to MMKV when there's no in-memory entry yet (cold start).
    const pois = await getPOIsForRoute(routeId);
    let osmCount = 0,
      googleCount = 0;
    for (const p of pois) {
      if (p.source === "google") googleCount++;
      else if (p.source === "osm") osmCount++;
    }

    set((s) => {
      const info = s.sourceInfo[routeId];
      if (info && info.osm.count === osmCount && info.google.count === googleCount) {
        return s;
      }

      const osm = info?.osm ?? readSourceInfo(routeId, "osm");
      const google = info?.google ?? readSourceInfo(routeId, "google");

      const nextOsm = { ...osm, count: osmCount };
      if (nextOsm.status === "idle" && osmCount > 0) nextOsm.status = "done";
      const nextGoogle = { ...google, count: googleCount };
      if (nextGoogle.status === "idle" && googleCount > 0) nextGoogle.status = "done";

      return {
        pois: { ...s.pois, [routeId]: pois },
        sourceInfo: {
          ...s.sourceInfo,
          [routeId]: { osm: nextOsm, google: nextGoogle },
        },
      };
    });
  },

  fetchSource: async (routeId, source, routePoints) => {
    const updateSourceInfo = (partial: Partial<SourceInfo>, opts?: { persist?: boolean }) => {
      set((s) => {
        const current = s.sourceInfo[routeId]?.[source] ?? { ...DEFAULT_SOURCE_INFO };
        const updated = { ...current, ...partial };
        if (opts?.persist !== false) persistSourceInfo(routeId, source, updated);
        return {
          sourceInfo: {
            ...s.sourceInfo,
            [routeId]: { ...s.sourceInfo[routeId], [source]: updated },
          },
        };
      });
    };

    updateSourceInfo({ status: "fetching", error: null, progress: null });

    try {
      const corridorWidthM = get().corridorWidthM;
      const fetchFn = source === "osm" ? fetchOsmPOIs : fetchGooglePOIs;
      const count = await fetchFn(routeId, routePoints, corridorWidthM, (phase, done, total) => {
        // progress is ephemeral — skip MMKV write, it'd churn on every tick
        updateSourceInfo({ progress: { phase, done, total } }, { persist: false });
      });
      updateSourceInfo({
        status: "done",
        count,
        fetchedAt: new Date().toISOString(),
        error: null,
        progress: null,
      });

      const pois = await getPOIsForRoute(routeId);
      set((s) => ({ pois: { ...s.pois, [routeId]: pois } }));
      await refreshPlacesForRoute(routeId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch POIs";
      updateSourceInfo({ status: "error", error: message, progress: null });
    }
  },

  clearSource: async (routeId, source) => {
    await deletePOIsBySource(routeId, source);
    clearSourceInfo(routeId, source);

    // Reload remaining POIs
    const pois = await getPOIsForRoute(routeId);
    set((s) => {
      const droppedSelection =
        s.selectedPOI?.routeId === routeId && s.selectedPOI?.source === source;
      return {
        pois: { ...s.pois, [routeId]: pois },
        selectedPOI: droppedSelection ? null : s.selectedPOI,
        sourceInfo: {
          ...s.sourceInfo,
          [routeId]: {
            ...s.sourceInfo[routeId],
            [source]: { ...DEFAULT_SOURCE_INFO },
          },
        },
      };
    });
    await refreshStarredItems();
    await refreshPlacesForRoute(routeId);
  },

  toggleCategory: (category) => {
    const current = get().enabledCategories;
    const next = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    try {
      getStorage().set("enabledCategories", JSON.stringify(next));
    } catch {}
    set({ enabledCategories: next });
  },
  setEnabledCategories: (categories) => {
    const next = normalizeCategories(categories);
    try {
      getStorage().set("enabledCategories", JSON.stringify(next));
    } catch {}
    set({ enabledCategories: next });
  },

  setCorridorWidth: (widthM) => {
    try {
      getStorage().set("corridorWidthM", String(widthM));
    } catch {}
    set({ corridorWidthM: widthM });
  },

  setAllCategories: (enabled) => {
    const next = enabled ? POI_CATEGORIES.map((c) => c.key) : [];
    try {
      getStorage().set("enabledCategories", JSON.stringify(next));
    } catch {}
    set({ enabledCategories: next });
  },

  toggleShowOpenOnly: () => {
    const next = !get().showOpenOnly;
    try {
      getStorage().set("showOpenOnly", String(next));
    } catch {}
    set({ showOpenOnly: next });
  },

  setShowOpenOnly: (show) => {
    try {
      getStorage().set("showOpenOnly", String(show));
    } catch {}
    set({ showOpenOnly: show });
  },

  getStarredPOIs: (routeId) => {
    const state = get();
    const all = state.pois[routeId];
    if (!all) return [];
    const starredIds = useStarredStore.getState().getStarredIds("downloadedPoi");
    return all.filter((p) => starredIds.has(p.id));
  },

  clearPOIs: async (routeId) => {
    await deleteDownloadedPOIsForRoute(routeId);
    clearSourceInfo(routeId, "osm");
    clearSourceInfo(routeId, "google");
    set((s) => buildRouteScrubPatch(s, routeId, "reset"));
    await refreshStarredItems();
    await refreshPlacesForRoute(routeId);
  },

  cleanupRouteState: (routeId) => {
    // Called when a route is deleted. DB cascade handles pois rows; this
    // only scrubs in-memory state + MMKV source metadata so nothing orphans.
    clearSourceInfo(routeId, "osm");
    clearSourceInfo(routeId, "google");
    set((s) => buildRouteScrubPatch(s, routeId, "remove"));
  },

  setSelectedPOI: (poi) => {
    set({ selectedPOI: poi });
    if (poi) usePanelStore.getState().setPanelTab("pois");
  },
  getVisiblePOIs: (routeId) => {
    const state = get();
    const all = state.pois[routeId];
    if (!all) return [];
    const enabled = new Set(state.enabledCategories);
    return all.filter((p) => {
      if (state.showOpenOnly) {
        if (!enabled.has(p.category)) return false;
        return isKnownOpenNow(p.tags.opening_hours);
      }
      // Always show starred POIs outside Open now filtering
      if (useStarredStore.getState().isStarred("downloadedPoi", p.id)) return true;
      if (!enabled.has(p.category)) return false;
      return true;
    });
  },

  getNextPOIPerCategory: (routeId, currentDistAlongRoute) => {
    const state = get();
    const all = state.pois[routeId];
    if (!all) return {};

    const enabled = new Set(state.enabledCategories);
    const result: Partial<Record<POICategory, POI>> = {};

    for (const poi of all) {
      if (!enabled.has(poi.category)) continue;
      if (poi.distanceAlongRouteMeters <= currentDistAlongRoute) continue;
      if (!result[poi.category]) {
        result[poi.category] = poi;
      }
    }

    return result;
  },
}));
