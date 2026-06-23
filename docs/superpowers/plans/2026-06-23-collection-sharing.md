# Explicit Collection + Social Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace auto-save-on-scan with an explicit "Add to Collection" action on the results screen, add a delete path for collection entries, and add social-media sharing for both individual watches and a whole-collection summary.

**Architecture:** `scanStore` (zustand) gains a `savedEntryId` field tracking whether the current result is persisted. The results screen and Home tab both read/write this via the existing `usePortfolio().save()`/`.remove()` hooks (no backend changes). Sharing is implemented generically via `react-native-view-shot` (capture a React view to PNG) + `expo-sharing` (open the OS share sheet), wrapped in two presentational card components.

**Tech Stack:** Expo SDK 54, React Native, zustand, expo-sharing, react-native-view-shot, existing Supabase/SQLite portfolio persistence.

---

## Reference: full current file contents touched by this plan

**`src/store/scanStore.ts` (current, in full):**
```ts
import { create } from "zustand";
import type { IdentifyResponse } from "@/types";

interface ScanStore {
  result: IdentifyResponse | null;
  imageUri: string | null;
  setResult: (result: IdentifyResponse, imageUri: string | null) => void;
  clear: () => void;
}

/** Carries the current scan result across the scan→results navigation boundary.
 *  Cleared when the user leaves the results screen or starts a new scan. */
export const useScanStore = create<ScanStore>((set) => ({
  result: null,
  imageUri: null,
  setResult: (result, imageUri) => set({ result, imageUri }),
  clear: () => set({ result: null, imageUri: null }),
}));
```

---

## Task 1: Scan store tracks save state

