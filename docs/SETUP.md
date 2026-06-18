# Setup — Phase 1

## Prerequisites
- Node 18+ (you have 24), npm
- Android Studio + an emulator or a physical device with USB debugging
- A **development build** (Expo Go cannot load the native SDKs we add later:
  AdMob, RevenueCat, Sentry)
- For local `.aab` builds: WSL2 with the Android SDK + JDK 17

## Install
```bash
npm install
# Pin Expo-compatible native versions (authoritative — overrides package.json ranges):
npx expo install --fix
```

## Configure env
```bash
cp .env.example .env
# Fill EXPO_PUBLIC_* (client). Server secrets go in the Vercel dashboard later.
```

## Run (Phase 1 smoke test)
```bash
npm run typecheck          # must pass with zero errors
npx expo prebuild --platform android   # generates ./android via CNG
npm run android            # builds + installs the dev client
```
You should see the dark "The Watch Identifier — Phase 1 · Foundation ready" screen.

## Build a release bundle (documented now, used in Phase 9)
```bash
npx expo prebuild --platform android
cd android && ./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

## Environment variables
See `.env.example`. Rule: anything secret is a **server** var configured in
Vercel — never prefixed `EXPO_PUBLIC_`, never committed.

## What Phase 1 delivers
- Expo CNG project (TS, strict), dark luxury theme, `@/` path alias
- Shared types + Zod schemas, constants (cache TTLs, quotas, disclaimers)
- INR/locale currency formatting
- Runnable themed home screen
- Architecture + setup docs

## Not yet implemented (later phases)
API proxy (2), SQLite/cache (3), camera (4), Supabase auth/sync (5),
results/localization (6), monetization (7), analytics/monitoring (8),
Play Store prep (9).
