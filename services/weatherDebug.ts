type WeatherDebugData = Record<string, unknown>;

const isEnabled = typeof __DEV__ !== "undefined" && __DEV__;

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

export function logWeatherDebug(
  event: string,
  data: WeatherDebugData = {},
  level: "info" | "warn" | "error" = "info",
): void {
  if (!isEnabled) return;
  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  logger(`[weather] ${event}`, data);
}

export function startWeatherDebug(event: string, data: WeatherDebugData = {}) {
  if (!isEnabled) {
    return {
      step: () => {},
      end: () => {},
      error: () => {},
    };
  }

  const startedAt = nowMs();
  let lastStepAt = startedAt;
  console.groupCollapsed(`[weather] ${event}`);
  console.info("start", data);

  return {
    step(label: string, stepData: WeatherDebugData = {}) {
      const current = nowMs();
      console.info(label, {
        ...stepData,
        deltaMs: roundMs(current - lastStepAt),
        elapsedMs: roundMs(current - startedAt),
      });
      lastStepAt = current;
    },
    end(endData: WeatherDebugData = {}) {
      console.info("end", { ...endData, elapsedMs: roundMs(nowMs() - startedAt) });
      console.groupEnd();
    },
    error(errorData: WeatherDebugData = {}) {
      console.error("error", { ...errorData, elapsedMs: roundMs(nowMs() - startedAt) });
      console.groupEnd();
    },
  };
}
