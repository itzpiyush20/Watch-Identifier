# Manual Enrichment Fields (Phase 1) — Design

Status: Approved
Date: 2026-06-24

## Goal

Add the first 7 "required" manual fields from the broader watch-vault
product vision (purchase date, purchase price, condition, ownership status,
box available, papers available, collection name), plus make the
AI-detected fields (brand, model family, reference number) editable. This
is the first of several independent sub-projects identified while
decomposing a much larger product spec (public showcase, milestones,
portfolio value/ROI, expert mode, multi-image/OCR expansion — each gets
its own future spec). This phase unblocks all of those, since they depend
on this data existing.

## Context corrections carried into this spec

- The app is **not** Expo-Go compatible and hasn't been for a while
  (`expo-dev-client`, Reanimated v4 + worklets, and — as of this session —
  `react-native-view-shot`/`expo-sharing` are all native deps). This spec
  deliberately avoids adding any *new* native dependency so it ships
  without requiring another EAS dev-client rebuild.
- "Required" fields do not block saving. "Add to Collection" stays the
  existing one-tap action (shipped this session); these 7 fields are
  filled in afterward, anytime, never gating the core save.

## Non-goals

- The 10 "recommended" fields (acquisition source, service history,
  seller name, country purchased, personal rating, notes, tags, insurance
  value, last service date, year acquired) — deferred to a fast-follow
  spec once this edit-screen pattern exists and works.
- No native date picker or native dropdown component — both add new
  native dependencies. Date is a validated plain-text field; Condition and
  Ownership Status reuse the existing row-list selector pattern already
  used for region selection in `app/settings.tsx`.
- No Home grid card display changes — the new fields aren't surfaced
  there in this phase (that's a "showcase" concern, a separate project).
- No public showcase, milestones, or portfolio-value features — those are
  separate sub-projects that consume this data later.

## 1. Data model

**SQLite** (`src/database/migrations.ts`, migration version 3) adds 7
nullable columns to `local_portfolio`:

```sql
ALTER TABLE local_portfolio ADD COLUMN collection_name TEXT;
ALTER TABLE local_portfolio ADD COLUMN purchase_date TEXT;
ALTER TABLE local_portfolio ADD COLUMN purchase_price REAL;
ALTER TABLE local_portfolio ADD COLUMN purchase_currency TEXT;
ALTER TABLE local_portfolio ADD COLUMN condition TEXT;
ALTER TABLE local_portfolio ADD COLUMN ownership_status TEXT;
ALTER TABLE local_portfolio ADD COLUMN box_available INTEGER;
ALTER TABLE local_portfolio ADD COLUMN papers_available INTEGER;
```

`purchase_date` is stored as a plain `YYYY-MM-DD` string (not an epoch
timestamp) — it's a calendar date with no time/timezone meaning, and a
plain string avoids any timezone-conversion bugs when displaying it back.
`purchase_currency` defaults to the device currency (`getDeviceCurrency()`,
already used elsewhere) at the time the field is first filled in, since a
user's purchase currency may differ from the market-valuation currency.
`condition` and `ownership_status` are stored as their literal display
strings (e.g. `"Very Good"`, `"Currently Owned"`) — simpler than an enum
mapping for a small, stable set of values.

**Supabase** (`supabase/migrations/004_manual_enrichment.sql`) mirrors the
same 7 columns on `public.portfolio`, nullable. No RLS policy changes
needed — the existing `portfolio_owner_update` policy
(`auth.uid() = user_id`) already covers updates to these new columns.

## 2. Repository layer

New function in `src/database/repositories/portfolioRepo.ts`:

```ts
updatePortfolioEntry(db, id, updates: Partial<Pick<PortfolioEntry,
  "brand" | "model_family" | "reference_number" | "collection_name" |
  "purchase_date" | "purchase_price" | "purchase_currency" | "condition" |
  "ownership_status" | "box_available" | "papers_available"
>>): Promise<void>
```

**Critical detail:** this function sets `synced = 0` on the edited row.
Without this, an edit to an already-synced row (`synced = 1`) would never
reach Supabase — `syncPortfolio` only ever looks at `synced = 0` rows via
`listUnsyncedEntries`. Resetting the flag on every edit makes the existing
upsert-based sync mechanism pick up the change on its next pass, with no
other changes needed to the sync logic itself.

## 3. Sync

`src/services/syncService.ts`'s `rowsToSync` mapping gains the 7 new
fields (plus the now-editable `brand`/`model_family`/`reference_number`,
which were already included). No other change to `syncPortfolio` — the
existing upsert(`onConflict: "id"`) already overwrites the full row.

## 4. Edit screen

New route `app/edit-watch.tsx`. One screen handles both AI-detected fields
and the new manual fields — editing brand/model/reference and filling in
purchase details are the same user action ("correct or complete this
record"), not two separate flows.

**Entry point:** an "Edit Details" button on the Results screen
(`app/results.tsx`), visible whenever `savedEntryId != null` — i.e. after
either tapping "Add to Collection" or reopening a saved watch from Home.
Navigates to `/edit-watch?id={savedEntryId}`.

**Fields, in order:**
- Brand (text input, prefilled)
- Model Family (text input, prefilled)
- Reference Number (text input, prefilled, nullable)
- Collection Name (text input)
- Purchase Date (text input, `YYYY-MM-DD`, validated on save — invalid
  format shows an inline error, not a blocking alert; an empty value is
  always valid)
- Purchase Price (numeric input) + currency (defaults to
  `getDeviceCurrency()`, shown as a label, not editable in this phase)
- Condition (row-list selector, 7 options: New, Unworn, Excellent, Very
  Good, Good, Fair, Poor — same UI pattern as `app/settings.tsx`'s region
  picker)
- Ownership Status (row-list selector, 3 options: Currently Owned,
  Previously Owned, Wishlist)
- Box Available (toggle)
- Papers Available (toggle)

**Save behavior:** a single "Save" button calls `updatePortfolioEntry`
with whatever fields are filled in — no field is required to submit,
matching the "never force, never block" rule carried over from the
broader product vision. Required-ness is communicated only via a small
"required" label next to Collection Name, Purchase Date, Purchase Price,
Condition, Ownership Status, Box Available, and Papers Available (the 7
fields from the original product spec) — visual hint only, not
validation.

## Testing

No automated test convention exists for screens/components in this
codebase (confirmed across two prior projects this session). Verification
is manual, via the EAS dev-client build already installed (no rebuild
needed — no new native dependency):

- Add a watch to the collection, open "Edit Details", fill in all 7
  fields + correct the brand, save — confirm the watch's data updates on
  Home/Results.
- Edit an already-synced watch (one that's been online and synced before)
  — confirm it shows `synced = 0` again locally and gets pushed to
  Supabase on the next app foreground/sync pass (verify the Supabase row
  directly via the dashboard or a SQL query).
- Leave all 7 fields blank and save — confirm it succeeds with no error
  (proves nothing blocks on missing fields).
- Enter an invalid purchase date (e.g. "not a date") — confirm an inline
  error appears and the rest of the form remains editable/saveable after
  correcting it.
