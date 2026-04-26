import React, { useMemo } from "react";
import { ShapeSource, SymbolLayer, Images, Image } from "@rnmapbox/maps";
import { SvgXml } from "react-native-svg";
import { buildRouteMarkerSourceShape } from "@/utils/routeMarkers";
import { buildStartFinishBadgeSvgs, START_ICON_NAME, FINISH_ICON_NAME } from "./mapBadgeIcons";
import type { RoutePoint } from "@/types";
import type { SymbolLayerStyle } from "@rnmapbox/maps";

interface RouteMarkerLayerProps {
  points: RoutePoint[];
  /** ID of the layer this group should render above (for explicit z-ordering). */
  aboveLayerID?: string;
}

const START_FINISH_SVGS = buildStartFinishBadgeSvgs();

const sortKeyField = ["get", "sortKey"] as const;
const kindField = ["get", "kind"] as const;

const startFilter = ["==", kindField, "start"] as const;
const finishFilter = ["==", kindField, "finish"] as const;

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

export default function RouteMarkerLayer({ points, aboveLayerID }: RouteMarkerLayerProps) {
  const shape = useMemo(() => buildRouteMarkerSourceShape(points), [points]);

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
      <ShapeSource id="route-marker-source" shape={shape}>
        <SymbolLayer
          id="route-start-marker-icon"
          filter={startFilter}
          style={startIconStyle}
          aboveLayerID={aboveLayerID}
        />
        <SymbolLayer
          id="route-finish-marker-icon"
          filter={finishFilter}
          style={finishIconStyle}
          aboveLayerID="route-start-marker-icon"
        />
      </ShapeSource>
    </>
  );
}
