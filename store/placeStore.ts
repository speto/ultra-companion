import { create } from "zustand";
import { getPOIsForRoute, getRouteWaypoints } from "@/db/database";
import { usePoiStore } from "./poiStore";
import { usePanelStore } from "./panelStore";
import { useStarredStore } from "./starredStore";
import {
  downloadedPoiToPlace,
  routeWaypointToPlace,
  filterPlacesByCategory,
  filterPlacesByOpenNow,
  getPlaceCategoryCounts,
} from "@/utils/placeAdapter";
import type { PlaceViewModel, POICategory, StitchedSegmentInfo } from "@/types";

interface PlaceState {
  /** Places per route (raw, unfiltered) */
  places: Record<string, PlaceViewModel[]>;
  /** Selected place for detail view */
  selectedPlace: PlaceViewModel | null;

  // Actions
  loadPlaces: (routeId: string) => Promise<void>;
  /** Get visible downloaded POIs for a single route, applying category filters from poiStore */
  getVisiblePlaces: (routeId: string) => PlaceViewModel[];
  /** Get all places for multiple route IDs (unfiltered) */
  getPlacesForRoutes: (routeIds: string[]) => PlaceViewModel[];
  /** Stitch places across collection segments and apply filters */
  getStitchedVisiblePlaces: (
    segments: StitchedSegmentInfo[],
    routeIds: string[],
  ) => PlaceViewModel[];
  /** Get category counts for a set of route IDs */
  getCategoryCounts: (routeIds: string[]) => Partial<Record<POICategory | "waypoint", number>>;
  getPlaceById: (placeId: string) => PlaceViewModel | undefined;
  setSelectedPlace: (place: PlaceViewModel | null) => void;
  cleanupRouteState: (routeId: string) => void;
}

export const usePlaceStore = create<PlaceState>((set, get) => ({
  places: {},
  selectedPlace: null,

  loadPlaces: async (routeId) => {
    const [pois, waypoints] = await Promise.all([
      getPOIsForRoute(routeId),
      getRouteWaypoints(routeId),
    ]);

    const places: PlaceViewModel[] = [
      ...pois.map((poi) => downloadedPoiToPlace(poi)),
      ...waypoints.map((wp) => routeWaypointToPlace(wp)),
    ];

    // Sort by raw distance along route
    places.sort((a, b) => a.rawDistanceAlongRouteMeters - b.rawDistanceAlongRouteMeters);

    set((s) => ({
      places: { ...s.places, [routeId]: places },
    }));
  },

  getVisiblePlaces: (routeId) => {
    const state = get();
    const allPlaces = state.places[routeId];
    if (!allPlaces) return [];

    const poiState = usePoiStore.getState();
    const enabledCategories = new Set<POICategory | "waypoint">(poiState.enabledCategories);
    const downloadedPOIs = allPlaces.filter((p) => p.entityType === "downloadedPoi");

    const starredIds = useStarredStore.getState().getStarredIds("downloadedPoi");
    const filteredByCategory = filterPlacesByCategory(downloadedPOIs, enabledCategories);
    const byPlaceId = new Map(filteredByCategory.map((place) => [place.placeId, place]));

    for (const place of downloadedPOIs) {
      if (starredIds.has(place.entityId)) byPlaceId.set(place.placeId, place);
    }

    let filtered = Array.from(byPlaceId.values());

    // Apply showOpenOnly to downloaded POIs only
    if (poiState.showOpenOnly) {
      filtered = filterPlacesByOpenNow(filtered);
    }

    return filtered;
  },

  getPlacesForRoutes: (routeIds) => {
    const state = get();
    const combined: PlaceViewModel[] = [];
    for (const routeId of routeIds) {
      const places = state.places[routeId];
      if (places) combined.push(...places);
    }
    return combined;
  },

  getStitchedVisiblePlaces: (segments, routeIds) => {
    const state = get();
    const poiState = usePoiStore.getState();
    const enabledCategories = new Set<POICategory | "waypoint">(poiState.enabledCategories);

    const starredIds = useStarredStore.getState().getStarredIds("downloadedPoi");
    const combinedByPlaceId = new Map<string, PlaceViewModel>();
    for (const seg of segments) {
      const places = state.places[seg.routeId];
      if (!places) continue;

      const downloadedPOIs = places.filter((p) => p.entityType === "downloadedPoi");
      const filteredByCategory = filterPlacesByCategory(downloadedPOIs, enabledCategories);
      const byPlaceId = new Map(filteredByCategory.map((place) => [place.placeId, place]));

      for (const place of downloadedPOIs) {
        if (starredIds.has(place.entityId)) byPlaceId.set(place.placeId, place);
      }

      let filtered = Array.from(byPlaceId.values());
      if (poiState.showOpenOnly) filtered = filterPlacesByOpenNow(filtered);
      for (const place of filtered) {
        const stitchedPlace = {
          ...place,
          effectiveDistanceAlongRouteMeters:
            place.rawDistanceAlongRouteMeters + seg.distanceOffsetMeters,
        };
        combinedByPlaceId.set(stitchedPlace.placeId, stitchedPlace);
      }
    }

    // Single route fallback (no segments)
    if (segments.length === 0 && routeIds.length > 0) {
      for (const routeId of routeIds) {
        const places = state.places[routeId];
        if (!places) continue;
        const downloadedPOIs = places.filter((p) => p.entityType === "downloadedPoi");
        const filteredByCategory = filterPlacesByCategory(downloadedPOIs, enabledCategories);
        const byPlaceId = new Map(filteredByCategory.map((place) => [place.placeId, place]));

        for (const place of downloadedPOIs) {
          if (starredIds.has(place.entityId)) byPlaceId.set(place.placeId, place);
        }

        let filtered = Array.from(byPlaceId.values());
        if (poiState.showOpenOnly) filtered = filterPlacesByOpenNow(filtered);
        for (const place of filtered) combinedByPlaceId.set(place.placeId, place);
      }
    }

    const combined = Array.from(combinedByPlaceId.values());
    combined.sort(
      (a, b) => a.effectiveDistanceAlongRouteMeters - b.effectiveDistanceAlongRouteMeters,
    );
    return combined;
  },

  getCategoryCounts: (routeIds) => {
    const state = get();
    const allPlaces: PlaceViewModel[] = [];
    for (const routeId of routeIds) {
      const places = state.places[routeId];
      if (places) allPlaces.push(...places);
    }
    return getPlaceCategoryCounts(allPlaces);
  },

  getPlaceById: (placeId) => {
    const state = get();
    for (const places of Object.values(state.places)) {
      const found = places.find((p) => p.placeId === placeId);
      if (found) return found;
    }
    return undefined;
  },

  setSelectedPlace: (place) => {
    set({ selectedPlace: place });
    if (place) {
      if (place.entityType === "downloadedPoi" && place.raw) {
        usePoiStore.getState().setSelectedPOI(place.raw as any);
      } else if (place.entityType === "routeWaypoint") {
        usePoiStore.getState().setSelectedPOI(null);
        usePanelStore.getState().setPanelTab("waypoints");
      } else {
        usePoiStore.getState().setSelectedPOI(null);
      }
    } else {
      usePoiStore.getState().setSelectedPOI(null);
    }
  },

  cleanupRouteState: (routeId) => {
    set((s) => {
      const { [routeId]: _removed, ...places } = s.places;
      const selectedCleared = s.selectedPlace?.routeId === routeId ? null : s.selectedPlace;
      return { places, selectedPlace: selectedCleared };
    });
  },
}));
