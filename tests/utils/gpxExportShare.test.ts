import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSafeFilename, shareGPXFile } from "@/utils/gpxExportShare";

const mockWrite = vi.fn();
const mockFileUri = "file:///mock/cache/dir/Test_Route.gpx";

vi.mock("expo-file-system", () => ({
  File: vi.fn().mockImplementation(() => ({
    uri: mockFileUri,
    write: mockWrite,
  })),
  Paths: {
    cache: "file:///mock/cache/dir/",
  },
}));

vi.mock("react-native", () => ({
  Share: {
    share: vi.fn().mockResolvedValue({ action: "sharedAction" }),
  },
}));

describe("gpxExportShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSafeFilename", () => {
    it("appends .gpx if missing", () => {
      expect(getSafeFilename("My Route")).toBe("My_Route.gpx");
    });

    it("does not append .gpx if already present", () => {
      expect(getSafeFilename("My_Route.gpx")).toBe("My_Route.gpx");
    });

    it("replaces invalid characters with underscores", () => {
      expect(getSafeFilename("Route/With\\Invalid:Chars?")).toBe("Route_With_Invalid_Chars_.gpx");
    });

    it("handles empty string", () => {
      expect(getSafeFilename("")).toBe(".gpx");
    });

    it("preserves dots and hyphens", () => {
      expect(getSafeFilename("Stage-1.2")).toBe("Stage-1.2.gpx");
    });
  });

  describe("shareGPXFile", () => {
    it("writes file and opens share sheet", async () => {
      const { File, Paths } = await import("expo-file-system");
      const { Share } = await import("react-native");

      const gpxContent = "<gpx></gpx>";
      const filename = "Test Route";

      await shareGPXFile(gpxContent, filename);

      expect(File).toHaveBeenCalledWith(Paths.cache, "Test_Route.gpx");
      expect(mockWrite).toHaveBeenCalledWith(gpxContent);

      expect(Share.share).toHaveBeenCalledWith({
        url: mockFileUri,
        title: "Test_Route.gpx",
      });
    });
  });
});
