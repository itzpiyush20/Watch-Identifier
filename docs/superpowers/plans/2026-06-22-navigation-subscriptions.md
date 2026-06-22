# Navigation, Profile/Settings, and Subscription Tiers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the app into a tab-based shell (Home/Scan/Profile) with Settings, legal pages, and account deletion, then add a real (payment-stubbed) 5-tier subscription/trial system that gates scan volume and portfolio history retention — exactly as approved in `docs/superpowers/specs/2026-06-22-navigation-subscriptions-design.md`.

**Architecture:** Part A builds the navigation shell and Settings/legal/account-deletion screens — independently shippable and testable. Part B adds the `subscriptions` table (with an auth-trigger-provisioned 7-day trial), a server tier-resolution helper that replaces the old binary `isPremiumUser` stub, a new `GET /api/entitlement` read endpoint, and wires tier-aware quota limits + portfolio retention filtering + a stubbed paywall screen on top of the Part A shell.

**Tech Stack:** `expo-router` Tabs, `@expo/vector-icons` (Ionicons), existing Supabase REST + Redis (Upstash) patterns, existing local SQLite migration system.

**Testing note (same deviation as the Phase 8 plan):** This repo has no automated test framework in active use (`jest --passWithNoTests`, zero `*.test.ts` files). Each task ends with a manual verification step instead of a unit test. `npx tsc --noEmit` is run after every code task as the automated gate.

---

## PART A — Navigation shell, Profile, Settings, legal, account deletion

### Task A1: Local `preferences` table (SQLite migration v2)

**Files:**
- Modify: `src/database/migrations.ts`
- Create: `src/database/repositories/preferencesRepo.ts`
- Modify: `src/database/index.ts`

- [ ] **Step 1: Add migration version 2**

In `src/database/migrations.ts`, add a second entry to the `MIGRATIONS` array
(after the existing version-1 entry, inside the array, before the closing
`];`):

```typescript
  {
    version: 2,
    async up(db) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS preferences (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
```

- [ ] **Step 2: Write the preferences repository**

```typescript
import type { SQLiteDatabase } from "expo-sqlite";

export async function getPreference(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?;",
    [key]
  );
  return row?.value ?? null;
}

export async function setPreference(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
    [key, value]
  );
}
```

Save as `src/database/repositories/preferencesRepo.ts`.

- [ ] **Step 3: Export it**

In `src/database/index.ts`, add:

```typescript
export * from "./repositories/preferencesRepo";
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run the app (it will run the migration on next DB open — delete and
reinstall the Expo Go app data, or just trust the existing
`runMigrations`/`schema_migrations` version-tracking logic to apply only
the new version-2 migration on top of an already-migrated v1 database).
No visible UI yet — this is verified indirectly in Task A4.

- [ ] **Step 6: Commit**

```bash
git add src/database/migrations.ts src/database/repositories/preferencesRepo.ts src/database/index.ts
git commit -m "Add local preferences table for region/currency persistence"
```

---

### Task A2: `useCountryCode` hook and region constants

**Files:**
- Create: `src/hooks/useCountryCode.ts`
- Modify: `src/constants/index.ts`

- [ ] **Step 1: Add a `REGIONS` constant and remove the stale `QUOTA` constant**

In `src/constants/index.ts`, replace:

```typescript
export const QUOTA = {
  FREE_SCANS_PER_DAY: 3,
  WINDOW_MS: 24 * 60 * 60 * 1000,
} as const;
```

with (this constant is unused anywhere in the codebase and is now actively
misleading once Task B-series makes scan limits tier-dependent server-side):

```typescript
export interface RegionOption {
  code: string;
  label: string;
  currencySymbol: string;
}

/** Mirrors the 4 regions defined server-side in api/_lib/regions.ts. */
export const REGIONS: RegionOption[] = [
  { code: "IN", label: "India", currencySymbol: "₹" },
  { code: "US", label: "United States", currencySymbol: "$" },
  { code: "GB", label: "United Kingdom", currencySymbol: "£" },
  { code: "DE", label: "Germany", currencySymbol: "€" },
];
```

- [ ] **Step 2: Write the hook**

```typescript
import { useState, useEffect, useCallback } from "react";
import { getPreference, setPreference } from "@/database";
import { useDatabase } from "./useDatabase";

const KEY = "country_code";
const DEFAULT_COUNTRY = "IN";

interface UseCountryCodeReturn {
  countryCode: string;
  setCountryCode: (code: string) => Promise<void>;
  loading: boolean;
}

