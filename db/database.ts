import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { openDatabaseSync } from "expo-sqlite";
import { sql, eq, and, inArray, desc, asc, count, max } from "drizzle-orm";
import {
  routes,
  routePoints,
  routeWaypoints,
  pois,
  starredItems,
  collections,
  collectionSegments,
  climbs,
} from "./schema";
import migrations from "../drizzle/migrations";
import type {
  Route,
  RoutePoint,
  RouteWaypoint,
  RouteWithPoints,
  POI,
  POICategory,
  POISource,
  Collection,
  CollectionSegment,
  Climb,
  StarredEntityType,
  StarredItem,
} from "@/types";

// --- Database init ---

const expoDb = openDatabaseSync("ultra.db");
expoDb.execSync("PRAGMA journal_mode = WAL;");
expoDb.execSync("PRAGMA foreign_keys = ON;");

export const db = drizzle(expoDb, {
  schema: {
    routes,
    routePoints,
    routeWaypoints,
    pois,
    starredItems,
    collections,
    collectionSegments,
    climbs,
  },
});

// Apply schema from drizzle/migrations.ts (generated from db/schema.ts via `npm run db:migrate`)
migrate(db, migrations);

// --- Route CRUD ---

export async function insertRoute(
  route: Route,
  points: RoutePoint[],
  waypoints: RouteWaypoint[] = [],
): Promise<void> {
  db.transaction((tx) => {
    tx.insert(routes)
      .values({
        id: route.id,
        name: route.name,
        fileName: route.fileName,
        color: route.color,
        isActive: route.isActive,
        isVisible: route.isVisible,
        totalDistanceMeters: route.totalDistanceMeters,
        totalAscentMeters: route.totalAscentMeters,
        totalDescentMeters: route.totalDescentMeters,
        pointCount: route.pointCount,
        createdAt: route.createdAt,
      })
      .run();

    const CHUNK = 500;
    for (let i = 0; i < points.length; i += CHUNK) {
      const chunk = points.slice(i, i + CHUNK);
      tx.insert(routePoints)
        .values(
          chunk.map((p) => ({
            routeId: route.id,
            idx: p.idx,
            latitude: p.latitude,
            longitude: p.longitude,
            elevationMeters: p.elevationMeters,
            distanceFromStartMeters: p.distanceFromStartMeters,
          })),
        )
        .run();
    }

    for (let i = 0; i < waypoints.length; i += CHUNK) {
      const chunk = waypoints.slice(i, i + CHUNK);
      tx.insert(routeWaypoints)
        .values(
          chunk.map((waypoint) => ({
            id: waypoint.id,
            routeId: waypoint.routeId,
            sourceIndex: waypoint.sourceIndex,
            origin: waypoint.origin,
            name: waypoint.name,
            type: waypoint.type,
            description: waypoint.description,
            elevationMeters: waypoint.elevationMeters,
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            distanceFromRouteMeters: waypoint.distanceFromRouteMeters,
            distanceAlongRouteMeters: waypoint.distanceAlongRouteMeters,
          })),
        )
        .run();
    }
  });
}

export async function getAllRoutes(): Promise<Route[]> {
  return db.select().from(routes).orderBy(desc(routes.createdAt)).all();
}

export async function getRoute(routeId: string): Promise<Route | null> {
  const row = db.select().from(routes).where(eq(routes.id, routeId)).get();
  return row ?? null;
}

export async function getRouteWithPoints(routeId: string): Promise<RouteWithPoints | null> {
  const row = db.select().from(routes).where(eq(routes.id, routeId)).get();
  if (!row) return null;

  const pointRows = db
    .select()
    .from(routePoints)
    .where(eq(routePoints.routeId, routeId))
    .orderBy(asc(routePoints.idx))
    .all();

  return {
    ...row,
    points: pointRows,
  };
}

