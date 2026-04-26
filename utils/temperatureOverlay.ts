export type TemperatureComfortBucket =
  | "cold-risk"
  | "cool"
  | "comfortable"
  | "warm"
  | "hot-risk"
  | "unknown";

export const TEMPERATURE_COMFORT_STOPS = [
  { bucket: "cold-risk", minC: -Infinity, color: "#2563EB", label: "Cold risk" },
  { bucket: "cool", minC: 5, color: "#38BDF8", label: "Cool" },
  { bucket: "comfortable", minC: 12, color: "#22C55E", label: "Comfortable" },
  { bucket: "warm", minC: 22, color: "#F59E0B", label: "Warm" },
  { bucket: "hot-risk", minC: 30, color: "#DC2626", label: "Hot risk" },
] as const;

const UNKNOWN_TEMPERATURE_COLOR = "#9C958E";

export function classifyTemperatureComfort(temperatureC: number): TemperatureComfortBucket {
  if (!Number.isFinite(temperatureC)) return "unknown";

  let bucket: TemperatureComfortBucket = TEMPERATURE_COMFORT_STOPS[0].bucket;
  for (const stop of TEMPERATURE_COMFORT_STOPS) {
    if (temperatureC >= stop.minC) bucket = stop.bucket;
  }
  return bucket;
}

export function temperatureColor(temperatureC: number): string {
  const bucket = classifyTemperatureComfort(temperatureC);
  if (bucket === "unknown") return UNKNOWN_TEMPERATURE_COLOR;
  return (
    TEMPERATURE_COMFORT_STOPS.find((stop) => stop.bucket === bucket)?.color ??
    UNKNOWN_TEMPERATURE_COLOR
  );
}
