import { create } from "zustand";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import {
  getAllRoutes,
  insertRoute,
  deleteRoute as dbDeleteRoute,
  updateRouteVisibility,
  setActiveRoute as dbSetActiveRoute,
  getRouteWithPoints,
  getRoutePoints,
} from "@/db/database";
import { generateId } from "@/utils/generateId";
import {
  importRouteBatch,
  importRouteFileContent,
  type RouteImportDependencies,
  type RouteImportProgress,
  type RouteImportResult,
} from "@/services/routeImportPipeline";
import type { Route, RouteWithPoints, RoutePoint, SnappedPosition } from "@/types";

interface RouteState {
  routes: Route[];
  isLoading: boolean;
  error: string | null;
  importProgress: RouteImportProgress[];
  lastImportResults: RouteImportResult[];
  // Cached points for visible routes (for map rendering)
  visibleRoutePoints: Record<string, RoutePoint[]>;
  // Snapped position on active route
  snappedPosition: SnappedPosition | null;

  /** Fetch route metadata only. Cheap; safe to call on every tab mount. */
  loadRouteMetadata: () => Promise<void>;
  /**
   * Ensure `visibleRoutePoints` contains points for every currently-visible
   * route. Reuses already-cached entries and fetches missing ones in parallel.
   * Drops entries for routes that are no longer visible.
   */
  loadVisibleRoutePoints: () => Promise<void>;
  /** Load metadata, then visible points. Use when both are needed. */
  loadRoutesAndPoints: () => Promise<void>;
  importRoute: () => Promise<void>;
  importFromUri: (uri: string, fileName: string) => Promise<Route>;
  deleteRoute: (id: string) => Promise<void>;
  toggleVisibility: (id: string) => Promise<void>;
  setActiveRoute: (id: string) => Promise<void>;
  getRouteDetail: (id: string) => Promise<RouteWithPoints | null>;
  setSnappedPosition: (pos: SnappedPosition | null) => void;
  clearError: () => void;
}

function routeFileExtension(fileName: string): string | null {
  return fileName.toLowerCase().split(".").pop() ?? null;
}

async function readRouteFileText(uri: string, fileName: string): Promise<string> {
  const ext = routeFileExtension(fileName);
  try {
    return await new File(uri).text();
  } catch {
    // Fallback: AppDelegate copies share-sheet files to Caches/pending-import.<ext>
    // while iOS security scope is still active (see AppDelegate.swift copyImportedFileToTmpIfNeeded)
    const fallback = new File(Paths.cache, `pending-import.${ext}`);
    const content = await fallback.text();
    try {
      fallback.delete();
    } catch {}
    return content;
  }
}

function routeImportDependencies(): RouteImportDependencies {
  return {
    generateId,
    now: () => new Date().toISOString(),
    insertRoute,
    detectAndStoreClimbs: async (routeId, points) => {
      const { detectAndStoreClimbs } = await import("@/services/climbDetector");
      await detectAndStoreClimbs(routeId, points);
    },
  };
}

function throwFailedImport(result: RouteImportResult): never {
  if (result.status === "failed") throw new Error(result.error);
  if (result.status === "skipped") throw new Error("Route was skipped as a duplicate.");
  throw new Error("Failed to import route");
}

