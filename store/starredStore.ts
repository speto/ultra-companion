import { create } from "zustand";
import { getStarredItems, setStarredItem } from "@/db/database";
import type { StarredEntityType } from "@/types";

function starKey(entityType: StarredEntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

interface StarredState {
  starredKeys: Set<string>;
  loadStarredItems: () => Promise<void>;
  toggleStarred: (entityType: StarredEntityType, entityId: string) => Promise<void>;
  setStarred: (entityType: StarredEntityType, entityId: string, starred: boolean) => Promise<void>;
  isStarred: (entityType: StarredEntityType, entityId: string) => boolean;
  getStarredIds: (entityType: StarredEntityType) => Set<string>;
}

export const useStarredStore = create<StarredState>((set, get) => ({
  starredKeys: new Set(),

  loadStarredItems: async () => {
    const items = await getStarredItems();
    set({ starredKeys: new Set(items.map((item) => starKey(item.entityType, item.entityId))) });
  },

  toggleStarred: async (entityType, entityId) => {
    const nextStarred = !get().isStarred(entityType, entityId);
    await get().setStarred(entityType, entityId, nextStarred);
  },

  setStarred: async (entityType, entityId, starred) => {
    const key = starKey(entityType, entityId);
    const previous = get().starredKeys;
    const next = new Set(previous);
    if (starred) {
      next.add(key);
    } else {
      next.delete(key);
    }

    set({ starredKeys: next });
    try {
      await setStarredItem(entityType, entityId, starred);
    } catch (error) {
      set({ starredKeys: previous });
      throw error;
    }
  },

  isStarred: (entityType, entityId) => get().starredKeys.has(starKey(entityType, entityId)),

  getStarredIds: (entityType) => {
    const prefix = `${entityType}:`;
    return new Set(
      [...get().starredKeys]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length)),
    );
  },
}));
