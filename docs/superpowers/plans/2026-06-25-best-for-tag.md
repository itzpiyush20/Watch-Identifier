# "Best For" Specialty Tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-entered "Best For" specialty tag (Formal, Party, Sport / Active, Everyday / Casual, Dress, Travel) to each watch, display it as a pill wherever the watch appears, and use it to turn the collective share card from a bare thumbnail grid into a list with real per-watch detail.

**Architecture:** One new nullable `best_for` column on the existing `local_portfolio` SQLite table and its Supabase mirror, following the exact pattern already established by `condition`/`ownership_status` in the manual-enrichment-fields project. The existing `updatePortfolioEntry` → `synced = 0` → `syncPortfolio` pipeline picks it up with no new sync logic. Display is a small pill component repeated (not extracted — each file already defines its own `StyleSheet`, per the existing codebase pattern) across four places: the Home grid card, the Results screen, `WatchShareCard`, and a layout-redesigned `CollectionShareCard`.

**Tech Stack:** Expo SQLite, Supabase Postgres, Expo Router, React Native `StyleSheet` — no new dependencies.

---

## Task 1: SQLite migration — add `best_for` column

**Files:**
- Modify: `src/database/migrations.ts`

- [ ] **Step 1: Add migration version 4**

Find the end of the `MIGRATIONS` array (the closing `];` after the version-3 entry):
```ts
  {
    version: 3,
    async up(db) {
      await db.execAsync(`
        ALTER TABLE local_portfolio ADD COLUMN collection_name TEXT;
        ALTER TABLE local_portfolio ADD COLUMN purchase_date TEXT;
        ALTER TABLE local_portfolio ADD COLUMN purchase_price REAL;
        ALTER TABLE local_portfolio ADD COLUMN purchase_currency TEXT;
        ALTER TABLE local_portfolio ADD COLUMN condition TEXT;
        ALTER TABLE local_portfolio ADD COLUMN ownership_status TEXT;
        ALTER TABLE local_portfolio ADD COLUMN box_available INTEGER;
        ALTER TABLE local_portfolio ADD COLUMN papers_available INTEGER;
      `);
    },
  },
];
```

Replace with:
```ts
  {
    version: 3,
    async up(db) {
      await db.execAsync(`
        ALTER TABLE local_portfolio ADD COLUMN collection_name TEXT;
        ALTER TABLE local_portfolio ADD COLUMN purchase_date TEXT;
        ALTER TABLE local_portfolio ADD COLUMN purchase_price REAL;
        ALTER TABLE local_portfolio ADD COLUMN purchase_currency TEXT;
        ALTER TABLE local_portfolio ADD COLUMN condition TEXT;
        ALTER TABLE local_portfolio ADD COLUMN ownership_status TEXT;
        ALTER TABLE local_portfolio ADD COLUMN box_available INTEGER;
        ALTER TABLE local_portfolio ADD COLUMN papers_available INTEGER;
      `);
    },
  },
  {
    version: 4,
    async up(db) {
      await db.execAsync(`
        ALTER TABLE local_portfolio ADD COLUMN best_for TEXT;
      `);
    },
  },
];
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/database/migrations.ts
git commit -m "Add SQLite migration for best_for column"
git push
```

---

## Task 2: Extend `PortfolioEntry` type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the field**

Find:
```ts
  condition?: string | null; // one of: New, Unworn, Excellent, Very Good, Good, Fair, Poor
  ownership_status?: string | null; // one of: Currently Owned, Previously Owned, Wishlist
  box_available?: 0 | 1 | null;
  papers_available?: 0 | 1 | null;
}
```

Replace with:
```ts
  condition?: string | null; // one of: New, Unworn, Excellent, Very Good, Good, Fair, Poor
  ownership_status?: string | null; // one of: Currently Owned, Previously Owned, Wishlist
  box_available?: 0 | 1 | null;
  papers_available?: 0 | 1 | null;
  // "Best For" specialty tag — user-entered, not AI-inferred. One of:
  // Formal, Party, Sport / Active, Everyday / Casual, Dress, Travel.
  best_for?: string | null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors (the new field is optional, so every existing object literal that builds a `PortfolioEntry` still compiles).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "Add best_for field to PortfolioEntry type"
git push
```