export function useCountryCode(): UseCountryCodeReturn {
  const { db } = useDatabase();
  const [countryCode, setCode] = useState(DEFAULT_COUNTRY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    let active = true;
    getPreference(db, KEY).then((value) => {
      if (active) {
        setCode(value ?? DEFAULT_COUNTRY);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [db]);

  const setCountryCode = useCallback(
    async (code: string) => {
      if (!db) return;
      await setPreference(db, KEY, code);
      setCode(code);
    },
    [db]
  );

  return { countryCode, setCountryCode, loading };
}
```

Save as `src/hooks/useCountryCode.ts`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `QUOTA` was imported anywhere, this step will
surface it — grep confirmed zero usages before writing this plan.)

- [ ] **Step 4: Commit**

```bash
git add src/constants/index.ts src/hooks/useCountryCode.ts
git commit -m "Add useCountryCode hook and REGIONS constant for Settings"
```

---

### Task A3: Wire `useCountryCode` into `ScanScreen`

**Files:**
- Modify: `src/screens/ScanScreen.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { useCountryCode } from "@/hooks/useCountryCode";
```

- [ ] **Step 2: Use the stored country code instead of the hardcoded one**

Replace:

```typescript
  const { session, user } = useAuth();
  const { save: saveToPortfolio } = usePortfolio(user?.id);
```

with:

```typescript
  const { session, user } = useAuth();
  const { countryCode } = useCountryCode();
  const { save: saveToPortfolio } = usePortfolio(user?.id);
```

Replace:

```typescript
        const result = await identifyWatch({
          imageBase64: processedFront.base64,
          imageBase64Back: processedBack?.base64,
          countryCode: "IN", // TODO Phase 6: resolve from expo-localization
          accessToken: session?.access_token,
          userId: user?.id,
        });
```

with:

```typescript
        const result = await identifyWatch({
          imageBase64: processedFront.base64,
          imageBase64Back: processedBack?.base64,
          countryCode,
          accessToken: session?.access_token,
          userId: user?.id,
        });
```

Add `countryCode` to the `runPipeline` `useCallback` dependency array — find:

```typescript
    [scanCache, setResult, router, session, user, saveToPortfolio, resetCapture]
```

and replace with:

```typescript
    [scanCache, setResult, router, session, user, saveToPortfolio, resetCapture, countryCode]
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ScanScreen.tsx
git commit -m "Use stored region preference instead of hardcoded countryCode"
```

---

### Task A4: Tab navigation shell

**Files:**
- Create: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/scan-tab.tsx`
- Modify: `app/(tabs)/index.tsx` (moved from `app/index.tsx`)
- Delete: `app/index.tsx`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Install Ionicons at the correct Expo SDK version**

Run: `npx expo install @expo/vector-icons`
Expected: `@expo/vector-icons` added to `dependencies` in `package.json`.

- [ ] **Step 2: Move the Home screen into the tab group**

Move the entire current contents of `app/index.tsx` to a new file
`app/(tabs)/index.tsx` unchanged, **except** remove the "Log Out" button
(it moves to Profile in Task A5). Specifically, in the moved file:

Remove the import line:

```typescript
import { useAuth } from "@/hooks/useAuth";
```

Replace:

```typescript
  const { user, signOut } = useAuth();
  const { entries, loading } = usePortfolio(user?.id);
```

with:

```typescript
  const { entries, loading } = usePortfolio(user?.id);
```

(this requires keeping a way to get `user?.id` — replace the removed
`useAuth` import with the existing one already needed; check the current
`app/index.tsx` top of file: it does NOT otherwise import `useAuth`
separately, so re-add the import but only destructure `user`):

```typescript
import { useAuth } from "@/hooks/useAuth";
```

```typescript
  const { user } = useAuth();
  const { entries, loading } = usePortfolio(user?.id);
```

Then remove the entire "Log Out" JSX block:

```typescript
        {user && (
          <Pressable style={styles.signOutBtn} onPress={signOut}>
            <Text style={styles.signOutBtnText}>Log Out</Text>
          </Pressable>
        )}
```

and remove its now-unused styles `signOutBtn` and `signOutBtnText` from the
`styles` object at the bottom of the file. Delete the original
`app/index.tsx` once `app/(tabs)/index.tsx` has these edits applied.

- [ ] **Step 3: Create the inert Scan tab route**

```typescript
import { View } from "react-native";

/** Never actually rendered — the Scan tab intercepts tabPress and pushes
 *  /scan instead (see app/(tabs)/_layout.tsx). This file only exists so
 *  expo-router has a route to register the tab against. */
export default function ScanTabPlaceholder() {
  return <View />;
}
```

Save as `app/(tabs)/scan-tab.tsx`.

- [ ] **Step 4: Create the tab layout**

```typescript
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

export default function TabsLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan-tab"
        options={{
          title: "Scan",
          tabBarIcon: ({ color, size }) => <Ionicons name="camera" size={size} color={color} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push("/scan");
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

Save as `app/(tabs)/_layout.tsx`.

- [ ] **Step 5: Update the root Stack**

In `app/_layout.tsx`, replace:

```typescript
      <Stack.Screen name="index" options={{ title: "The Watch Identifier" }} />
      <Stack.Screen
        name="scan"
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="results"
        options={{ title: "Result", headerBackTitle: "Scan" }}
      />
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/signup" options={{ headerShown: false }} />
```

with:

```typescript
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="scan"
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="results"
        options={{ title: "Result", headerBackTitle: "Scan" }}
      />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="subscription" options={{ title: "Upgrade" }} />
      <Stack.Screen name="legal/privacy-policy" options={{ title: "Privacy Policy" }} />
      <Stack.Screen name="legal/terms" options={{ title: "Terms of Service" }} />
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/signup" options={{ headerShown: false }} />
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Task A5/A6 below create `profile.tsx`, `settings.tsx`,
`subscription.tsx`, and the `legal/` screens — until those exist, the route
*names* referenced above are just strings to expo-router and won't fail
`tsc`, but the app will 404 on those routes until those tasks land. Do not
skip ahead in execution order.)

- [ ] **Step 7: Manual verification**

Run the app. Confirm: a bottom tab bar appears with Home/Scan/Profile (a
placeholder/blank Profile screen is fine for now — built in Task A5).
Confirm tapping "Scan" still opens the exact same full-screen camera UI as
before (slide-from-bottom, no header, no tab bar visible while scanning).
Confirm Home shows the same portfolio grid as before, minus the "Log Out"
button.

- [ ] **Step 8: Commit**

```bash
git add app/(tabs) app/_layout.tsx
git rm app/index.tsx
git commit -m "Replace flat Stack with Home/Scan/Profile tab navigation"
```

---

### Task A5: Profile screen (shell, no entitlement data yet)

**Files:**
- Create: `app/(tabs)/profile.tsx`

- [ ] **Step 1: Write the screen**

```typescript
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";
import { colors, spacing, typography, radius } from "@/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.kicker}>ACCOUNT</Text>
        <Text style={styles.email}>{user?.email ?? "—"}</Text>
      </View>

      <Pressable style={styles.row} onPress={() => router.push("/subscription")}>
        <Text style={styles.rowLabel}>Upgrade</Text>
        <Text style={styles.rowChevron}>›</Text>
      </Pressable>

      <Pressable style={styles.row} onPress={() => router.push("/settings")}>
        <Text style={styles.rowLabel}>Settings</Text>
        <Text style={styles.rowChevron}>›</Text>
      </Pressable>

      <Pressable style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutBtnText}>Sign Out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  kicker: { ...typography.label, color: colors.goldMuted, fontSize: 10, letterSpacing: 1 },
  email: { ...typography.title, color: colors.textPrimary, fontSize: 20 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowChevron: { ...typography.body, color: colors.textTertiary, fontSize: 18 },
  signOutBtn: {
    marginTop: spacing.lg,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  signOutBtnText: { ...typography.label, color: colors.danger },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Open the Profile tab. Confirm it shows the logged-in email, an "Upgrade"
row, a "Settings" row (both will 404 until Tasks A6/B6 land — fine to leave
the routes pending in this commit per the plan's intended order, OR run
Task A6 immediately after this one before testing taps), and a working
"Sign Out" button that returns to the login screen.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/profile.tsx
git commit -m "Add Profile screen with account info and navigation rows"
```

---

### Task A6: Settings screen (region picker, version, legal links — no account deletion yet)

**Files:**
- Create: `app/settings.tsx`
- Create: `app/legal/privacy-policy.tsx`
- Create: `app/legal/terms.tsx`

- [ ] **Step 1: Write the Privacy Policy content**

```typescript
import React from "react";
import { ScrollView, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "@/theme";

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>What we collect</Text>
        <Text style={styles.body}>
          When you create an account, we store your email address via
          Supabase Authentication. When you scan a watch, we store the
          identified brand, model, reference number, estimated value, and
          confidence score in your portfolio — both locally on your device
          and, if you are signed in, synced to our cloud database so your
          collection follows you across devices.
        </Text>

        <Text style={styles.heading}>What we never store</Text>
        <Text style={styles.body}>
          Photos you capture or upload are processed to generate an
          identification result and are not retained on our servers or by
          our AI identification provider afterward. The photo file itself
          stays only on your device — it is never included in the cloud
          sync of your portfolio.
        </Text>

        <Text style={styles.heading}>Third parties</Text>
        <Text style={styles.body}>
          To identify a watch, the photo is sent securely to our AI
          identification provider solely to generate a result. To estimate
          market value, the identified brand/model (text only — never the
          photo) is sent to eBay's public listings API. Neither receives
          your email or account information.
        </Text>

        <Text style={styles.heading}>Your data, your control</Text>
        <Text style={styles.body}>
          You can delete your account at any time from Settings. This
          permanently removes your account and your cloud-synced portfolio
          data. Data stored locally on your device is removed from the
          device at the same time.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  heading: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.md },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
});
```

Save as `app/legal/privacy-policy.tsx`.

- [ ] **Step 2: Write the Terms of Service content**

```typescript
import React from "react";
import { ScrollView, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "@/theme";

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Identification is AI-assisted, not a guarantee</Text>
        <Text style={styles.body}>
          Brand, model, reference number, and authenticity notes are
          generated by an AI model from the photos you provide and may be
          inaccurate or incomplete. Always verify reference numbers and
          authenticity through an authorized dealer or qualified watchmaker
          before relying on this app's output for a purchase, sale, or
          insurance decision.
        </Text>

        <Text style={styles.heading}>Valuations are estimates</Text>
        <Text style={styles.body}>
          Market value estimates are derived from active marketplace
          listing prices, not realized sale prices, and do not constitute a
          professional appraisal. Actual sale prices may differ
          significantly.
        </Text>

        <Text style={styles.heading}>Subscriptions</Text>
        <Text style={styles.body}>
          Paid tiers increase your daily scan allowance and portfolio
          history retention as described on the Upgrade screen. Subscriptions,
          once available, are billed and managed through Google Play and can
          be cancelled at any time through your Google Play account settings.
        </Text>

        <Text style={styles.heading}>Account deletion</Text>
        <Text style={styles.body}>
          You may delete your account at any time from Settings. This action
          is permanent and cannot be undone.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  heading: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.md },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
});
```

Save as `app/legal/terms.tsx`.

- [ ] **Step 3: Write the Settings screen**

```typescript
import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useCountryCode } from "@/hooks/useCountryCode";
import { REGIONS } from "@/constants";
import { colors, spacing, typography, radius } from "@/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { countryCode, setCountryCode } = useCountryCode();
  const version = Constants.expoConfig?.version ?? "—";

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>REGION & CURRENCY</Text>
        <View style={styles.card}>
          {REGIONS.map((region) => (
            <Pressable
              key={region.code}
              style={styles.regionRow}
              onPress={() => void setCountryCode(region.code)}
            >
              <Text style={styles.regionLabel}>
                {region.currencySymbol} {region.label}
              </Text>
              {countryCode === region.code && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>ABOUT</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => router.push("/legal/privacy-policy")}>
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => router.push("/legal/terms")}>
            <Text style={styles.rowLabel}>Terms of Service</Text>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.versionText}>{version}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  sectionTitle: { ...typography.label, color: colors.goldMuted, fontSize: 11, letterSpacing: 1 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  regionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  regionLabel: { ...typography.body, color: colors.textPrimary },
  checkmark: { ...typography.body, color: colors.gold, fontWeight: "700" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowChevron: { ...typography.body, color: colors.textTertiary, fontSize: 18 },
  versionText: { ...typography.caption, color: colors.textTertiary },
});
```

Save as `app/settings.tsx`. (Account deletion row is added in Task A7 once
the backend endpoint exists.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

From Profile, tap Settings. Confirm the region picker shows a checkmark on
India by default, tapping United States moves the checkmark. Force-close
and reopen the app (or reload in Expo Go), reopen Settings, confirm the
selection persisted. Tap Privacy Policy and Terms of Service, confirm both
render their text content and back navigation works.

- [ ] **Step 6: Commit**

```bash
git add app/settings.tsx app/legal
git commit -m "Add Settings screen with region picker, version, and legal pages"
```

---

### Task A7: Account deletion — server endpoint

**Files:**
- Create: `api/account.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { env } from "./_lib/env.js";
import { ErrorCode, sendError } from "./_lib/errors.js";
import { resolveUserId } from "./_lib/auth.js";
import { captureException } from "./_lib/sentry.js";

/**
 * Permanently deletes the authenticated user's Supabase Auth account.
 * portfolio and subscriptions rows cascade-delete via existing
 * ON DELETE CASCADE foreign keys; analytics_events.user_id is set to NULL
 * (ON DELETE SET NULL) so historical events survive anonymized.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "DELETE") {
    return sendError(res, ErrorCode.METHOD_NOT_ALLOWED, "Use DELETE");
  }

  const userId = await resolveUserId(req.headers.authorization, undefined);
  if (!userId) {
    return sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required");
  }

  if (!env.supabase.isConfigured) {
    return sendError(res, ErrorCode.INTERNAL, "Account deletion unavailable");
  }

  try {
    const resp = await fetch(`${env.supabase.url}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        apikey: env.supabase.serviceRoleKey!,
        Authorization: `Bearer ${env.supabase.serviceRoleKey}`,
      },
    });
    if (!resp.ok) {
      console.error(`[account] delete failed for ${userId}: ${resp.status}`);
      return sendError(res, ErrorCode.INTERNAL, "Failed to delete account");
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    captureException(err);
    console.error("[account] delete threw", err);
    return sendError(res, ErrorCode.INTERNAL, "Failed to delete account");
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Sign up a fresh throwaway test account, grab its access token from the
Supabase dashboard's Auth logs or by temporarily logging the
`session.access_token` client-side, then:

```bash
curl -X DELETE https://<your-vercel-app>.vercel.app/api/account \
  -H "Authorization: Bearer <access_token>"
```

Expected: `{"ok":true}`, and the user disappears from Supabase Auth → Users.

- [ ] **Step 4: Commit**

```bash
git add api/account.ts
git commit -m "Add DELETE /api/account endpoint for account deletion"
```

---

### Task A8: Account deletion — client wiring

**Files:**
- Modify: `app/settings.tsx`

- [ ] **Step 1: Add imports and the delete handler**

Replace:

```typescript
import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useCountryCode } from "@/hooks/useCountryCode";
import { REGIONS } from "@/constants";
import { colors, spacing, typography, radius } from "@/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { countryCode, setCountryCode } = useCountryCode();
  const version = Constants.expoConfig?.version ?? "—";
```

with:

```typescript
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useCountryCode } from "@/hooks/useCountryCode";
import { useAuth } from "@/hooks/useAuth";
import { useDatabase } from "@/hooks/useDatabase";
import { REGIONS } from "@/constants";
import { colors, spacing, typography, radius } from "@/theme";

const apiBaseUrl: string = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "";

export default function SettingsScreen() {
  const router = useRouter();
  const { countryCode, setCountryCode } = useCountryCode();
  const { session, signOut } = useAuth();
  const { db } = useDatabase();
  const [deleting, setDeleting] = useState(false);
  const version = Constants.expoConfig?.version ?? "—";

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account and synced portfolio data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!session?.access_token) return;
            setDeleting(true);
            try {
              const resp = await fetch(`${apiBaseUrl}/api/account`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              if (!resp.ok) {
                Alert.alert("Error", "Failed to delete account. Please try again.");
                setDeleting(false);
                return;
              }
              if (db) {
                await db.runAsync("DELETE FROM local_portfolio;");
              }
              await signOut();
              router.replace("/(auth)/login");
            } catch (err) {
              console.error("[Settings] Account deletion failed:", err);
              Alert.alert("Error", "Failed to delete account. Please try again.");
              setDeleting(false);
            }
          },
        },
      ]
    );
  };
```

- [ ] **Step 2: Add the Account section to the JSX**

Insert this block right before the closing `</ScrollView>`:

```typescript
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <Pressable
          style={[styles.dangerCard, deleting && styles.disabled]}
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.dangerText}>Delete My Account</Text>
          )}
        </Pressable>
```

- [ ] **Step 3: Add styles**

Add to the `styles` object:

```typescript
  dangerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  dangerText: { ...typography.label, color: colors.danger },
  disabled: { opacity: 0.6 },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Sign up a fresh throwaway account in the app, go to Settings, tap "Delete
My Account", confirm. Verify you land back on the login screen, the account
is gone from Supabase Auth, and re-opening the app does not auto-log you
back in.

- [ ] **Step 6: Commit**

```bash
git add app/settings.tsx
git commit -m "Wire account deletion into Settings screen"
```

---

## PART B — Subscriptions, trial, tier-aware quota, retention filtering

### Task B1: `subscriptions` table + trial-provisioning trigger

**Files:**
- Create: `supabase/migrations/003_subscriptions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 003: subscriptions
-- Apply via: supabase db push  (or paste into Supabase SQL editor)

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id        UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier           TEXT        NOT NULL CHECK (tier IN ('trial','free','collector','connoisseur','vault')) DEFAULT 'trial',
  status         TEXT        NOT NULL CHECK (status IN ('active','expired','cancelled')) DEFAULT 'active',
  trial_ends_at  TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_owner_select" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
-- No insert/update policy: only the trigger below (SECURITY DEFINER) and the
-- service role may write.

CREATE OR REPLACE FUNCTION public.provision_trial_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, tier, trial_ends_at)
  VALUES (NEW.id, 'trial', NOW() + INTERVAL '7 days');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_provision_trial ON auth.users;
