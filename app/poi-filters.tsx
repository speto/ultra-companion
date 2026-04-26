import { router } from "expo-router";
import { POIFilterSheetContent } from "@/components/map/POIFilterBar";

export default function POIFiltersScreen() {
  return <POIFilterSheetContent onClose={() => router.back()} />;
}
