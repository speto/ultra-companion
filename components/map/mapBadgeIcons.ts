import { POI_CATEGORIES } from "@/constants";
import { WAYPOINT_CATEGORIES } from "@/constants/waypointCategories";

const toHex = (c: number) => c.toString(16).padStart(2, "0");

/** Blend a hex color over white at the given alpha, returning an opaque hex string. */
function tintColor(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const blend = (c: number) => Math.round(c * alpha + 255 * (1 - alpha));
  return `#${toHex(blend(r))}${toHex(blend(g))}${toHex(blend(b))}`;
}
type BadgeVariant = "clean" | "bordered";

export type BadgeSvgMap = Record<string, string>;

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
  ShowerHead: [
    ["path", { d: "m4 4 2.5 2.5" }],
    ["path", { d: "M13.5 6.5a4.95 4.95 0 0 0-7 7" }],
    ["path", { d: "M15 5 5 15" }],
    ["path", { d: "M14 17v.01" }],
    ["path", { d: "M10 16v.01" }],
    ["path", { d: "M13 13v.01" }],
    ["path", { d: "M16 10v.01" }],
    ["path", { d: "M11 20v.01" }],
    ["path", { d: "M17 14v.01" }],
    ["path", { d: "M20 11v.01" }],
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
 * Generates a list-style map badge SVG (32x32) with:
 * - Soft category tint background
 * - Optional border that does not alter icon geometry
 * - Lucide-derived stroke icon in category color
 */
function makeLucideBadgeSvg(color: string, iconName: string, variant: BadgeVariant): string {
  const elements = LUCIDE_ICONS[iconName];
  const iconSvg = elements
    ? lucideToSvgElements(elements, color)
    : // Fallback: MapPin stroke icon
      `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="10" r="3" fill="${color}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

  const border =
    variant === "bordered"
      ? `\n  <circle cx="16" cy="16" r="15.5" fill="none" stroke="${color}" stroke-opacity="0.35" stroke-width="1"/>`
      : "";

  return `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="16" fill="${color}" fill-opacity="0.1"/>${border}
  <g transform="translate(7, 7) scale(0.75)">
    ${iconSvg}
  </g>
</svg>`;
}

/** Generate badge SVGs for all POI categories, keyed by `poi-{categoryKey}` */
export function buildPoiBadgeSvgs(): BadgeSvgMap {
  const svgs: BadgeSvgMap = {};
  for (const cat of POI_CATEGORIES) {
    svgs[`poi-${cat.key}`] = makeLucideBadgeSvg(cat.color, cat.iconName, "clean");
  }
  return svgs;
}

/** Generate clean and bordered badge SVGs for all waypoint categories. */
export function buildWaypointBadgeSvgs(): BadgeSvgMap {
  const svgs: BadgeSvgMap = {};
  for (const cat of WAYPOINT_CATEGORIES) {
    svgs[`wp-${cat.key}`] = makeLucideBadgeSvg(cat.color, cat.iconName, "clean");
    svgs[`wp-${cat.key}-bordered`] = makeLucideBadgeSvg(cat.color, cat.iconName, "bordered");
  }
  return svgs;
}

// ---------------------------------------------------------------------------
// Start / Finish endpoint markers (soft chip family)
// ---------------------------------------------------------------------------

/** Soft green start chip: opaque pale green fill, play-triangle glyph. */
const START_ICON_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="13" fill="${tintColor("#22C55E", 0.2)}"/>
  <circle cx="16" cy="16" r="13" fill="none" stroke="${tintColor("#22C55E", 0.4)}" stroke-width="0.75"/>
  <path d="M13 10L22 16L13 22Z" fill="#22C55E"/>
</svg>`;

/** Soft neutral finish chip: opaque pale neutral fill, checkered pattern. */
const FINISH_ICON_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="13" fill="${tintColor("#1C1A18", 0.12)}"/>
  <circle cx="16" cy="16" r="13" fill="none" stroke="${tintColor("#1C1A18", 0.3)}" stroke-width="0.75"/>
  <g>
    <rect x="9" y="9" width="4.67" height="4.67" fill="#1C1A18"/>
    <rect x="18.33" y="9" width="4.67" height="4.67" fill="#1C1A18"/>
    <rect x="13.67" y="13.67" width="4.67" height="4.67" fill="#1C1A18"/>
    <rect x="9" y="18.33" width="4.67" height="4.67" fill="#1C1A18"/>
    <rect x="18.33" y="18.33" width="4.67" height="4.67" fill="#1C1A18"/>
  </g>
</svg>`;

export const START_ICON_NAME = "route-start-play" as const;
export const FINISH_ICON_NAME = "route-finish-checkered" as const;

export function buildStartFinishBadgeSvgs(): BadgeSvgMap {
  return {
    [START_ICON_NAME]: START_ICON_SVG,
    [FINISH_ICON_NAME]: FINISH_ICON_SVG,
  };
}

// ---------------------------------------------------------------------------
// Distance markers (Strava-like chip)
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
