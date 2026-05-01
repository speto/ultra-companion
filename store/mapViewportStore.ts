import { create } from "zustand";

export type MapViewportInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type OverlayInsetSource = "bottomPanel" | "keyboard" | "topOverlay" | "sideOverlay";
type InsetEdge = keyof MapViewportInsets;
type OverlayInsetSources = Partial<Record<OverlayInsetSource, Partial<MapViewportInsets>>>;

interface MapViewportState {
  insets: MapViewportInsets;
  overlayInsets: OverlayInsetSources;
  setOverlayInsets: (source: OverlayInsetSource, insets: Partial<MapViewportInsets>) => void;
  clearOverlayInsets: (source: OverlayInsetSource) => void;
}

const INSET_EDGES: readonly InsetEdge[] = ["top", "right", "bottom", "left"];
const EMPTY_INSETS: MapViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function normalizeInsetValue(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function normalizeSourceInsets(insets: Partial<MapViewportInsets>): Partial<MapViewportInsets> {
  const nextInsets: Partial<MapViewportInsets> = {};
  for (const edge of INSET_EDGES) {
    if (insets[edge] != null) nextInsets[edge] = normalizeInsetValue(insets[edge]);
  }
  return nextInsets;
}

function combineOverlayInsets(sources: OverlayInsetSources): MapViewportInsets {
  const combined: MapViewportInsets = { ...EMPTY_INSETS };
  for (const sourceInsets of Object.values(sources)) {
    if (!sourceInsets) continue;
    for (const edge of INSET_EDGES) {
      combined[edge] = Math.max(combined[edge], normalizeInsetValue(sourceInsets[edge]));
    }
  }
  return combined;
}

function areInsetsEqual(a: MapViewportInsets, b: MapViewportInsets): boolean {
  return INSET_EDGES.every((edge) => a[edge] === b[edge]);
}

export const useMapViewportStore = create<MapViewportState>((set, get) => ({
  insets: EMPTY_INSETS,
  overlayInsets: {},

  setOverlayInsets: (source, insets) => {
    const overlayInsets = {
      ...get().overlayInsets,
      [source]: normalizeSourceInsets(insets),
    };
    const nextInsets = combineOverlayInsets(overlayInsets);
    if (areInsetsEqual(get().insets, nextInsets)) {
      set({ overlayInsets });
      return;
    }
    set({ overlayInsets, insets: nextInsets });
  },

  clearOverlayInsets: (source) => {
    const overlayInsets = { ...get().overlayInsets };
    delete overlayInsets[source];
    const nextInsets = combineOverlayInsets(overlayInsets);
    if (areInsetsEqual(get().insets, nextInsets)) {
      set({ overlayInsets });
      return;
    }
    set({ overlayInsets, insets: nextInsets });
  },
}));