---

## Task 3: Repository — extend `RawRow`, `rowToEntry`, and `ManualEnrichmentUpdate`

**Files:**
- Modify: `src/database/repositories/portfolioRepo.ts`

- [ ] **Step 1: Add `best_for` to `RawRow`**

Find:
```ts
  condition: string | null;
  ownership_status: string | null;
  box_available: number | null;
  papers_available: number | null;
};
```

Replace with:
```ts
  condition: string | null;
  ownership_status: string | null;
  box_available: number | null;
  papers_available: number | null;
  best_for: string | null;
};
```

- [ ] **Step 2: Add `best_for` to `ManualEnrichmentUpdate`**

Find:
```ts
export type ManualEnrichmentUpdate = Partial<
  Pick<
    PortfolioEntry,
    | "brand"
    | "model_family"
    | "reference_number"
    | "collection_name"
    | "purchase_date"
    | "purchase_price"
    | "purchase_currency"
    | "condition"
    | "ownership_status"
    | "box_available"
    | "papers_available"
  >
>;
```

Replace with:
```ts
export type ManualEnrichmentUpdate = Partial<
  Pick<
    PortfolioEntry,
    | "brand"
    | "model_family"
    | "reference_number"
    | "collection_name"
    | "purchase_date"
    | "purchase_price"
    | "purchase_currency"
    | "condition"
    | "ownership_status"
    | "box_available"
    | "papers_available"
    | "best_for"
  >
>;
```

`rowToEntry` needs no change — `best_for` is a plain string column (no 0/1 normalization needed, unlike `box_available`/`papers_available`), so the existing `{ ...row, ... }` spread already carries it through correctly.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/database/repositories/portfolioRepo.ts
git commit -m "Add best_for to portfolio repository update path"
git push
```

---

## Task 4: Supabase migration for `best_for`

**Files:**
- Create: `supabase/migrations/005_best_for.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 005: "Best For" specialty tag
-- Apply via: supabase db push  (or paste into Supabase SQL editor)

ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS best_for TEXT;
```

No RLS policy changes needed — the existing `portfolio_owner_update` policy (`auth.uid() = user_id`) already covers writes to this new column.

- [ ] **Step 2: Apply it**

This is a Supabase-side migration, not run by the app's test suite. Apply it by pasting the SQL into the Supabase SQL editor for this project (or `supabase db push` if the Supabase CLI is linked locally). Confirm by querying `information_schema.columns` for `public.portfolio` afterward, or checking the Supabase dashboard's table editor shows the new column.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_best_for.sql
git commit -m "Add Supabase migration for best_for column"
git push
```

---

## Task 5: Sync `best_for` to Supabase

**Files:**
- Modify: `src/services/syncService.ts`

- [ ] **Step 1: Add the field to the upsert payload**

Find:
```ts
      condition: entry.condition ?? null,
      ownership_status: entry.ownership_status ?? null,
      box_available: entry.box_available ?? null,
      papers_available: entry.papers_available ?? null,
    }));
```

Replace with:
```ts
      condition: entry.condition ?? null,
      ownership_status: entry.ownership_status ?? null,
      box_available: entry.box_available ?? null,
      papers_available: entry.papers_available ?? null,
      best_for: entry.best_for ?? null,
    }));
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/syncService.ts
git commit -m "Sync best_for field to Supabase"
git push
```

---

## Task 6: "Best For" picker on the Edit Details screen

**Files:**
- Modify: `app/edit-watch.tsx`

- [ ] **Step 1: Add the options constant**

Find:
```ts
const CONDITIONS = ["New", "Unworn", "Excellent", "Very Good", "Good", "Fair", "Poor"];
const OWNERSHIP_STATUSES = ["Currently Owned", "Previously Owned", "Wishlist"];
```

Replace with:
```ts
const CONDITIONS = ["New", "Unworn", "Excellent", "Very Good", "Good", "Fair", "Poor"];
const OWNERSHIP_STATUSES = ["Currently Owned", "Previously Owned", "Wishlist"];
const BEST_FOR_OPTIONS = ["Formal", "Party", "Sport / Active", "Everyday / Casual", "Dress", "Travel"];
```

