import React, { useMemo } from "react";
import { ShapeSource, SymbolLayer, Images, Image } from "@rnmapbox/maps";
import { SvgXml } from "react-native-svg";
import { deriveRouteMarkerSourceInput } from "@/utils/routeMarkers";
import {
  buildStartFinishBadgeSvgs,
  START_ICON_NAME,
  FINISH_ICON_NAME,
  MAP_BADGE_ICON_SIZE_EXPR,
  makeDistanceMarkerSvg,
} from "./mapBadgeIcons";
import type { RoutePoint } from "@/types";
import type { SymbolLayerStyle } from "@rnmapbox/maps";

interface RouteMarkerLayerProps {
  activeContextKey: string | null;
  points: RoutePoint[];
  showDistanceMarkers: boolean;
  zoom: number;
}

const START_FINISH_SVGS = buildStartFinishBadgeSvgs();

const sortKeyField = ["get", "sortKey"] as const;
const kindField = ["get", "kind"] as const;
const iconNameField = ["get", "iconName"] as const;

const startFilter = ["==", kindField, "start"] as const;
const finishFilter = ["==", kindField, "finish"] as const;
const distanceFilter = ["==", kindField, "distance"] as const;
export default function RouteMarkerLayer({
  activeContextKey,
  points,
  showDistanceMarkers,
  zoom,
}: RouteMarkerLayerProps) {
  const sourceInput = useMemo(
    () =>
      deriveRouteMarkerSourceInput({
        activeContextKey,
        points,
        showDistanceMarkers,
        zoom,
      }),
    [activeContextKey, points, showDistanceMarkers, zoom],
  );

  const distanceLabels = useMemo(() => {
    if (!showDistanceMarkers) return [];
    const labels = new Set<string>();
    for (const feature of sourceInput.shape.features) {
      if (feature.properties.kind === "distance") {
        labels.add(feature.properties.markerLabel);
      }
    }
    return Array.from(labels);
  }, [sourceInput.shape.features, showDistanceMarkers]);

  const startIconStyle = useMemo<SymbolLayerStyle>(
    () => ({
      iconImage: START_ICON_NAME,
      iconSize: MAP_BADGE_ICON_SIZE_EXPR,
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
      iconSize: MAP_BADGE_ICON_SIZE_EXPR,
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      iconAnchor: "center",
      symbolSortKey: sortKeyField,
    }),
    [],
  );

  const distanceIconStyle = useMemo<SymbolLayerStyle>(
    () => ({
      iconImage: iconNameField,
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      iconAnchor: "bottom",
      symbolSortKey: sortKeyField,
      visibility: showDistanceMarkers ? "visible" : "none",
    }),
    [showDistanceMarkers],
  );

  const layers = [
    <SymbolLayer
      key="distance-icon"
      id="route-distance-marker-icons"
      filter={distanceFilter}
      style={distanceIconStyle}
    />,
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
        {distanceLabels.map((label) => (
          <Image key={`distance-${label}`} name={`distance-${label}`}>
            <SvgXml xml={makeDistanceMarkerSvg(label)} />
          </Image>
        ))}
      </Images>
      <ShapeSource id="route-marker-source" shape={sourceInput.shape}>
        {layers}
      </ShapeSource>
    </>
  );
}
