# Explicit Collection + Social Sharing — Design

Status: Approved
Date: 2026-06-23

## Goal

Replace auto-save-on-scan with an explicit "Add to Collection" action, add a
delete path for collection entries, and add social-media sharing for both
individual watches and a whole-collection summary. This supersedes the
sharing/collection portions of the unbuilt
`2026-06-22-modern-ui-collection-sharing-design.md` spec, which was written
against an old single-screen Vault layout (`app/index.tsx`) before the tab
navigation rewrite (Home/Scan/Profile) shipped. The visual-redesign portion
of that old spec (gradients, blur, animations) is explicitly out of scope
here — not requested, and kept separate so this stays focused.

## Current state (for reference)

- `ScanScreen.runPipeline` (`src/screens/ScanScreen.tsx:98,121`) calls
  `saveToPortfolio(...)` on both the cache-hit and fresh-identification
  branches, before the user reaches the results screen. Every scan is
  persisted with no user choice.
- `usePortfolio` (`src/hooks/usePortfolio.ts`) already exposes `save()`
  (returns the new entry's id) and `remove(id)` — both fully implemented,
  no backend changes needed.
- `app/(tabs)/index.tsx` (`HomeScreen`) is the current collection view
  ("Horology Vault" header), rendering a 2-column grid from
  `usePortfolio(user?.id)`. Tapping a card (`handleCardPress`) reconstructs
  an `IdentifyResponse` from the stored entry and navigates to `/results`,
  but does not currently pass the entry's id to `scanStore`.
- `app/(tabs)/index.tsx:33-37` already filters the displayed `entries` by
  tier retention (90-day cutoff unless `entitlement.unlimited_history`) —
  this is a view-level filter only; the underlying SQLite data is never
  deleted by retention. Any new "share collection" feature must reuse this
  same filtered `entries` array, not the unfiltered `allEntries`, so
  sharing never reveals more than what's already visible to that tier.
- `app/results.tsx` is currently purely presentational — no save/remove
  controls exist yet.
- `src/store/scanStore.ts` currently has only `result`, `imageUri`,
  `setResult(result, imageUri)`, `clear()`.
- No sharing-related packages are installed: `expo-sharing`,
  `react-native-view-shot` are both absent from `package.json`.
- Portfolio sync (`syncService.syncPortfolio`) is one-directional
  (local → Supabase `upsert` only); a local delete is never resurrected by
  sync, so deletes are safe to apply locally without a pull-back conflict.

## 1. Scan flow becomes explicit-save

Remove both `saveToPortfolio(...)` calls in `ScanScreen.runPipeline`
(`src/screens/ScanScreen.tsx:98` and `:121`). After this change, scanning
only calls `setResult(result, processedFront.uri)` and navigates to
`/results` — no database write happens during the scan itself. The
`saveToPortfolio` import/prop becomes unused in `ScanScreen.tsx` and should
be removed.

## 2. Scan store tracks save state

`src/store/scanStore.ts`:

```ts
interface ScanStore {
  result: IdentifyResponse | null;
  imageUri: string | null;
  savedEntryId: string | null; // null = not yet saved to the collection
  setResult: (result: IdentifyResponse, imageUri: string | null, savedEntryId?: string | null) => void;
  setSavedEntryId: (id: string | null) => void;
  clear: () => void;
}
```

- Fresh scan → `setResult(result, uri)` → `savedEntryId` defaults to `null`.
- Tapping a Home-tab card → `setResult(response, entry.image_uri, entry.id)`
  → `savedEntryId` pre-populated, since that result is already saved.
- `setSavedEntryId` is called by the Results screen after a successful
  save/remove, without needing to re-run `setResult`.

`app/(tabs)/index.tsx` `handleCardPress` is updated to pass `entry.id` as
the third argument to `setResult`.

## 3. Results screen: Add / Remove from Collection

In `app/results.tsx`, read `savedEntryId` from `useScanStore`.

- If `savedEntryId == null`: render an **"Add to Collection"** button. On
  press, call `usePortfolio().save(result, imageUri, user?.id ?? null)`,
  then `setSavedEntryId(returnedId)`. Show a brief success state (checkmark
  + haptic, matching existing haptic usage patterns in `ScanScreen.tsx`).
- If `savedEntryId != null`: render a **"Remove from Collection"** button
  (visually distinct — outlined, not filled, to signal a destructive
  action). On press, confirm via `Alert.alert` (matching the existing
  account-deletion confirmation pattern in `app/settings.tsx`), then call
  `usePortfolio().remove(savedEntryId)` and `setSavedEntryId(null)`.
- A separate **Share** button (see section 5) is always shown regardless of
  saved state — sharing a watch doesn't require it to be saved first.

## 4. Home tab: delete via long-press

In `app/(tabs)/index.tsx`, each card's `Pressable` gains `onLongPress`,
opening an `Alert.alert` with two actions: **Delete** and **Share**
(`Alert.alert` action-sheet style, consistent with the rest of the app's
confirmation dialogs — no new platform-specific menu component needed).

- **Delete**: confirm (a second `Alert.alert` with destructive styling,
  matching the account-deletion flow), then `usePortfolio().remove(id)`. If
  `item.synced === 1`, also fire a best-effort
  `supabase.from("portfolio").delete().eq("id", item.id)` — swallow errors,
  since the local delete is authoritative for this device (sync never reads
  remote state back).
- **Share**: invokes the per-watch share flow from section 5/6, using that
  card's entry data.

## 5. Sharing mechanics

New dependencies: `expo-sharing`, `react-native-view-shot`. Both are
standard Expo-compatible packages requiring no custom native code beyond
the existing `expo prebuild` step (no new EAS dev-client rebuild trigger
beyond what's already needed for any native dependency change — this will
require one dev-client rebuild after this ships, same as any other native
module addition).

`src/services/share.ts`:

```ts
export async function captureAndShare(
  ref: React.RefObject<View>,
  filename: string
): Promise<void>
```

Uses `captureRef` (`react-native-view-shot`) to snapshot the referenced
view to a PNG, then `Sharing.shareAsync` (`expo-sharing`) to open the native
OS share sheet — this is what makes the share generic across WhatsApp,
Instagram, etc., without integrating any per-platform SDK. Errors are caught
and surfaced via `Alert`, matching the existing error-handling style used
throughout the app (e.g. `ScanScreen.tsx`'s `catch` blocks).

## 6. Two share card components

`src/components/share/WatchShareCard.tsx` — a fixed-layout branded card,
rendered off-screen and captured on demand: watch photo, brand + model +
reference number, estimated value, confidence badge, "The Watch Identifier"
wordmark footer (using the app's actual configured name from
`app.config.ts`, not the inconsistent "AI Watch Identifier" branding floated
in the old, unbuilt spec — no rebrand is part of this project).

- Entry points: a **Share** button on the Results screen's action row, and
  the **Share** option in the Home card's long-press menu (section 4).
- Works whether or not the watch is currently saved (`savedEntryId` is
  irrelevant to sharing).

`src/components/share/CollectionShareCard.tsx` — "My Collection · {N}
timepieces · est. {currency total}" headline plus a thumbnail grid of up to
6 watches.

- Entry point: a **Share Collection** button on the Home tab's stats card
  (`app/(tabs)/index.tsx`), shown only when `entries.length > 0`.
- Uses the same tier-filtered `entries` array already computed on
  `HomeScreen` (post-retention-cutoff), not `allEntries` — a free-tier user
  sharing their collection never exposes more history than what they can
  currently see themselves.

## Out of scope

- No visual/animation redesign (gradients, blur, Reanimated polish) — not
  requested for this project; the old spec's section 1 is dropped entirely.
- No remote pull-back / multi-device sync of deletes — sync stays
  one-directional, consistent with the current architecture.
- No customizable share-card templates or themes — one fixed layout per
  card type.
- No changes to identification, market data, or authenticity logic.
- No rebranding ("AI Watch Identifier" vs "The Watch Identifier") — share
  cards use the app's actual current configured name as-is.

## Testing

No automated test convention exists for screens/components in this
codebase (confirmed during the Play Store listing prep project — `jest
--passWithNoTests` with zero existing test files). Verification is manual,
via a running dev-client build:

- Scan a watch → confirm it does NOT appear on the Home tab until "Add to
  Collection" is tapped on the Results screen.
- Tap "Remove from Collection" → confirm it disappears from Home and the
  button reverts to "Add to Collection" if the user navigates back to that
  same result.
- Long-press a Home card → Delete → confirm removal from both local SQLite
  and Supabase (when `synced === 1`).
- Long-press a Home card → Share → confirm the native share sheet opens
  with a rendered PNG of `WatchShareCard`.
- Tap "Share Collection" on the stats card → confirm the share sheet opens
  with a rendered PNG of `CollectionShareCard`, and that a lower-tier
  account with hidden (retention-filtered) entries does not see those
  hidden entries reflected in the shared summary's count/total.
