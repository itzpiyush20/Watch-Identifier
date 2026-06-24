# "Best For" Specialty Tag — Design

Status: Approved
Date: 2026-06-25

## Goal

Add a short, user-entered "Best For" specialty tag to each watch (e.g. "Best
for Formal Wear"), and use it to make the collective share card actually
informative per-watch instead of a bare thumbnail grid. This is a fast-follow
to `2026-06-24-manual-enrichment-fields-design.md`, reusing the same edit
screen and update path.

## Context corrections carried into this spec

- `CollectionShareCard` (`src/components/share/CollectionShareCard.tsx`)
  currently renders a 104×104 thumbnail grid with no per-watch text — title
  and a single collection-wide total are the only text on the card. Adding
  brand + model + a specialty tag per watch requires a layout change, not
  just an addition.
- `WatchShareCard` already shows brand/model/reference/value/confidence per
  watch (built in the collection-sharing project) — it only needs the new
  tag added alongside what's already there.
- The manual-enrichment edit screen (`app/edit-watch.tsx`) already has a
  working row-list selector pattern (Condition, Ownership Status) and a
  `updatePortfolioEntry` save path that resets `synced = 0` so edits ride
  the existing one-directional upsert sync with no new sync code.

## Non-goals

- No AI/LLM involvement — this is explicitly user-entered, not inferred at
  identification time, per the decision to ship faster and stay accurate.
- No free-text variant — a fixed picker keeps share-card layout predictable.
- No display on the Profile screen — not requested.
- No change to identification schema, prompt, or market valuation.

## 1. Data model

**SQLite** (`src/database/migrations.ts`, migration version 4):

```sql
ALTER TABLE local_portfolio ADD COLUMN best_for TEXT;
```

**Supabase** (`supabase/migrations/005_best_for.sql`) mirrors the same
column on `public.portfolio`, nullable. No RLS changes needed — the
existing `portfolio_owner_update` policy already covers it.

Stored as the literal display string, same pattern as `condition` and
`ownership_status` (simpler than an enum mapping for a small, stable set of
values). Picker options:

`Formal`, `Party`, `Sport / Active`, `Everyday / Casual`, `Dress`, `Travel`

## 2. Repository, sync, and type changes

- `PortfolioEntry` type gains `best_for: string | null`.
- `updatePortfolioEntry`'s allowed-fields union gains `"best_for"` (no other
  change — it already sets `synced = 0` on any update).
- `syncService.ts`'s `rowsToSync` mapping gains `best_for`.

## 3. Edit Details screen

`app/edit-watch.tsx` gains a new section, "BEST FOR," placed after
"OWNERSHIP STATUS," using the exact same row-list `Pressable` + checkmark
pattern already used for Condition and Ownership Status. Optional — no
"required" label, since this is new and outside the original 7 required
fields from the manual-enrichment project.

```ts
const BEST_FOR_OPTIONS = ["Formal", "Party", "Sport / Active", "Everyday / Casual", "Dress", "Travel"];
const [bestFor, setBestFor] = React.useState<string | null>(entry?.best_for ?? null);
```

Included in the `handleSave` call to `updatePortfolioEntry` alongside the
existing fields.

## 4. Display: Home grid card

In `WatchCard` (`app/(tabs)/index.tsx`), render a small gold-outlined pill
below `cardModel`, only when `item.best_for` is set:

```tsx
{item.best_for && (
  <View style={styles.bestForPill}>
    <Text style={styles.bestForPillText}>{item.best_for}</Text>
  </View>
)}
```

## 5. Display: Results screen

In `app/results.tsx`'s `detailsCard` block, render the same pill style
immediately after the reference-number badge, reading
`savedEntryId`-resolved entry data — since `result`/`identification` don't
carry `best_for` (it's a portfolio-only field, not part of the AI
identification response), this requires looking up the saved entry via
`usePortfolio` by `savedEntryId`, same lookup pattern already used in
`app/edit-watch.tsx`. Only rendered when a saved entry with `best_for` set
exists; not shown for an unsaved fresh scan (there's nothing to look up
yet).

## 6. Display: WatchShareCard (individual share)

`src/components/share/WatchShareCard.tsx` gains an optional `bestFor: string
| null` prop, rendered as a pill next to the confidence line. Both call
sites (`app/results.tsx`, `app/(tabs)/index.tsx`'s long-press share) pass
the saved entry's `best_for`.

## 7. Display: CollectionShareCard (collective share) — layout change

`src/components/share/CollectionShareCard.tsx` changes from a thumbnail
grid to a **vertical list**, since each row now needs three pieces of text
(brand, model, tag) plus an image — a 104×104 grid cell has no room for
that. Still capped at the first 6 entries (unchanged from today), since
this is a single static captured image, not a scrollable view.

Each row: a 56×56 thumbnail on the left, brand (bold) + model (secondary)
stacked on the right, with the "Best For" pill below the model line when
set. The card header (title + count + total value) is unchanged.

```tsx
interface CollectionShareCardProps {
  entries: PortfolioEntry[]; // now reads .brand, .model_family, .best_for too
  totalValue: number;
  currency: string;
}
```

## Testing

No automated test convention exists for screens/components in this
codebase. Verification is manual, via the EAS dev-client build (no new
native dependency, no rebuild needed):

- Open Edit Details on a saved watch, pick a "Best For" option, save —
  confirm the pill appears on the Home grid card and on the Results screen.
- Leave "Best For" unset on another watch — confirm no pill renders
  anywhere for it (no empty pill, no layout gap).
- Share that watch individually — confirm the pill appears on the captured
  `WatchShareCard` PNG.
- Tap "Share Collection" with at least 3 watches, some with "Best For" set
  and some without — confirm the captured `CollectionShareCard` PNG shows a
  vertical list with brand/model/tag per row, correctly omitting the pill
  for entries without one.
- Edit an already-synced watch's "Best For" — confirm it shows `synced = 0`
  again and the new value reaches the Supabase row on the next sync pass.
