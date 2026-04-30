import React, { useMemo, useCallback, useDeferredValue } from "react";
import { ShapeSource, SymbolLayer, Images, Image } from "@rnmapbox/maps";
import { SvgXml } from "react-native-svg";
import { usePoiStore } from "@/store/poiStore";
import { useMapStore } from "@/store/mapStore";
import { usePlaceStore } from "@/store/placeStore";
import { useStarredStore } from "@/store/starredStore";
import { useEtaStore } from "@/store/etaStore";
import { haversineDistance } from "@/utils/geo";
import { isOpenAt } from "@/services/openingHoursParser";
import { isFoodShopCategory } from "@/utils/placeAdapter";
import { waypointCategoryForType } from "@/constants/waypointCategories";
import {
  buildPoiBadgeSvgs,
  buildWaypointBadgeSvgs,
  MAP_BADGE_ICON_SIZE_EXPR,
} from "./mapBadgeIcons";
import type { POI, PlaceViewModel } from "@/types";
import type { SymbolLayerStyle } from "@rnmapbox/maps";

const POI_BADGE_SVGS = buildPoiBadgeSvgs();
const WP_BADGE_SVGS = buildWaypointBadgeSvgs();
// Merge both icon sets so waypoint icons are available alongside POI icons
const ALL_BADGE_SVGS = { ...POI_BADGE_SVGS, ...WP_BADGE_SVGS };

interface POILayerProps {
  routeIds: string[];
}

export default function POILayer({ routeIds }: POILayerProps) {
  const enabledCategories = usePoiStore((s) => s.enabledCategories);
  const showOpenOnly = usePoiStore((s) => s.showOpenOnly);
  const foodAvailabilityMode = usePoiStore((s) => s.foodAvailabilityMode);
  const foodAvailabilityCustomTime = usePoiStore((s) => s.foodAvailabilityCustomTime);
  const getETAToPOI = useEtaStore((s) => s.getETAToPOI);
  const showPOIs = useMapStore((s) => s.showPOIs);
  const showWaypoints = useMapStore((s) => s.showWaypoints);
  const starredKeys = useStarredStore((s) => s.starredKeys);
  const allPlaces = usePlaceStore((s) => s.places);
  const getVisiblePlaces = usePlaceStore((s) => s.getVisiblePlaces);
  const setSelectedPlace = usePlaceStore((s) => s.setSelectedPlace);

  const visiblePlaces = useMemo(() => {
    if (!showPOIs && !showWaypoints) return [];

    const placesById = new Map<string, PlaceViewModel>();
    for (const routeId of routeIds) {
      if (showPOIs) {
        for (const place of getVisiblePlaces(routeId)) {
          placesById.set(place.placeId, place);
        }
      }
      if (showWaypoints) {
        for (const place of allPlaces[routeId] ?? []) {
          if (place.entityType === "routeWaypoint") {
            placesById.set(place.placeId, place);
          }
        }
      }
    }
    return filterByFoodAvailability(
      Array.from(placesById.values()),
      foodAvailabilityMode,
      foodAvailabilityCustomTime,
      getETAToPOI,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeIds,
    allPlaces,
    enabledCategories,
    showOpenOnly,
    foodAvailabilityMode,
    foodAvailabilityCustomTime,
    getETAToPOI,
    starredKeys,
    showPOIs,
    showWaypoints,
    getVisiblePlaces,
  ]);

  const deferredVisiblePlaces = useDeferredValue(visiblePlaces);

  const geoJSON = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: "FeatureCollection",
      features: deferredVisiblePlaces.map((place) => {
        const waypointCategory =
          place.entityType === "routeWaypoint" ? waypointCategoryForType(place.waypointType) : null;
        const baseIconName = waypointCategory ? `wp-${waypointCategory}` : `poi-${place.category}`;
        const starred = starredKeys.has(`${place.entityType}:${place.entityId}`);
        const iconName = starred ? `${baseIconName}-starred` : baseIconName;
        return {
          type: "Feature",
          properties: {
            placeId: place.placeId,
            entityId: place.entityId,
            entityType: place.entityType,
            category: place.category,
            iconName,
          },
          geometry: {
            type: "Point",
            coordinates: [place.longitude, place.latitude],
          },
        };
      }),
    }),
    [deferredVisiblePlaces, starredKeys],
  );

  const handlePress = useCallback(
    (event: any) => {
      const features = event?.features;
      if (!features?.length) return;

      const tapCoord = event?.coordinates;
      let bestPlace: PlaceViewModel | undefined;

      if (tapCoord && features.length > 1) {
        let bestDist = Infinity;
        for (const feature of features) {
          const placeId = feature?.properties?.placeId;
          if (!placeId) continue;
          const place = deferredVisiblePlaces.find((p) => p.placeId === placeId);
          if (!place) continue;
          const dist = haversineDistance(
            tapCoord.latitude,
            tapCoord.longitude,
            place.latitude,
            place.longitude,
          );
          if (dist < bestDist) {
            bestDist = dist;
            bestPlace = place;
          }
        }
      } else {
        const placeId = features[0]?.properties?.placeId;
        if (placeId) bestPlace = deferredVisiblePlaces.find((p) => p.placeId === placeId);
      }

      if (bestPlace) {
        setSelectedPlace(bestPlace);
      }
    },
    [deferredVisiblePlaces, setSelectedPlace],
  );

  const badgeStyle = useMemo<SymbolLayerStyle>(
    () => ({
      iconImage: ["get", "iconName"],
      iconSize: MAP_BADGE_ICON_SIZE_EXPR as SymbolLayerStyle["iconSize"],
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      iconAnchor: "center",
    }),
    [],
  );

  const badgeEntries = useMemo(() => Object.entries(ALL_BADGE_SVGS), []);

  return (
    <>
      <Images>
        {badgeEntries.map(([name, svg]) => (
          <Image key={name} name={name}>
            <SvgXml xml={svg} width={32} height={32} />
          </Image>
        ))}
      </Images>
      <ShapeSource
        id="poi-source"
        shape={geoJSON}
        onPress={handlePress}
        hitbox={{ width: 40, height: 40 }}
      >
        <SymbolLayer id="poi-badge" style={badgeStyle} />
      </ShapeSource>
    </>
  );
}

function filterByFoodAvailability(
  places: PlaceViewModel[],
  mode: string,
  customTime: string | null,
  getETAToPOI: (poi: POI) => { eta: Date } | null,
) {
  if (mode === "off" || mode === "now") return places;

  const customDate = mode === "custom" && customTime ? new Date(customTime) : null;
  if (mode === "custom" && (!customDate || Number.isNaN(customDate.getTime()))) return places;

  return places.filter((place) => {
    if (place.entityType !== "downloadedPoi") return true;
    if (!isFoodShopCategory(place.category)) return true;
    if (!place.openingHours) return true;

    const targetTime = mode === "eta" ? getETAToPOI(place.raw as POI)?.eta : customDate;
    if (!targetTime) return true;

    return isOpenAt(place.openingHours, targetTime) !== false;
  });
}