**Files:**
- Modify: `src/store/scanStore.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import { create } from "zustand";
import type { IdentifyResponse } from "@/types";

interface ScanStore {
  result: IdentifyResponse | null;
  imageUri: string | null;
  savedEntryId: string | null; // null = not yet saved to the collection
  setResult: (
    result: IdentifyResponse,
    imageUri: string | null,
    savedEntryId?: string | null
  ) => void;
  setSavedEntryId: (id: string | null) => void;
  clear: () => void;
}

/** Carries the current scan result across the scan→results navigation boundary.
 *  Cleared when the user leaves the results screen or starts a new scan. */
export const useScanStore = create<ScanStore>((set) => ({
  result: null,
  imageUri: null,
  savedEntryId: null,
  setResult: (result, imageUri, savedEntryId = null) =>
    set({ result, imageUri, savedEntryId }),
  setSavedEntryId: (id) => set({ savedEntryId: id }),
  clear: () => set({ result: null, imageUri: null, savedEntryId: null }),
}));
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (This will show errors in `ScanScreen.tsx` and `app/(tabs)/index.tsx` calling `setResult` with the old signature — that's expected; those are fixed in Tasks 2 and 3. If you see errors in files NOT touched by this plan, stop and report.)

- [ ] **Step 3: Commit**

```bash
git add src/store/scanStore.ts
git commit -m "Add savedEntryId tracking to scan store"
```

---

## Task 2: Remove auto-save from the scan pipeline

**Files:**
- Modify: `src/screens/ScanScreen.tsx:27,55,98,121`

The scan pipeline currently calls `saveToPortfolio(...)` on both the cache-hit branch (line 98) and the fresh-identification branch (line 121), persisting every scan before the user reaches the results screen. This task removes both calls — scanning becomes presentation-only; saving becomes an explicit user action added in Task 4.

- [ ] **Step 1: Remove the now-unused `usePortfolio` import**

In `src/screens/ScanScreen.tsx`, delete this line (currently line 27):
```ts
import { usePortfolio } from "@/hooks/usePortfolio";
```

- [ ] **Step 2: Remove the `saveToPortfolio` destructure**

Delete this line (currently line 55):
```ts
const { save: saveToPortfolio } = usePortfolio(user?.id);
```

- [ ] **Step 3: Remove the cache-hit save call**

Find this block (currently around line 96-101):
```ts
      const cached = await scanCache.get(hash);
      if (cached) {
        try {
          await saveToPortfolio(cached, processedFront.uri, user?.id ?? null);
        } catch (err) {
          console.error("[ScanScreen] Failed to save cached result to portfolio:", err);
        }
        setResult(cached, processedFront.uri);
```

Replace with:
```ts
      const cached = await scanCache.get(hash);
      if (cached) {
        setResult(cached, processedFront.uri);
```

- [ ] **Step 4: Remove the fresh-identification save call**

Find this block (currently around line 117-125):
```ts
        await scanCache.set(hash, result);
        try {
          await saveToPortfolio(result, processedFront.uri, user?.id ?? null);
        } catch (err) {
          console.error("[ScanScreen] Failed to save scan result to portfolio:", err);
        }
        setResult(result, processedFront.uri);
```

Replace with:
```ts
        await scanCache.set(hash, result);
        setResult(result, processedFront.uri);
```

- [ ] **Step 5: Remove `saveToPortfolio` from the `useCallback` dependency array**

Find the `runPipeline` callback's dependency array (currently line 138):
```ts
    [scanCache, setResult, router, session, user, saveToPortfolio, resetCapture, countryCode]
```

Replace with:
```ts
    [scanCache, setResult, router, session, user, resetCapture, countryCode]
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors referencing `ScanScreen.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/screens/ScanScreen.tsx
git commit -m "Remove auto-save from scan pipeline"
```

---

## Task 3: Home tab passes saved entry id when reopening a result

**Files:**
- Modify: `app/(tabs)/index.tsx:62`

Tapping an existing collection card currently calls `setResult(response, entry.image_uri)` without telling the store this result is already saved. After Task 1's signature change, this needs the entry's real id as the third argument so the Results screen renders "Remove from Collection" instead of "Add to Collection" for already-saved entries.

- [ ] **Step 1: Update the `setResult` call**

In `app/(tabs)/index.tsx`, find (currently line 62):
```ts
      setResult(response, entry.image_uri);
```

Replace with:
```ts
      setResult(response, entry.image_uri, entry.id);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "Pass saved entry id when reopening a collection result"
```

---

## Task 4: Results screen — Add / Remove from Collection

**Files:**
- Modify: `app/results.tsx`

- [ ] **Step 1: Add new imports and hooks**

In `app/results.tsx`, find the import block (currently lines 1-19) and add after the existing `useAuth` import (line 16):
```ts
import { usePortfolio } from "@/hooks/usePortfolio";
```

Find the component body (currently lines 22-26):
```ts
  const router = useRouter();
  const { result, imageUri, clear } = useScanStore();
  const config = useRemoteConfig();
  const { session } = useAuth();
  const [rating, setRating] = React.useState<"up" | "down" | null>(null);
```

Replace with:
```ts
  const router = useRouter();
  const { result, imageUri, savedEntryId, setSavedEntryId, clear } = useScanStore();
  const config = useRemoteConfig();
  const { session, user } = useAuth();
  const { save: saveToPortfolio, remove: removeFromPortfolio } = usePortfolio(user?.id);
  const [rating, setRating] = React.useState<"up" | "down" | null>(null);
  const [savingState, setSavingState] = React.useState<"idle" | "saving">("idle");
```

- [ ] **Step 2: Add the save/remove handler**

Add this function after `handleRate` (currently ends at line 97), before the `hasCaution` line:

```ts
  const handleToggleCollection = async () => {
    if (savingState === "saving") return;
    if (savedEntryId == null) {
      setSavingState("saving");
      try {
        const id = await saveToPortfolio(result, imageUri, user?.id ?? null);
        setSavedEntryId(id);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        console.error("[Results] Failed to save to collection:", err);
        Alert.alert("Error", "Failed to add to collection. Please try again.");
      } finally {
        setSavingState("idle");
      }
    } else {
      Alert.alert(
        "Remove from Collection",
        "This removes the watch from your collection. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                await removeFromPortfolio(savedEntryId);
                setSavedEntryId(null);
              } catch (err) {
                console.error("[Results] Failed to remove from collection:", err);
                Alert.alert("Error", "Failed to remove from collection. Please try again.");
              }
            },
          },
        ]
      );
    }
  };
```

- [ ] **Step 3: Import `Haptics`**

Add to the top imports (after the `expo-router` import, currently line 12):
```ts
import * as Haptics from "expo-haptics";
```

- [ ] **Step 4: Render the button in the footer**

Find the footer actions block (currently lines 262-273):
```ts
      {/* Footer controls */}
      <View style={styles.actions}>
        <Pressable
          style={styles.scanBtn}
          onPress={() => {
            clear();
            router.back();
          }}
        >
          <Text style={styles.scanBtnText}>Scan Another</Text>
        </Pressable>
      </View>
```

Replace with:
```ts
      {/* Footer controls */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.collectionBtn, savedEntryId != null && styles.collectionBtnSaved]}
          onPress={handleToggleCollection}
          disabled={savingState === "saving"}
        >
          <Text
            style={[
              styles.collectionBtnText,
              savedEntryId != null && styles.collectionBtnTextSaved,
            ]}
          >
            {savingState === "saving"
              ? "Saving…"
              : savedEntryId != null
                ? "Remove from Collection"
                : "Add to Collection"}
          </Text>
        </Pressable>
        <Pressable
          style={styles.scanBtn}
          onPress={() => {
            clear();
            router.back();
          }}
        >
          <Text style={styles.scanBtnText}>Scan Another</Text>
        </Pressable>
      </View>
```

- [ ] **Step 5: Add the new button styles**

In the `styles` object (currently ending at line 497), add before the closing `});`:
```ts
  collectionBtn: {
    backgroundColor: "transparent",
    borderColor: colors.gold,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  collectionBtnSaved: {
    borderColor: colors.danger,
  },
  collectionBtnText: { ...typography.label, color: colors.gold },
  collectionBtnTextSaved: { color: colors.danger },
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/results.tsx
git commit -m "Add Add/Remove from Collection button to results screen"
```

---

## Task 5: Install sharing dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install via `expo install` (resolves SDK-54-compatible versions)**

Run: `npx expo install expo-sharing react-native-view-shot`
Expected: both packages added to `package.json` under `dependencies`, install completes with no errors.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add expo-sharing and react-native-view-shot dependencies"
```

**Note for whoever runs the app next:** this adds new native modules, so the installed EAS dev-client build needs one rebuild (`eas build --profile development --platform android`) before sharing will work on-device — Metro live-reload alone is not enough for a new native module.

---

## Task 6: Share helper service

**Files:**
- Create: `src/services/share.ts`

- [ ] **Step 1: Write the helper**

```ts
import type { RefObject } from "react";
import type { View } from "react-native";
import { Alert } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

/**
 * Captures the referenced view as a PNG and opens the native OS share sheet.
 * Works generically across WhatsApp, Instagram, etc. — no per-platform SDK.
 */
export async function captureAndShare(
  ref: RefObject<View>,
  filename: string
): Promise<void> {
  try {
    const uri = await captureRef(ref, {
      format: "png",
      quality: 1,
    });

    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert("Sharing Unavailable", "Sharing is not supported on this device.");
      return;
    }

    await Sharing.shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle: filename,
    });
  } catch (err) {
    console.error("[share] Failed to capture and share:", err);
    Alert.alert("Error", "Failed to share. Please try again.");
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/share.ts
git commit -m "Add captureAndShare helper for view-to-image sharing"
```

---

## Task 7: Per-watch share card component

**Files:**
- Create: `src/components/share/WatchShareCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React, { forwardRef } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Constants from "expo-constants";
import { colors, spacing, typography, radius } from "@/theme";
import { formatCurrency } from "@/utils/format";
import type { Identification, MarketRange } from "@/types";

interface WatchShareCardProps {
  identification: Identification;
  market: MarketRange;
  imageUri: string | null;
}

const appName = (Constants.expoConfig?.name as string) ?? "The Watch Identifier";

/** Fixed-layout branded card, rendered off-screen and captured to PNG for sharing. */
export const WatchShareCard = forwardRef<View, WatchShareCardProps>(
  ({ identification, market, imageUri }, ref) => {
    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        <View style={styles.imageWrap}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderEmoji}>🕒</Text>
            </View>
          )}
        </View>
        <Text style={styles.brand}>{identification.brand}</Text>
        <Text style={styles.model}>{identification.model_family}</Text>
        {identification.reference_number && (
          <Text style={styles.ref}>Ref. {identification.reference_number}</Text>
        )}
        {market.median_estimate != null && (
          <View style={styles.valueRow}>
            <Text style={styles.valueLabel}>ESTIMATED VALUE</Text>
            <Text style={styles.value}>
              {formatCurrency(market.median_estimate, market.currency)}
            </Text>
          </View>
        )}
        <Text style={styles.confidence}>
          {Math.round(identification.confidence_score * 100)}% confidence
        </Text>
        <Text style={styles.footer}>{appName}</Text>
      </View>
    );
  }
);
WatchShareCard.displayName = "WatchShareCard";