- [ ] **Step 2: Add state, synced to the loaded entry**

Find:
```ts
  const [boxAvailable, setBoxAvailable] = React.useState(entry?.box_available === 1);
  const [papersAvailable, setPapersAvailable] = React.useState(entry?.papers_available === 1);
  const [dateError, setDateError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!entry) return;
    setBrand(entry.brand);
    setModelFamily(entry.model_family);
    setReferenceNumber(entry.reference_number ?? "");
    setCollectionName(entry.collection_name ?? "");
    setPurchaseDate(entry.purchase_date ?? "");
    setPurchasePrice(entry.purchase_price != null ? String(entry.purchase_price) : "");
    setCondition(entry.condition ?? null);
    setOwnershipStatus(entry.ownership_status ?? null);
    setBoxAvailable(entry.box_available === 1);
    setPapersAvailable(entry.papers_available === 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);
```

Replace with:
```ts
  const [boxAvailable, setBoxAvailable] = React.useState(entry?.box_available === 1);
  const [papersAvailable, setPapersAvailable] = React.useState(entry?.papers_available === 1);
  const [bestFor, setBestFor] = React.useState<string | null>(entry?.best_for ?? null);
  const [dateError, setDateError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!entry) return;
    setBrand(entry.brand);
    setModelFamily(entry.model_family);
    setReferenceNumber(entry.reference_number ?? "");
    setCollectionName(entry.collection_name ?? "");
    setPurchaseDate(entry.purchase_date ?? "");
    setPurchasePrice(entry.purchase_price != null ? String(entry.purchase_price) : "");
    setCondition(entry.condition ?? null);
    setOwnershipStatus(entry.ownership_status ?? null);
    setBoxAvailable(entry.box_available === 1);
    setPapersAvailable(entry.papers_available === 1);
    setBestFor(entry.best_for ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);
```

- [ ] **Step 3: Include it in the save call**

Find:
```ts
        condition,
        ownership_status: ownershipStatus,
        box_available: boxAvailable ? 1 : 0,
        papers_available: papersAvailable ? 1 : 0,
      });
```

Replace with:
```ts
        condition,
        ownership_status: ownershipStatus,
        box_available: boxAvailable ? 1 : 0,
        papers_available: papersAvailable ? 1 : 0,
        best_for: bestFor,
      });
```

- [ ] **Step 4: Add the picker section to the form**

Find:
```tsx
        <Text style={styles.sectionTitle}>WHAT CAME WITH IT</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.optionLabel}>Box Available *</Text>
            <Switch
              value={boxAvailable}
              onValueChange={setBoxAvailable}
              trackColor={{ false: colors.surfaceElevated, true: colors.gold }}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.optionLabel}>Papers Available *</Text>
            <Switch
              value={papersAvailable}
              onValueChange={setPapersAvailable}
              trackColor={{ false: colors.surfaceElevated, true: colors.gold }}
            />
          </View>
        </View>

        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
```

Replace with:
```tsx
        <Text style={styles.sectionTitle}>WHAT CAME WITH IT</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.optionLabel}>Box Available *</Text>
            <Switch
              value={boxAvailable}
              onValueChange={setBoxAvailable}
              trackColor={{ false: colors.surfaceElevated, true: colors.gold }}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.optionLabel}>Papers Available *</Text>
            <Switch
              value={papersAvailable}
              onValueChange={setPapersAvailable}
              trackColor={{ false: colors.surfaceElevated, true: colors.gold }}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>BEST FOR</Text>
        <View style={styles.card}>
          {BEST_FOR_OPTIONS.map((option) => (
            <Pressable key={option} style={styles.optionRow} onPress={() => setBestFor(option)}>
              <Text style={styles.optionLabel}>{option}</Text>
              {bestFor === option && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/edit-watch.tsx
git commit -m "Add Best For picker to Edit Details screen"
git push
```

---

## Task 7: "Best For" pill on the Home grid card

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Render the pill in `WatchCard`**

Find:
```tsx
          <View style={styles.cardInfo}>
            <Text style={styles.cardBrand} numberOfLines={1}>
              {item.brand}
            </Text>
            <Text style={styles.cardModel} numberOfLines={1}>
              {item.model_family}
            </Text>
            <Text style={styles.cardPrice}>{medianPrice}</Text>
          </View>
```

