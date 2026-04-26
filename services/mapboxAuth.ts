import Mapbox from "@rnmapbox/maps";
import Constants from "expo-constants";

let initialized = false;

export function initializeMapboxAccessToken() {
  if (initialized) return;

  initialized = true;

  try {
    const extra = Constants.expoConfig?.extra as { mapboxAccessToken?: unknown } | undefined;
    const mapboxToken = extra?.mapboxAccessToken;

    if (typeof mapboxToken === "string" && mapboxToken.length > 0) {
      Mapbox.setAccessToken(mapboxToken);
      return;
    }

    if (__DEV__) {
      console.warn("Missing MAPBOX_ACCESS_TOKEN; Mapbox tiles and styles will return 401.");
    }
  } catch (error) {
    console.warn("Failed to set Mapbox access token:", error);
  }
}
