import { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Dynamic Expo config. Only PUBLIC values belong in `extra` — anything secret
 * (Gemini, eBay, Supabase service role) lives on the Vercel server, never here.
 * The client only ever talks to the API proxy via EXPO_PUBLIC_API_BASE_URL.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "The Watch Identifier",
  slug: "watch-identifier",
  scheme: "watchid",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  icon: "./assets/adaptive-icon.png",
  splash: {
    image: "./assets/adaptive-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0B0B0C",
  },
  android: {
    package: "com.watchidentifier.app",
    versionCode: 5,
    permissions: ["CAMERA", "VIBRATE"],
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0B0B0C",
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-asset",
    "expo-sqlite",
    "expo-font",
    [
      "expo-camera",
      {
        cameraPermission:
          "The Watch Identifier uses your camera to scan and identify watches. Images are processed to generate an estimate and are never stored on our servers.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // PUBLIC ONLY. Resolved at build time from EXPO_PUBLIC_* env vars.
    eas: {
      projectId: "cd0f7efe-f653-4b6f-9c2f-3b04b1b99198",
    },
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "",
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
    revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "",
    admobAndroidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID ?? "",
    environment: process.env.EXPO_PUBLIC_ENV ?? "development",
  },
});
