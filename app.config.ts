import { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Dynamic Expo config. Only PUBLIC values belong in `extra` — anything secret
 * (Gemini, eBay, Supabase service role) lives on the Vercel server, never here.
 * The client only ever talks to the API proxy via EXPO_PUBLIC_API_BASE_URL.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Watch Vault",
  slug: "watch-vault",
  owner: "itzpiyush20",
  scheme: "watchvault",
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
    package: "com.watchvault.app",
    versionCode: 5,
    permissions: ["CAMERA", "VIBRATE"],
    googleServicesFile: "./google-services.json",
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
    "@react-native-firebase/app",
    [
      "expo-camera",
      {
        cameraPermission:
          "Watch Vault uses your camera to scan and identify watches. Images are processed to generate an estimate and are never stored on our servers.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // PUBLIC ONLY. Resolved at build time from EXPO_PUBLIC_* env vars.
    eas: {
      projectId: "ad1630a5-ec2c-4b91-a35d-711c1559986e",
    },
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
    firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
    firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "",
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
    revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "",
    admobAndroidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID ?? "",
    environment: process.env.EXPO_PUBLIC_ENV ?? "development",
  },
});