CREATE TRIGGER on_auth_user_created_provision_trial
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_trial_subscription();
```

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL editor (or `supabase db push` if the CLI is
linked). Confirm in the Table Editor that `subscriptions` exists with the
columns above, and that the trigger appears under
Database → Triggers → `auth.users`.

- [ ] **Step 3: Manual verification**

Sign up a fresh test account through the app. In the Supabase Table Editor,
confirm a `subscriptions` row was auto-created for that user's `id` with
`tier = 'trial'` and `trial_ends_at` approximately 7 days in the future.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_subscriptions.sql
git commit -m "Add subscriptions table with auto-provisioned 7-day trial trigger"
```

---

### Task B2: Server tier-resolution helper

**Files:**
- Modify: `src/types/index.ts`
- Create: `api/_lib/subscriptions.ts`
- Delete: `api/_lib/premium.ts`

- [ ] **Step 1: Add the shared `Tier` type**

In `src/types/index.ts`, add this block after the `TrackEventSchema` export
(after the `API: POST /api/track` section, before `Local persistence`):

```typescript
// ---------------------------------------------------------------------------
// Subscription tiers (shared by api/_lib/subscriptions.ts and the client)
// ---------------------------------------------------------------------------

export const TierSchema = z.enum(["trial", "free", "collector", "connoisseur", "vault"]);
export type Tier = z.infer<typeof TierSchema>;
```

