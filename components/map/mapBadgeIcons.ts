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
// ---------------------------------------------------------------------------
// POI badge style (unchanged): saturated fill + white glyph
// ---------------------------------------------------------------------------

/**
 * Generates a circular badge SVG (24x24) with:
 * - White outer ring (border)
 * - Colored fill circle
 * - White glyph icon inside
 */
function makeBadgeSvg(color: string, iconContent: string): string {
  return `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="11.5" fill="white"/>
  <circle cx="12" cy="12" r="10" fill="${color}"/>
  ${iconContent}
</svg>`;
}

// Simple white glyph shapes for 24x24 viewBox, centered at (12,12).
// Designed for visibility at 12-20px rendered size. Bold fills preferred over thin strokes.
const GLYPHS: Record<string, string> = {
  // Teardrop
  Droplets: `<path d="M12 5C12 5 7 10.5 7 14.5C7 17.2 9.2 19.5 12 19.5C14.8 19.5 17 17.2 17 14.5C17 10.5 12 5 12 5Z" fill="white"/>`,

  // Bag with handle
  ShoppingCart: `<rect x="8" y="10" width="8" height="8" rx="1" fill="white"/><path d="M10 10V8C10 6.5 14 6.5 14 8V10" fill="none" stroke="white" stroke-width="2"/>`,

  // Pump body + nozzle
  Fuel: `<rect x="7" y="5" width="7" height="13" rx="1" fill="white"/><path d="M14.5 7.5L17 10V14.5" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`,

  // Arch/crescent (bread shape)
  Croissant: `<path d="M7 15C7 11 9 8 12 8C15 8 17 11 17 15C15.5 13 14 12 12 12C10 12 8.5 13 7 15Z" fill="white"/>`,

  // Circle head + three falling drops
  ShowerHead: `<circle cx="12" cy="8.5" r="3" fill="white"/><circle cx="9.5" cy="15" r="1.3" fill="white"/><circle cx="12" cy="17.5" r="1.3" fill="white"/><circle cx="14.5" cy="15" r="1.3" fill="white"/>`,

  // Triangle
  Tent: `<path d="M5.5 18L12 7L18.5 18Z" fill="white"/>`,

  // Rounded rectangle
  Bus: `<rect x="6" y="7" width="12" height="10" rx="2.5" fill="white"/>`,

  // Two weights + bar
  Dumbbell: `<rect x="4.5" y="10" width="4" height="4" rx="1" fill="white"/><rect x="15.5" y="10" width="4" height="4" rx="1" fill="white"/><rect x="8" y="11.25" width="8" height="1.5" rx="0.5" fill="white"/>`,

  // Solid triangle
  Landmark: `<path d="M12 6L6 18H18L12 6Z" fill="white"/>`,

  // Building with peaked roof
  School: `<rect x="6" y="11" width="12" height="7" rx="0.5" fill="white"/><path d="M5 11L12 6L19 11H5Z" fill="white"/>`,

  // Ring + dot (target)
  CircleDot: `<circle cx="12" cy="12" r="5" fill="none" stroke="white" stroke-width="2.2"/><circle cx="12" cy="12" r="2" fill="white"/>`,

  // Fork + knife, kept parallel so it reads as cutlery instead of an X at map size.
  Utensils: `<path d="M8 6V18" stroke="white" stroke-width="1.8" stroke-linecap="round"/><path d="M6.2 6V10.2C6.2 11.2 7 12 8 12C9 12 9.8 11.2 9.8 10.2V6" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round"/><path d="M15.2 6C16.3 7.4 16.6 9.1 16.1 11L15.6 12.7H14.2L14.8 6H15.2Z" fill="white"/><rect x="14.2" y="12" width="1.5" height="6" rx="0.75" fill="white"/>`,

  // Fallback food glyph for generic food/resupply types.
  UtensilsCrossed: `<path d="M8 6V18" stroke="white" stroke-width="1.8" stroke-linecap="round"/><path d="M6.2 6V10.2C6.2 11.2 7 12 8 12C9 12 9.8 11.2 9.8 10.2V6" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round"/><path d="M15.2 6C16.3 7.4 16.6 9.1 16.1 11L15.6 12.7H14.2L14.8 6H15.2Z" fill="white"/><rect x="14.2" y="12" width="1.5" height="6" rx="0.75" fill="white"/>`,

  // Cup shape
  Coffee: `<path d="M7 8H14V16C14 17.5 12.5 18 10.5 18C8.5 18 7 17.5 7 16V8Z" fill="white"/>`,

  // Mattress + headboard
  Bed: `<rect x="5" y="12" width="14" height="5" rx="1" fill="white"/><rect x="5.5" y="9.5" width="3" height="5" rx="1" fill="white"/>`,

  // Two wheels + frame
  Bike: `<circle cx="8" cy="14" r="3" fill="none" stroke="white" stroke-width="1.8"/><circle cx="16" cy="14" r="3" fill="none" stroke="white" stroke-width="1.8"/><path d="M8 14L12 9L16 14" stroke="white" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`,

  // Outline triangle + exclamation
  AlertTriangle: `<path d="M12 5L21 18H3L12 5Z" fill="none" stroke="white" stroke-width="2" stroke-linejoin="round"/><line x1="12" y1="10" x2="12" y2="14" stroke="white" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.2" fill="white"/>`,

  // Pin drop
  MapPin: `<path d="M12 2C8.7 2 6 4.7 6 8C6 12.5 12 19 12 19C12 19 18 12.5 18 8C18 4.7 15.3 2 12 2Z" fill="white"/>`,
};

