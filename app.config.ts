import { ExpoConfig, ConfigContext } from "expo/config";

const appName = process.env.EXPO_APP_NAME ?? "Ultra Companion";
const appSlug = process.env.EXPO_APP_SLUG ?? "ultra-companion";
const appScheme = process.env.EXPO_APP_SCHEME ?? "ultra";
const androidPackage = process.env.EXPO_ANDROID_PACKAGE ?? "com.ultra.companion";
const iosBundleIdentifier = process.env.EXPO_IOS_BUNDLE_IDENTIFIER ?? "com.conqeror.ultracompanion";
const easProjectId = process.env.EXPO_EAS_PROJECT_ID;

export default (_: ConfigContext): ExpoConfig => ({
  name: appName,
  slug: appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: appScheme,
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0E0E0C",
  },
  android: {
    package: androidPackage,
    adaptiveIcon: {
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: iosBundleIdentifier,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Ultra Companion needs your location to show your position on the map during rides.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Ultra Companion uses background location to track your position during ultra-distance rides.",
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: "GPX File",
          CFBundleTypeRole: "Viewer",
          LSHandlerRank: "Alternate",
          LSItemContentTypes: ["com.topografix.gpx"],
        },
        {
          CFBundleTypeName: "KML File",
          CFBundleTypeRole: "Viewer",
          LSHandlerRank: "Alternate",
          LSItemContentTypes: ["com.google.earth.kml"],
        },
      ],
      UTImportedTypeDeclarations: [
        {
          UTTypeIdentifier: "com.topografix.gpx",
          UTTypeDescription: "GPX File",
          UTTypeConformsTo: ["public.xml"],
          UTTypeTagSpecification: {
            "public.filename-extension": ["gpx"],
            "public.mime-type": ["application/gpx+xml"],
          },
        },
        {
          UTTypeIdentifier: "com.google.earth.kml",
          UTTypeDescription: "KML File",
          UTTypeConformsTo: ["public.xml"],
          UTTypeTagSpecification: {
            "public.filename-extension": ["kml"],
            "public.mime-type": ["application/vnd.google-earth.kml+xml"],
          },
        },
      ],
    },
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "@rnmapbox/maps",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Ultra Companion needs your location to show your position on the map during rides.",
        locationAlwaysAndWhenInUsePermission:
          "Ultra Companion uses background location to track your position during ultra-distance rides.",
      },
    ],
    "expo-sqlite",
    "./plugins/withShareSheetImport",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
});
