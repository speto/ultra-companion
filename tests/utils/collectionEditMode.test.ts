import { describe, it, expect } from "vitest";
import { getSegmentControlVisibility } from "../../utils/collectionEditMode";

describe("getSegmentControlVisibility", () => {
  it("returns correct visibility for normal mode", () => {
    const result = getSegmentControlVisibility(false);
    expect(result.showLeftControls).toBe(false);
    expect(result.showRemove).toBe(false);
    expect(result.showChevron).toBe(true);
  });

  it("returns correct visibility for edit mode", () => {
    const result = getSegmentControlVisibility(true);
    expect(result.showLeftControls).toBe(true);
    expect(result.showRemove).toBe(true);
    expect(result.showChevron).toBe(false);
  });
});