Replace with:
```tsx
          <View style={styles.cardInfo}>
            <Text style={styles.cardBrand} numberOfLines={1}>
              {item.brand}
            </Text>
            <Text style={styles.cardModel} numberOfLines={1}>
              {item.model_family}
            </Text>
            <Text style={styles.cardPrice}>{medianPrice}</Text>
            {item.best_for && (
              <View style={styles.bestForPill}>
                <Text style={styles.bestForPillText} numberOfLines={1}>
                  {item.best_for}
                </Text>
              </View>
            )}
          </View>
```

- [ ] **Step 2: Add the pill styles**

Find:
```ts
  cardBrand: { ...typography.label, color: colors.gold, fontSize: 12 },
  cardModel: { ...typography.body, color: colors.textPrimary, fontSize: 14 },
  cardPrice: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
```

Replace with:
```ts
  cardBrand: { ...typography.label, color: colors.gold, fontSize: 12 },
  cardModel: { ...typography.body, color: colors.textPrimary, fontSize: 14 },
  cardPrice: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  bestForPill: {
    alignSelf: "flex-start",
    borderColor: colors.goldMuted,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.xs,
  },
  bestForPillText: { ...typography.caption, color: colors.goldMuted, fontSize: 10 },
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "Show Best For pill on Home grid card"
git push
```

---

## Task 8: "Best For" pill on the Results screen

**Files:**
- Modify: `app/results.tsx`

The `result`/`identification` object on this screen comes from the AI identify response and never carries `best_for` (it's a portfolio-only field). To display it, look up the saved entry by `savedEntryId`, the same pattern `app/edit-watch.tsx` already uses.

- [ ] **Step 1: Look up the saved entry**

Find:
```ts
  const { session, user } = useAuth();
  const { save: saveToPortfolio, remove: removeFromPortfolio } = usePortfolio(user?.id);
```

Replace with:
```ts
  const { session, user } = useAuth();
  const { entries, save: saveToPortfolio, remove: removeFromPortfolio } = usePortfolio(user?.id);
```

- [ ] **Step 2: Derive `bestFor` after `identification`/`market` are destructured**

Find:
```ts
  const { identification, market, request_id } = result;
```

Replace with:
```ts
  const { identification, market, request_id } = result;
  const savedEntry = savedEntryId != null ? entries.find((e) => e.id === savedEntryId) : null;
  const bestFor = savedEntry?.best_for ?? null;
```

- [ ] **Step 3: Render the pill after the reference-number badge**

Find:
```tsx
          {identification.reference_number && (
            <View style={styles.refBadge}>
              <Text style={styles.refText}>Ref. {identification.reference_number}</Text>
            </View>
          )}

          {/* Confidence Score Bar */}
```

Replace with:
```tsx
          {identification.reference_number && (
            <View style={styles.refBadge}>
              <Text style={styles.refText}>Ref. {identification.reference_number}</Text>
            </View>
          )}

          {bestFor && (
            <View style={styles.bestForPill}>
              <Text style={styles.bestForPillText}>{bestFor}</Text>
            </View>
          )}

          {/* Confidence Score Bar */}
```

- [ ] **Step 4: Pass `bestFor` to `WatchShareCard`**

Find:
```tsx
      <View style={styles.offscreen} pointerEvents="none">
        <WatchShareCard
          ref={shareCardRef}
          identification={identification}
          market={market}
          imageUri={imageUri}
        />
      </View>
```

Replace with:
```tsx
      <View style={styles.offscreen} pointerEvents="none">
        <WatchShareCard
          ref={shareCardRef}
          identification={identification}
          market={market}
          imageUri={imageUri}
          bestFor={bestFor}
        />
      </View>
```

- [ ] **Step 5: Add the pill style**

Find:
```ts
  refText: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },
  confidenceRow: {
```

Replace with:
```ts
  refText: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },
  bestForPill: {
    alignSelf: "flex-start",
    borderColor: colors.goldMuted,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.xs,
  },
  bestForPillText: { ...typography.caption, color: colors.goldMuted, fontSize: 11 },
  confidenceRow: {
```

- [ ] **Step 6: Run typecheck**

This step will fail until Task 9 adds the `bestFor` prop to `WatchShareCard` — that's expected and fine, since these two tasks are deliberately sequential (Task 8 is the consumer, Task 9 is the prop's definition). Run it anyway to confirm the *only* error is the missing `bestFor` prop on `WatchShareCard`, not anything else:

