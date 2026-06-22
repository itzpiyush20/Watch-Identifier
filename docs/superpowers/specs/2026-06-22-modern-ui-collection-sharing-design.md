# Modern UI Redesign + Explicit Collection & Social Sharing

Date: 2026-06-22

## Goal

Two combined changes to the "AI Watch Identifier" Expo app:

1. Modernize the visual design across all 5 screens (Home/Vault, Scan, Results, Login, Signup) with fluid Reanimated animations, gradient/blur accents, and updated branding copy.
2. Change the collection model from auto-save-on-scan to an explicit "Add to Collection" action, add delete, and add social-media sharing for both individual watches and the whole collection.

## Current state (for reference)

- Palette already exists (`src/theme/colors.ts`, `src/theme/index.ts`): dark background, gold accents. Kept as-is.
- `react-native-reanimated` is installed but used in exactly one place (`ReticleOverlay.tsx`). No `expo-linear-gradient`, `expo-blur`, `expo-sharing`, or `react-native-view-shot` installed.
- `ScanScreen.runPipeline` (`src/screens/ScanScreen.tsx`) currently calls `saveToPortfolio(...)` automatically for both cache hits and fresh identifications — every scan becomes a Vault entry with no user choice.
- `usePortfolio` (`src/hooks/usePortfolio.ts`) already exposes `remove(id)`, calling `deletePortfolioEntry` (`src/database/repositories/portfolioRepo.ts`), but no UI calls it.
- `syncService.syncPortfolio` only pushes local→Supabase (`upsert`); there is no pull-back, so a local delete is never resurrected by sync.
- Branding text currently reads "THE WATCH IDENTIFIER" (login) and "Horology Vault" (home header) — inconsistent with the actual app name "AI Watch Identifier".

## 1. Visual system

Keep the existing dark/gold palette and `theme` tokens. Add:

- **expo-linear-gradient**: gold-to-transparent glow behind hero elements — Vault stats card, Results price block, Login/Signup header — and gradient fill on primary CTA buttons (replacing flat `colors.gold` background).
- **expo-blur**: frosted `BlurView` behind the Scan screen's status/error banners and bottom controls (replacing the current `rgba(0,0,0,0.72)` flat fill), and behind the delete-confirmation and share-preview modals.
- **Reanimated** (already installed):
  - Staggered entrance (`FadeInDown` + slight delay per index) for Vault grid cards and Results detail sections.
  - Spring scale-down on press for all buttons/cards (replace `Pressable`'s opacity-only feedback with an `Animated.View` wrapper using `withSpring`).
  - Animated fill/width on the Results confidence dot row and price range track (currently rendered fully static).
  - Subtle continuous pulse on the Scan reticle (extending the existing `active` prop animation in `ReticleOverlay.tsx`).
  - Card removal: fade + height collapse before the list re-renders, instead of an instant disappearance.
- **Branding copy**: "THE WATCH IDENTIFIER" → "AI WATCH IDENTIFIER" (login/signup kicker), "Horology Vault" → "My Collection" (home header). No other copy changes.

No new screens; this is a styling/animation pass over the 5 existing screens plus the small shared components (`CaptureButton`, `FlashToggle`, `ReticleOverlay`).

## 2. Explicit add-to-collection

### Scan flow change
`ScanScreen.runPipeline` (`src/screens/ScanScreen.tsx:67-137`) removes both `saveToPortfolio(...)` calls (cache-hit branch and fresh-identification branch). It only calls `setResult(result, processedFront.uri)` and navigates to `/results`. Scanning no longer writes to the database.

### Scan store
`src/store/scanStore.ts` gains a third field:

```ts
interface ScanStore {
  result: IdentifyResponse | null;
  imageUri: string | null;
  savedEntryId: string | null; // null = not yet in collection
  setResult: (result, imageUri, savedEntryId?: string | null) => void;
  clear: () => void;
}
```

- Fresh scan → `setResult(result, uri)` → `savedEntryId: null`.
- Tapping a Vault card (`app/index.tsx` `handleCardPress`) → `setResult(response, entry.image_uri, entry.id)` → `savedEntryId` pre-populated, since that result already lives in the collection.

### Results screen
- If `savedEntryId == null`: show a gold-gradient **"Add to Collection"** button. On press: call `usePortfolio().save(result, imageUri, user?.id ?? null)`, store the returned id back into `scanStore.savedEntryId`, swap the button to "Remove from Collection" with a brief success animation (checkmark + haptic).
- If `savedEntryId != null`: show an outlined **"Remove from Collection"** button. On press: confirm via `Alert`, then `usePortfolio().remove(savedEntryId)`, clear `savedEntryId`, swap button back to "Add to Collection".
- Existing "Scan Another" footer button unchanged, still calls `clear()`.

### Vault delete
- `app/index.tsx`: each card gets `onLongPress` → `Alert.alert` confirm → `usePortfolio().remove(item.id)`.
- Before the local delete, if `item.synced === 1`, fire a best-effort `supabase.from("portfolio").delete().eq("id", item.id)` (swallow errors — local delete is authoritative for this device since sync never reads back).
- Card removal animates out (fade + collapse) via Reanimated before the list re-renders.

## 3. Sharing

New dependencies: `react-native-view-shot`, `expo-sharing` (alongside `expo-linear-gradient`, `expo-blur` from section 1). All are standard Expo-compatible packages requiring no custom native code beyond the existing `expo prebuild`.

### Shared helper
`src/services/share.ts`:
```ts
export async function captureAndShare(ref: React.RefObject<View>, filename: string): Promise<void>
```
Uses `captureRef` (react-native-view-shot) to snapshot the referenced view to a PNG, then `Sharing.shareAsync` (expo-sharing) to open the native share sheet. Errors are caught and surfaced via `Alert`, mirroring existing error handling style in the codebase.

### Per-watch share card
`src/components/share/WatchShareCard.tsx` — a fixed-layout branded card (rendered off-screen, captured on demand): watch photo, brand + model + reference number, estimated value, confidence badge, "AI Watch Identifier" gold wordmark footer.
- Entry point: a **Share** icon button on the Results screen action row, and a long-press menu option on Vault cards ("Share" alongside "Delete").
- Works whether or not the watch is currently saved to the collection (share doesn't require `savedEntryId`).

### Collection summary share
`src/components/share/CollectionShareCard.tsx` — "My Collection · {N} timepieces · est. {currency total}" headline plus a thumbnail grid of up to 6 watches.
- Entry point: a **Share Collection** button on the Vault stats card (`app/index.tsx`), only shown when `entries.length > 0`.

## Out of scope

- No remote pull-back / multi-device sync of deletes (current sync is one-directional; acceptable for this app's current architecture).
- No customizable share-card templates/themes — one fixed branded layout per type.
- No changes to identification, market data, or authenticity logic.

## Testing

- Manual verification per `verify`/`run` flow: scan a watch, confirm it does NOT appear in Vault until "Add to Collection" is tapped; confirm Remove works and removes from both local DB and Supabase (when synced); confirm long-press delete + share menu on Vault cards; confirm share sheet opens with a rendered PNG for both per-watch and collection-summary cards.
- Visual/animation changes are not unit-testable — verified by running the app (Expo dev client) and visually confirming fluidity, no jank, and no regressions to existing scan/results functionality.
