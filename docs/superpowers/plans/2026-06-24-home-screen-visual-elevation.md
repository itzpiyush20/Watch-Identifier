# Home Screen Visual Elevation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan starts from current `master`, which already has collection sharing, manual enrichment fields, and visual fingerprint identification merged in. Create a fresh worktree from `master` for this work — do not reuse the old `worktree-collection-sharing` branch, which is now an ancestor of `master`, not a current working branch.**

**Goal:** Elevate the Home/Vault screen's perceived quality: luxury typography (Bodoni Moda + Jost), real Ionicons replacing emoji, card press/entrance animation, and a subtle gradient glow on the stats card.

**Architecture:** Load two Google Font families once at the root layout via `expo-font`'s `useFonts`, gated behind the existing loading-screen pattern. Update the shared `typography` tokens in `src/theme/index.ts` to reference the loaded font families (this is a deliberate global change — every screen picks up the new fonts automatically, even though only the Home screen's layout/icons/animation get touched in this phase). Extract a `WatchCard` component so each grid card can use its own Reanimated shared value for press feedback (FlatList's `renderItem` callback can't safely call hooks directly).

**Tech Stack:** `expo-font`, `@expo-google-fonts/bodoni-moda`, `@expo-google-fonts/jost`, `expo-linear-gradient` (3 new native-adjacent dependencies, one EAS rebuild needed), `@expo/vector-icons` (Ionicons, already installed), `react-native-reanimated` (already installed), `expo-haptics` (already installed).

---

## Task 1: Install new dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install via `expo install`**

Run: `npx expo install expo-font @expo-google-fonts/bodoni-moda @expo-google-fonts/jost expo-linear-gradient`
Expected: all four packages added to `package.json` under `dependencies`, install completes with no errors.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add font loading and gradient dependencies"
```

**Note for whoever runs the app next:** this adds new native modules, so the installed EAS dev-client APK needs one rebuild (`eas build --profile development --platform android`) before this phase's fonts/gradient will render correctly on-device — the rest of the app will keep working on the existing build in the meantime since Metro serves the JS either way, but the new font/gradient native modules won't be linked until a rebuild.

---

## Task 2: Load fonts at the root layout

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Add the font imports**

Find:
```tsx
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DatabaseProvider } from "@/hooks/useDatabase";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { RemoteConfigProvider } from "@/hooks/useRemoteConfig";
import { EntitlementProvider } from "@/hooks/useEntitlement";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { colors } from "@/theme";
```

Replace with:
```tsx
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import { BodoniModa_700Bold } from "@expo-google-fonts/bodoni-moda";
import { Jost_400Regular, Jost_600SemiBold } from "@expo-google-fonts/jost";
import { DatabaseProvider } from "@/hooks/useDatabase";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { RemoteConfigProvider } from "@/hooks/useRemoteConfig";
import { EntitlementProvider } from "@/hooks/useEntitlement";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { colors } from "@/theme";
```

- [ ] **Step 2: Gate the root render on fonts loading**

Find:
```tsx
export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <DatabaseProvider>
              <AuthProvider>
                <RemoteConfigProvider>
                  <EntitlementProvider>
                    <StatusBar style="light" />
                    <InitialLayout />
                  </EntitlementProvider>
                </RemoteConfigProvider>
              </AuthProvider>
            </DatabaseProvider>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
```

Replace with:
```tsx
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BodoniModa_700Bold,
    Jost_400Regular,
    Jost_600SemiBold,
  });

  if (!fontsLoaded) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <DatabaseProvider>
              <AuthProvider>
                <RemoteConfigProvider>
                  <EntitlementProvider>
                    <StatusBar style="light" />
                    <InitialLayout />
                  </EntitlementProvider>
                </RemoteConfigProvider>
              </AuthProvider>
            </DatabaseProvider>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
```

(`LoadingScreen` is already defined earlier in this same file, reused as-is — no new component needed.)

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx
git commit -m "Load Bodoni Moda and Jost fonts at app startup"
```