Run: `npm run typecheck`
Expected: exactly one error, on the `<WatchShareCard ... bestFor={bestFor} />` call in `app/results.tsx`, complaining `bestFor` does not exist on `WatchShareCardProps`.

- [ ] **Step 7: Commit**

```bash
git add app/results.tsx
git commit -m "Show Best For pill on Results screen"
git push
```

---

## Task 9: Add `bestFor` to `WatchShareCard`

**Files:**
- Modify: `src/components/share/WatchShareCard.tsx`

- [ ] **Step 1: Add the prop**

Find:
```tsx
interface WatchShareCardProps {
  identification: Identification;
  market: MarketRange;
  imageUri: string | null;
}
```

Replace with:
```tsx
interface WatchShareCardProps {
  identification: Identification;
  market: MarketRange;
  imageUri: string | null;
  bestFor?: string | null;
}
```

- [ ] **Step 2: Destructure it and render the pill**

Find:
```tsx
export const WatchShareCard = forwardRef<View, WatchShareCardProps>(
  ({ identification, market, imageUri }, ref) => {
```

Replace with:
```tsx
export const WatchShareCard = forwardRef<View, WatchShareCardProps>(
  ({ identification, market, imageUri, bestFor }, ref) => {
```

Find:
```tsx
        {identification.reference_number && (
          <Text style={styles.ref}>Ref. {identification.reference_number}</Text>
        )}
        {market.median_estimate != null && (
```

Replace with:
```tsx
        {identification.reference_number && (
          <Text style={styles.ref}>Ref. {identification.reference_number}</Text>
        )}
        {bestFor && (
          <View style={styles.bestForPill}>
            <Text style={styles.bestForPillText}>{bestFor}</Text>
          </View>
        )}
        {market.median_estimate != null && (
```

- [ ] **Step 3: Add the pill style**

Find:
```ts
  ref: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  valueRow: { marginTop: spacing.sm },
```

Replace with:
```ts
  ref: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  bestForPill: {
    alignSelf: "flex-start",
    borderColor: colors.goldMuted,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.xs,
  },
  bestForPillText: { ...typography.caption, color: colors.goldMuted, fontSize: 11 },
  valueRow: { marginTop: spacing.sm },
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: no errors (this resolves the single error left over from Task 8).

- [ ] **Step 5: Commit**

```bash
git add src/components/share/WatchShareCard.tsx
git commit -m "Add Best For pill to WatchShareCard"
git push
```

---

## Task 10: Wire `bestFor` into the Home tab's long-press share flow

**Files:**
- Modify: `app/(tabs)/index.tsx`

The long-press "Share" action on a Home card builds its own `WatchShareCard` off-screen render — it needs the new prop too.

- [ ] **Step 1: Pass `bestFor` from the entry**

Find:
```tsx
      {shareTarget && (
        <View style={styles.offscreen} pointerEvents="none">
          <WatchShareCard
            ref={cardShareRef}
            identification={shareTarget.identification}
            market={shareTarget.market}
            imageUri={shareTarget.entry.image_uri}
          />
        </View>
      )}
```

Replace with:
```tsx
      {shareTarget && (
        <View style={styles.offscreen} pointerEvents="none">
          <WatchShareCard
            ref={cardShareRef}
            identification={shareTarget.identification}
            market={shareTarget.market}
            imageUri={shareTarget.entry.image_uri}
            bestFor={shareTarget.entry.best_for}
          />
        </View>
      )}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "Pass best_for into Home tab's per-watch share flow"