export async function getRouteEndpoints(
  routeId: string,
): Promise<{ first: RoutePoint; last: RoutePoint } | null> {
  const first = db
    .select({
      latitude: routePoints.latitude,
      longitude: routePoints.longitude,
      elevationMeters: routePoints.elevationMeters,
      distanceFromStartMeters: routePoints.distanceFromStartMeters,
      idx: routePoints.idx,
    })
    .from(routePoints)
    .where(eq(routePoints.routeId, routeId))
    .orderBy(asc(routePoints.idx))
    .limit(1)
    .get();

  const last = db
    .select({
      latitude: routePoints.latitude,
      longitude: routePoints.longitude,
      elevationMeters: routePoints.elevationMeters,
      distanceFromStartMeters: routePoints.distanceFromStartMeters,
      idx: routePoints.idx,
    })
    .from(routePoints)
    .where(eq(routePoints.routeId, routeId))
    .orderBy(desc(routePoints.idx))
    .limit(1)
    .get();

  if (!first || !last) return null;
  return { first, last };
}

export async function getRoutePoints(routeId: string): Promise<RoutePoint[]> {
  const rows = db
    .select()
    .from(routePoints)
    .where(eq(routePoints.routeId, routeId))
    .orderBy(asc(routePoints.idx))
    .all();
  return rows;
}

export async function insertRouteWaypoints(newWaypoints: RouteWaypoint[]): Promise<void> {
  if (newWaypoints.length === 0) return;

  db.transaction((tx) => {
    const CHUNK = 500;
    for (let i = 0; i < newWaypoints.length; i += CHUNK) {
      const chunk = newWaypoints.slice(i, i + CHUNK);
      tx.insert(routeWaypoints)
        .values(
          chunk.map((waypoint) => ({
            id: waypoint.id,
            routeId: waypoint.routeId,
            sourceIndex: waypoint.sourceIndex,
            origin: waypoint.origin,
            name: waypoint.name,
            type: waypoint.type,
            description: waypoint.description,
            elevationMeters: waypoint.elevationMeters,
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            distanceFromRouteMeters: waypoint.distanceFromRouteMeters,
            distanceAlongRouteMeters: waypoint.distanceAlongRouteMeters,
          })),
        )
        .run();
    }
  });
}

export async function getRouteWaypoints(routeId: string): Promise<RouteWaypoint[]> {
  return db
    .select()
    .from(routeWaypoints)
    .where(eq(routeWaypoints.routeId, routeId))
    .orderBy(asc(routeWaypoints.distanceAlongRouteMeters))
    .all();
}

export async function deleteRoute(routeId: string): Promise<void> {
  deleteStarredItemsForRoute(routeId);
  // Foreign keys with ON DELETE CASCADE handle route_points, route_waypoints,
  // pois, and collection_segments. starred_items has no FK because it stores
  // multiple entity types, so it is cleaned above.
  db.delete(routes).where(eq(routes.id, routeId)).run();
}

// --- Starred Items CRUD ---

function starConditions(entityType: StarredEntityType, entityId: string) {
  return and(eq(starredItems.entityType, entityType), eq(starredItems.entityId, entityId));
}

function deleteStarredEntityIds(entityType: StarredEntityType, entityIds: string[]): void {
  if (entityIds.length === 0) return;
  db.delete(starredItems)
    .where(and(eq(starredItems.entityType, entityType), inArray(starredItems.entityId, entityIds)))
    .run();
}

function poiIdsForRoute(routeId: string, source?: POISource): string[] {
  const conditions = [eq(pois.routeId, routeId)];
  if (source) conditions.push(eq(pois.source, source));
  return db
    .select({ id: pois.id })
    .from(pois)
    .where(and(...conditions))
    .all()
    .map((row) => row.id);
}

function waypointIdsForRoute(routeId: string): string[] {
  return db
    .select({ id: routeWaypoints.id })
    .from(routeWaypoints)
    .where(eq(routeWaypoints.routeId, routeId))
    .all()
    .map((row) => row.id);
}

function deleteStarredItemsForRoute(routeId: string): void {
  deleteStarredEntityIds("downloadedPoi", poiIdsForRoute(routeId));
  deleteStarredEntityIds("routeWaypoint", waypointIdsForRoute(routeId));
}

