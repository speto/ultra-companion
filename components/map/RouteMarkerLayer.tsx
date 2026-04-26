import React, { useMemo } from "react";
import { ShapeSource, SymbolLayer, Images, Image } from "@rnmapbox/maps";
import { SvgXml } from "react-native-svg";
import { deriveRouteMarkerSourceInput } from "@/utils/routeMarkers";
import { buildStartFinishBadgeSvgs, START_ICON_NAME, FINISH_ICON_NAME } from "./mapBadgeIcons";
import type { RoutePoint } from "@/types";
import type { SymbolLayerStyle } from "@rnmapbox/maps";

interface RouteMarkerLayerProps {
  activeContextKey: string | null;
  points: RoutePoint[];
  showDistanceMarkers: boolean;
  zoom: number;
  /** ID of the layer this group should render above (for explicit z-ordering). */
  aboveLayerID?: string;
}

const START_FINISH_SVGS = buildStartFinishBadgeSvgs();

const markerLabelField = ["get", "markerLabel"] as const;
const sortKeyField = ["get", "sortKey"] as const;
const kindField = ["get", "kind"] as const;

const startFilter = ["==", kindField, "start"] as const;
const finishFilter = ["==", kindField, "finish"] as const;
const distanceFilter = ["==", kindField, "distance"] as const;

const TOOLTIP_TAIL = "▾";

// Zoom-aware icon size for start/finish soft-chip markers (32px base SVGs)
const endpointIconSizeExpr: SymbolLayerStyle["iconSize"] = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  0.55,
  10,
  0.75,
  12,
  0.95,
];

export default function RouteMarkerLayer({
  activeContextKey,
  points,
  showDistanceMarkers,
  zoom,
  aboveLayerID,
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

  const startIconStyle = useMemo<SymbolLayerStyle>(
    () => ({
      iconImage: START_ICON_NAME,
      iconSize: endpointIconSizeExpr,
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
      iconSize: endpointIconSizeExpr,
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      iconAnchor: "center",
      symbolSortKey: sortKeyField,
    }),
    [],
  );

  const distanceLabelStyle = useMemo<SymbolLayerStyle>(
    () => ({
      textField: markerLabelField,
      textSize: 12,
      textColor: "#FFFFFF",
      textHaloColor: "rgba(28,26,24,0.92)",
      textHaloWidth: 7,
      textHaloBlur: 0.5,
      textAllowOverlap: true,
      textIgnorePlacement: true,
      textAnchor: "center",
      textOffset: [0, -1.15],
      symbolSortKey: sortKeyField,
      visibility: showDistanceMarkers ? "visible" : "none",
    }),
    [showDistanceMarkers],
  );

  const distanceTailStyle = useMemo<SymbolLayerStyle>(
    () => ({
      textField: TOOLTIP_TAIL,
      textSize: 12,
      textColor: "rgba(28,26,24,0.92)",
      textAllowOverlap: true,
      textIgnorePlacement: true,
      textAnchor: "center",
      textOffset: [0, -0.3],
      symbolSortKey: sortKeyField,
      visibility: showDistanceMarkers ? "visible" : "none",
    }),
    [showDistanceMarkers],
  );

  const layers = [
    <SymbolLayer
      key="distance-tail"
      id="route-distance-marker-tails"
      filter={distanceFilter}
      style={distanceTailStyle}
      aboveLayerID={aboveLayerID}
    />,
    <SymbolLayer
      key="distance-label"
      id="route-distance-marker-labels"
      filter={distanceFilter}
      style={distanceLabelStyle}
      aboveLayerID="route-distance-marker-tails"
    />,
    <SymbolLayer
      key="start-icon"
      id="route-start-marker-icon"
      filter={startFilter}
      style={startIconStyle}
      aboveLayerID="route-distance-marker-labels"
    />,
    <SymbolLayer
      key="finish-icon"
      id="route-finish-marker-icon"
      filter={finishFilter}
      style={finishIconStyle}
      aboveLayerID="route-start-marker-icon"
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
      </Images>
      <ShapeSource id="route-marker-source" shape={sourceInput.shape}>
        {layers}
      </ShapeSource>
    </>
  );
}