git push
```

---

## Task 11: Redesign `CollectionShareCard` as a vertical list with per-watch detail

**Files:**
- Modify: `src/components/share/CollectionShareCard.tsx`

This replaces the current 104×104 thumbnail grid with a vertical list of rows (thumbnail + brand/model + "Best For" pill), since a grid cell has no room for three pieces of text. Still capped at the first 6 entries — this is a single static captured image, not a scrollable view.

- [ ] **Step 1: Replace the component body**

Find:
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

Replace with:
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
    const rows = entries.slice(0, 6);
    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        <Text style={styles.title}>My Collection</Text>
        <Text style={styles.subtitle}>
          {entries.length} timepiece{entries.length === 1 ? "" : "s"} · est.{" "}
          {formatCurrency(totalValue, currency)}
        </Text>
        <View style={styles.list}>
          {rows.map((entry) => (
            <View key={entry.id} style={styles.row}>
              <View style={styles.thumbWrap}>
                {entry.image_uri ? (
                  <Image source={{ uri: entry.image_uri }} style={styles.thumb} />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Text style={styles.thumbEmoji}>🕒</Text>
                  </View>
                )}
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowBrand} numberOfLines={1}>
                  {entry.brand}
                </Text>
                <Text style={styles.rowModel} numberOfLines={1}>
                  {entry.model_family}
                </Text>
                {entry.best_for && (
                  <View style={styles.bestForPill}>
                    <Text style={styles.bestForPillText} numberOfLines={1}>
                      {entry.best_for}
                    </Text>
                  </View>
                )}
              </View>
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
  list: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  thumbWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  thumb: { width: "100%", height: "100%", resizeMode: "cover" },
  thumbPlaceholder: { flex: 1, justifyContent: "center", alignItems: "center" },
  thumbEmoji: { fontSize: 20 },
  rowInfo: { flex: 1, gap: 2 },
  rowBrand: { ...typography.label, color: colors.gold, fontSize: 13 },
  rowModel: { ...typography.body, color: colors.textPrimary, fontSize: 14 },
  bestForPill: {
    alignSelf: "flex-start",
    borderColor: colors.goldMuted,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 2,
  },
  bestForPillText: { ...typography.caption, color: colors.goldMuted, fontSize: 10 },
  footer: {
    ...typography.label,
    color: colors.gold,
    fontSize: 12,
    marginTop: spacing.md,
    textAlign: "right",
  },
});
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/share/CollectionShareCard.tsx
git commit -m "Redesign CollectionShareCard as a per-watch detail list"
git push
```

---

## Task 12: Manual verification pass

No automated test convention exists for screens/components in this codebase. Verification is manual, via the EAS dev-client build already installed (no new native dependency in this plan, so no rebuild is needed).

**Files:** none (verification only)

- [ ] **Step 1: Restart Metro and reload the app**

Run `npm start`, reload the app on the connected device.

- [ ] **Step 2: Verify the picker**

Open Edit Details on a saved watch, scroll to "BEST FOR," select "Formal," save. Confirm it navigates back without error.

- [ ] **Step 3: Verify display on Home and Results**

Confirm the watch's Home grid card now shows a small gold-outlined "Formal" pill below the price. Open that watch's Results screen — confirm the same pill appears near the reference-number badge.

- [ ] **Step 4: Verify a watch with no tag set shows nothing**

Pick a different watch that has never had "Best For" set. Confirm no empty pill or layout gap appears on its Home card or Results screen.

- [ ] **Step 5: Verify individual share**

On the tagged watch's Results screen, tap "Share." Confirm the captured `WatchShareCard` PNG includes the "Formal" pill. Long-press the same watch's Home card → Share — confirm the same pill appears in that share path too.

- [ ] **Step 6: Verify collective share**

Tag at least 2 of your watches with different "Best For" values, leave at least 1 watch untagged. Tap "Share Collection" on the Home tab's stats card. Confirm the captured `CollectionShareCard` PNG shows a vertical list — each row with a thumbnail, brand, model, and the pill where set (no pill, no gap, for the untagged one).

- [ ] **Step 7: Verify sync resets on edit**

For a watch that has already synced (shows the ☁️ badge), set or change its "Best For" value and save. Check the Supabase dashboard's `portfolio` table directly — confirm `best_for` reaches the row after the next app foreground/sync pass.

- [ ] **Step 8: Final commit (if any fixes were needed during manual testing)**

If manual testing surfaced bugs requiring code changes, fix them, re-run `npm run typecheck`, and commit + push each fix separately with a descriptive message before considering this plan complete.
