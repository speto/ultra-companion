import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StarredItem } from "@/types";

const dbMocks = vi.hoisted(() => ({
  getStarredItems: vi.fn<() => Promise<StarredItem[]>>(),
  setStarredItem:
    vi.fn<
      (entityType: StarredItem["entityType"], entityId: string, starred: boolean) => Promise<void>
    >(),
}));

vi.mock("@/db/database", () => dbMocks);

async function loadStarredStore() {
  return (await import("@/store/starredStore")).useStarredStore;
}

describe("starredStore", () => {
  beforeEach(() => {
    vi.resetModules();
    dbMocks.getStarredItems.mockReset();
    dbMocks.setStarredItem.mockReset();
    dbMocks.getStarredItems.mockResolvedValue([]);
    dbMocks.setStarredItem.mockResolvedValue(undefined);
  });

  it("loads downloaded POI and route waypoint stars from SQLite", async () => {
    dbMocks.getStarredItems.mockResolvedValue([
      { entityType: "downloadedPoi", entityId: "poi-1", createdAt: "2026-04-01T00:00:00Z" },
      { entityType: "routeWaypoint", entityId: "wp-1", createdAt: "2026-04-01T00:00:00Z" },
    ]);
    const useStarredStore = await loadStarredStore();

    await useStarredStore.getState().loadStarredItems();

    expect(useStarredStore.getState().isStarred("downloadedPoi", "poi-1")).toBe(true);
    expect(useStarredStore.getState().isStarred("routeWaypoint", "wp-1")).toBe(true);
  });

  it("toggles stars for either entity type", async () => {
    const useStarredStore = await loadStarredStore();

    await useStarredStore.getState().toggleStarred("routeWaypoint", "wp-1");

    expect(dbMocks.setStarredItem).toHaveBeenCalledWith("routeWaypoint", "wp-1", true);
    expect(useStarredStore.getState().isStarred("routeWaypoint", "wp-1")).toBe(true);

    await useStarredStore.getState().toggleStarred("routeWaypoint", "wp-1");

    expect(dbMocks.setStarredItem).toHaveBeenLastCalledWith("routeWaypoint", "wp-1", false);
    expect(useStarredStore.getState().isStarred("routeWaypoint", "wp-1")).toBe(false);
  });
});