- [ ] **Step 2: Write the helper**

```typescript
import { env } from "./env.js";
import type { Tier } from "../../src/types/index.js";

export const TIER_LIMITS: Record<Tier, number | null> = {
  trial: 10,
  free: 3,
  collector: 15,
  connoisseur: 50,
  vault: null, // unlimited
};

export const TIER_UNLIMITED_HISTORY: Record<Tier, boolean> = {
  trial: true,
  free: false,
  collector: false,
  connoisseur: true,
  vault: true,
};

interface SubscriptionRow {
  tier: Tier;
  status: "active" | "expired" | "cancelled";
  trial_ends_at: string | null;
  expires_at: string | null;
}

export interface EffectiveTier {
  tier: Tier;
  trialEndsAt: string | null;
}

/**
 * Resolves a user's effective tier at request time (no cron job needed):
 * a `trial` row past its trial_ends_at, or any inactive/expired row,
 * resolves to `free`. A missing row (account predates this feature, or
 * Supabase is unconfigured) also resolves to `free` — the safe default.
 */
export async function getEffectiveTier(userId: string): Promise<EffectiveTier> {
  if (!env.supabase.isConfigured) return { tier: "free", trialEndsAt: null };

  let row: SubscriptionRow | null = null;
  try {
    const resp = await fetch(
      `${env.supabase.url}/rest/v1/subscriptions?user_id=eq.${userId}&select=tier,status,trial_ends_at,expires_at`,
      {
        headers: {
          apikey: env.supabase.serviceRoleKey!,
          Authorization: `Bearer ${env.supabase.serviceRoleKey}`,
        },
      }
    );
    if (resp.ok) {
      const rows = (await resp.json()) as SubscriptionRow[];
      row = rows[0] ?? null;
    }
  } catch {
    // fall through to the free default below
  }

  if (!row) return { tier: "free", trialEndsAt: null };
  if (row.status !== "active") return { tier: "free", trialEndsAt: row.trial_ends_at };

  if (row.tier === "trial") {
    if (row.trial_ends_at && new Date(row.trial_ends_at) < new Date()) {
      return { tier: "free", trialEndsAt: row.trial_ends_at };
    }
    return { tier: "trial", trialEndsAt: row.trial_ends_at };
  }

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { tier: "free", trialEndsAt: null };
  }

  return { tier: row.tier, trialEndsAt: null };
}
```

