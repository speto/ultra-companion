import {
  AlertTriangle,
  Bed,
  Bike,
  CircleDot,
  Coffee,
  Droplets,
  Fuel,
  MapPin,
  Utensils,
  UtensilsCrossed,
} from "lucide-react-native";
import type { ComponentType } from "react";

export type WaypointCategoryKey =
  | "control"
  | "water"
  | "restaurant"
  | "food"
  | "coffee"
  | "fuel"
  | "sleep"
  | "bike"
  | "hazard"
  | "generic";

export interface WaypointCategoryMeta {
  key: WaypointCategoryKey;
  label: string;
  color: string;
  iconName: string;
}

export type WaypointIconComponent = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

export const WAYPOINT_CATEGORIES: WaypointCategoryMeta[] = [
  { key: "control", label: "Control", color: "#F97316", iconName: "CircleDot" },
  { key: "water", label: "Water", color: "#38BDF8", iconName: "Droplets" },
  { key: "restaurant", label: "Restaurant", color: "#EC4899", iconName: "Utensils" },
  { key: "food", label: "Food", color: "#22C55E", iconName: "UtensilsCrossed" },
  { key: "coffee", label: "Coffee", color: "#C08457", iconName: "Coffee" },
  { key: "fuel", label: "Fuel", color: "#F59E0B", iconName: "Fuel" },
  { key: "sleep", label: "Sleep", color: "#8B5CF6", iconName: "Bed" },
  { key: "bike", label: "Bike", color: "#14B8A6", iconName: "Bike" },
  { key: "hazard", label: "Hazard", color: "#EF4444", iconName: "AlertTriangle" },
  { key: "generic", label: "Waypoint", color: "#0D9488", iconName: "MapPin" },
];

export const WAYPOINT_ICON_MAP: Record<string, WaypointIconComponent> = {
  AlertTriangle,
  Bed,
  Bike,
  CircleDot,
  Coffee,
  Droplets,
  Fuel,
  MapPin,
  Utensils,
  UtensilsCrossed,
};

const categoryByKey = new Map(WAYPOINT_CATEGORIES.map((category) => [category.key, category]));

const WAYPOINT_TYPE_ALIASES: Record<string, WaypointCategoryKey> = {
  aid: "control",
  aid_station: "control",
  checkpoint: "control",
  control: "control",
  transition: "control",
  transition_zone: "control",
  water: "water",
  water_source: "water",
  restroom: "water",
  toilet: "water",
  wc: "water",
  bakery: "restaurant",
  food: "restaurant",
  groceries: "food",
  grocery: "food",
  restaurant: "restaurant",
  supermarket: "food",
  cafe: "coffee",
  coffee: "coffee",
  fuel: "fuel",
  gas: "fuel",
  gas_station: "fuel",
  camp: "sleep",
  camp_site: "sleep",
  campsite: "sleep",
  hotel: "sleep",
  lodging: "sleep",
  sleep: "sleep",
  accommodation: "sleep",
  bike: "bike",
  bike_shop: "bike",
  bikeshop: "bike",
  bicycle_shop: "bike",
  alert: "hazard",
  hazard: "hazard",
  warning: "hazard",
};

function normalizeWaypointTypeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function waypointCategoryForType(raw: string | null | undefined): WaypointCategoryKey {
  if (!raw) return "generic";
  return WAYPOINT_TYPE_ALIASES[normalizeWaypointTypeKey(raw)] ?? "generic";
}

export function getWaypointCategoryMeta(raw: string | null | undefined): WaypointCategoryMeta {
  return (
    categoryByKey.get(waypointCategoryForType(raw)) ??
    WAYPOINT_CATEGORIES[WAYPOINT_CATEGORIES.length - 1]
  );
}
