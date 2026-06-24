# Manual Enrichment Fields (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan builds on the existing worktree `C:\Users\itzpi\OneDrive\Desktop\Watch Identifier\.claude\worktrees\collection-sharing` (branch `worktree-collection-sharing`) — do NOT create a fresh worktree from master.** The edit screen's entry point depends on `savedEntryId`/`setSavedEntryId` in `scanStore` and the Results screen footer, both of which only exist on that unmerged branch.

**Goal:** Add 7 manual enrichment fields (collection name, purchase date, purchase price, condition, ownership status, box available, papers available) plus make AI-detected fields (brand, model family, reference number) editable, via a new Edit Details screen.

**Architecture:** Extend the existing local SQLite `local_portfolio` table and its Supabase mirror with 8 nullable columns (7 enrichment fields + the implicit purchase currency). Add a generic `updatePortfolioEntry` repository function that resets `synced = 0` on every edit so the existing upsert-based sync picks up changes. A new `app/edit-watch.tsx` screen reads the currently-saved entry from `usePortfolio`'s `entries` list (matched by `scanStore.savedEntryId`) and writes back through a new `update()` method on `usePortfolio`.

**Tech Stack:** Expo SQLite, Supabase Postgres, Expo Router, zustand — no new dependencies.

---

## Task 1: SQLite migration — add enrichment columns

**Files:**
- Modify: `src/database/migrations.ts`

The `MIGRATIONS` array currently has two entries (version 1, version 2). Add a third.

- [ ] **Step 1: Add migration version 3**

Find the end of the `MIGRATIONS` array (the closing `];` after the version-2 entry):
```ts
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
];
```

