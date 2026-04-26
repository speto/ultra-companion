import type { POI } from "@/types";

const MAPY_TAG_KEYS = ["mapy_url", "mapy:cz:url", "mapy:com:url", "mapy.com", "mapy.cz"];

function encode(value: string): string {
  return encodeURIComponent(value);
}

export function buildAppleMapsUrl(poi: POI): string {
  const label = poi.name ? `&q=${encode(poi.name)}` : "";
  return `https://maps.apple.com/?ll=${poi.latitude},${poi.longitude}${label}`;
}

export function buildGoogleMapsUrl(poi: POI): string {
  const query = poi.name
    ? `${poi.name} ${poi.latitude},${poi.longitude}`
    : `${poi.latitude},${poi.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encode(query)}`;
}

export function getCuratedMapyUrl(tags: Record<string, string>): string | null {
  for (const key of MAPY_TAG_KEYS) {
    const value = tags[key];
    if (value?.startsWith("http")) return value;
  }

  const website = tags.website ?? tags.url;
  if (website?.includes("mapy.")) return website;
  return null;
}

export function buildMapyUrl(poi: POI): string {
  const curated = getCuratedMapyUrl(poi.tags);
  if (curated) return curated;

  if (poi.name) {
    return `https://mapy.com/fnc/v1/search?query=${encode(poi.name)}&x=${poi.longitude}&y=${poi.latitude}&z=17`;
  }

  return `https://mapy.com/fnc/v1/showmap?x=${poi.longitude}&y=${poi.latitude}&z=17`;
}

export function buildMapyActionLabel(): string {
  return "Mapy (online)";
}

export function buildPhoneUrl(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/(?!^\+)\D/g, "");
  return normalized ? `tel:${normalized}` : null;
}

export function shouldPromoteMapy(poi: POI): boolean {
  if (poi.category === "shelter") return true;
  if (poi.category !== "water") return false;
  return poi.tags.natural === "spring" || poi.tags.water === "spring";
}
