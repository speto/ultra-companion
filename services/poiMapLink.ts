import { showLocation } from "react-native-map-link";
import { buildPoiMapLinkPayload } from "@/utils/poiActions";
import type { POI } from "@/types";

export function openPoiInMaps(poi: POI): void {
  showLocation(buildPoiMapLinkPayload(poi));
}