const styles = StyleSheet.create({
  card: {
    width: 360,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  imageWrap: {
    height: 200,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  placeholderImage: { flex: 1, justifyContent: "center", alignItems: "center" },
  placeholderEmoji: { fontSize: 48 },
  brand: { ...typography.display, color: colors.textPrimary, fontSize: 24 },
  model: { ...typography.title, color: colors.textSecondary, fontSize: 16 },
  ref: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  valueRow: { marginTop: spacing.sm },
  valueLabel: { ...typography.label, color: colors.goldMuted, fontSize: 10, letterSpacing: 1 },
  value: { ...typography.display, color: colors.gold, fontSize: 28 },
  confidence: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  footer: {
    ...typography.label,
    color: colors.gold,
    fontSize: 12,
    marginTop: spacing.md,
    textAlign: "right",
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. If `formatCurrency` signature mismatch errors appear, check `src/utils/format.ts` for its exact signature and adjust the call to match — do not change `format.ts` itself in this task.

- [ ] **Step 3: Commit**

```bash
git add src/components/share/WatchShareCard.tsx
git commit -m "Add WatchShareCard component for per-watch sharing"
```

---

## Task 8: Wire Share button into Results screen

**Files:**
- Modify: `app/results.tsx`

- [ ] **Step 1: Add imports**

`View` is already imported from `react-native` in this file (line 3 of the existing import block) — no change needed there. Add these two new imports:
```ts
import { WatchShareCard } from "@/components/share/WatchShareCard";
import { captureAndShare } from "@/services/share";
```

- [ ] **Step 2: Add a ref and handler**

In the component body, after the `savingState` state (added in Task 4 Step 1), add:
```ts
  const shareCardRef = React.useRef<View>(null);

  const handleShare = async () => {
    await captureAndShare(shareCardRef, `${identification.brand}-${identification.model_family}`);
  };
```

- [ ] **Step 3: Render the off-screen share card and a Share button**

In the footer actions block (modified in Task 4 Step 4), add a Share button above the collection button:
```ts
      {/* Footer controls */}
      <View style={styles.actions}>
        <Pressable style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>Share</Text>
        </Pressable>
        <Pressable
          style={[styles.collectionBtn, savedEntryId != null && styles.collectionBtnSaved]}
          onPress={handleToggleCollection}
          disabled={savingState === "saving"}
        >
```//... (rest of collection button and Scan Another button unchanged from Task 4)

Immediately before the closing `</SafeAreaView>` (after the `</View>` that closes `styles.actions`), render the off-screen card used only for capture:
```ts
      <View style={styles.offscreen} pointerEvents="none">
        <WatchShareCard
          ref={shareCardRef}
          identification={identification}
          market={market}
          imageUri={imageUri}
        />
      </View>
```

- [ ] **Step 4: Add the new styles**

Add to the `styles` object:
```ts
  shareBtn: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  shareBtnText: { ...typography.label, color: colors.textPrimary },
  offscreen: {
    position: "absolute",
    top: -9999,
    left: -9999,
  },
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/results.tsx
git commit -m "Wire Share button into Results screen using WatchShareCard"
```

---

## Task 9: Collection summary share card component

**Files:**
- Create: `src/components/share/CollectionShareCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React, { forwardRef } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Constants from "expo-constants";
import { colors, spacing, typography, radius } from "@/theme";
import { formatCurrency } from "@/utils/format";
import type { PortfolioEntry } from "@/types";

interface CollectionShareCardProps {
  entries: PortfolioEntry[];
  totalValue: number;
  currency: string;
}

const appName = (Constants.expoConfig?.name as string) ?? "The Watch Identifier";

/** Fixed-layout branded collection-summary card, rendered off-screen and captured to PNG. */
export const CollectionShareCard = forwardRef<View, CollectionShareCardProps>(
  ({ entries, totalValue, currency }, ref) => {
    const thumbnails = entries.slice(0, 6);
    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        <Text style={styles.title}>My Collection</Text>
        <Text style={styles.subtitle}>
          {entries.length} timepiece{entries.length === 1 ? "" : "s"} · est.{" "}
          {formatCurrency(totalValue, currency)}
        </Text>
        <View style={styles.grid}>
          {thumbnails.map((entry) => (
            <View key={entry.id} style={styles.thumbWrap}>
              {entry.image_uri ? (
                <Image source={{ uri: entry.image_uri }} style={styles.thumb} />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <Text style={styles.thumbEmoji}>🕒</Text>
                </View>
              )}
            </View>
          ))}
        </View>
        <Text style={styles.footer}>{appName}</Text>
      </View>
    );
  }
);
CollectionShareCard.displayName = "CollectionShareCard";

const styles = StyleSheet.create({
  card: {
    width: 360,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { ...typography.display, color: colors.textPrimary, fontSize: 24 },
  subtitle: { ...typography.body, color: colors.gold, fontSize: 14 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  thumbWrap: {
    width: 104,
    height: 104,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  thumb: { width: "100%", height: "100%", resizeMode: "cover" },
  thumbPlaceholder: { flex: 1, justifyContent: "center", alignItems: "center" },
  thumbEmoji: { fontSize: 28 },
  footer: {
    ...typography.label,
    color: colors.gold,
    fontSize: 12,
    marginTop: spacing.md,
    textAlign: "right",
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/share/CollectionShareCard.tsx
git commit -m "Add CollectionShareCard component for collection-summary sharing"
```

---

## Task 10: Wire Share Collection button into Home tab

**Files:**
- Modify: `app/(tabs)/index.tsx`

This must use the same tier-filtered `entries` array already computed on this screen (post-retention-cutoff), not `allEntries` — a free-tier user sharing their collection must never expose more than what they can currently see themselves.

- [ ] **Step 1: Add imports**

Add to the top imports in `app/(tabs)/index.tsx`:
```ts
import { CollectionShareCard } from "@/components/share/CollectionShareCard";
import { captureAndShare } from "@/services/share";
```

- [ ] **Step 2: Add a ref and handler**

In the component body, after the `getCollectionValue` function (currently ends at line 78), add:
```ts
  const collectionShareRef = React.useRef<View>(null);

  const handleShareCollection = async () => {
    await captureAndShare(collectionShareRef, "my-watch-collection");
  };
```

- [ ] **Step 3: Add a "Share Collection" button to the stats card**

Find the stats card block (currently lines 135-151):
```ts
      {entries.length > 0 && (
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View>
              <Text style={styles.statsLabel}>COLLECTION VALUE</Text>
              <Text style={styles.statsValue}>
                {formatCurrency(getCollectionValue(), getDeviceCurrency())}
              </Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsItem}>
              <Text style={styles.statsLabel}>TIMEPIECES</Text>
              <Text style={styles.statsValue}>{entries.length}</Text>
            </View>
          </View>
        </View>
      )}
```

Replace with:
```ts
      {entries.length > 0 && (
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View>
              <Text style={styles.statsLabel}>COLLECTION VALUE</Text>
              <Text style={styles.statsValue}>
                {formatCurrency(getCollectionValue(), getDeviceCurrency())}
              </Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsItem}>
              <Text style={styles.statsLabel}>TIMEPIECES</Text>
              <Text style={styles.statsValue}>{entries.length}</Text>
            </View>
          </View>
          <Pressable style={styles.shareCollectionBtn} onPress={handleShareCollection}>
            <Text style={styles.shareCollectionBtnText}>Share Collection</Text>
          </Pressable>
        </View>
      )}
```

- [ ] **Step 4: Render the off-screen share card**

Immediately before the closing `</SafeAreaView>` (after the floating action button block, currently ending at line 190), add:
```ts
      <View style={styles.offscreen} pointerEvents="none">
        <CollectionShareCard
          ref={collectionShareRef}
          entries={entries}
          totalValue={getCollectionValue()}
          currency={getDeviceCurrency()}
        />
      </View>
```

- [ ] **Step 5: Add the new styles**

Add to the `styles` object:
```ts
  shareCollectionBtn: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "center",
  },
  shareCollectionBtnText: { ...typography.label, color: colors.gold, fontSize: 13 },
  offscreen: {
    position: "absolute",
    top: -9999,
    left: -9999,
  },
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "Wire Share Collection button into Home tab using CollectionShareCard"
```

---

## Task 11: Long-press Delete/Share menu on collection cards

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Add imports**

`usePortfolio` is already imported in this file (line 16) — no change needed there. Find the existing `react-native` import block (currently lines 2-11):
```ts
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  Dimensions,
  ActivityIndicator,
} from "react-native";
```

Add `Alert` to this list:
```ts
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
```

Then add this new import for the best-effort remote delete:
```ts
import { supabase } from "@/services/supabase";
```

- [ ] **Step 2: Destructure `remove` from `usePortfolio`**

Find (currently line 29):
```ts
  const { entries: allEntries, loading } = usePortfolio(user?.id);
```

Replace with:
```ts
  const { entries: allEntries, loading, remove: removeEntry } = usePortfolio(user?.id);
```

- [ ] **Step 3: Add per-card share state and handlers**

After `handleCardPress` (currently ends at line 67), add:
```ts
  const [shareTarget, setShareTarget] = React.useState<PortfolioEntry | null>(null);
  const cardShareRef = React.useRef<View>(null);

  const handleDeleteEntry = (entry: PortfolioEntry) => {
    Alert.alert(
      "Delete from Collection",
      `Remove ${entry.brand} ${entry.model_family} from your collection? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await removeEntry(entry.id);
              if (entry.synced === 1) {
                try {
                  await supabase.from("portfolio").delete().eq("id", entry.id);
                } catch (err) {
                  console.error("[HomeScreen] Best-effort remote delete failed:", err);
                }
              }
            } catch (err) {
              console.error("[HomeScreen] Failed to delete entry:", err);
              Alert.alert("Error", "Failed to delete. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleCardLongPress = (entry: PortfolioEntry) => {
    Alert.alert(entry.brand, entry.model_family, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Share",
        onPress: () => setShareTarget(entry),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => handleDeleteEntry(entry),
      },
    ]);
  };

  React.useEffect(() => {
    if (!shareTarget) return;
    const run = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50)); // let the off-screen card render with the new target
      await captureAndShare(cardShareRef, `${shareTarget.brand}-${shareTarget.model_family}`);
      setShareTarget(null);
    };
    void run();
  }, [shareTarget]);