---

## Task 3: Update theme typography tokens

**Files:**
- Modify: `src/theme/index.ts`

- [ ] **Step 1: Replace the typography tokens**

Find:
```ts
export const typography = {
  display: { fontSize: 32, fontWeight: "700" as const, letterSpacing: 0.3 },
  title: { fontSize: 24, fontWeight: "700" as const, letterSpacing: 0.2 },
  heading: { fontSize: 18, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: "600" as const, letterSpacing: 0.4 },
  caption: { fontSize: 12, fontWeight: "400" as const },
} as const;
```

Replace with:
```ts
export const typography = {
  display: { fontFamily: "BodoniModa_700Bold", fontSize: 32, letterSpacing: 0.3 },
  title: { fontFamily: "BodoniModa_700Bold", fontSize: 24, letterSpacing: 0.2 },
  heading: { fontFamily: "Jost_600SemiBold", fontSize: 18 },
  body: { fontFamily: "Jost_400Regular", fontSize: 15, lineHeight: 22 },
  label: { fontFamily: "Jost_600SemiBold", fontSize: 13, letterSpacing: 0.4 },
  caption: { fontFamily: "Jost_400Regular", fontSize: 12 },
} as const;
```

`fontWeight` is dropped from every token — these are now discrete static font files (one file per weight), not a variable/system font, so `fontWeight` would be ignored or could conflict with the loaded font file's own baked-in weight. The font file itself now carries the weight.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/theme/index.ts
git commit -m "Use Bodoni Moda and Jost in shared typography tokens"
```

**Note:** this is a global change — every screen using `typography.*` tokens (Results, Settings, Edit Details, auth screens, etc.) picks up the new fonts immediately, not just Home. This is intentional and was called out in the design spec; it's a strict visual improvement, not a regression, and doesn't require touching those screens' own code in this phase.

---

## Task 4: Extract WatchCard with icons, taller images, and press/entrance animation

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Add new imports**

Find:
```tsx
import React from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { colors, spacing, typography, radius } from "@/theme";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useScanStore } from "@/store/scanStore";
import { formatCurrency } from "@/utils/format";
import { getDeviceCurrency } from "@/utils/format";
import type { PortfolioEntry, IdentifyResponse, Identification, MarketRange } from "@/types";
import { CollectionShareCard } from "@/components/share/CollectionShareCard";
import { WatchShareCard } from "@/components/share/WatchShareCard";
import { captureAndShare } from "@/services/share";
import { supabase } from "@/services/supabase";
```

Replace with:
```tsx
import React from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { colors, spacing, typography, radius } from "@/theme";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useScanStore } from "@/store/scanStore";
import { formatCurrency } from "@/utils/format";
import { getDeviceCurrency } from "@/utils/format";
import type { PortfolioEntry, IdentifyResponse, Identification, MarketRange } from "@/types";
import { CollectionShareCard } from "@/components/share/CollectionShareCard";
import { WatchShareCard } from "@/components/share/WatchShareCard";
import { captureAndShare } from "@/services/share";
import { supabase } from "@/services/supabase";
```

- [ ] **Step 2: Add the `WatchCard` component**

Add this above `export default function HomeScreen()`:

```tsx
interface WatchCardProps {
  item: PortfolioEntry;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
}

