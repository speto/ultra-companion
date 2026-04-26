import { describe, expect, it } from "vitest";
import {
  headingDeltaFromNorth,
  isNorthUp,
  nextDisplayHeading,
  normalizeHeading,
} from "@/utils/mapHeading";

describe("map heading helpers", () => {
  it("normalizes headings into 0-360 degrees", () => {
    expect(normalizeHeading(361)).toBe(1);
    expect(normalizeHeading(-1)).toBe(359);
    expect(normalizeHeading(720)).toBe(0);
  });

  it("treats headings near 0/360 as north-up", () => {
    expect(headingDeltaFromNorth(359.5)).toBeCloseTo(0.5);
    expect(isNorthUp(0.5)).toBe(true);
    expect(isNorthUp(359.5)).toBe(true);
    expect(isNorthUp(2)).toBe(false);
  });

  it("snaps display heading back to zero near north", () => {
    expect(nextDisplayHeading(15, 359.5)).toBe(0);
    expect(nextDisplayHeading(15, -0.5)).toBe(0);
  });

  it("uses wrapped distance for update threshold", () => {
    expect(nextDisplayHeading(359, 1)).toBe(0);
    expect(nextDisplayHeading(355, 357)).toBe(355);
    expect(nextDisplayHeading(350, 10)).toBe(10);
  });
});