```

- [ ] **Step 4: Wire `onLongPress` on the card**

Find (currently line 90):
```ts
      <Pressable style={styles.card} onPress={() => handleCardPress(item)}>
```

Replace with:
```ts
      <Pressable
        style={styles.card}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleCardLongPress(item)}
      >
```

- [ ] **Step 5: Render the off-screen per-card share target**

Add alongside the existing `CollectionShareCard` off-screen block (from Task 10 Step 4), inside the same `styles.offscreen` wrapper or a sibling one:
```ts
      {shareTarget && (
        <View style={styles.offscreen} pointerEvents="none">
          <WatchShareCard
            ref={cardShareRef}
            identification={{
              brand: shareTarget.brand,
              model_family: shareTarget.model_family,
              reference_number: shareTarget.reference_number,
              search_string: `${shareTarget.brand} ${shareTarget.model_family}`,
              confidence_score: shareTarget.confidence_score,
              possible_matches: [],
              authenticity_caution: JSON.parse(shareTarget.authenticity_caution),
              verification_required: false,
              additional_image_hint: null,
            }}
            market={JSON.parse(shareTarget.market_data_json)}
            imageUri={shareTarget.image_uri}
          />
        </View>
      )}
```

- [ ] **Step 6: Add the `WatchShareCard` import**

Add to the top imports:
```ts
import { WatchShareCard } from "@/components/share/WatchShareCard";
import { captureAndShare } from "@/services/share";
```

(If `captureAndShare` is already imported from Task 10, don't duplicate the import line.)

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "Add long-press Delete/Share menu to collection cards"
```