Save as `api/_lib/subscriptions.ts`. Then delete `api/_lib/premium.ts` —
superseded (free tier replaces "not premium", vault replaces "premium").

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `api/identify.ts` referencing `isPremiumUser` — expected
at this point, fixed in Task B4. Confirm the *only* errors are in
`api/identify.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts api/_lib/subscriptions.ts
git rm api/_lib/premium.ts
git commit -m "Add tier-resolution helper, replacing the binary premium stub"
```

---

### Task B3: Tier-aware quota (`reserveScan`/`refundScan`/`peekQuota`)

**Files:**
- Modify: `api/_lib/quota.ts`

- [ ] **Step 1: Rewrite the module**

Replace the entire contents of `api/_lib/quota.ts` with:

```typescript
import { getRedis } from "./redis.js";

const WINDOW_SECONDS = 24 * 60 * 60;

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

function key(userId: string): string {
  // Fixed 24h window bucket per user.
  const bucket = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  return `quota:${userId}:${bucket}`;
}

/**
 * Reserve one scan against the user's daily limit (reserve-then-refund
 * pattern). `limit === null` means unlimited (Vault tier) and bypasses
 * Redis entirely. Fails OPEN if Redis is unconfigured (dev).
 */
export async function reserveScan(userId: string, limit: number | null): Promise<QuotaResult> {
  if (limit === null) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit: Number.POSITIVE_INFINITY };
  }
  const redis = getRedis();
  if (!redis) {
    return { allowed: true, remaining: limit, limit };
  }

  const k = key(userId);
  const count = await redis.incr(k);
  if (count === 1) {
    await redis.expire(k, WINDOW_SECONDS);
  }

  if (count > limit) {
    await redis.decr(k); // we did not consume a scan
    return { allowed: false, remaining: 0, limit };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    limit,
  };
}

/** Refund a previously reserved scan when downstream processing fails. */
export async function refundScan(userId: string, limit: number | null): Promise<void> {
  if (limit === null) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.decr(key(userId));
  } catch {
    /* best-effort */
  }
}

/** Non-consuming read of the current quota state — used by GET /api/entitlement
 *  so checking your remaining quota never itself counts as a scan. */
export async function peekQuota(userId: string, limit: number | null): Promise<QuotaResult> {
  if (limit === null) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit: Number.POSITIVE_INFINITY };
  }
  const redis = getRedis();
  if (!redis) {
    return { allowed: true, remaining: limit, limit };
  }
  const count = (await redis.get<number>(key(userId))) ?? 0;
  return { allowed: count < limit, remaining: Math.max(0, limit - count), limit };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `api/identify.ts` calling `reserveScan`/`refundScan`
with the old boolean signature — expected, fixed in Task B4.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/quota.ts
git commit -m "Generalize quota to a numeric per-tier limit, add peekQuota"
```

