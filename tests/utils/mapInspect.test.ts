import { describe, expect, it } from "vitest";
import { getMapInspectHref, parseMapInspectParams } from "../../utils/mapInspect";

describe("mapInspect utils", () => {
  describe("getMapInspectHref", () => {
    it("generates correct href for route", () => {
      expect(getMapInspectHref("route", "route-123")).toBe("/map-inspect?type=route&id=route-123");
    });

    it("generates correct href for collection", () => {
      expect(getMapInspectHref("collection", "col-456")).toBe(
        "/map-inspect?type=collection&id=col-456",
      );
    });

    it("encodes ids for query parameters", () => {
      expect(getMapInspectHref("route", "route 123")).toBe(
        "/map-inspect?type=route&id=route%20123",
      );
    });
  });

  describe("parseMapInspectParams", () => {
    it("parses valid route params", () => {
      expect(parseMapInspectParams("route", "route-123")).toEqual({
        type: "route",
        id: "route-123",
        isValid: true,
      });
    });

    it("parses valid collection params", () => {
      expect(parseMapInspectParams("collection", "col-456")).toEqual({
        type: "collection",
        id: "col-456",
        isValid: true,
      });
    });

    it("returns invalid for missing id", () => {
      expect(parseMapInspectParams("route", undefined)).toEqual({
        type: "route",
        id: undefined,
        isValid: false,
      });
    });

    it("returns invalid for unknown type", () => {
      expect(parseMapInspectParams("unknown", "123")).toEqual({
        type: "unknown",
        id: "123",
        isValid: false,
      });
    });
  });
});
