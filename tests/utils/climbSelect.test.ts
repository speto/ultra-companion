import { describe, it, expect } from "vitest";
import { buildClimb } from "../fixtures/climb";
import { getClimbOrdinal, getAdjacentClimb } from "../../utils/climbSelect";

describe("climbSelect helpers", () => {
  const climbs = [
    buildClimb("c1", "r1", 0, 1000),
    buildClimb("c2", "r1", 2000, 3000),
    buildClimb("c3", "r1", 4000, 5000),
  ];

  describe("getClimbOrdinal", () => {
    it("returns correct ordinal for existing climb", () => {
      expect(getClimbOrdinal(climbs, "c1")).toEqual({ current: 1, total: 3 });
      expect(getClimbOrdinal(climbs, "c2")).toEqual({ current: 2, total: 3 });
      expect(getClimbOrdinal(climbs, "c3")).toEqual({ current: 3, total: 3 });
    });

    it("returns null for non-existent climb", () => {
      expect(getClimbOrdinal(climbs, "c4")).toBeNull();
    });

    it("returns null for empty climbs array", () => {
      expect(getClimbOrdinal([], "c1")).toBeNull();
    });
  });

  describe("getAdjacentClimb", () => {
    it("returns next climb", () => {
      expect(getAdjacentClimb(climbs, "c1", "next")).toEqual(climbs[1]);
      expect(getAdjacentClimb(climbs, "c2", "next")).toEqual(climbs[2]);
    });

    it("returns null when no next climb", () => {
      expect(getAdjacentClimb(climbs, "c3", "next")).toBeNull();
    });

    it("returns prev climb", () => {
      expect(getAdjacentClimb(climbs, "c3", "prev")).toEqual(climbs[1]);
      expect(getAdjacentClimb(climbs, "c2", "prev")).toEqual(climbs[0]);
    });

    it("returns null when no prev climb", () => {
      expect(getAdjacentClimb(climbs, "c1", "prev")).toBeNull();
    });

    it("returns null for non-existent climb", () => {
      expect(getAdjacentClimb(climbs, "c4", "next")).toBeNull();
      expect(getAdjacentClimb(climbs, "c4", "prev")).toBeNull();
    });
  });
});