export type BadgeSvgMap = Record<string, string>;

/** Generate badge SVGs for all POI categories, keyed by `poi-{categoryKey}` */
export function buildPoiBadgeSvgs(): BadgeSvgMap {
  const svgs: BadgeSvgMap = {};
  for (const cat of POI_CATEGORIES) {
    const glyph = GLYPHS[cat.iconName] ?? GLYPHS.MapPin;
    svgs[`poi-${cat.key}`] = makeBadgeSvg(cat.color, glyph);
  }
  return svgs;
}

// ---------------------------------------------------------------------------
// Waypoint badge style: soft tinted chip + category-colored Lucide glyph
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
        // Small circles (r <= 1.5) are dots — fill them with the category color.
        // Larger circles are outlines — stroke only.
        const r = parseFloat(attrs.r ?? "0");
        const fillRule = r <= 1.5 ? `fill="${color}"` : 'fill="none"';
        return `<circle ${attrStr} ${fillRule} stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      // Default: path
      return `<path ${attrStr} fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("\n    ");
}

/**
 * Generates a soft-chip waypoint badge SVG (32x32) with:
 * - Opaque tinted fill circle (category color pre-blended over white)
 * - Thin category-colored border ring
 * - Lucide-derived stroke icon in category color
 */
function makeWaypointBadgeSvg(color: string, iconName: string): string {
  const elements = LUCIDE_ICONS[iconName];
  const iconSvg = elements
    ? lucideToSvgElements(elements, color)
    : // Fallback: MapPin stroke icon
      `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="10" r="3" fill="${color}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

  const fill = tintColor(color, 0.2);
  const stroke = tintColor(color, 0.4);

  return `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="13" fill="${fill}"/>
  <circle cx="16" cy="16" r="13" fill="none" stroke="${stroke}" stroke-width="0.75"/>
  <g transform="translate(7, 7) scale(0.75)">
    ${iconSvg}
  </g>
</svg>`;
}

/** Generate badge SVGs for all waypoint categories, keyed by `wp-{categoryKey}` */
export function buildWaypointBadgeSvgs(): BadgeSvgMap {
  const svgs: BadgeSvgMap = {};
  for (const cat of WAYPOINT_CATEGORIES) {
    svgs[`wp-${cat.key}`] = makeWaypointBadgeSvg(cat.color, cat.iconName);
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
