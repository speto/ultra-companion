import type { ExpoConfig, ConfigContext } from "expo/config";

type AppVariant = "development" | "preview" | "production";

type VariantSettings = {
  assetSuffix: string;
  identifierSuffix: string;
  nameSuffix: string;
};

const variantSettings: Record<AppVariant, VariantSettings> = {
  development: {
    assetSuffix: "-dev",
    identifierSuffix: ".dev",
    nameSuffix: " Dev",
  },
  preview: {
    assetSuffix: "-preview",
    identifierSuffix: ".preview",
    nameSuffix: " Preview",
  },
  production: {
    assetSuffix: "",
    identifierSuffix: "",
    nameSuffix: "",
  },
};

const appVariant = getAppVariant();
const variantConfig = variantSettings[appVariant];

const baseAppName = process.env.EXPO_APP_NAME ?? "Ultra Companion";
const appName = `${baseAppName}${variantConfig.nameSuffix}`;
const appSlug = process.env.EXPO_APP_SLUG ?? "ultra-companion";
const baseAppScheme = process.env.EXPO_APP_SCHEME ?? "ultra";
const appScheme = `${baseAppScheme}${variantConfig.assetSuffix}`;
const androidPackage = process.env.EXPO_ANDROID_PACKAGE ?? "com.ultra.companion";
const baseIosBundleIdentifier =
  process.env.EXPO_IOS_BUNDLE_IDENTIFIER ?? "com.conqeror.ultracompanion";
const iosBundleIdentifier = `${baseIosBundleIdentifier}${variantConfig.identifierSuffix}`;
const appIcon = process.env.EXPO_APP_ICON ?? `./assets/images/icon${variantConfig.assetSuffix}.png`;
const splashImage =
  process.env.EXPO_SPLASH_IMAGE ?? `./assets/images/splash-icon${variantConfig.assetSuffix}.png`;
const splashBackgroundColor = process.env.EXPO_SPLASH_BACKGROUND_COLOR ?? "#0E0E0C";
const easProjectId = process.env.EXPO_EAS_PROJECT_ID;

function getAppVariant(): AppVariant {
  const variant = process.env.APP_VARIANT ?? "production";

  if (variant === "development" || variant === "preview" || variant === "production") {
    return variant;
  }

  throw new Error(
    `Invalid APP_VARIANT "${variant}". Expected "development", "preview", or "production".`,
  );
}

export default (_: ConfigContext): ExpoConfig => ({
  name: appName,
  slug: appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: appIcon,
  scheme: appScheme,
  userInterfaceStyle: "automatic",
  splash: {
    image: splashImage,
    resizeMode: "contain",
    backgroundColor: splashBackgroundColor,
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
    icon: appIcon,
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
    [
      "expo-splash-screen",
      {
        image: splashImage,
        imageWidth: 200,
        backgroundColor: splashBackgroundColor,
      },
    ],
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
    appVariant,
    mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
});
