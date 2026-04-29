import * as Location from "expo-location";
import type { UserPosition } from "@/types";

const FOLLOW_POSITION_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced,
  distanceInterval: 25,
  timeInterval: 10_000,
};

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function getCurrentPosition(): Promise<UserPosition | null> {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return locationToPosition(location);
}

export async function watchForegroundPosition(
  onPosition: (position: UserPosition) => void,
): Promise<Location.LocationSubscription | null> {
  const granted = await requestLocationPermission();
  if (!granted) return null;

  return Location.watchPositionAsync(FOLLOW_POSITION_OPTIONS, (location) => {
    const position = locationToPosition(location);
    if (position) onPosition(position);
  });
}

export async function watchForegroundHeading(
  onHeading: (heading: number) => void,
): Promise<Location.LocationSubscription | null> {
  const granted = await requestLocationPermission();
  if (!granted) return null;

  return Location.watchHeadingAsync((location) => {
    const heading = location.trueHeading >= 0 ? location.trueHeading : location.magHeading;
    if (heading >= 0) onHeading(heading);
  });
}

function locationToPosition(location: Location.LocationObject): UserPosition | null {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    altitude: location.coords.altitude,
    heading: location.coords.heading,
    speed: location.coords.speed,
    timestamp: location.timestamp,
  };
}