---

### Task B4: Wire tiers into `api/identify.ts`

**Files:**
- Modify: `api/identify.ts`

- [ ] **Step 1: Swap the import**

Replace:

```typescript
import { isPremiumUser } from "./_lib/premium.js";
```

with:

```typescript
import { getEffectiveTier, TIER_LIMITS } from "./_lib/subscriptions.js";
```

- [ ] **Step 2: Resolve tier and limit before reserving**

Replace:

```typescript
  // 4. Quota (reserve-then-refund). Premium bypasses.
  const premium = await isPremiumUser(userId);
  const quota = await reserveScan(userId, premium);
  if (!quota.allowed) {
    await trackEvent("quota_exceeded", {}, userId);
    return sendError(res, ErrorCode.QUOTA_EXCEEDED, "Daily free scan limit reached");
  }
```

with:

```typescript
  // 4. Quota (reserve-then-refund). Vault tier bypasses entirely.
  const { tier } = await getEffectiveTier(userId);
  const limit = TIER_LIMITS[tier];
  const quota = await reserveScan(userId, limit);
  if (!quota.allowed) {
    await trackEvent("quota_exceeded", { tier }, userId);
    return sendError(res, ErrorCode.QUOTA_EXCEEDED, "Daily scan limit reached");
  }
```

- [ ] **Step 3: Update the remaining `premium` references**

Replace:

```typescript
    await trackEvent(
      "scan_completed",
      {
        confidence_band: confidenceBand(identification.confidence_score),
        verification_required: identification.verification_required,
      },
      userId
    );
```

with:

```typescript
    await trackEvent(
      "scan_completed",
      {
        confidence_band: confidenceBand(identification.confidence_score),
        verification_required: identification.verification_required,
        tier,
      },
      userId
    );
```

Replace both occurrences of:

```typescript
    await refundScan(userId, premium); // did not deliver a result
```

with:

```typescript
    await refundScan(userId, limit); // did not deliver a result
```

(there is only one occurrence — in the `catch` block — but search for
`premium` across the file to confirm no other references remain).

Replace:

```typescript
    if (err instanceof ApiException) {
      await trackEvent("scan_failed", { error_code: err.code }, userId);
      return sendError(res, err.code, err.message);
    }
    console.error(`[identify] ${requestId}`, err);
    await trackEvent("scan_failed", { error_code: ErrorCode.INTERNAL }, userId);
```

with:

```typescript
    if (err instanceof ApiException) {
      await trackEvent("scan_failed", { error_code: err.code, tier }, userId);
      return sendError(res, err.code, err.message);
    }
    console.error(`[identify] ${requestId}`, err);
    await trackEvent("scan_failed", { error_code: ErrorCode.INTERNAL, tier }, userId);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 5: Manual verification**

Run 4 scans in a row on a fresh trial account (limit 10, so this should
still succeed) — confirm all 4 succeed and `scan_completed` events log
`tier: "trial"`. Manually set that account's `subscriptions.trial_ends_at`
to a past date in the Supabase dashboard, scan again, confirm the 4th and
5th scans still succeed (free limit is 3, so the *next* fresh-day count
matters) — more precisely: confirm a brand-new free-tier test account is
blocked on its 4th scan in the same day with `QUOTA_EXCEEDED`, and that the
logged `quota_exceeded` event has `tier: "free"`.

- [ ] **Step 6: Commit**

```bash
git add api/identify.ts
git commit -m "Replace binary premium check with tier-aware quota in identify pipeline"
```

---

### Task B5: `GET /api/entitlement` endpoint

**Files:**
- Create: `api/entitlement.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the entitlement response schema**

`TierSchema`/`Tier` already exist from Task B2, Step 1. In
`src/types/index.ts`, add this block right after that `Tier` block:

```typescript
// ---------------------------------------------------------------------------
// API: GET /api/entitlement
// ---------------------------------------------------------------------------

export const EntitlementSchema = z.object({
  tier: TierSchema,
  scans_remaining: z.number().nullable(), // null = unlimited
  scans_limit: z.number().nullable(), // null = unlimited
  trial_ends_at: z.string().nullable(),
  unlimited_history: z.boolean(),
});
export type Entitlement = z.infer<typeof EntitlementSchema>;
```

