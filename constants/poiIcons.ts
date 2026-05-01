import {
  AlertTriangle,
  Ambulance,
  Bike,
  Bus,
  CircleDot,
  Coffee,
  Droplets,
  ShoppingCart,
  Fuel,
  HeartPulse,
  Hospital,
  Croissant,
  Toilet,
  Tent,
  Dumbbell,
  Landmark,
  Phone,
  Pill,
  School,
  TrainFront,
  Utensils,
  UtensilsCrossed,
  Wrench,
} from "lucide-react-native";
import type { ComponentType } from "react";

type POIIconComponent = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

/** Shared icon map for POI categories, keyed by POICategoryMeta.iconName */
export const POI_ICON_MAP: Record<string, POIIconComponent> = {
  AlertTriangle,
  Ambulance,
  Bike,
  Bus,
  CircleDot,
  Coffee,
  Droplets,
  ShoppingCart,
  Fuel,
  HeartPulse,
  Hospital,
  Croissant,
  Toilet,
  Tent,
  Dumbbell,
  Landmark,
  Phone,
  Pill,
  School,
  TrainFront,
  Utensils,
  UtensilsCrossed,
  Wrench,
};