export async function getStarredItems(): Promise<StarredItem[]> {
  return db.select().from(starredItems).all();
}

export async function setStarredItem(
  entityType: StarredEntityType,
  entityId: string,
  starred: boolean,
): Promise<void> {
  if (starred) {
    db.insert(starredItems)
      .values({ entityType, entityId, createdAt: new Date().toISOString() })
      .onConflictDoNothing()
      .run();
    return;
  }

  db.delete(starredItems).where(starConditions(entityType, entityId)).run();
}

export async function updateRouteVisibility(routeId: string, isVisible: boolean): Promise<void> {
  db.update(routes).set({ isVisible }).where(eq(routes.id, routeId)).run();
}

export async function setRoutesVisible(routeIds: string[]): Promise<void> {
  if (routeIds.length === 0) return;
  db.update(routes).set({ isVisible: true }).where(inArray(routes.id, routeIds)).run();
}

export async function setActiveRoute(routeId: string): Promise<void> {
  db.transaction((tx) => {
    tx.update(collections).set({ isActive: false }).run();
    tx.update(routes).set({ isActive: false }).run();
    tx.update(routes).set({ isActive: true, isVisible: true }).where(eq(routes.id, routeId)).run();
  });
}

// --- POI CRUD ---

export async function insertPOIs(newPois: POI[]): Promise<void> {
  if (newPois.length === 0) return;

  db.transaction((tx) => {
    const CHUNK = 500;
    for (let i = 0; i < newPois.length; i += CHUNK) {
      const chunk = newPois.slice(i, i + CHUNK);
      tx.insert(pois)
        .values(
          chunk.map((p) => ({
            id: p.id,
            sourceId: p.sourceId,
            source: p.source,
            routeId: p.routeId,
            name: p.name,
            category: p.category,
            latitude: p.latitude,
            longitude: p.longitude,
            tags: p.tags,
            distanceFromRouteMeters: p.distanceFromRouteMeters,
            distanceAlongRouteMeters: p.distanceAlongRouteMeters,
          })),
        )
        .onConflictDoUpdate({
          target: pois.id,
          set: {
            name: sql`excluded.name`,
            category: sql`excluded.category`,
            latitude: sql`excluded.latitude`,
            longitude: sql`excluded.longitude`,
            tags: sql`excluded.tags`,
            distanceFromRouteMeters: sql`excluded.distanceFromRouteMeters`,
            distanceAlongRouteMeters: sql`excluded.distanceAlongRouteMeters`,
          },
        })
        .run();
    }
  });
}

export async function getPOIsForRoute(
  routeId: string,
  categories?: POICategory[],
  maxDistFromRoute?: number,
): Promise<POI[]> {
  const conditions = [eq(pois.routeId, routeId)];

  if (categories && categories.length > 0) {
    conditions.push(inArray(pois.category, categories));
  }
  if (maxDistFromRoute != null) {
    conditions.push(sql`${pois.distanceFromRouteMeters} <= ${maxDistFromRoute}`);
  }

  return db
    .select()
    .from(pois)
    .where(and(...conditions))
    .orderBy(asc(pois.distanceAlongRouteMeters))
    .all();
}

export async function getStarredDownloadedPOIsForRoute(routeId: string): Promise<POI[]> {
  return db
    .select({
      id: pois.id,
      sourceId: pois.sourceId,
      source: pois.source,
      routeId: pois.routeId,
      name: pois.name,
      category: pois.category,
      latitude: pois.latitude,
      longitude: pois.longitude,
      tags: pois.tags,
      distanceFromRouteMeters: pois.distanceFromRouteMeters,
      distanceAlongRouteMeters: pois.distanceAlongRouteMeters,
    })
    .from(pois)
    .innerJoin(
      starredItems,
      and(eq(starredItems.entityType, "downloadedPoi"), eq(starredItems.entityId, pois.id)),
    )
    .where(eq(pois.routeId, routeId))
    .orderBy(asc(pois.distanceAlongRouteMeters))
    .all();
}