function WatchCard({ item, index, onPress, onLongPress }: WatchCardProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  let medianPrice = "—";
  try {
    const market = JSON.parse(item.market_data_json);
    if (market.median_estimate) {
      medianPrice = formatCurrency(market.median_estimate, market.currency);
    }
  } catch {}

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
      <Animated.View style={animatedStyle}>
        <Pressable
          style={styles.card}
          onPress={() => {
            void Haptics.selectionAsync();
            onPress();
          }}
          onLongPress={onLongPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <View style={styles.imageContainer}>
            {item.image_uri ? (
              <Image source={{ uri: item.image_uri }} style={styles.cardImage} />
            ) : (
              <View style={styles.placeholderImage}>
                <Ionicons name="watch-outline" size={40} color={colors.goldMuted} />
              </View>
            )}
            <View style={styles.syncBadge}>
              <Ionicons
                name={item.synced === 1 ? "cloud-done-outline" : "sync-outline"}
                size={14}
                color={colors.textPrimary}
              />
            </View>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardBrand} numberOfLines={1}>
              {item.brand}
            </Text>
            <Text style={styles.cardModel} numberOfLines={1}>
              {item.model_family}
            </Text>
            <Text style={styles.cardPrice}>{medianPrice}</Text>
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
```

- [ ] **Step 3: Replace `renderItem` to use `WatchCard`**

Find:
```tsx
  const renderItem = ({ item }: { item: PortfolioEntry }) => {
    let medianPrice = "—";
    try {
      const market = JSON.parse(item.market_data_json);
      if (market.median_estimate) {
        medianPrice = formatCurrency(market.median_estimate, market.currency);
      }
    } catch {}

    return (
      <Pressable
        style={styles.card}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleCardLongPress(item)}
      >
        <View style={styles.imageContainer}>
          {item.image_uri ? (
            <Image source={{ uri: item.image_uri }} style={styles.cardImage} />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}>🕒</Text>
            </View>
          )}
          <View style={styles.syncBadge}>
            <Text style={styles.syncText}>{item.synced === 1 ? "☁️" : "🔄"}</Text>
          </View>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardBrand} numberOfLines={1}>
            {item.brand}
          </Text>
          <Text style={styles.cardModel} numberOfLines={1}>
            {item.model_family}
          </Text>
          <Text style={styles.cardPrice}>{medianPrice}</Text>
        </View>
      </Pressable>
    );
  };
```

Replace with:
```tsx
  const renderItem = ({ item, index }: { item: PortfolioEntry; index: number }) => (
    <WatchCard
      item={item}
      index={index}
      onPress={() => handleCardPress(item)}
      onLongPress={() => handleCardLongPress(item)}
    />
  );
```

- [ ] **Step 4: Increase the card image height**

Find:
```ts
  imageContainer: {
    height: 140,
    backgroundColor: colors.surfaceElevated,
    position: "relative",
  },
```

Replace with:
```ts
  imageContainer: {
    height: 190,
    backgroundColor: colors.surfaceElevated,
    position: "relative",
  },
```

- [ ] **Step 5: Remove the now-unused emoji-icon styles**

Find:
```ts
  placeholderText: {
    fontSize: 32,
  },
  syncBadge: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    padding: 4,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  syncText: {
    fontSize: 12,
  },
```

Replace with:
```ts
  syncBadge: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    padding: 4,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
```

(`placeholderText` and `syncText` were only used by the emoji `<Text>` elements just removed; `syncBadge` is kept unchanged since `WatchCard` still renders an `Ionicons` glyph inside the same badge container.)

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "Extract WatchCard with Ionicons, taller images, and press/entrance animation"
```

---

## Task 5: Stats card gradient, icon accent, and empty-state icon

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Add the `LinearGradient` import**

Find:
```tsx
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
```

Replace with:
```tsx
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
```

- [ ] **Step 2: Wrap the stats card in a gradient and add the icon accent**