---

## Task 12: Manual verification pass

No automated test convention exists for screens/components in this codebase (confirmed: `jest --passWithNoTests`, zero existing test files for UI code). Verification is manual, via the EAS dev-client build.

**Files:** none (verification only)

- [ ] **Step 1: Rebuild the dev client**

Since Task 5 added new native modules (`expo-sharing`, `react-native-view-shot`), the previously-installed dev-client APK won't have them. Run:
```bash
npx eas-cli build --profile development --platform android --non-interactive
```
Expected: build succeeds, produces a new APK URL. Install it on the test device, replacing the prior build.

- [ ] **Step 2: Verify explicit save**

Start Metro (`npm start`), connect the dev client. Scan a watch. Confirm it does NOT appear on the Home tab yet. On the Results screen, tap "Add to Collection" — confirm a success haptic fires and the button changes to "Remove from Collection". Navigate back to Home — confirm the watch now appears.

- [ ] **Step 3: Verify remove from Results**

Tap a Home card to reopen it (button should already read "Remove from Collection" since `savedEntryId` is pre-populated). Tap it, confirm the deletion alert, confirm — verify it disappears from Home.

- [ ] **Step 4: Verify long-press delete**

On Home, long-press a card. Confirm the action sheet shows the watch's brand/model with Cancel/Share/Delete. Tap Delete, confirm, verify the card disappears from the grid.

- [ ] **Step 5: Verify per-watch share**

On Results, tap "Share". Confirm the native OS share sheet opens with a PNG attachment showing the branded watch card. On a Home card, long-press → Share, confirm the same share sheet opens for that card's data.

- [ ] **Step 6: Verify collection share respects retention**

If testing with a free-tier or trial-expired account showing the "N older scans hidden" note, tap "Share Collection" and confirm the shared summary's timepiece count matches the *visible* count on screen, not the full hidden total.

- [ ] **Step 7: Final commit (if any fixes were needed during manual testing)**

If manual testing surfaced bugs requiring code changes, fix them, re-run `npm run typecheck`, and commit each fix separately with a descriptive message before considering this plan complete.
