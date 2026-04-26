import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockMMKV, reactNativeMmkvMocks } from "../mocks/reactNativeMmkv";

vi.mock("react-native-mmkv", () => ({
  createMMKV: createMockMMKV,
}));

async function loadPanelStore() {
  return (await import("@/store/panelStore")).usePanelStore;
}

describe("panelStore", () => {
  beforeEach(() => {
    vi.resetModules();
    reactNativeMmkvMocks.getString.mockReset();
    reactNativeMmkvMocks.set.mockReset();
    reactNativeMmkvMocks.getString.mockReturnValue(null);
  });

  describe("horizon", () => {
    it("defaults global horizon to 50km when no stored value", async () => {
      const usePanelStore = await loadPanelStore();
      expect(usePanelStore.getState().horizon).toBe(50);
    });

    it("persists and reads stored global horizon", async () => {
      reactNativeMmkvMocks.getString.mockImplementation((key?: string) => {
        if (key === "horizon") return JSON.stringify(100);
        return null;
      });

      const usePanelStore = await loadPanelStore();
      expect(usePanelStore.getState().horizon).toBe(100);
    });

    it("setHorizon updates and persists the global horizon", async () => {
      const usePanelStore = await loadPanelStore();
      const beforeRequestId = usePanelStore.getState().horizonFitRequestId;
      usePanelStore.getState().setHorizon(100);

      expect(usePanelStore.getState().horizon).toBe(100);
      expect(usePanelStore.getState().horizonFitRequestId).toBe(beforeRequestId + 1);
      expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("horizon", "100");
    });

    it("setHorizon supports null (whole route)", async () => {
      const usePanelStore = await loadPanelStore();
      usePanelStore.getState().setHorizon(null);

      expect(usePanelStore.getState().horizon).toBeNull();
    });

    it("activeHorizon returns global horizon", async () => {
      reactNativeMmkvMocks.getString.mockImplementation((key?: string) => {
        if (key === "horizon") return JSON.stringify(100);
        if (key === "panelTab") return "weather";
        return null;
      });

      const usePanelStore = await loadPanelStore();
      expect(usePanelStore.getState().activeHorizon()).toBe(100);
    });

    it("falls back to default for invalid stored horizon values", async () => {
      reactNativeMmkvMocks.getString.mockImplementation((key?: string) => {
        if (key === "horizon") return JSON.stringify(999);
        return null;
      });

      const usePanelStore = await loadPanelStore();
      expect(usePanelStore.getState().horizon).toBe(50);
    });
  });

  describe("panelTab", () => {
    it("defaults to profile", async () => {
      const usePanelStore = await loadPanelStore();
      expect(usePanelStore.getState().panelTab).toBe("profile");
    });

    it("persists tab changes", async () => {
      const usePanelStore = await loadPanelStore();
      usePanelStore.getState().setPanelTab("weather");
      expect(usePanelStore.getState().panelTab).toBe("weather");
      expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("panelTab", "weather");
    });

    it("accepts waypoints as a valid tab", async () => {
      const usePanelStore = await loadPanelStore();
      usePanelStore.getState().setPanelTab("waypoints");
      expect(usePanelStore.getState().panelTab).toBe("waypoints");
      expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("panelTab", "waypoints");
    });
  });

  describe("horizon popover", () => {
    it("defaults to closed", async () => {
      const usePanelStore = await loadPanelStore();
      expect(usePanelStore.getState().isHorizonPopoverOpen).toBe(false);
    });

    it("setHorizonPopoverOpen toggles state", async () => {
      const usePanelStore = await loadPanelStore();
      usePanelStore.getState().setHorizonPopoverOpen(true);
      expect(usePanelStore.getState().isHorizonPopoverOpen).toBe(true);
      usePanelStore.getState().setHorizonPopoverOpen(false);
      expect(usePanelStore.getState().isHorizonPopoverOpen).toBe(false);
    });

    it("setHorizon closes popover", async () => {
      const usePanelStore = await loadPanelStore();
      usePanelStore.getState().setHorizonPopoverOpen(true);
      usePanelStore.getState().setHorizon(100);
      expect(usePanelStore.getState().isHorizonPopoverOpen).toBe(false);
      expect(usePanelStore.getState().horizon).toBe(100);
    });

    it("setPanelTab closes popover", async () => {
      const usePanelStore = await loadPanelStore();
      usePanelStore.getState().setHorizonPopoverOpen(true);
      usePanelStore.getState().setPanelTab("weather");
      expect(usePanelStore.getState().isHorizonPopoverOpen).toBe(false);
    });

    it("setHorizonFromZoom updates horizon when popover is closed", async () => {
      const usePanelStore = await loadPanelStore();
      const beforeRequestId = usePanelStore.getState().horizonFitRequestId;
      usePanelStore.getState().setHorizonFromZoom(20);
      expect(usePanelStore.getState().horizon).toBe(20);
      expect(usePanelStore.getState().horizonFitRequestId).toBe(beforeRequestId);
    });

    it("setHorizonFromZoom skips update when popover is open", async () => {
      const usePanelStore = await loadPanelStore();
      usePanelStore.getState().setHorizon(50);
      usePanelStore.getState().setHorizonPopoverOpen(true);
      usePanelStore.getState().setHorizonFromZoom(20);
      expect(usePanelStore.getState().horizon).toBe(50);
    });

    it("setHorizonFromZoom skips update when horizon unchanged", async () => {
      const usePanelStore = await loadPanelStore();
      usePanelStore.getState().setHorizon(50);
      usePanelStore.getState().setHorizonFromZoom(50);
      expect(usePanelStore.getState().horizon).toBe(50);
    });

    it("setHorizonFromCamera updates horizon without fit request", async () => {
      const usePanelStore = await loadPanelStore();
      const beforeRequestId = usePanelStore.getState().horizonFitRequestId;
      usePanelStore.getState().setHorizonFromCamera(20);
      expect(usePanelStore.getState().horizon).toBe(20);
      expect(usePanelStore.getState().horizonFitRequestId).toBe(beforeRequestId);
    });

    it("setHorizonFromCamera updates even when popover is open", async () => {
      const usePanelStore = await loadPanelStore();
      usePanelStore.getState().setHorizon(50);
      usePanelStore.getState().setHorizonPopoverOpen(true);
      usePanelStore.getState().setHorizonFromCamera(20);
      expect(usePanelStore.getState().horizon).toBe(20);
    });

    it("setHorizonFromCamera skips update when horizon unchanged", async () => {
      const usePanelStore = await loadPanelStore();
      usePanelStore.getState().setHorizon(50);
      usePanelStore.getState().setHorizonFromCamera(50);
      expect(usePanelStore.getState().horizon).toBe(50);
    });
  });

  describe("climbZoomScope", () => {
    it("defaults to climb when no stored value", async () => {
      const usePanelStore = await loadPanelStore();
      expect(usePanelStore.getState().climbZoomScope).toBe("climb");
    });

    it("reads persisted climbZoomScope", async () => {
      reactNativeMmkvMocks.getString.mockImplementation((key?: string) => {
        if (key === "climbZoomScope") return "segment";
        return null;
      });
      const usePanelStore = await loadPanelStore();
      expect(usePanelStore.getState().climbZoomScope).toBe("segment");
    });

    it("falls back to climb for invalid stored value", async () => {
      reactNativeMmkvMocks.getString.mockImplementation((key?: string) => {
        if (key === "climbZoomScope") return "invalid";
        return null;
      });
      const usePanelStore = await loadPanelStore();
      expect(usePanelStore.getState().climbZoomScope).toBe("climb");
    });

    it("setClimbZoomScope updates and persists scope", async () => {
      const usePanelStore = await loadPanelStore();
      const beforeRequestId = usePanelStore.getState().climbScopeFitRequestId;
      usePanelStore.getState().setClimbZoomScope("segment");
      expect(usePanelStore.getState().climbZoomScope).toBe("segment");
      expect(usePanelStore.getState().climbScopeFitRequestId).toBe(beforeRequestId + 1);
      expect(reactNativeMmkvMocks.set).toHaveBeenCalledWith("climbZoomScope", "segment");
    });

    it("setClimbZoomScope closes popover", async () => {
      const usePanelStore = await loadPanelStore();
      usePanelStore.getState().setHorizonPopoverOpen(true);
      usePanelStore.getState().setClimbZoomScope("all");
      expect(usePanelStore.getState().isHorizonPopoverOpen).toBe(false);
      expect(usePanelStore.getState().climbZoomScope).toBe("all");
    });

    it("setClimbZoomScope to all increments fit request id", async () => {
      const usePanelStore = await loadPanelStore();
      const beforeId = usePanelStore.getState().climbScopeFitRequestId;
      usePanelStore.getState().setClimbZoomScope("all");
      expect(usePanelStore.getState().climbScopeFitRequestId).toBe(beforeId + 1);
    });
  });
});