Find:
```tsx
      {/* Collection Stats Card */}
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

Replace with:
```tsx
      {/* Collection Stats Card */}
      {entries.length > 0 && (
        <LinearGradient
          colors={["rgba(201,162,75,0.12)", "rgba(20,20,22,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statsCard}
        >
          <View style={styles.statsRow}>
            <View>
              <View style={styles.statsLabelRow}>
                <Ionicons name="diamond-outline" size={12} color={colors.goldMuted} />
                <Text style={styles.statsLabel}>COLLECTION VALUE</Text>
              </View>
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
        </LinearGradient>
      )}
```

- [ ] **Step 3: Replace the empty-state emoji icon**

Find:
```tsx
      {entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🕒</Text>
          <Text style={styles.emptyTitle}>Vault is Empty</Text>
```

Replace with:
```tsx
      {entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="watch-outline" size={64} color={colors.goldMuted} />
          <Text style={styles.emptyTitle}>Vault is Empty</Text>
```

- [ ] **Step 4: Add the `statsLabelRow` style and remove the now-unused `emptyIcon` style**

Find:
```ts
  statsLabel: { ...typography.label, color: colors.textTertiary, fontSize: 10 },
  statsValue: { ...typography.heading, color: colors.gold, fontSize: 20 },
```

Replace with:
```ts
  statsLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statsLabel: { ...typography.label, color: colors.textTertiary, fontSize: 10 },
  statsValue: { fontFamily: "BodoniModa_700Bold", color: colors.gold, fontSize: 20 },
```

Find:
```ts
  emptyIcon: {
    fontSize: 64,
    color: colors.goldMuted,
  },
  emptyTitle: { ...typography.title, color: colors.textPrimary },
```

Replace with:
```ts
  emptyTitle: { ...typography.title, color: colors.textPrimary },
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "Add gradient glow and icon accent to stats card, replace empty-state emoji"
```

---

## Task 6: Manual verification pass

This phase added 4 new native-adjacent dependencies (Task 1), so the
installed EAS dev-client APK needs a rebuild before fonts/gradient render
correctly — verifiable visually only after that rebuild.

**Files:** none (verification only)

- [ ] **Step 1: Rebuild the dev client**

Run: `npx eas-cli build --profile development --platform android --non-interactive`
Expected: build succeeds, produces a new APK URL. Install it on the test device, replacing the prior build (uninstall first if the test device has previously shown auth/networking issues tied to a stale install — see project memory on Samsung battery restrictions blocking fresh installs).

- [ ] **Step 2: Verify fonts load correctly**

Start Metro (`npm start`), connect the dev client. Confirm:
- No flash of blank/system-font text before the loading screen resolves — the loading screen (existing dark spinner) should show briefly, then the app renders with fonts already in place.
- "Horology Vault" header and the collection-value number render in a visibly serif/display font (Bodoni Moda), not the system sans-serif.
- Body text, labels, and captions throughout Home render in Jost (a clean geometric sans, visibly different from the device's default system font).

- [ ] **Step 3: Verify icons replaced emoji**

Confirm no emoji appear anywhere on the Home screen: empty-state watch icon, per-card placeholder watch icon, per-card sync badges (cloud-done vs. sync icon depending on `synced` state) — all should be crisp vector icons, not emoji glyphs.

- [ ] **Step 4: Verify card animation and press feedback**

With a populated collection (ideally 4+ watches), navigate to Home and confirm cards fade up with a slight stagger on load (not all appearing instantly at once). Press and hold a card — confirm it scales down slightly and springs back on release, with a light haptic tap on tap-release.

- [ ] **Step 5: Verify the gradient glow**

Confirm the stats card shows a subtle gold-tinted gradient glow (top-left to bottom-right), not a flat solid background, and that the small diamond icon appears next to "COLLECTION VALUE."

- [ ] **Step 6: Regression-check existing functionality**

Confirm Share Collection, per-card long-press (Share/Delete), and tapping a card to reopen its Results all still work exactly as before — this phase must not break any of the prior collection-sharing or manual-enrichment functionality.

- [ ] **Step 7: Spot-check other screens picked up the font change**

Open Results, Settings, or Edit Details — confirm headings/body text there also now render in the new fonts (expected side effect of the shared `typography` token change in Task 3), and that nothing looks broken or misaligned as a result.

- [ ] **Step 8: Final commit (if any fixes were needed during manual testing)**

If manual testing surfaced bugs requiring code changes, fix them, re-run `npm run typecheck`, and commit each fix separately with a descriptive message before considering this plan complete.
