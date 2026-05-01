import {
  Bus,
  Droplets,
  ShoppingCart,
  Fuel,
  Croissant,
  Toilet,
  Tent,
  Dumbbell,
  Landmark,
  School,
} from "lucide-react-native";
import type { ComponentType } from "react";

type POIIconComponent = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

/** Shared icon map for POI categories, keyed by POICategoryMeta.iconName */
export const POI_ICON_MAP: Record<string, POIIconComponent> = {
  Bus,
  Droplets,
  ShoppingCart,
  Fuel,
  Croissant,
  Toilet,
  Tent,
  Dumbbell,
  Landmark,
  School,
};
