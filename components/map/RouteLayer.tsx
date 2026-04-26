import React, { useMemo } from "react";
import { ShapeSource, LineLayer, SymbolLayer } from "@rnmapbox/maps";
import { routeToGeoJSON, buildDirectionArrows } from "@/utils/geo";
import { useThemeColors } from "@/theme";
import { ACTIVE_ROUTE_COLOR, INACTIVE_ROUTE_COLOR } from "@/constants";
import type { Route, RoutePoint } from "@/types";
import type { SymbolLayerStyle } from "@rnmapbox/maps";

const ARROW_UNICODE = "▶";
const EMPTY_ARROW_SOURCE: ReturnType<typeof buildDirectionArrows> = {
  type: "FeatureCollection",
  features: [],
};

interface RouteLayerProps {
  route: Route;
  points: RoutePoint[];
  /** Dim the route line (e.g. when a climb highlight is shown on top) */
  dimmed?: boolean;
  /** Explicit color override (used for collection segment colors) */
  colorOverride?: string;
}

interface RouteArrowLayerProps extends RouteLayerProps {
  /** Show direction arrows along the route */
  showArrows?: boolean;
  /** Current map zoom, used to smooth arrow bearings more at overview scale. */
  zoom: number;
}

function getRouteColor(
  route: Route,
  dimmed: boolean | undefined,
  colorOverride: string | undefined,
) {
  return route.isActive && !dimmed ? (colorOverride ?? ACTIVE_ROUTE_COLOR) : INACTIVE_ROUTE_COLOR;
}

export default function RouteLayer({ route, points, dimmed, colorOverride }: RouteLayerProps) {
  const colors = useThemeColors();
  const geoJSON = useMemo(() => routeToGeoJSON(points), [points]);

  const isActive = route.isActive;
  const routeColor = getRouteColor(route, dimmed, colorOverride);

  const outlineStyle = useMemo(
    () => ({
      lineColor: colors.surface,
      lineWidth: 6,
      lineOpacity: isActive ? 0.8 : 0.4,
      lineCap: "round" as const,
      lineJoin: "round" as const,
    }),
    [colors.surface, isActive],
  );

  const lineStyle = useMemo(
    () => ({
      lineColor: routeColor,
      lineWidth: 4,
      lineOpacity: isActive && !dimmed ? 1 : 0.6,
      lineCap: "round" as const,
      lineJoin: "round" as const,
    }),
    [routeColor, isActive, dimmed],
  );

  if (points.length < 2) return null;

  return (
    <ShapeSource id={`route-source-${route.id}`} shape={geoJSON}>
      <LineLayer id={`route-outline-${route.id}`} style={outlineStyle} />
      <LineLayer id={`route-line-${route.id}`} style={lineStyle} />
    </ShapeSource>
  );
}

export function RouteArrowLayer({
  route,
  points,
  dimmed,
  colorOverride,
  showArrows = false,
  zoom,
}: RouteArrowLayerProps) {
  const colors = useThemeColors();
  const isActive = route.isActive;
  const routeColor = getRouteColor(route, dimmed, colorOverride);
  const arrowsVisible = showArrows && isActive && !dimmed;

  const arrowSource = useMemo(
    () => (arrowsVisible ? buildDirectionArrows(points, routeColor, zoom) : EMPTY_ARROW_SOURCE),
    [arrowsVisible, points, routeColor, zoom],
  );

  const isLongRoute = (points[points.length - 1]?.distanceFromStartMeters ?? 0) >= 200_000;

  const arrowStyle = useMemo<SymbolLayerStyle>(
    () => ({
      textField: ARROW_UNICODE,
      textSize: (isLongRoute
        ? ["interpolate", ["linear"], ["zoom"], 7, 24, 10, 26, 13, 28]
        : [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            20,
            10,
            22,
            13,
            24,
          ]) as unknown as SymbolLayerStyle["textSize"],
      textColor: routeColor,
      textHaloColor: colors.surface,
      textHaloWidth: [
        "interpolate",
        ["linear"],
        ["zoom"],
        7,
        0.7,
        10,
        1.2,
        13,
        1.8,
      ] as unknown as SymbolLayerStyle["textHaloWidth"],
      textRotate: ["get", "rotation"],
      textRotationAlignment: "map",
      textPitchAlignment: "map",
      textAllowOverlap: true,
      textIgnorePlacement: true,
      textAnchor: "center",
      textKeepUpright: false,
      visibility: arrowsVisible ? "visible" : "none",
    }),
    [routeColor, colors.surface, isLongRoute, arrowsVisible],
  );

  if (points.length < 2) return null;

  return (
    <ShapeSource id={`route-arrows-${route.id}`} shape={arrowSource}>
      <SymbolLayer id={`route-arrow-layer-${route.id}`} style={arrowStyle} minZoomLevel={7} />
    </ShapeSource>
  );
}
