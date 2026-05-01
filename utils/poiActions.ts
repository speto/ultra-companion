import type { ShowLocationProps } from "react-native-map-link";
import type { POI } from "@/types";

const ADDRESS_TAG_KEYS = [
  "formatted_address",
  "addr:street",
  "addr:housenumber",
  "addr:city",
  "addr:postcode",
  "addr:country",
];
const PHONE_TAG_KEYS = ["phone", "contact:phone"];
const EXTRA_DETAIL_TAGS: Array<{ key: string; label: string }> = [
  { key: "operator", label: "Operator" },
  { key: "brand", label: "Brand" },
  { key: "website", label: "Website" },
  { key: "contact:website", label: "Website" },
  { key: "url", label: "Website" },
  { key: "description", label: "Details" },
  { key: "description:en", label: "Details" },
  { key: "note", label: "Note" },
  { key: "fee", label: "Fee" },
  { key: "wheelchair", label: "Wheelchair" },
  { key: "drinking_water", label: "Drinking water" },
];

export const POI_MAP_APPS_WHITE_LIST = ["apple-maps", "google-maps", "mapycz"] as const;

export interface PoiDetailField {
  label: string;
  value: string;
}

function cleanTagValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildPoiMapLinkPayload(poi: POI): ShowLocationProps {
  const title = poi.name ?? "Selected POI";
  const googlePlaceId = poi.source === "google" ? cleanTagValue(poi.sourceId) : null;
  return {
    latitude: poi.latitude,
    longitude: poi.longitude,
    title,
    dialogTitle: "Open in Maps",
    dialogMessage: "Choose an installed map app for this POI.",
    cancelText: "Cancel",
    appsWhiteList: [...POI_MAP_APPS_WHITE_LIST],
    googleForceLatLon: !googlePlaceId,
    ...(googlePlaceId ? { googlePlaceId } : {}),
  };
}

export function buildPhoneUrl(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/(?!^\+)\D/g, "");
  return normalized ? `tel:${normalized}` : null;
}

export function getPoiAddress(poi: POI): string | null {
  const t = poi.tags;
  const formatted = cleanTagValue(t.formatted_address);
  if (formatted) return formatted;

  const street = cleanTagValue(t["addr:street"]);
  const houseNumber = cleanTagValue(t["addr:housenumber"]);
  const city = cleanTagValue(t["addr:city"]);
  const postcode = cleanTagValue(t["addr:postcode"]);
  const country = cleanTagValue(t["addr:country"]);

  const parts: string[] = [];
  if (street) parts.push(`${street}${houseNumber ? ` ${houseNumber}` : ""}`);
  if (postcode || city) parts.push([postcode, city].filter(Boolean).join(" "));
  if (country) parts.push(country);

  return parts.length > 0 ? parts.join(", ") : null;
}

export function getPoiPhone(poi: POI): string | null {
  for (const key of PHONE_TAG_KEYS) {
    const value = cleanTagValue(poi.tags[key]);
    if (value) return value;
  }
  return null;
}

export function getPoiExtraDetailFields(poi: POI): PoiDetailField[] {
  const seenLabels = new Set<string>();
  const fields: PoiDetailField[] = [];

  for (const { key, label } of EXTRA_DETAIL_TAGS) {
    const value = cleanTagValue(poi.tags[key]);
    if (!value || seenLabels.has(label)) continue;
    fields.push({ label, value });
    seenLabels.add(label);
  }

  return fields;
}

export function hasExpandablePoiDetails(poi: POI): boolean {
  if (cleanTagValue(poi.tags.opening_hours)) return true;
  if (getPoiAddress(poi)) return true;
  if (getPoiPhone(poi)) return true;
  if (getPoiExtraDetailFields(poi).length > 0) return true;

  return ADDRESS_TAG_KEYS.some((key) => Boolean(cleanTagValue(poi.tags[key])));
}