- [ ] **Step 2: Write the endpoint**

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { EntitlementSchema } from "../src/types/index.js";
import { ErrorCode, sendError } from "./_lib/errors.js";
import { resolveUserId } from "./_lib/auth.js";
import { getEffectiveTier, TIER_LIMITS, TIER_UNLIMITED_HISTORY } from "./_lib/subscriptions.js";
import { peekQuota } from "./_lib/quota.js";
import { captureException } from "./_lib/sentry.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    return sendError(res, ErrorCode.METHOD_NOT_ALLOWED, "Use GET");
  }

  const userId = await resolveUserId(req.headers.authorization, undefined);
  if (!userId) {
    return sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required");
  }

  try {
    const { tier, trialEndsAt } = await getEffectiveTier(userId);
    const limit = TIER_LIMITS[tier];
    const quota = await peekQuota(userId, limit);

    const body = EntitlementSchema.parse({
      tier,
      scans_remaining: limit === null ? null : quota.remaining,
      scans_limit: limit,
      trial_ends_at: trialEndsAt,
      unlimited_history: TIER_UNLIMITED_HISTORY[tier],
    });
    res.status(200).json(body);
  } catch (err) {
    captureException(err);
    console.error("[entitlement] error", err);
    return sendError(res, ErrorCode.INTERNAL, "Unexpected error");
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

```bash
curl https://<your-vercel-app>.vercel.app/api/entitlement \
  -H "Authorization: Bearer <a_real_access_token>"
```

Expected for a fresh trial account:
`{"tier":"trial","scans_remaining":10,"scans_limit":10,"trial_ends_at":"...","unlimited_history":true}`

- [ ] **Step 5: Commit**

```bash
git add api/entitlement.ts src/types/index.ts
git commit -m "Add GET /api/entitlement endpoint"
```

---

### Task B6: Client `useEntitlement` provider

**Files:**
- Create: `src/services/entitlement.ts`
- Create: `src/hooks/useEntitlement.tsx`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Write the client fetch wrapper**

```typescript
import Constants from "expo-constants";
import { EntitlementSchema, type Entitlement } from "@/types";

const apiBaseUrl: string = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "";

export async function fetchEntitlement(accessToken: string): Promise<Entitlement | null> {
  if (!apiBaseUrl) return null;
  try {
    const resp = await fetch(`${apiBaseUrl}/api/entitlement`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const parsed = EntitlementSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

Save as `src/services/entitlement.ts`.

- [ ] **Step 2: Write the provider, mirroring `useRemoteConfig.tsx`**

```typescript
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Entitlement } from "@/types";
import { fetchEntitlement } from "@/services/entitlement";
import { useAuth } from "./useAuth";