Replace with:
```ts
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

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck` (from `C:\Users\itzpi\OneDrive\Desktop\Watch Identifier\.claude\worktrees\collection-sharing`)
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/database/migrations.ts
git commit -m "Add SQLite migration for manual enrichment columns"
```

---

## Task 2: Extend PortfolioEntry type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the 8 new fields**

Find the `PortfolioEntry` interface (currently the last block in the file):
```ts
export interface PortfolioEntry {
  id: string;
  user_id: string | null;
  brand: string;
  model_family: string;
  reference_number: string | null;
  image_uri: string | null; // local device URI only — never uploaded
  market_data_json: string; // serialized MarketRange
  confidence_score: number;
  authenticity_caution: string; // serialized AuthenticityCaution
  scanned_at: number; // epoch ms
  synced: 0 | 1;
  expires_at: number | null;
}
```

Replace with:
```ts
export interface PortfolioEntry {
  id: string;
  user_id: string | null;
  brand: string;
  model_family: string;
  reference_number: string | null;
  image_uri: string | null; // local device URI only — never uploaded
  market_data_json: string; // serialized MarketRange
  confidence_score: number;
  authenticity_caution: string; // serialized AuthenticityCaution
  scanned_at: number; // epoch ms
  synced: 0 | 1;
  expires_at: number | null;
  // Manual enrichment fields (Phase 1) — all nullable, filled in via the
  // Edit Details screen after a watch is saved. Never required to save.
  collection_name?: string | null;
  purchase_date?: string | null; // "YYYY-MM-DD", not a timestamp
  purchase_price?: number | null;
  purchase_currency?: string | null; // ISO 4217, set when purchase_price is set
  condition?: string | null; // one of: New, Unworn, Excellent, Very Good, Good, Fair, Poor
  ownership_status?: string | null; // one of: Currently Owned, Previously Owned, Wishlist
  box_available?: 0 | 1 | null;
  papers_available?: 0 | 1 | null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors (the new fields are optional, so `usePortfolio.save()`'s existing object literal — which doesn't set them — still compiles).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "Add manual enrichment fields to PortfolioEntry type"
```

---

## Task 3: Repository — updatePortfolioEntry

**Files:**
- Modify: `src/database/repositories/portfolioRepo.ts`

- [ ] **Step 1: Extend `RawRow` with the new columns**

Find:
```ts
type RawRow = {
  id: string;
  user_id: string | null;
  brand: string;
  model_family: string;
  reference_number: string | null;
  image_uri: string | null;
  market_data_json: string;
  confidence_score: number;
  authenticity_caution: string;
  scanned_at: number;
  synced: number;
  expires_at: number | null;
};
```

Replace with:
```ts
type RawRow = {
  id: string;
  user_id: string | null;
  brand: string;
  model_family: string;
  reference_number: string | null;
  image_uri: string | null;
  market_data_json: string;
  confidence_score: number;
  authenticity_caution: string;
  scanned_at: number;
  synced: number;
  expires_at: number | null;
  collection_name: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  purchase_currency: string | null;
  condition: string | null;
  ownership_status: string | null;
  box_available: number | null;
  papers_available: number | null;
};
```

- [ ] **Step 2: Normalize the boolean-ish columns in `rowToEntry`**

Find:
```ts
function rowToEntry(row: RawRow): PortfolioEntry {
  return {
    ...row,
    synced: (row.synced === 1 ? 1 : 0) as 0 | 1,
  };
}
```

Replace with:
```ts
function rowToEntry(row: RawRow): PortfolioEntry {
  return {
    ...row,
    synced: (row.synced === 1 ? 1 : 0) as 0 | 1,
    box_available: row.box_available === 1 ? 1 : row.box_available === 0 ? 0 : null,
    papers_available: row.papers_available === 1 ? 1 : row.papers_available === 0 ? 0 : null,
  };
}
```

- [ ] **Step 3: Add `updatePortfolioEntry`**

Add this after `deletePortfolioEntry` (and before `listUnsyncedEntries`):

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

/**
 * Updates a portfolio entry's editable fields and resets synced to 0, so
 * the next sync pass pushes the change to Supabase — without this,
 * editing an already-synced row would never reach the cloud, since
 * syncPortfolio only ever looks at synced = 0 rows.
 */
export async function updatePortfolioEntry(
  db: SQLiteDatabase,
  id: string,
  updates: ManualEnrichmentUpdate
): Promise<void> {
  const fields = Object.keys(updates) as (keyof ManualEnrichmentUpdate)[];
  if (fields.length === 0) return;
  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => updates[f] ?? null);
  await db.runAsync(
    `UPDATE local_portfolio SET ${setClause}, synced = 0 WHERE id = ?;`,
    [...values, id]
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/database/repositories/portfolioRepo.ts
git commit -m "Add updatePortfolioEntry repository function"
```

---

## Task 4: Expose update() on usePortfolio

**Files:**
- Modify: `src/hooks/usePortfolio.ts`

- [ ] **Step 1: Import `updatePortfolioEntry`**

Find:
```ts
import {
  listPortfolioEntries,
  insertPortfolioEntry,
  deletePortfolioEntry,
  serializeMarketData,
  serializeAuthenticityCaution,
} from "@/database";
```

Replace with:
```ts
import {
  listPortfolioEntries,
  insertPortfolioEntry,
  deletePortfolioEntry,
  updatePortfolioEntry,
  serializeMarketData,
  serializeAuthenticityCaution,
  type ManualEnrichmentUpdate,
} from "@/database";
```

- [ ] **Step 2: Add `update` to the returned interface**

Find:
```ts
interface UsePortfolioReturn {
  entries: PortfolioEntry[];
  loading: boolean;
  save: (
    response: IdentifyResponse,
    imageUri: string | null,
    userId: string | null
  ) => Promise<string>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}
```

Replace with:
```ts
interface UsePortfolioReturn {
  entries: PortfolioEntry[];
  loading: boolean;
  save: (
    response: IdentifyResponse,
    imageUri: string | null,
    userId: string | null
  ) => Promise<string>;
  remove: (id: string) => Promise<void>;
  update: (id: string, updates: ManualEnrichmentUpdate) => Promise<void>;
  refresh: () => Promise<void>;
}
```

- [ ] **Step 3: Implement `update` and add it to the return value**

Find:
```ts
  const remove = useCallback(
    async (id: string) => {
      if (!db) throw new Error("Database not ready");
      await deletePortfolioEntry(db, id);
      await refresh();
    },
    [db, refresh]
  );

  return { entries, loading, save, remove, refresh };
}
```

Replace with:
```ts
  const remove = useCallback(
    async (id: string) => {
      if (!db) throw new Error("Database not ready");
      await deletePortfolioEntry(db, id);
      await refresh();
    },
    [db, refresh]
  );

  const update = useCallback(
    async (id: string, updates: ManualEnrichmentUpdate) => {
      if (!db) throw new Error("Database not ready");
      await updatePortfolioEntry(db, id, updates);
      await refresh();
    },
    [db, refresh]
  );

  return { entries, loading, save, remove, update, refresh };
}
```

- [ ] **Step 4: Confirm `database/index.ts` already exports the new function and type**

`src/database/index.ts` has `export * from "./repositories/portfolioRepo";` — this already re-exports `updatePortfolioEntry` and `ManualEnrichmentUpdate` from Task 3 with no change needed. Just confirm by running typecheck in the next step.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePortfolio.ts
git commit -m "Expose update() on usePortfolio hook"
```

---

## Task 5: Supabase migration for enrichment columns

**Files:**
- Create: `supabase/migrations/004_manual_enrichment.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 004: manual enrichment fields (Phase 1)
-- Apply via: supabase db push  (or paste into Supabase SQL editor)

ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS collection_name TEXT;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS purchase_date TEXT;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS purchase_price NUMERIC;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS purchase_currency TEXT;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS condition TEXT;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS ownership_status TEXT;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS box_available INTEGER;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS papers_available INTEGER;

-- box_available/papers_available are INTEGER (0/1), not BOOLEAN, to match
-- the 0/1 representation already used client-side for `synced` and to
-- avoid PostgREST's strict JSON-type coercion rejecting a JS number
-- payload against a boolean column.
```

No RLS policy changes needed — the existing `portfolio_owner_update` policy from migration 001 (`auth.uid() = user_id`) already covers writes to these new columns.

- [ ] **Step 2: Apply it**

This is a Supabase-side migration, not run by the app's test suite. Apply it by pasting the SQL into the Supabase SQL editor for this project (or `supabase db push` if the Supabase CLI is linked locally — it isn't in this environment, per earlier discovery in the Play Store prep work). Confirm by querying `information_schema.columns` for `public.portfolio` afterward, or by checking the Supabase dashboard's table editor shows the 8 new columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_manual_enrichment.sql
git commit -m "Add Supabase migration for manual enrichment columns"
```

---

## Task 6: Sync the new fields to Supabase

**Files:**
- Modify: `src/services/syncService.ts`

- [ ] **Step 1: Add the new fields to the upsert payload**

Find:
```ts
    const rowsToSync = userUnsynced.map((entry) => ({
      id: entry.id,
      user_id: userId, // Bind to authenticated user
      brand: entry.brand,
      model_family: entry.model_family,
      reference_number: entry.reference_number,
      market_data_json: JSON.parse(entry.market_data_json),
      confidence_score: entry.confidence_score,
      authenticity_caution: JSON.parse(entry.authenticity_caution),
      scanned_at: new Date(entry.scanned_at).toISOString(),
    }));
```

Replace with:
```ts
    const rowsToSync = userUnsynced.map((entry) => ({
      id: entry.id,
      user_id: userId, // Bind to authenticated user
      brand: entry.brand,
      model_family: entry.model_family,
      reference_number: entry.reference_number,
      market_data_json: JSON.parse(entry.market_data_json),
      confidence_score: entry.confidence_score,
      authenticity_caution: JSON.parse(entry.authenticity_caution),
      scanned_at: new Date(entry.scanned_at).toISOString(),
      collection_name: entry.collection_name ?? null,
      purchase_date: entry.purchase_date ?? null,
      purchase_price: entry.purchase_price ?? null,
      purchase_currency: entry.purchase_currency ?? null,
      condition: entry.condition ?? null,
      ownership_status: entry.ownership_status ?? null,
      box_available: entry.box_available ?? null,
      papers_available: entry.papers_available ?? null,
    }));
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/syncService.ts
git commit -m "Sync manual enrichment fields to Supabase"
```

---

## Task 7: Edit Details screen

**Files:**
- Create: `app/edit-watch.tsx`

- [ ] **Step 1: Write the screen**

```tsx
import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScanStore } from "@/store/scanStore";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio } from "@/hooks/usePortfolio";
import { colors, spacing, typography, radius } from "@/theme";
import { getDeviceCurrency } from "@/utils/format";

const CONDITIONS = ["New", "Unworn", "Excellent", "Very Good", "Good", "Fair", "Poor"];
const OWNERSHIP_STATUSES = ["Currently Owned", "Previously Owned", "Wishlist"];

export default function EditWatchScreen() {
  const router = useRouter();
  const { savedEntryId } = useScanStore();
  const { user } = useAuth();
  const { entries, loading, update: updatePortfolio } = usePortfolio(user?.id);
  const entry = entries.find((e) => e.id === savedEntryId);

  const [brand, setBrand] = React.useState(entry?.brand ?? "");
  const [modelFamily, setModelFamily] = React.useState(entry?.model_family ?? "");
  const [referenceNumber, setReferenceNumber] = React.useState(entry?.reference_number ?? "");
  const [collectionName, setCollectionName] = React.useState(entry?.collection_name ?? "");
  const [purchaseDate, setPurchaseDate] = React.useState(entry?.purchase_date ?? "");
  const [purchasePrice, setPurchasePrice] = React.useState(
    entry?.purchase_price != null ? String(entry.purchase_price) : ""
  );
  const [condition, setCondition] = React.useState<string | null>(entry?.condition ?? null);
  const [ownershipStatus, setOwnershipStatus] = React.useState<string | null>(
    entry?.ownership_status ?? null
  );
  const [boxAvailable, setBoxAvailable] = React.useState(entry?.box_available === 1);
  const [papersAvailable, setPapersAvailable] = React.useState(entry?.papers_available === 1);
  const [dateError, setDateError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  if (!entry) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.empty}>
          {loading ? "Loading…" : "This watch is no longer in your collection."}
        </Text>
      </SafeAreaView>
    );
  }

  const handleSave = async () => {
    const trimmedDate = purchaseDate.trim();
    if (trimmedDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      setDateError("Use YYYY-MM-DD format");
      return;
    }
    setDateError(null);

    const trimmedPrice = purchasePrice.trim();
    const parsedPrice = trimmedPrice === "" ? null : parseFloat(trimmedPrice);
    const validPrice = parsedPrice != null && !Number.isNaN(parsedPrice) ? parsedPrice : null;

    setSaving(true);
    try {
      await updatePortfolio(entry.id, {
        brand: brand.trim(),
        model_family: modelFamily.trim(),
        reference_number: referenceNumber.trim() === "" ? null : referenceNumber.trim(),
        collection_name: collectionName.trim() === "" ? null : collectionName.trim(),
        purchase_date: trimmedDate === "" ? null : trimmedDate,
        purchase_price: validPrice,
        purchase_currency: validPrice != null ? getDeviceCurrency() : null,
        condition,
        ownership_status: ownershipStatus,
        box_available: boxAvailable ? 1 : 0,
        papers_available: papersAvailable ? 1 : 0,
      });
      router.back();
    } catch (err) {
      console.error("[EditWatch] Failed to save:", err);
      Alert.alert("Error", "Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>IDENTIFICATION</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Brand</Text>
          <TextInput
            style={styles.input}
            value={brand}
            onChangeText={setBrand}
            placeholder="Brand"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.label}>Model Family</Text>
          <TextInput
            style={styles.input}
            value={modelFamily}
            onChangeText={setModelFamily}
            placeholder="Model family"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.label}>Reference Number</Text>
          <TextInput
            style={styles.input}
            value={referenceNumber}
            onChangeText={setReferenceNumber}
            placeholder="Reference number"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <Text style={styles.sectionTitle}>COLLECTION DETAILS</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Collection Name *</Text>
          <TextInput
            style={styles.input}
            value={collectionName}
            onChangeText={setCollectionName}
            placeholder="e.g. My Daily Wearers"
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={styles.label}>Purchase Date * (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={purchaseDate}
            onChangeText={(v) => {
              setPurchaseDate(v);
              setDateError(null);
            }}
            placeholder="2026-01-15"
            placeholderTextColor={colors.textTertiary}
          />
          {dateError && <Text style={styles.errorText}>{dateError}</Text>}

          <Text style={styles.label}>Purchase Price * ({getDeviceCurrency()})</Text>
          <TextInput
            style={styles.input}
            value={purchasePrice}
            onChangeText={setPurchasePrice}
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.sectionTitle}>CONDITION *</Text>
        <View style={styles.card}>
          {CONDITIONS.map((option) => (
            <Pressable key={option} style={styles.optionRow} onPress={() => setCondition(option)}>
              <Text style={styles.optionLabel}>{option}</Text>
              {condition === option && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>OWNERSHIP STATUS *</Text>
        <View style={styles.card}>
          {OWNERSHIP_STATUSES.map((option) => (
            <Pressable
              key={option}
              style={styles.optionRow}
              onPress={() => setOwnershipStatus(option)}
            >
              <Text style={styles.optionLabel}>{option}</Text>
              {ownershipStatus === option && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>

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
          <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  empty: { ...typography.body, color: colors.textSecondary, margin: spacing.xl },
  sectionTitle: { ...typography.label, color: colors.goldMuted, fontSize: 11, letterSpacing: 1 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: { ...typography.label, color: colors.textSecondary, fontSize: 12, marginTop: spacing.sm },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  errorText: { ...typography.caption, color: colors.danger },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  optionLabel: { ...typography.body, color: colors.textPrimary },
  checkmark: { ...typography.body, color: colors.gold, fontWeight: "700" },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  saveBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  saveBtnText: { ...typography.label, color: colors.textOnGold },
});
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/edit-watch.tsx
git commit -m "Add Edit Details screen for manual enrichment fields"
```

---

## Task 8: Register the new screen

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Add a Stack.Screen entry**

Find:
```tsx
      <Stack.Screen
        name="results"
        options={{ title: "Result", headerBackTitle: "Scan" }}
      />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
```

Replace with:
```tsx
      <Stack.Screen
        name="results"
        options={{ title: "Result", headerBackTitle: "Scan" }}
      />
      <Stack.Screen name="edit-watch" options={{ title: "Edit Details" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "Register edit-watch screen in root navigation stack"
```

---

## Task 9: Edit Details button on Results screen

**Files:**
- Modify: `app/results.tsx`

- [ ] **Step 1: Add the button to the footer**

Find the footer actions block:
```tsx
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
```

Replace with:
```tsx
      {/* Footer controls */}
      <View style={styles.actions}>
        <Pressable style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>Share</Text>
        </Pressable>
        {savedEntryId != null && (
          <Pressable
            style={styles.editBtn}
            onPress={() => router.push("/edit-watch")}
          >
            <Text style={styles.editBtnText}>Edit Details</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.collectionBtn, savedEntryId != null && styles.collectionBtnSaved]}
          onPress={handleToggleCollection}
          disabled={savingState === "saving"}
        >
```

(The rest of the collection-toggle `Pressable` and everything after it is unchanged — this only inserts the new conditional button between the existing Share button and the existing collection-toggle button.)

- [ ] **Step 2: Add the new style**

Find:
```ts
  shareBtnText: { ...typography.label, color: colors.textPrimary },
  offscreen: {
```

Replace with:
```ts
  shareBtnText: { ...typography.label, color: colors.textPrimary },
  editBtn: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  editBtnText: { ...typography.label, color: colors.gold },
  offscreen: {
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/results.tsx
git commit -m "Add Edit Details button to Results screen"
```

---

## Task 10: Manual verification pass

No automated test convention exists for screens/components in this codebase. Verification is manual, via the EAS dev-client build already installed for this worktree (no new native dependency in this plan, so no rebuild is needed).

**Files:** none (verification only)

- [ ] **Step 1: Restart Metro and reload the app**

From `C:\Users\itzpi\OneDrive\Desktop\Watch Identifier\.claude\worktrees\collection-sharing`, run `npm start`, reload the app on the connected device (the existing dev-client build works unchanged — no rebuild needed since no native dependency was added).

- [ ] **Step 2: Verify the edit flow end to end**

Scan a watch, tap "Add to Collection". Confirm "Edit Details" now appears in the footer. Tap it — confirm the screen shows Brand/Model/Reference prefilled, and all 7 enrichment fields empty. Fill in all fields (including selecting a Condition and Ownership Status, toggling both switches), tap Save. Confirm it navigates back without error.

- [ ] **Step 3: Verify the edit persisted**

Reopen the same watch from the Home tab. Tap "Edit Details" again. Confirm every field you entered is still there (including the corrected Brand/Model/Reference if you changed them).

- [ ] **Step 4: Verify partial save doesn't block**

Edit a different (or the same) watch, leave every field blank, tap Save. Confirm it saves successfully with no validation error blocking it.

- [ ] **Step 5: Verify the date validation**

Type "not-a-date" into Purchase Date, tap Save. Confirm an inline error appears ("Use YYYY-MM-DD format") and the screen does NOT navigate back. Correct it to a valid date, tap Save again, confirm it now succeeds.

- [ ] **Step 6: Verify sync resets on edit**

For a watch that has already synced to Supabase (has the ☁️ badge on its Home card, meaning `synced === 1`), edit and save any field. Check the Supabase dashboard's `portfolio` table directly — confirm the edited row's new column values appear there after the next app foreground (sync runs in `usePortfolio`'s background effect on mount/user-change).

- [ ] **Step 7: Final commit (if any fixes were needed during manual testing)**

If manual testing surfaced bugs requiring code changes, fix them, re-run `npm run typecheck`, and commit each fix separately with a descriptive message before considering this plan complete.
