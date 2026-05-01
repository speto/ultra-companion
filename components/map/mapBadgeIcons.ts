import { POI_CATEGORIES } from "@/constants";
import { WAYPOINT_CATEGORIES } from "@/constants/waypointCategories";
import { COLORS } from "@/theme/colors";

type MapboxExpression = number | readonly unknown[];

const toHex = (c: number) => c.toString(16).padStart(2, "0");

/** Blend a hex color over white at the given alpha, returning an opaque hex string. */
function tintColor(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const blend = (c: number) => Math.round(c * alpha + 255 * (1 - alpha));
  return `#${toHex(blend(r))}${toHex(blend(g))}${toHex(blend(b))}`;
}

export type BadgeSvgMap = Record<string, string>;

const BADGE_TINT_ALPHA = 0.22;
const BADGE_CANVAS_SIZE = 32;
const BADGE_CENTER = 16;
const BADGE_RADIUS = 13;
const BADGE_STROKE_WIDTH = 0.75;
const BADGE_GLYPH_TRANSFORM = "translate(7, 7) scale(0.75)";
const STARRED_PIP_COLOR = COLORS.light.starred;
const STARRED_PIP_STROKE = "#FFFFFF";

export const MAP_BADGE_ICON_SIZE_EXPR: MapboxExpression = [
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

export const DISTANCE_CHIP_ICON_SIZE: MapboxExpression = 1;

interface BadgeSvgConfig {
  color: string;
  backgroundTintAlpha: number;
  borderTintAlpha: number;
  borderOpacity?: number;
  glyphSvg: string;
  overlaySvg?: string;
}

function makeBadgeSvg({
  color,
  backgroundTintAlpha,
  borderTintAlpha,
  borderOpacity = 1,
  glyphSvg,
  overlaySvg = "",
}: BadgeSvgConfig): string {
  const backgroundColor = tintColor(color, backgroundTintAlpha);
  const borderColor = tintColor(color, borderTintAlpha);

  return `<svg width="${BADGE_CANVAS_SIZE}" height="${BADGE_CANVAS_SIZE}" viewBox="0 0 ${BADGE_CANVAS_SIZE} ${BADGE_CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${BADGE_CENTER}" cy="${BADGE_CENTER}" r="${BADGE_RADIUS}" fill="${backgroundColor}"/>
  <circle cx="${BADGE_CENTER}" cy="${BADGE_CENTER}" r="${BADGE_RADIUS}" fill="none" stroke="${borderColor}" stroke-opacity="${borderOpacity}" stroke-width="${BADGE_STROKE_WIDTH}"/>
  ${glyphSvg}
  ${overlaySvg}
</svg>`;
}

function makeStarredPipSvg(): string {
  return `<path d="M24 4.6l1.67 3.39 3.74.54-2.7 2.63.64 3.72L24 13.12l-3.35 1.76.64-3.72-2.7-2.63 3.74-.54L24 4.6z" fill="${STARRED_PIP_COLOR}" stroke="${STARRED_PIP_STROKE}" stroke-width="1.25" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------------------
// Shared POI / waypoint badge style: list-chip parity
// ---------------------------------------------------------------------------

/**
 * Lucide icon definitions for waypoint categories.
 * Each entry is an array of [elementType, attrs] tuples matching the
 * lucide-react-native icon spec.  We render these as stroke-based SVG
 * elements inside the soft chip.
 *
 * Source: lucide-react-native v1.7.0 (ISC license)
 */
const LUCIDE_ICONS: Record<string, Array<[string, Record<string, string>]>> = {
  Bus: [
    ["path", { d: "M8 6v6" }],
    ["path", { d: "M15 6v6" }],
    ["path", { d: "M2 12h19.6" }],
    [
      "path",
      {
        d: "M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3",
      },
    ],
    ["circle", { cx: "7", cy: "18", r: "2" }],
    ["path", { d: "M9 18h5" }],
    ["circle", { cx: "16", cy: "18", r: "2" }],
  ],
  CircleDot: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["circle", { cx: "12", cy: "12", r: "1" }],
  ],
  Droplets: [
    [
      "path",
      {
        d: "M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z",
      },
    ],
    [
      "path",
      {
        d: "M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97",
      },
    ],
  ],
  Utensils: [
    ["path", { d: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" }],
    ["path", { d: "M7 2v20" }],
    ["path", { d: "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" }],
  ],
  UtensilsCrossed: [
    [
      "path",
      {
        d: "m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8",
      },
    ],
    [
      "path",
      {
        d: "M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7",
      },
    ],
    ["path", { d: "m2.1 21.8 6.4-6.3" }],
    ["path", { d: "m19 5-7 7" }],
  ],
  Coffee: [
    ["path", { d: "M10 2v2" }],
    ["path", { d: "M14 2v2" }],
    [
      "path",
      {
        d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1",
      },
    ],
    ["path", { d: "M6 2v2" }],
  ],
  Croissant: [
    ["path", { d: "M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487" }],
    ["path", { d: "M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132" }],
    ["path", { d: "M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42" }],
    ["path", { d: "M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14" }],
    [
      "path",
      {
        d: "M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676",
      },
    ],
  ],
  Dumbbell: [
    [
      "path",
      {
        d: "M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z",
      },
    ],
    ["path", { d: "m2.5 21.5 1.4-1.4" }],
    ["path", { d: "m20.1 3.9 1.4-1.4" }],
    [
      "path",
      {
        d: "M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z",
      },
    ],
    ["path", { d: "m9.6 14.4 4.8-4.8" }],
  ],
  Fuel: [
    [
      "path",
      {
        d: "M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5",
      },
    ],
    ["path", { d: "M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16" }],
    ["path", { d: "M2 21h13" }],
    ["path", { d: "M3 9h11" }],
  ],
  Landmark: [
    ["path", { d: "M10 18v-7" }],
    [
      "path",
      {
        d: "M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z",
      },
    ],
    ["path", { d: "M14 18v-7" }],
    ["path", { d: "M18 18v-7" }],
    ["path", { d: "M3 22h18" }],
    ["path", { d: "M6 18v-7" }],
  ],
  School: [
    ["path", { d: "M14 21v-3a2 2 0 0 0-4 0v3" }],
    ["path", { d: "M18 4.933V21" }],
    ["path", { d: "m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6" }],
    [
      "path",
      {
        d: "m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11",
      },
    ],
    ["path", { d: "M6 4.933V21" }],
    ["circle", { cx: "12", cy: "9", r: "2" }],
  ],
  ShoppingCart: [
    ["circle", { cx: "8", cy: "21", r: "1" }],
    ["circle", { cx: "19", cy: "21", r: "1" }],
    [
      "path",
      {
        d: "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12",
      },
    ],
  ],
  Toilet: [
    [
      "path",
      {
        d: "M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18",
      },
    ],
    ["path", { d: "M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8" }],
  ],
  Tent: [
    ["path", { d: "M3.5 21 14 3" }],
    ["path", { d: "M20.5 21 10 3" }],
    ["path", { d: "M15.5 21 12 15l-3.5 6" }],
    ["path", { d: "M2 21h20" }],
  ],
  Bed: [
    ["path", { d: "M2 4v16" }],
    ["path", { d: "M2 8h18a2 2 0 0 1 2 2v10" }],
    ["path", { d: "M2 17h20" }],
    ["path", { d: "M6 8v9" }],
  ],
  Bike: [
    ["circle", { cx: "18.5", cy: "17.5", r: "3.5" }],
    ["circle", { cx: "5.5", cy: "17.5", r: "3.5" }],
    ["circle", { cx: "15", cy: "5", r: "1" }],
    ["path", { d: "M12 17.5V14l-3-3 4-3 2 3h2" }],
  ],
  Wrench: [
    [
      "path",
      {
        d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z",
      },
    ],
  ],
  Pill: [
    ["path", { d: "m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" }],
    ["path", { d: "m8.5 8.5 7 7" }],
  ],
  Hospital: [
    ["path", { d: "M12 7v4" }],
    ["path", { d: "M14 21v-3a2 2 0 0 0-4 0v3" }],
    ["path", { d: "M14 9h-4" }],
    ["path", { d: "M18 11h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2" }],
    ["path", { d: "M18 21V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16" }],
  ],
  HeartPulse: [
    [
      "path",
      {
        d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
      },
    ],
    ["path", { d: "M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" }],
  ],
  Phone: [
    [
      "path",
      {
        d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
      },
    ],
  ],
  Ambulance: [
    ["path", { d: "M10 10H6" }],
    ["path", { d: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" }],
    [
      "path",
      {
        d: "M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14",
      },
    ],
    ["path", { d: "M8 8v4" }],
    ["path", { d: "M9 18h6" }],
    ["circle", { cx: "17", cy: "18", r: "2" }],
    ["circle", { cx: "7", cy: "18", r: "2" }],
  ],
  TrainFront: [
    ["path", { d: "M8 3.1V7a4 4 0 0 0 8 0V3.1" }],
    ["path", { d: "m9 15-1-1" }],
    ["path", { d: "m15 15 1-1" }],
    ["path", { d: "M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z" }],
    ["path", { d: "m8 19-2 3" }],
    ["path", { d: "m16 19 2 3" }],
  ],
  AlertTriangle: [
    [
      "path",
      {
        d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      },
    ],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 17h.01" }],
  ],
  Beer: [
    ["path", { d: "M17 11h1a3 3 0 0 1 0 6h-1" }],
    ["path", { d: "M9 12v6" }],
    ["path", { d: "M13 12v6" }],
    [
      "path",
      {
        d: "M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z",
      },
    ],
    ["path", { d: "M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" }],
  ],
  MapPin: [
    [
      "path",
      {
        d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
      },
    ],
    ["circle", { cx: "12", cy: "10", r: "3" }],
  ],
};

/** Convert a Lucide icon definition array to SVG elements inside a group. */
function lucideToSvgElements(
  elements: Array<[string, Record<string, string>]>,
  color: string,
): string {
  return elements
    .map(([type, attrs]) => {
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");

      if (type === "circle") {
        return `<circle ${attrStr} fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      return `<${type} ${attrStr} fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("\n    ");
}

/**
 * Generates a map badge SVG (32x32) using the same inset-chip geometry as
 * start/finish markers, with an opaque category tint background.
 */
function makeLucideBadgeSvg(color: string, iconName: string, starred = false): string {
  const elements = LUCIDE_ICONS[iconName];
  const iconSvg = elements
    ? lucideToSvgElements(elements, color)
    : // Fallback: MapPin stroke icon
      `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="10" r="3" fill="${color}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

  return makeBadgeSvg({
    color,
    backgroundTintAlpha: BADGE_TINT_ALPHA,
    borderTintAlpha: 0.45,
    borderOpacity: 0.9,
    glyphSvg: `<g transform="${BADGE_GLYPH_TRANSFORM}">
    ${iconSvg}
  </g>`,
    overlaySvg: starred ? makeStarredPipSvg() : undefined,
  });
}

/** Generate bordered badge SVGs for all POI categories. */
export function buildPoiBadgeSvgs(): BadgeSvgMap {
  const svgs: BadgeSvgMap = {};
  for (const cat of POI_CATEGORIES) {
    svgs[`poi-${cat.key}`] = makeLucideBadgeSvg(cat.color, cat.iconName);
    svgs[`poi-${cat.key}-starred`] = makeLucideBadgeSvg(cat.color, cat.iconName, true);
  }
  return svgs;
}

/** Generate bordered badge SVGs for all waypoint categories. */
export function buildWaypointBadgeSvgs(): BadgeSvgMap {
  const svgs: BadgeSvgMap = {};
  for (const cat of WAYPOINT_CATEGORIES) {
    svgs[`wp-${cat.key}`] = makeLucideBadgeSvg(cat.color, cat.iconName);
    svgs[`wp-${cat.key}-starred`] = makeLucideBadgeSvg(cat.color, cat.iconName, true);
  }
  return svgs;
}

// ---------------------------------------------------------------------------
// Start / Finish endpoint markers (soft chip family)
// ---------------------------------------------------------------------------

/** Soft green start chip: opaque pale green fill, play-triangle glyph. */
const START_ICON_SVG = makeBadgeSvg({
  color: "#22C55E",
  backgroundTintAlpha: 0.2,
  borderTintAlpha: 0.4,
  glyphSvg: `<path d="M13 10L22 16L13 22Z" fill="#22C55E"/>`,
});

/** Soft neutral finish chip: opaque pale neutral fill, checkered pattern. */
const FINISH_ICON_SVG = makeBadgeSvg({
  color: "#1C1A18",
  backgroundTintAlpha: 0.12,
  borderTintAlpha: 0.3,
  glyphSvg: `<g>
    <rect x="9" y="9" width="4.67" height="4.67" fill="#1C1A18"/>
    <rect x="18.33" y="9" width="4.67" height="4.67" fill="#1C1A18"/>
    <rect x="13.67" y="13.67" width="4.67" height="4.67" fill="#1C1A18"/>
    <rect x="9" y="18.33" width="4.67" height="4.67" fill="#1C1A18"/>
    <rect x="18.33" y="18.33" width="4.67" height="4.67" fill="#1C1A18"/>
  </g>`,
});

export const START_ICON_NAME = "route-start-play" as const;
export const FINISH_ICON_NAME = "route-finish-checkered" as const;

export function buildStartFinishBadgeSvgs(): BadgeSvgMap {
  return {
    [START_ICON_NAME]: START_ICON_SVG,
    [FINISH_ICON_NAME]: FINISH_ICON_SVG,
  };
}

// ---------------------------------------------------------------------------
// Distance marker chips
// ---------------------------------------------------------------------------

/**
 * Generates a distance marker SVG with a rounded black chip and a bottom pointer.
 * The width scales with the text length.
 */
export function makeDistanceMarkerSvg(label: string): string {
  // Approximate Barlow semibold width so every label gets real chip padding.
  const charWidth = 8;
  const textWidth = label.length * charWidth;
  const paddingX = 8;
  const width = Math.max(26, textWidth + paddingX);
  const height = 25;
  const chipHeight = 20;
  const radius = 5;
  const pointerWidth = 7;
  const pointerHeight = 5;

  const centerX = width / 2;

  // Single path for rounded rect + bottom pointer to avoid antialias seams
  const path = `
    M ${radius} 0
    H ${width - radius}
    A ${radius} ${radius} 0 0 1 ${width} ${radius}
    V ${chipHeight - radius}
    A ${radius} ${radius} 0 0 1 ${width - radius} ${chipHeight}
    H ${centerX + pointerWidth / 2}
    L ${centerX} ${chipHeight + pointerHeight}
    L ${centerX - pointerWidth / 2} ${chipHeight}
    H ${radius}
    A ${radius} ${radius} 0 0 1 0 ${chipHeight - radius}
    V ${radius}
    A ${radius} ${radius} 0 0 1 ${radius} 0
    Z
  `
    .trim()
    .replace(/\s+/g, " ");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <path d="${path}" fill="#1C1A18" />
  <text x="${centerX}" y="14.5" font-family="Barlow, sans-serif" font-weight="700" font-size="12" fill="#FFFFFF" text-anchor="middle">${label}</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Distance marker chip backgrounds (for textField overlay rendering)
// ---------------------------------------------------------------------------

const CHIP_PADDING_X = 10;
const CHIP_HEIGHT = 20;
const CHIP_RADIUS = 5;
const CHIP_POINTER_WIDTH = 7;
const CHIP_POINTER_HEIGHT = 5;
const CHAR_WIDTH = 8;

/** Chip size tiers based on label digit count. */
export type DistanceChipSize = "chip-s" | "chip-m" | "chip-l";

/** Calculate chip width for a given number of characters. */
function chipWidthForChars(charCount: number): number {
  return Math.max(26, charCount * CHAR_WIDTH + CHIP_PADDING_X);
}

export const DISTANCE_CHIP_IMAGE_SIZES: Record<
  DistanceChipSize,
  { width: number; height: number }
> = {
  "chip-s": { width: chipWidthForChars(2), height: CHIP_HEIGHT + CHIP_POINTER_HEIGHT },
  "chip-m": { width: chipWidthForChars(3), height: CHIP_HEIGHT + CHIP_POINTER_HEIGHT },
  "chip-l": { width: chipWidthForChars(4), height: CHIP_HEIGHT + CHIP_POINTER_HEIGHT },
};

/** Build the SVG path for a rounded chip with bottom pointer. */
function chipPath(width: number): string {
  const centerX = width / 2;
  return `
    M ${CHIP_RADIUS} 0
    H ${width - CHIP_RADIUS}
    A ${CHIP_RADIUS} ${CHIP_RADIUS} 0 0 1 ${width} ${CHIP_RADIUS}
    V ${CHIP_HEIGHT - CHIP_RADIUS}
    A ${CHIP_RADIUS} ${CHIP_RADIUS} 0 0 1 ${width - CHIP_RADIUS} ${CHIP_HEIGHT}
    H ${centerX + CHIP_POINTER_WIDTH / 2}
    L ${centerX} ${CHIP_HEIGHT + CHIP_POINTER_HEIGHT}
    L ${centerX - CHIP_POINTER_WIDTH / 2} ${CHIP_HEIGHT}
    H ${CHIP_RADIUS}
    A ${CHIP_RADIUS} ${CHIP_RADIUS} 0 0 1 0 ${CHIP_HEIGHT - CHIP_RADIUS}
    V ${CHIP_RADIUS}
    A ${CHIP_RADIUS} ${CHIP_RADIUS} 0 0 1 ${CHIP_RADIUS} 0
    Z
  `
    .trim()
    .replace(/\s+/g, " ");
}

/** Generate a distance marker chip background SVG (no text — text rendered via Mapbox textField). */
function makeChipBackgroundSvg(width: number): string {
  const totalHeight = CHIP_HEIGHT + CHIP_POINTER_HEIGHT;
  return `<svg width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
  <path d="${chipPath(width)}" fill="#1C1A18" />
</svg>`;
}

/** Build all chip background SVGs keyed by size tier. */
export function buildDistanceChipBackgrounds(): Record<DistanceChipSize, string> {
  return {
    "chip-s": makeChipBackgroundSvg(DISTANCE_CHIP_IMAGE_SIZES["chip-s"].width),
    "chip-m": makeChipBackgroundSvg(DISTANCE_CHIP_IMAGE_SIZES["chip-m"].width),
    "chip-l": makeChipBackgroundSvg(DISTANCE_CHIP_IMAGE_SIZES["chip-l"].width),
  };
}

/** Mapbox expression to select the right chip size based on markerLabel length. */
export const CHIP_SIZE_EXPR = [
  "match",
  ["length", ["to-string", ["get", "markerLabel"]]],
  1,
  "chip-s",
  2,
  "chip-s",
  3,
  "chip-m",
  "chip-l",
] as const;
