import { File, Paths } from "expo-file-system";
import { Share } from "react-native";

/**
 * Sanitizes a string to be used as a safe filename.
 * Replaces invalid characters with underscores and ensures a .gpx extension.
 */
export function getSafeFilename(name: string): string {
  const sanitized = name.replace(/[^a-z0-9.\-_]/gi, "_");
  if (sanitized.toLowerCase().endsWith(".gpx")) {
    return sanitized;
  }
  return `${sanitized}.gpx`;
}

/**
 * Writes GPX content to the cache directory and opens the native share sheet.
 */
export async function shareGPXFile(gpxContent: string, filename: string): Promise<void> {
  const safeFilename = getSafeFilename(filename);
  const file = new File(Paths.cache, safeFilename);

  file.write(gpxContent);

  await Share.share({
    url: file.uri,
    title: safeFilename,
  });
}
