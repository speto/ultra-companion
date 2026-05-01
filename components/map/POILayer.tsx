import React, { useMemo, useCallback, useDeferredValue } from "react";
import { ShapeSource, SymbolLayer, Images, Image } from "@rnmapbox/maps";
import { SvgXml } from "react-native-svg";
import { usePoiStore } from "@/store/poiStore";
import { useMapStore } from "@/store/mapStore";
import { usePlaceStore } from "@/store/placeStore";
import { useStarredStore } from "@/store/starredStore";
import { useEtaStore } from "@/store/etaStore";
import { usePanelStore } from "@/store/panelStore";
import { haversineDistance } from "@/utils/geo";
import { downloadedPoiToPlace, filterPlacesByFoodAvailability } from "@/utils/placeAdapter";
import { waypointCategoryForType } from "@/constants/waypointCategories";
import { POI_CATEGORIES } from "@/constants";
import {
  buildPoiBadgeSvgs,
  buildWaypointBadgeSvgs,
  MAP_BADGE_ICON_SIZE_EXPR,
} from "./mapBadgeIcons";
import type { PlaceViewModel } from "@/types";
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
  const foodAvailabilityMode = usePoiStore((s) => s.foodAvailabilityMode);
  const foodAvailabilityCustomTime = usePoiStore((s) => s.foodAvailabilityCustomTime);
  const showSavedOnly = usePoiStore((s) => s.showSavedOnly);
  const selectedPOI = usePoiStore((s) => s.selectedPOI);
  const getETAToPOI = useEtaStore((s) => s.getETAToPOI);
  const showPOIs = useMapStore((s) => s.showPOIs);
  const showWaypoints = useMapStore((s) => s.showWaypoints);
  const starredKeys = useStarredStore((s) => s.starredKeys);
  const allPlaces = usePlaceStore((s) => s.places);
  const getVisiblePlaces = usePlaceStore((s) => s.getVisiblePlaces);
  const selectedPlace = usePlaceStore((s) => s.selectedPlace);
  const setSelectedPlace = usePlaceStore((s) => s.setSelectedPlace);
  const panelTab = usePanelStore((s) => s.panelTab);

  const visiblePlaces = useMemo(() => {
    if (!showWaypoints && routeIds.length === 0) return [];

    const placesById = new Map<string, PlaceViewModel>();
    const starredIds = useStarredStore.getState().getStarredIds("downloadedPoi");
    const categoryFocusActive = enabledCategories.length < POI_CATEGORIES.length;
    const allowBulkPOIs = panelTab === "pois" && (showPOIs || categoryFocusActive || showSavedOnly);

    for (const routeId of routeIds) {
      const routePlaces = allPlaces[routeId] ?? [];
      if (allowBulkPOIs) {
        const bulkPlaces =
          showPOIs && !categoryFocusActive
            ? routePlaces.filter((place) => place.entityType === "downloadedPoi")
            : getVisiblePlaces(routeId);
        for (const place of bulkPlaces) {
          placesById.set(place.placeId, place);
        }
      }
      if (showWaypoints) {
        for (const place of routePlaces) {
          if (place.entityType === "routeWaypoint") {
            placesById.set(place.placeId, place);
          }
        }
      }
    }

    const selectedDownloadedPlace =
      selectedPlace?.entityType === "downloadedPoi" && routeIds.includes(selectedPlace.routeId)
        ? selectedPlace
        : null;
    const selectedPlaceId =
      selectedDownloadedPlace?.placeId ?? (selectedPOI ? `downloadedPoi:${selectedPOI.id}` : null);

    let filtered = filterPlacesByFoodAvailability(
      Array.from(placesById.values()),
      foodAvailabilityMode,
      {
        customTime: foodAvailabilityCustomTime,
        getETAToPOI,
        starredIds,
      },
    );
    const filteredById = new Map(filtered.map((place) => [place.placeId, place]));

    if (selectedDownloadedPlace) {
      filteredById.set(selectedDownloadedPlace.placeId, selectedDownloadedPlace);
    } else if (selectedPOI && routeIds.includes(selectedPOI.routeId)) {
      filteredById.set(`downloadedPoi:${selectedPOI.id}`, downloadedPoiToPlace(selectedPOI));
    }

    if (selectedPlaceId && placesById.has(selectedPlaceId)) {
      filteredById.set(selectedPlaceId, placesById.get(selectedPlaceId)!);
    }

    filtered = Array.from(filteredById.values());
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeIds,
    allPlaces,
    enabledCategories,
    foodAvailabilityMode,
    foodAvailabilityCustomTime,
    getETAToPOI,
    starredKeys,
    showSavedOnly,
    showPOIs,
    showWaypoints,
    getVisiblePlaces,
    selectedPlace,
    selectedPOI,
    panelTab,
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