export async function deletePOIsForRoute(routeId: string): Promise<void> {
  deleteStarredEntityIds("downloadedPoi", poiIdsForRoute(routeId));
  db.delete(pois).where(eq(pois.routeId, routeId)).run();
}

export async function deleteDownloadedPOIsForRoute(routeId: string): Promise<void> {
  deleteStarredEntityIds("downloadedPoi", poiIdsForRoute(routeId));
  db.delete(pois)
    .where(and(eq(pois.routeId, routeId), inArray(pois.source, ["osm", "google"])))
    .run();
}

export async function deletePOIsBySource(
  routeId: string,
  source: POISource,
  options: { preserveStarred?: boolean } = {},
): Promise<void> {
  if (!options.preserveStarred) {
    deleteStarredEntityIds("downloadedPoi", poiIdsForRoute(routeId, source));
  }
  db.delete(pois)
    .where(and(eq(pois.routeId, routeId), eq(pois.source, source)))
    .run();
}

export async function hasPOIsForRoute(routeId: string): Promise<boolean> {
  const row = db.select({ count: count() }).from(pois).where(eq(pois.routeId, routeId)).get();
  return (row?.count ?? 0) > 0;
}

export async function getPOICountsBySource(
  routeId: string,
): Promise<{ osm: number; google: number }> {
  const rows = db
    .select({ source: pois.source, cnt: count() })
    .from(pois)
    .where(eq(pois.routeId, routeId))
    .groupBy(pois.source)
    .all();

  let osm = 0,
    google = 0;
  for (const row of rows) {
    if (row.source === "google") google = row.cnt;
    else if (row.source === "osm") osm = row.cnt;
  }
  return { osm, google };
}

// --- Climb CRUD ---

export async function insertClimbs(newClimbs: Climb[]): Promise<void> {
  if (newClimbs.length === 0) return;
  db.transaction((tx) => {
    const CHUNK = 500;
    for (let i = 0; i < newClimbs.length; i += CHUNK) {
      const chunk = newClimbs.slice(i, i + CHUNK);
      tx.insert(climbs)
        .values(
          chunk.map((c) => ({
            id: c.id,
            routeId: c.routeId,
            name: c.name,
            startDistanceMeters: c.startDistanceMeters,
            endDistanceMeters: c.endDistanceMeters,
            lengthMeters: c.lengthMeters,
            totalAscentMeters: c.totalAscentMeters,
            startElevationMeters: c.startElevationMeters,
            endElevationMeters: c.endElevationMeters,
            averageGradientPercent: c.averageGradientPercent,
            maxGradientPercent: c.maxGradientPercent,
            difficultyScore: c.difficultyScore,
          })),
        )
        .run();
    }
  });
}

export async function getClimbsForRoute(routeId: string): Promise<Climb[]> {
  return db
    .select()
    .from(climbs)
    .where(eq(climbs.routeId, routeId))
    .orderBy(asc(climbs.startDistanceMeters))
    .all();
}

export async function deleteClimbsForRoute(routeId: string): Promise<void> {
  db.delete(climbs).where(eq(climbs.routeId, routeId)).run();
}

export async function updateClimbName(climbId: string, name: string | null): Promise<void> {
  db.update(climbs).set({ name }).where(eq(climbs.id, climbId)).run();
}

// --- Collection CRUD ---

export async function insertCollection(collection: Collection): Promise<void> {
  db.insert(collections)
    .values({
      id: collection.id,
      name: collection.name,
      isActive: collection.isActive,
      createdAt: collection.createdAt,
      plannedStartMs: collection.plannedStartMs,
      plannedRoadSpeedKmh: collection.plannedRoadSpeedKmh,
      plannedOffroadSpeedKmh: collection.plannedOffroadSpeedKmh,
    })
    .run();
}

export async function getAllCollections(): Promise<Collection[]> {
  return db.select().from(collections).orderBy(desc(collections.createdAt)).all();
}

