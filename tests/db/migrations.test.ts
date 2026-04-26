import { describe, expect, it } from "vitest";
import migrations from "@/drizzle/migrations";

const migrationSql = Object.values(migrations.migrations).join("\n");

describe("database migrations", () => {
  it("creates route-owned waypoints outside the downloaded POI cache table", () => {
    expect(migrationSql).toContain("CREATE TABLE `route_waypoints`");
    expect(migrationSql).toContain("`origin` text DEFAULT 'gpx' NOT NULL");
    expect(migrationSql).toContain("`routeId` text NOT NULL");
    expect(migrationSql).toContain("ON DELETE cascade");
  });

  it("creates typed starred items independent of downloaded cache rows", () => {
    expect(migrationSql).toContain("CREATE TABLE `starred_items`");
    expect(migrationSql).toContain("`entityType` text NOT NULL");
    expect(migrationSql).toContain("`entityId` text NOT NULL");
    expect(migrationSql).toContain("PRIMARY KEY(`entityType`,`entityId`)");
  });
});