export const useRouteStore = create<RouteState>((set, get) => ({
  routes: [],
  isLoading: false,
  error: null,
  importProgress: [],
  lastImportResults: [],
  visibleRoutePoints: {},
  snappedPosition: null,

  loadRouteMetadata: async () => {
    try {
      const routes = await getAllRoutes();
      set({ routes });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  loadRoutesAndPoints: async () => {
    await get().loadRouteMetadata();
    await get().loadVisibleRoutePoints();
  },

  importFromUri: async (uri: string, fileName: string) => {
    const content = await readRouteFileText(uri, fileName);
    const result = await importRouteFileContent({ fileName, content }, routeImportDependencies());

    if (result.status !== "success") throwFailedImport(result);

    await get().loadRoutesAndPoints();
    return result.route;
  },

  importRoute: async () => {
    try {
      set({ isLoading: true, error: null, importProgress: [], lastImportResults: [] });

      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/gpx+xml", "application/vnd.google-earth.kml+xml", "*/*"],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        set({ isLoading: false });
        return;
      }

      const pendingProgress = result.assets.map((asset, index) => ({
        index,
        fileName: asset.name || "route",
        status: "pending" as const,
      }));
      set({ importProgress: pendingProgress });

      const files = await Promise.all(
        result.assets.map(async (asset) => {
          const fileName = asset.name || "route";
          return { fileName, content: await readRouteFileText(asset.uri, fileName) };
        }),
      );
      const results = await importRouteBatch(files, routeImportDependencies(), {
        onProgress: (progress) => {
          set((state) => ({
            importProgress: state.importProgress.map((item) =>
              item.index === progress.index ? progress : item,
            ),
          }));
        },
      });
      const failures = results.filter((importResult) => importResult.status === "failed");
      const successes = results.filter((importResult) => importResult.status === "success");
      const skipped = results.filter((importResult) => importResult.status === "skipped");
      set({ lastImportResults: results });

      if (successes.length > 0) await get().loadRoutesAndPoints();
      if (failures.length > 0 && successes.length === 0) {
        throw new Error(failures[0].error);
      }
      if (failures.length > 0 || skipped.length > 0) {
        set({
          error: `Imported ${successes.length}, skipped ${skipped.length}, failed ${failures.length}.`,
        });
      }
      set({ isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message || "Failed to import route" });
    }
  },

  deleteRoute: async (id) => {
    try {
      // Clean up offline tile data
      const { useOfflineStore } = await import("@/store/offlineStore");
      await useOfflineStore.getState().deleteOfflineData(id);
      await dbDeleteRoute(id);
      // Scrub per-route POI state (DB cascade handles the rows themselves)
      const { usePoiStore } = await import("@/store/poiStore");
      usePoiStore.getState().cleanupRouteState(id);
      // Drop points cache entry for the deleted route
      const current = get().visibleRoutePoints;
      if (current[id]) {
        const next = { ...current };
        delete next[id];
        set({ visibleRoutePoints: next });
      }
      await get().loadRouteMetadata();
      // Reload collections in case this route was in one (cascade deletes the segment)
      const { useCollectionStore } = await import("@/store/collectionStore");
      await useCollectionStore.getState().loadCollections();
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  toggleVisibility: async (id) => {
    const route = get().routes.find((r) => r.id === id);
    if (!route) return;
    await updateRouteVisibility(id, !route.isVisible);
    await get().loadRoutesAndPoints();
  },

  setActiveRoute: async (id) => {
    await dbSetActiveRoute(id);
    // Clear active collection in collectionStore
    const { useCollectionStore } = await import("@/store/collectionStore");
    useCollectionStore.getState().clearActiveStitched();
    await useCollectionStore.getState().loadCollections();
    // Active flag only; visibility didn't change, so no point fetch needed.
    await get().loadRouteMetadata();
  },

  getRouteDetail: async (id) => {
    return getRouteWithPoints(id);
  },

  loadVisibleRoutePoints: async () => {
    const routes = get().routes.filter((r) => r.isVisible);
    const current = get().visibleRoutePoints;
    const visibleIds = new Set(routes.map((r) => r.id));

    const toLoad = routes.filter((r) => !current[r.id]);

    // Fast path: nothing new to load. Still drop stale entries for routes
    // that are no longer visible.
    if (toLoad.length === 0) {
      let changed = false;
      const next: Record<string, RoutePoint[]> = {};
      for (const [id, pts] of Object.entries(current)) {
        if (visibleIds.has(id)) next[id] = pts;
        else changed = true;
      }
      if (changed) set({ visibleRoutePoints: next });
      return;
    }

    const loaded = await Promise.all(
      toLoad.map(async (r) => [r.id, await getRoutePoints(r.id)] as const),
    );

    const next: Record<string, RoutePoint[]> = {};
    for (const [id, pts] of Object.entries(current)) {
      if (visibleIds.has(id)) next[id] = pts;
    }
    for (const [id, pts] of loaded) next[id] = pts;
    set({ visibleRoutePoints: next });
  },

  setSnappedPosition: (snappedPosition) => {
    const prev = get().snappedPosition;
    if (
      prev?.pointIndex === snappedPosition?.pointIndex &&
      prev?.routeId === snappedPosition?.routeId
    )
      return;
    set({ snappedPosition });
  },

  clearError: () => set({ error: null }),
}));