export async function deleteCollection(collectionId: string): Promise<void> {
  // Foreign keys with ON DELETE CASCADE handle collection_segments
  db.delete(collections).where(eq(collections.id, collectionId)).run();
}

export async function renameCollection(collectionId: string, name: string): Promise<void> {
  db.update(collections).set({ name }).where(eq(collections.id, collectionId)).run();
}

export async function updateCollectionPlanning(
  collectionId: string,
  planning: Partial<
    Pick<Collection, "plannedStartMs" | "plannedRoadSpeedKmh" | "plannedOffroadSpeedKmh">
  >,
): Promise<void> {
  db.update(collections).set(planning).where(eq(collections.id, collectionId)).run();
}

export async function setActiveCollection(collectionId: string): Promise<void> {
  db.transaction((tx) => {
    tx.update(routes).set({ isActive: false }).run();
    tx.update(collections).set({ isActive: false }).run();
    tx.update(collections).set({ isActive: true }).where(eq(collections.id, collectionId)).run();
  });
}

export async function clearActiveCollection(): Promise<void> {
  db.update(collections).set({ isActive: false }).run();
}

// --- Collection Segment CRUD ---

export async function insertCollectionSegment(segment: CollectionSegment): Promise<void> {
  db.insert(collectionSegments)
    .values({
      collectionId: segment.collectionId,
      routeId: segment.routeId,
      position: segment.position,
      isSelected: segment.isSelected,
    })
    .run();
}

export async function deleteCollectionSegment(
  collectionId: string,
  routeId: string,
): Promise<void> {
  db.delete(collectionSegments)
    .where(
      and(
        eq(collectionSegments.collectionId, collectionId),
        eq(collectionSegments.routeId, routeId),
      ),
    )
    .run();
}

export async function getCollectionSegments(collectionId: string): Promise<CollectionSegment[]> {
  const rows = db
    .select()
    .from(collectionSegments)
    .where(eq(collectionSegments.collectionId, collectionId))
    .orderBy(asc(collectionSegments.position), desc(collectionSegments.isSelected))
    .all();
  return rows;
}

export async function selectVariant(collectionId: string, routeId: string): Promise<void> {
  const row = db
    .select({ position: collectionSegments.position })
    .from(collectionSegments)
    .where(
      and(
        eq(collectionSegments.collectionId, collectionId),
        eq(collectionSegments.routeId, routeId),
      ),
    )
    .get();
  if (!row) return;

  db.transaction((tx) => {
    tx.update(collectionSegments)
      .set({ isSelected: false })
      .where(
        and(
          eq(collectionSegments.collectionId, collectionId),
          eq(collectionSegments.position, row.position),
        ),
      )
      .run();
    tx.update(collectionSegments)
      .set({ isSelected: true })
      .where(
        and(
          eq(collectionSegments.collectionId, collectionId),
          eq(collectionSegments.routeId, routeId),
        ),
      )
      .run();
  });
}

export async function updateSegmentPositions(
  collectionId: string,
  positions: { routeId: string; position: number }[],
): Promise<void> {
  db.transaction((tx) => {
    for (const { routeId, position } of positions) {
      tx.update(collectionSegments)
        .set({ position })
        .where(
          and(
            eq(collectionSegments.collectionId, collectionId),
            eq(collectionSegments.routeId, routeId),
          ),
        )
        .run();
    }
  });
}

export async function getAllAssignedRouteIds(): Promise<Set<string>> {
  const rows = db
    .selectDistinct({ routeId: collectionSegments.routeId })
    .from(collectionSegments)
    .all();
  return new Set(rows.map((r) => r.routeId));
}

export async function getMaxSegmentPosition(collectionId: string): Promise<number> {
  const row = db
    .select({ maxPos: max(collectionSegments.position) })
    .from(collectionSegments)
    .where(eq(collectionSegments.collectionId, collectionId))
    .get();
  return row?.maxPos ?? -1;
}
