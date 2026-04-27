import React, { useMemo, useCallback, useDeferredValue } from "react";
import { ShapeSource, SymbolLayer, CircleLayer, Images, Image } from "@rnmapbox/maps";
import { SvgXml } from "react-native-svg";
import { usePoiStore } from "@/store/poiStore";
import { usePanelStore } from "@/store/panelStore";
import { usePlaceStore } from "@/store/placeStore";
import { useStarredStore } from "@/store/starredStore";
import { useThemeColors } from "@/theme";
import { useEtaStore } from "@/store/etaStore";
import { haversineDistance } from "@/utils/geo";
import { isOpenAt } from "@/services/openingHoursParser";
import { isFoodShopCategory } from "@/utils/placeAdapter";
import { waypointCategoryForType } from "@/constants/waypointCategories";
import { buildPoiBadgeSvgs, buildWaypointBadgeSvgs } from "./mapBadgeIcons";
import type { POI, PlaceViewModel } from "@/types";
import type { SymbolLayerStyle, CircleLayerStyle } from "@rnmapbox/maps";

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
  const starredKeys = useStarredStore((s) => s.starredKeys);
  const panelTab = usePanelStore((s) => s.panelTab);
  const allPlaces = usePlaceStore((s) => s.places);
  const getVisiblePlaces = usePlaceStore((s) => s.getVisiblePlaces);
  const setSelectedPlace = usePlaceStore((s) => s.setSelectedPlace);
  const colors = useThemeColors();

  const visiblePlaces = useMemo(() => {
    if (panelTab !== "pois" && panelTab !== "waypoints") return [];

    const places: PlaceViewModel[] = [];
    for (const routeId of routeIds) {
      if (panelTab === "pois") {
        places.push(...getVisiblePlaces(routeId));
      }
      if (panelTab === "waypoints") {
        places.push(
          ...(allPlaces[routeId] ?? []).filter((place) => place.entityType === "routeWaypoint"),
        );
      }
    }
    return filterByFoodAvailability(
      places,
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
    panelTab,
    getVisiblePlaces,
  ]);

  const deferredVisiblePlaces = useDeferredValue(visiblePlaces);

  const geoJSON = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: "FeatureCollection",
      features: deferredVisiblePlaces.map((place) => {
        const iconName =
          place.entityType === "routeWaypoint"
            ? `wp-${waypointCategoryForType(place.waypointType)}`
            : `poi-${place.category}`;
        const starred = starredKeys.has(`${place.entityType}:${place.entityId}`) ? 1 : 0;
        return {
          type: "Feature",
          properties: {
            placeId: place.placeId,
            entityId: place.entityId,
            entityType: place.entityType,
            category: place.category,
            iconName,
            starred,
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

  const starredHaloStyle = useMemo<CircleLayerStyle>(
    () => ({
      circleRadius: ["interpolate", ["linear"], ["zoom"], 5, 7, 8, 9, 10, 11, 12, 14],
      circleColor: colors.warning,
      circleOpacity: 0.85,
    }),
    [colors.warning],
  );

  const normalBadgeStyle = useMemo<SymbolLayerStyle>(
    () => ({
      iconImage: ["get", "iconName"],
      iconSize: ["interpolate", ["linear"], ["zoom"], 5, 0.73, 10, 1.0, 14, 1.27],
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      iconAnchor: "center",
    }),
    [],
  );

  const starredBadgeStyle = useMemo<SymbolLayerStyle>(
    () => ({
      iconImage: ["get", "iconName"],
      iconSize: ["interpolate", ["linear"], ["zoom"], 5, 0.8, 10, 1.1, 14, 1.4],
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
            <SvgXml xml={svg} width={24} height={24} />
          </Image>
        ))}
      </Images>
      <ShapeSource
        id="poi-source"
        shape={geoJSON}
        onPress={handlePress}
        hitbox={{ width: 40, height: 40 }}
      >
        <SymbolLayer
          id="poi-normal-badge"
          filter={["==", ["get", "starred"], 0]}
          style={normalBadgeStyle}
        />
        <CircleLayer
          id="poi-starred-halo"
          filter={["==", ["get", "starred"], 1]}
          style={starredHaloStyle}
        />
        <SymbolLayer
          id="poi-starred-badge"
          filter={["==", ["get", "starred"], 1]}
          style={starredBadgeStyle}
        />
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
