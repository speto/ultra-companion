import { describe, it, expect } from "vitest";
import { getBadgeProps } from "../../utils/importHelpers";

describe("ImportSummary helpers", () => {
  describe("getBadgeProps", () => {
    it("returns correct props for pending status", () => {
      expect(getBadgeProps("pending")).toEqual({ label: "Pending", variant: "outline" });
    });

    it("returns correct props for importing status", () => {
      expect(getBadgeProps("importing")).toEqual({ label: "Importing", variant: "outline" });
    });

    it("returns correct props for success status", () => {
      expect(getBadgeProps("success")).toEqual({ label: "Success", variant: "default" });
    });

    it("returns correct props for skipped status", () => {
      expect(getBadgeProps("skipped")).toEqual({ label: "Skipped", variant: "outline" });
    });

    it("returns correct props for failed status", () => {
      expect(getBadgeProps("failed")).toEqual({ label: "Failed", variant: "destructive" });
    });

    it("returns correct props for unknown status", () => {
      expect(getBadgeProps("unknown")).toEqual({ label: "Unknown", variant: "outline" });
    });
  });
});