interface EntitlementContextValue {
  entitlement: Entitlement | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextValue>({
  entitlement: null,
  loading: true,
  refresh: async () => {},
});

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.access_token) {
      setEntitlement(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await fetchEntitlement(session.access_token);
    setEntitlement(data);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <EntitlementContext.Provider value={{ entitlement, loading, refresh }}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement(): EntitlementContextValue {
  return useContext(EntitlementContext);
}
```

Save as `src/hooks/useEntitlement.tsx`.

- [ ] **Step 3: Add the provider to the app tree**

In `app/_layout.tsx`, add the import:

```typescript
import { EntitlementProvider } from "@/hooks/useEntitlement";
```

Replace:

```typescript
              <AuthProvider>
                <RemoteConfigProvider>
                  <StatusBar style="light" />
                  <InitialLayout />
                </RemoteConfigProvider>
              </AuthProvider>
```

with:

```typescript
              <AuthProvider>
                <RemoteConfigProvider>
                  <EntitlementProvider>
                    <StatusBar style="light" />
                    <InitialLayout />
                  </EntitlementProvider>
                </RemoteConfigProvider>
              </AuthProvider>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/entitlement.ts src/hooks/useEntitlement.tsx app/_layout.tsx
git commit -m "Add useEntitlement provider for client-side tier/quota state"
```

---

### Task B7: Show tier status on Profile

**Files:**
- Modify: `app/(tabs)/profile.tsx`

- [ ] **Step 1: Add the import and a tier-label helper**

Replace:

```typescript
import { useAuth } from "@/hooks/useAuth";
import { colors, spacing, typography, radius } from "@/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
```

with:

```typescript
import { useAuth } from "@/hooks/useAuth";
import { useEntitlement } from "@/hooks/useEntitlement";
import { colors, spacing, typography, radius } from "@/theme";

const TIER_LABEL: Record<string, string> = {
  trial: "Free Trial",
  free: "Free",
  collector: "Collector",
  connoisseur: "Connoisseur",
  vault: "Vault ⭐",
};

function daysLeft(isoDate: string): number {
  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { entitlement } = useEntitlement();
```

- [ ] **Step 2: Add the tier card to the JSX**

Insert this block right after the closing `</View>` of the `header` View
(i.e. after the email `Text`, before the "Upgrade" `Pressable`):

```typescript
      {entitlement && (
        <View style={styles.tierCard}>
          <Text style={styles.tierLabel}>{TIER_LABEL[entitlement.tier] ?? entitlement.tier}</Text>
          {entitlement.tier === "trial" && entitlement.trial_ends_at && (
            <Text style={styles.tierSub}>{daysLeft(entitlement.trial_ends_at)} days left</Text>
          )}
          <Text style={styles.tierSub}>
            {entitlement.scans_remaining == null
              ? "Unlimited scans today"
              : `${entitlement.scans_remaining} of ${entitlement.scans_limit} scans left today`}
          </Text>
        </View>
      )}
```

- [ ] **Step 3: Add styles**

Add to the `styles` object:

```typescript
  tierCard: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  tierLabel: { ...typography.heading, color: colors.gold, fontSize: 16 },
  tierSub: { ...typography.caption, color: colors.textSecondary },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Open Profile on a fresh trial account. Confirm it shows "Free Trial", "7
days left" (or close to it), and "10 of 10 scans left today" (or fewer
after scanning). Confirm the Upgrade and Settings rows from Task A5 still
work.

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/profile.tsx
git commit -m "Show tier status and scan quota on Profile screen"
```

---

### Task B8: Subscription/Paywall screen (stubbed purchase)

**Files:**
- Create: `src/services/billing.ts`
- Create: `app/subscription.tsx`

- [ ] **Step 1: Write the stubbed billing service**

```typescript
import { Alert } from "react-native";
import type { Tier } from "@/types";

export type PaidTier = Exclude<Tier, "trial" | "free">;

/**
 * Stub: real Google Play Billing (via RevenueCat) is deferred until the
 * project moves to an EAS/dev-client build, which real purchases require
 * regardless — Play Billing cannot be exercised in Expo Go under any
 * circumstances. This intentionally does NOT grant the tier: no payment
 * occurred, so nothing should unlock.
 */
export async function purchaseTier(_tier: PaidTier): Promise<void> {
  Alert.alert(
    "Coming Soon",
    "Subscriptions will be available once the app ships its production build."
  );
}
```

Save as `src/services/billing.ts`.

- [ ] **Step 2: Write the paywall screen**

```typescript
import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEntitlement } from "@/hooks/useEntitlement";
import { purchaseTier, type PaidTier } from "@/services/billing";
import { colors, spacing, typography, radius } from "@/theme";

interface PlanInfo {
  tier: PaidTier;
  name: string;
  price: string;
  scansPerDay: string;
  historyNote: string;
}

const PLANS: PlanInfo[] = [
  { tier: "collector", name: "Collector", price: "₹99/mo", scansPerDay: "15 scans/day", historyNote: "Last 90 days of history" },
  { tier: "connoisseur", name: "Connoisseur", price: "₹199/mo", scansPerDay: "50 scans/day", historyNote: "Unlimited history" },
  { tier: "vault", name: "Vault ⭐", price: "₹399/mo", scansPerDay: "Unlimited scans", historyNote: "Unlimited history + early access" },
];

export default function SubscriptionScreen() {
  const { entitlement } = useEntitlement();

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Upgrade for more scans per day and longer portfolio history.
        </Text>
        {PLANS.map((plan) => {
          const isCurrent = entitlement?.tier === plan.tier;
          return (
            <View
              key={plan.tier}
              style={[styles.planCard, isCurrent && styles.planCardActive]}
            >
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planPrice}>{plan.price}</Text>
              </View>
              <Text style={styles.planDetail}>{plan.scansPerDay}</Text>
              <Text style={styles.planDetail}>{plan.historyNote}</Text>
              {isCurrent ? (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>Current Plan</Text>
                </View>
              ) : (
                <Pressable
                  style={styles.subscribeBtn}
                  onPress={() => void purchaseTier(plan.tier)}
                >
                  <Text style={styles.subscribeBtnText}>Subscribe</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  intro: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  planCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  planCardActive: { borderColor: colors.gold },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planName: { ...typography.heading, color: colors.textPrimary },
  planPrice: { ...typography.heading, color: colors.gold },
  planDetail: { ...typography.body, color: colors.textSecondary, fontSize: 13 },
  subscribeBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  subscribeBtnText: { ...typography.label, color: colors.textOnGold },
  currentBadge: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  currentBadgeText: { ...typography.caption, color: colors.gold },
});
```

Save as `app/subscription.tsx`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

From Profile, tap Upgrade. Confirm all 3 plans render, the current tier
(e.g. "Free Trial") shows none of them as active (since `trial`/`free`
aren't in `PLANS`), tapping "Subscribe" on any plan shows the "Coming Soon"
alert, and the tier on Profile is unchanged afterward.

- [ ] **Step 5: Commit**

```bash
git add src/services/billing.ts app/subscription.tsx
git commit -m "Add Subscription/Paywall screen with stubbed purchase flow"
```

---

### Task B9: Portfolio history retention filtering on Home

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Add the import and compute the cutoff**

Add the import:

```typescript
import { useEntitlement } from "@/hooks/useEntitlement";
```

Replace:

```typescript
  const { user } = useAuth();
  const { entries, loading } = usePortfolio(user?.id);
```

with:

```typescript
  const { user } = useAuth();
  const { entries: allEntries, loading } = usePortfolio(user?.id);
  const { entitlement } = useEntitlement();

  const RETENTION_DAYS = 90;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const unlimitedHistory = entitlement?.unlimited_history ?? true; // default open until entitlement loads
  const entries = unlimitedHistory ? allEntries : allEntries.filter((e) => e.scanned_at >= cutoff);
  const hiddenCount = allEntries.length - entries.length;
```

- [ ] **Step 2: Show the disclosure when entries are hidden**

Insert this block right after the closing `)}` of the "Collection Stats
Card" section, before the "Watch Grid or Empty State" comment:

```typescript
      {hiddenCount > 0 && (
        <Text style={styles.retentionNote}>
          {hiddenCount} older scan{hiddenCount === 1 ? "" : "s"} hidden — upgrade to
          Connoisseur or Vault to see your full history.
        </Text>
      )}
```

- [ ] **Step 3: Add the style**

Add to the `styles` object:

```typescript
  retentionNote: {
    ...typography.caption,
    color: colors.textTertiary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

On a free-tier test account (set `subscriptions.trial_ends_at` to a past
date for an existing account, or wait out a real trial), manually backdate
a `local_portfolio` row's `scanned_at` via a SQLite browser or by adjusting
device clock during a scan, to simulate an entry older than 90 days.
Confirm it disappears from the Home grid and the "N older scans hidden"
note appears with the correct count. Confirm the row still exists in
SQLite (not deleted) by checking it reappears immediately if you simulate
an unlimited-history tier (e.g. temporarily hardcode
`unlimitedHistory = true` while testing, then revert).

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "Filter portfolio history by tier retention, never deleting data"
```

---

### Task B10: Final pass

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Confirm clean git state and push**

```bash
git status -sb
git push origin master
```

- [ ] **Step 3: End-to-end manual smoke test**

1. Sign up a fresh account → confirm a `subscriptions` row appears with
   `tier='trial'`.
2. Confirm the tab bar shows Home/Scan/Profile, Scan opens the camera modal
   exactly as before.
3. Confirm Profile shows "Free Trial", days remaining, and scan quota.
4. Open Settings, change region, confirm it persists after an app restart.
5. Open Privacy Policy and Terms, confirm they render.
6. Open Upgrade, confirm all 3 plans render and "Subscribe" shows the
   "Coming Soon" alert without changing your tier.
7. Scan a watch end-to-end, confirm it still produces a result and saves to
   Home.
8. Delete the test account from Settings, confirm it's gone from Supabase
   Auth and you're returned to login.
9. Confirm a brand-new free-tier (post-trial-expiry) account is blocked on
   its 4th scan of the day with a quota-exceeded error, while a trial
   account is not blocked until its 11th.
