import React, { useMemo } from "react";
import { ShapeSource, SymbolLayer, Images, Image } from "@rnmapbox/maps";
import { SvgXml } from "react-native-svg";
import { deriveRouteMarkerSourceInput, DISTANCE_MARKER_BUCKETS } from "@/utils/routeMarkers";
import {
  buildStartFinishBadgeSvgs,
  START_ICON_NAME,
  FINISH_ICON_NAME,
  MAP_BADGE_ICON_SIZE_EXPR,
  DISTANCE_CHIP_ICON_SIZE,
  DISTANCE_CHIP_IMAGE_SIZES,
  buildDistanceChipBackgrounds,
  CHIP_SIZE_EXPR,
} from "./mapBadgeIcons";
import type { RoutePoint } from "@/types";
import type { SymbolLayerStyle } from "@rnmapbox/maps";

interface RouteMarkerLayerProps {
  activeContextKey: string | null;
  points: RoutePoint[];
  showDistanceMarkers: boolean;
  // zoom removed - density now controlled by LEVEL_ZOOM + minZoomLevel
}

const START_FINISH_SVGS = buildStartFinishBadgeSvgs();
const CHIP_BACKGROUNDS = buildDistanceChipBackgrounds();

const sortKeyField = ["get", "sortKey"] as const;
const kindField = ["get", "kind"] as const;
const distanceKmField = ["get", "distanceKm"] as const;
const isOverviewMarkerField = ["get", "isOverviewMarker"] as const;

const startFilter = ["==", kindField, "start"] as const;
const finishFilter = ["==", kindField, "finish"] as const;
const distanceFilter = ["==", kindField, "distance"] as const;

function distanceBucketFilter(intervalKm: number) {
  const intervalFilter = ["==", ["%", distanceKmField, intervalKm], 0] as const;

  if (intervalKm === 100) {
    return [
      "all",
      distanceFilter,
      ["any", intervalFilter, ["==", isOverviewMarkerField, true]],
    ] as const;
  }

  return ["all", distanceFilter, intervalFilter] as const;
}

export default function RouteMarkerLayer({
  activeContextKey,
  points,
  showDistanceMarkers,
}: RouteMarkerLayerProps) {
  const sourceInput = useMemo(
    () =>
      deriveRouteMarkerSourceInput({
        activeContextKey,
        points,
        showDistanceMarkers,
      }),
    [activeContextKey, points, showDistanceMarkers],
  );

  const startIconStyle = useMemo<SymbolLayerStyle>(
    () => ({
      iconImage: START_ICON_NAME,
      iconSize: MAP_BADGE_ICON_SIZE_EXPR as SymbolLayerStyle["iconSize"],
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      iconAnchor: "center",
      symbolSortKey: sortKeyField,
    }),
    [],
  );

  const finishIconStyle = useMemo<SymbolLayerStyle>(
    () => ({
      iconImage: FINISH_ICON_NAME,
      iconSize: MAP_BADGE_ICON_SIZE_EXPR as SymbolLayerStyle["iconSize"],
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      iconAnchor: "center",
      symbolSortKey: sortKeyField,
    }),
    [],
  );

  const distanceStyle = useMemo<SymbolLayerStyle>(
    () => ({
      iconImage: CHIP_SIZE_EXPR,
      iconSize: DISTANCE_CHIP_ICON_SIZE as SymbolLayerStyle["iconSize"],
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      iconAnchor: "bottom",
      textField: ["get", "markerLabel"],
      textAllowOverlap: true,
      textIgnorePlacement: true,
      textFont: ["DIN Pro Medium", "Arial Unicode MS Regular"],
      textSize: 12,
      textColor: "#FFFFFF",
      textAnchor: "center",
      textOffset: [0, -1.333],
      textTranslate: [-1, -1],
      textTranslateAnchor: "viewport",
      symbolSortKey: sortKeyField,
      visibility: showDistanceMarkers ? "visible" : "none",
    }),
    [showDistanceMarkers],
  );

  const distanceLayers = DISTANCE_MARKER_BUCKETS.map((bucket) => (
    <SymbolLayer
      key={`distance-interval-${bucket.intervalKm}`}
      id={`route-distance-interval-${bucket.intervalKm}`}
      filter={distanceBucketFilter(bucket.intervalKm)}
      minZoomLevel={bucket.minZoom}
      maxZoomLevel={bucket.maxZoom}
      style={distanceStyle}
    />
  ));

  const layers = [
    ...distanceLayers,
    <SymbolLayer
      key="start-icon"
      id="route-start-marker-icon"
      filter={startFilter}
      style={startIconStyle}
    />,
    <SymbolLayer
      key="finish-icon"
      id="route-finish-marker-icon"
      filter={finishFilter}
      style={finishIconStyle}
    />,
  ];

  return (
    <>
      <Images>
        <Image name={START_ICON_NAME}>
          <SvgXml xml={START_FINISH_SVGS[START_ICON_NAME]} width={32} height={32} />
        </Image>
        <Image name={FINISH_ICON_NAME}>
          <SvgXml xml={START_FINISH_SVGS[FINISH_ICON_NAME]} width={32} height={32} />
        </Image>
        <Image name="chip-s">
          <SvgXml
            xml={CHIP_BACKGROUNDS["chip-s"]}
            width={DISTANCE_CHIP_IMAGE_SIZES["chip-s"].width}
            height={DISTANCE_CHIP_IMAGE_SIZES["chip-s"].height}
          />
        </Image>
        <Image name="chip-m">
          <SvgXml
            xml={CHIP_BACKGROUNDS["chip-m"]}
            width={DISTANCE_CHIP_IMAGE_SIZES["chip-m"].width}
            height={DISTANCE_CHIP_IMAGE_SIZES["chip-m"].height}
          />
        </Image>
        <Image name="chip-l">
          <SvgXml
            xml={CHIP_BACKGROUNDS["chip-l"]}
            width={DISTANCE_CHIP_IMAGE_SIZES["chip-l"].width}
            height={DISTANCE_CHIP_IMAGE_SIZES["chip-l"].height}
          />
        </Image>
      </Images>
      <ShapeSource id="route-marker-source" shape={sourceInput.shape}>
        {layers}
      </ShapeSource>
    </>
  );
}
