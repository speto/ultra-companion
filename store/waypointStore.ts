import { create } from "zustand";
import { getRouteWaypoints } from "@/db/database";
import type { RouteWaypoint } from "@/types";

interface WaypointState {
  waypoints: Record<string, RouteWaypoint[]>;
  loadWaypoints: (routeId: string) => Promise<void>;
  cleanupRouteState: (routeId: string) => void;
}

export const useWaypointStore = create<WaypointState>((set) => ({
  waypoints: {},

  loadWaypoints: async (routeId) => {
    const waypoints = await getRouteWaypoints(routeId);
    set((state) => ({ waypoints: { ...state.waypoints, [routeId]: waypoints } }));
  },

  cleanupRouteState: (routeId) => {
    set((state) => {
      const { [routeId]: _removed, ...waypoints } = state.waypoints;
      return { waypoints };
    });
  },
}));
