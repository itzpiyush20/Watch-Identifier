# Phase 5 Market Valuation Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-search, single-percentile eBay valuation in `api/_lib/market/ebay.ts` with a multi-strategy search → keyword/condition filtering → IQR outlier removal → confidence-scored valuation pipeline, normalized by Groq (not Gemini, not xAI Grok), persisted to two new Supabase tables, and surfaced honestly as **active-listing-derived**, not sold-price data.

## Locked decisions this plan must honor (confirmed with user 2026-06-22)

1. **eBay data source stays Browse API (active listings only).** No Marketplace Insights, no Finding API. All new logic (filtering, condition tiers, IQR, confidence) runs on active listings. Every user-facing label says "estimated from active asking prices," never "sold price." `market_source` stays `EBAY_ACTIVE`; the spec's `EBAY_SOLD` enum value is dead code and is **not** used.
2. **One LLM provider: Groq** (`GROQ_API_KEY`, `api.groq.com`, Llama-4-Scout). The codebase's `identifyWithGemini()` in `api/_lib/gemini.ts` already calls Groq, not Google Gemini or xAI Grok — that naming is stale and gets fixed in Task 8. The new normalization step reuses the exact same client.
3. Build behind the existing `MarketDataProvider` interface (`api/_lib/market/provider.ts`) and inside `EbayMarketProvider` (`api/_lib/market/ebay.ts`). Extend `MarketRange`/`MarketSource` in `src/types/index.ts` rather than replacing them.
4. Do not break the Phase 8 analytics/Sentry wiring in `api/identify.ts` (`trackEvent`, `captureException`, cache-then-quota-then-identify-then-market flow).
5. New tables follow the migration conventions in `supabase/migrations/001_initial_schema.sql` / `002_analytics_events.sql`: service-role-only writes, RLS enabled, no client policies, `gen_random_uuid()` PKs. There is no `watches` table — `watch_id` in the spec maps to `public.portfolio(id)` (the per-scan record), nullable since valuation runs on the identify path before any portfolio row may exist.

**Tech stack:** TypeScript, Zod, Vercel serverless functions, Supabase REST (service-role key), Groq OpenAI-compatible chat completions API, eBay Browse API.

**Testing note (deviation from default TDD steps):** This repo has zero existing automated tests and Phase 8 explicitly used manual verification. Each task ends with a manual/`tsc` verification step instead of a unit test. Run `npx tsc --noEmit` after every code task.

---

### Task 1: `valuation_sources` + `market_snapshots` migration

**Files:**
- Create: `supabase/migrations/003_market_valuation.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 003: market valuation sources + snapshots
-- Apply via: supabase db push  (or paste into Supabase SQL editor)

-- =========================================================================
-- valuation_sources — one row per eBay active listing used as a comparable
-- in a valuation run. watch_id references the portfolio scan it was
-- computed for; nullable because valuation runs before a scan is saved.
-- Written ONLY by the server (service-role key bypasses RLS).
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.valuation_sources (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_id          UUID        NULL REFERENCES public.portfolio(id) ON DELETE CASCADE,
  marketplace       TEXT        NOT NULL DEFAULT 'ebay',
  listing_id        TEXT        NOT NULL,
  title             TEXT        NOT NULL,
  listing_price     NUMERIC(12,2) NOT NULL,
  sold_price        NUMERIC(12,2) NULL, -- always NULL today; Browse API has no sold data
  currency          TEXT        NOT NULL,
  condition         TEXT        NOT NULL, -- one of CONDITION_TIERS, see src/types/index.ts
  listing_url       TEXT        NOT NULL,
  sold_date         TIMESTAMPTZ NULL,     -- always NULL today, see sold_price
  confidence_score  NUMERIC(5,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_valuation_sources_watch ON public.valuation_sources (watch_id);

ALTER TABLE public.valuation_sources ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) may read/write.

-- =========================================================================
-- market_snapshots — one row per valuation run, the aggregated result.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.market_snapshots (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_id            UUID        NULL REFERENCES public.portfolio(id) ON DELETE CASCADE,
  median_price        NUMERIC(12,2) NULL,
  private_sale_range  JSONB       NOT NULL DEFAULT '{}', -- {low, high}
  dealer_range        JSONB       NOT NULL DEFAULT '{}', -- {low, high}
  trade_in_range      JSONB       NOT NULL DEFAULT '{}', -- {low, high}
  sample_size         INTEGER     NOT NULL DEFAULT 0,
  valuation_confidence NUMERIC(5,2) NOT NULL CHECK (valuation_confidence BETWEEN 0 AND 100),
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_watch ON public.market_snapshots (watch_id, generated_at DESC);

ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) may read/write.
```

- [ ] **Step 2: Apply the migration**

Run in the Supabase SQL editor (or `supabase db push`), then confirm in the
Table Editor that both tables exist with the columns above.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_market_valuation.sql
git commit -m "Add valuation_sources and market_snapshots tables for Phase 5 rewrite"
```

---

### Task 2: Extend domain types/schemas

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add condition tiers + confidence band, after `MarketSource` (line 65)**

```typescript
export const ConditionTier = {
  NEW: "new",
  UNWORN: "unworn",
  EXCELLENT: "excellent",
  VERY_GOOD: "very_good",
  GOOD: "good",
  FAIR: "fair",
  POOR: "poor",
} as const;
export type ConditionTier = (typeof ConditionTier)[keyof typeof ConditionTier];

export const ValuationConfidenceBand = {
  VERY_HIGH: "very_high", // 90-100
  HIGH: "high",           // 75-89
  MODERATE: "moderate",   // 50-74
  LOW: "low",             // <50
} as const;
export type ValuationConfidenceBand =
  (typeof ValuationConfidenceBand)[keyof typeof ValuationConfidenceBand];

export function valuationConfidenceBand(score: number): ValuationConfidenceBand {
  if (score >= 90) return ValuationConfidenceBand.VERY_HIGH;
  if (score >= 75) return ValuationConfidenceBand.HIGH;
  if (score >= 50) return ValuationConfidenceBand.MODERATE;
  return ValuationConfidenceBand.LOW;
}
```

- [ ] **Step 2: Replace `MarketRangeSchema` (lines 67-78) with an extended version**

Keep every existing field (nothing client code reads today may disappear) and
add the new ones as optional-with-default so old cached responses still
parse:

```typescript
export const PriceRangeSchema = z.object({
  low: z.number().nullable(),
  high: z.number().nullable(),
});
export type PriceRange = z.infer<typeof PriceRangeSchema>;

export const TrendSchema = z.object({
  trend_30d_pct: z.number().nullable(),
  trend_90d_pct: z.number().nullable(),
  trend_1y_pct: z.number().nullable(),
  avg_days_to_sell: z.number().nullable(), // always null: no sold-date data, see Task 1 note
  active_listing_count: z.number().int().nonnegative(),
  sold_listing_count: z.number().int().nonnegative(), // always 0 today
});
export type Trend = z.infer<typeof TrendSchema>;

export const MarketRangeSchema = z.object({
  low_estimate: z.number().nullable(),
  median_estimate: z.number().nullable(),
  high_estimate: z.number().nullable(),
  currency: z.string(),
  market_source: z.nativeEnum(MarketSource),
  sample_size: z.number().int().nonnegative(),
  is_asking_price: z.boolean(),
  disclaimer: z.string(),
  // --- new fields ---
  private_sale_range: PriceRangeSchema.default({ low: null, high: null }),
  dealer_range: PriceRangeSchema.default({ low: null, high: null }),
  trade_in_range: PriceRangeSchema.default({ low: null, high: null }),
  auction_estimate: PriceRangeSchema.default({ low: null, high: null }),
  confidence_score: z.number().min(0).max(100).default(0),
  confidence_band: z.nativeEnum(ValuationConfidenceBand).default(ValuationConfidenceBand.LOW),
  listing_date_range: z.object({
    earliest: z.string().nullable(),
    latest: z.string().nullable(),
  }).default({ earliest: null, latest: null }),
  last_updated: z.string(), // ISO timestamp, set at response time
  trend: TrendSchema.default({
    trend_30d_pct: null, trend_90d_pct: null, trend_1y_pct: null,
    avg_days_to_sell: null, active_listing_count: 0, sold_listing_count: 0,
  }),
});
export type MarketRange = z.infer<typeof MarketRangeSchema>;
```

- [ ] **Step 3: `npx tsc --noEmit`** — fix any call sites that construct a
`MarketRange` object literal without the new fields (Zod `.default()` only
helps on *parse*, not on literal object construction in `ebay.ts`, so Task 4
must supply every field explicitly).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "Extend MarketRange schema with condition tiers, confidence scoring, and trend fields"
```

---

### Task 3: Alias/nickname table

**Files:**
- Create: `api/_lib/market/aliases.ts`

- [ ] **Step 1: Static alias map, keyed by lowercase `brand model_family`**

Hand-author ~20-30 well-known entries to start (e.g. `"rolex submariner": ["sub", "kermit", "hulk", "no date"]`,
`"omega speedmaster": ["moonwatch"]`). Keep it a plain exported `Record<string, string[]>`
with a `getAliases(brand, modelFamily): string[]` lookup that lowercases and
falls back to `[]`. This is intentionally static data, not Groq-generated —
Groq is used to *match* listings against these aliases (Task 6), not to
invent them.

- [ ] **Step 2: Commit**

```bash
git add api/_lib/market/aliases.ts
git commit -m "Add static brand/model alias table for multi-strategy eBay search"
```

---

### Task 4: Multi-strategy eBay search + keyword filter

**Files:**
- Modify: `api/_lib/market/ebay.ts`
- Create: `api/_lib/market/filters.ts`

- [ ] **Step 1: `filters.ts` — exclude-keyword list + predicate**

```typescript
export const EXCLUDE_TERMS = [
  "parts only", "for repair", "not working", "broken", "empty box",
  "papers only", "replica", "fake", "counterfeit", "homage",
  "aftermarket dial", "custom", "frankenwatch",
] as const;

export function isExcludedTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return EXCLUDE_TERMS.some((term) => lower.includes(term));
}
```

- [ ] **Step 2: Rewrite `EbayMarketProvider.getRange` query strategy**

Replace the single `q: searchString` Browse API call with up to three
parallel calls (skip a strategy if its query string would be empty),
dedupe by `itemId`, then apply `isExcludedTitle` before any price math:

1. Exact reference number (if present in the query input — see Task 9 for
   how `MarketQuery` gains a `referenceNumber` field).
2. `brand + model_family`.
3. `brand + model_family + alias` for each alias from Task 3, capped at 2
   extra calls to avoid rate-limit blowup.

Use `Promise.all`, merge `itemSummaries`, dedupe on `itemId`, filter out
excluded titles, *then* feed the survivors into Task 5 (condition/outlier)
instead of the current direct percentile call. This requires widening
`MarketQuery` (Task 9) — stub that field as optional first so this task
compiles standalone, then wire it through in Task 9.

- [ ] **Step 3: `npx tsc --noEmit`**, then manual check: call `/api/identify`
locally with a known reference number and confirm (via temporary
`console.log`, removed before commit) that more than one Browse API request
fires and duplicate `itemId`s are removed.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/market/ebay.ts api/_lib/market/filters.ts
git commit -m "Add multi-strategy eBay search and keyword-based listing filter"
```

---

### Task 5: Condition tiers, IQR outlier removal, confidence scoring

**Files:**
- Create: `api/_lib/market/scoring.ts`

- [ ] **Step 1: Pure functions, fully unit-testable in isolation (no network)**

```typescript
import { ConditionTier } from "../../../src/types/index.js";

/** Condition multiplier applied to a listing price before aggregation. */
export const CONDITION_MULTIPLIER: Record<ConditionTier, number> = {
  [ConditionTier.NEW]: 1.05,
  [ConditionTier.UNWORN]: 1.0,
  [ConditionTier.EXCELLENT]: 0.95,
  [ConditionTier.VERY_GOOD]: 0.88,
  [ConditionTier.GOOD]: 0.78,
  [ConditionTier.FAIR]: 0.65,
  [ConditionTier.POOR]: 0.5,
};

export function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function quartile(sorted: number[], q: 0.25 | 0.75): number {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/** Removes prices >30% below/above the median, per spec. IQR is computed for
 *  reference/telemetry but the median ±30% band is the actual cutoff used. */
export function removeOutliers(prices: number[]): { kept: number[]; iqr: [number, number] } {
  const sorted = [...prices].sort((a, b) => a - b);
  const med = median(sorted);
  const iqr: [number, number] = sorted.length
    ? [quartile(sorted, 0.25), quartile(sorted, 0.75)]
    : [0, 0];
  if (med == null) return { kept: [], iqr };
  const lo = med * 0.7, hi = med * 1.3;
  return { kept: sorted.filter((p) => p >= lo && p <= hi), iqr };
}

export interface ConfidenceInputs {
  comparableCount: number;
  referenceNumberCertain: boolean; // true if search used an exact ref number match
  conditionMatchQuality: number;   // 0-1, how many listings had a confidently-extracted condition
  listingQuality: number;          // 0-1, fraction of fetched listings that survived filtering
}

/** 0-100. No sold-listing recency/liquidity term yet — Browse API gives us
 *  none; revisit if a sold-data source is ever added (see locked decision #1). */
export function computeConfidence(inputs: ConfidenceInputs): number {
  const countScore = Math.min(1, inputs.comparableCount / 15) * 40;
  const refScore = (inputs.referenceNumberCertain ? 1 : 0.4) * 20;
  const conditionScore = inputs.conditionMatchQuality * 20;
  const qualityScore = inputs.listingQuality * 20;
  let score = countScore + refScore + conditionScore + qualityScore;
  if (inputs.comparableCount < 5) score = Math.min(score, 49); // force LOW per spec
  return Math.round(Math.max(0, Math.min(100, score)));
}
```

- [ ] **Step 2: Manual verification** — write a one-off `node -e` or temp
script feeding a known price array through `removeOutliers`/`computeConfidence`
and eyeball the output; delete the script before committing.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/market/scoring.ts
git commit -m "Add IQR outlier removal, condition multipliers, and confidence scoring"
```

---

### Task 6: Groq listing normalization

**Files:**
- Create: `api/_lib/market/normalize.ts`

- [ ] **Step 1: Reuse the exact Groq call pattern from `api/_lib/gemini.ts`
(`env.groq.apiKey`, `env.groq.model`, `response_format: json_object`)**, but
text-only (no images) and batched: one call per up to ~20 listing titles,
asking Groq to return, per listing, `{ id, standardized_title, condition:
ConditionTier, attributes: {...}, alias_match: boolean, mismatch_reason:
string | null }`.

- [ ] **Step 2: Hard constraint enforcement** — the Zod schema for Groq's
response **must not include any price field**. If Groq's raw JSON output
happens to include a `price` key (it shouldn't be prompted for one), the
parser must strip it via `.strict()` rejection or explicit `omit`, so a
hallucinated price can never reach the aggregation step. Add this as an
explicit code comment, not just a prompt instruction — prompts are not a
security boundary.

```typescript
const GroqListingSchema = z.object({
  id: z.string(),
  standardized_title: z.string(),
  condition: z.nativeEnum(ConditionTier),
  alias_match: z.boolean(),
  mismatch_reason: z.string().nullable(),
}).strict(); // rejects any extra key, e.g. a hallucinated "price"
```

- [ ] **Step 3: Prompt rules** (mirror the hedging style already used in
`gemini.ts`'s `PROMPT_SINGLE`): "Classify condition only from words in the
title (e.g. 'new', 'unworn', 'mint', 'good', 'parts', 'as-is'); if no
condition language is present, return `good` as a neutral default. Never
output a price. Never invent a reference number." Explain valuation logic
and trend summaries are separate, smaller prompts added in Task 7 — keep
this one single-purpose (classification, not narration) so failures are
isolated.

- [ ] **Step 4: Failure mode** — if Groq is unreachable or returns malformed
JSON, fall back to `condition: GOOD`, `alias_match: false` for every listing
(best-effort, matching the existing `EbayMarketProvider` pattern of "pricing
is best-effort; identification still returns"). Never throw out of this
module.

- [ ] **Step 5: `npx tsc --noEmit`, then commit**

```bash
git add api/_lib/market/normalize.ts
git commit -m "Add Groq-based listing title/condition normalization with no-price-output guarantee"
```

---

### Task 7: Groq valuation explanation + trend summary

**Files:**
- Create: `api/_lib/market/explain.ts`

- [ ] **Step 1:** One more Groq call, given only the *already-computed*
numbers (median, range, sample size, confidence, trend deltas) — never raw
listings — asking for a 2-3 sentence plain-English explanation string. This
ordering (numbers computed first, Groq explains after) is what makes "Grok
must not invent prices / override marketplace data" structurally true rather
than just a prompt request: the LLM physically never sees a code path where
its output becomes a price.

- [ ] **Step 2: Commit**

```bash
git add api/_lib/market/explain.ts
git commit -m "Add Groq valuation explanation generated from pre-computed numbers only"
```

---

### Task 8: Rename `gemini.ts` → `groq.ts` (fix stale naming)

**Files:**
- Rename: `api/_lib/gemini.ts` → `api/_lib/groq.ts`
- Modify: `api/identify.ts` (import + call site)

- [ ] **Step 1:** `git mv api/_lib/gemini.ts api/_lib/groq.ts`, rename
`identifyWithGemini` → `identifyWithGroq` and `GeminiRawSchema` →
`GroqIdentifyRawSchema` inside the file (pure rename, no logic change).

- [ ] **Step 2:** Update `api/identify.ts` line 16 import and line 72 call
site to match.

- [ ] **Step 3: `npx tsc --noEmit`, manual smoke test of `/api/identify`,
then commit**

```bash
git add api/_lib/groq.ts api/identify.ts
git commit -m "Rename identifyWithGemini to identifyWithGroq to match actual provider"
```

(Do this rename in its own commit, separate from Task 9's bigger wiring
change, so it's trivially revertable if anything depends on the old name
elsewhere.)

---

### Task 9: Wire it all together in `EbayMarketProvider`

**Files:**
- Modify: `api/_lib/market/provider.ts` (widen `MarketQuery`)
- Modify: `api/_lib/market/ebay.ts` (orchestrate Tasks 3-7)
- Modify: `api/identify.ts` (pass new query fields)

- [ ] **Step 1: Widen `MarketQuery`**

```typescript
export interface MarketQuery {
  searchString: string;
  referenceNumber: string | null;
  brand: string;
  modelFamily: string;
  region: RegionConfig;
}
```

- [ ] **Step 2: `EbayMarketProvider.getRange` becomes the orchestrator**:
multi-search (Task 4) → filter excluded titles (Task 4) → Groq normalize
(Task 6) → drop listings where `mismatch_reason` is non-null → apply
`CONDITION_MULTIPLIER` (Task 5) to each price → `removeOutliers` (Task 5) on
the adjusted prices → compute median/percentile ranges → derive
`private_sale_range`/`dealer_range`/`trade_in_range`/`auction_estimate` as
fixed multiplier bands off the median (document the multipliers as tunables
near `ASKING_TO_ESTIMATE`, e.g. dealer = median × [1.1, 1.3], trade-in =
median × [0.6, 0.75]) → `computeConfidence` (Task 5) → Groq explain (Task 7)
→ assemble the extended `MarketRange`. Trend fields (`trend_30d_pct` etc.)
stay `null`/`0` for this phase — there is no historical snapshot to diff
against yet (that requires `market_snapshots` to have accumulated history
across runs; revisit once Task 1's table has weeks of data).

- [ ] **Step 3:** Update `api/identify.ts` line 75-78 call site to pass
`referenceNumber`, `brand`, `modelFamily` from `identification`.

- [ ] **Step 4: `npx tsc --noEmit`, manual end-to-end test**: scan a real
watch photo, confirm the response includes populated
`private_sale_range`/`dealer_range`/`confidence_score`/`confidence_band` and
that `market_source` is still `EBAY_ACTIVE` with `is_asking_price: true`.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/market/provider.ts api/_lib/market/ebay.ts api/identify.ts
git commit -m "Orchestrate multi-strategy search, condition/outlier scoring, and Groq normalization into EbayMarketProvider"
```

---

### Task 10: Persist `valuation_sources` + `market_snapshots`

**Files:**
- Create: `api/_lib/market/persist.ts`
- Modify: `api/identify.ts`

- [ ] **Step 1:** Mirror `api/_lib/analytics.ts`'s `trackEvent` pattern
exactly — best-effort Supabase REST POST with the service-role key, never
throws, no-ops if `!env.supabase.isConfigured`. Two functions:
`persistValuationSources(watchId, sources)` (bulk insert array) and
`persistMarketSnapshot(watchId, snapshot)`.

- [ ] **Step 2:** Call both from `api/identify.ts` after the response is
assembled (around line 88, alongside `cache.set`), passing `watchId: null`
since no portfolio row exists yet at scan time — this only becomes non-null
later when the client syncs a saved scan to `portfolio` and wants to
backfill an association (out of scope for this phase; leave a one-line
comment noting this is a known gap, not silently incomplete).

- [ ] **Step 3: Manual verification** — scan a watch, then check the
Supabase Table Editor for new rows in both tables with `watch_id NULL`.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/market/persist.ts api/identify.ts
git commit -m "Persist valuation sources and market snapshots for each identify request"
```

---

### Task 11: Update disclaimer copy

**Files:**
- Modify: `api/_lib/market/disclaimers.ts`
- Modify: client-side `src/constants/index.ts` `DISCLAIMERS` (keep in sync per the existing file comment)

- [ ] **Step 1:** Add the spec's exact required sentence as a second
disclaimer string (`marketContext` or similar key) used specifically near
the trend/condition-adjusted figures, while keeping the existing
`combined` string (already accurate: "derived from active marketplace
listings... not realized sale prices") as the primary one. Don't replace
working, accurate copy — append.

- [ ] **Step 2: Commit**

```bash
git add api/_lib/market/disclaimers.ts src/constants/index.ts
git commit -m "Add required market-value disclaimer text alongside existing active-listing disclaimer"
```

---

### Task 12: Client display of new valuation fields

**Files:**
- Modify: `app/results.tsx` (around lines 160-195, where `market.median_estimate` etc. already render)

- [ ] **Step 1:** Add a collapsible "Valuation breakdown" section showing
`private_sale_range`, `dealer_range`, `trade_in_range`, `confidence_band`
(as a small badge — reuse whatever badge/pill component the existing
`confidenceBand` identification UI uses, if any; check for one before adding
a new component), and `sample_size` + `last_updated`. Keep the existing
low/median/high block untouched as the primary display; this is additive.

- [ ] **Step 2: Manual verification** — run the app (`npx expo start`),
scan a watch, confirm the new section renders without layout breakage on a
small screen, and that it gracefully shows nothing/placeholder when
`sample_size` is 0.

- [ ] **Step 3: Commit**

```bash
git add app/results.tsx
git commit -m "Display valuation confidence, range breakdown, and sample metadata on results screen"
```

---

### Final Phase: Verification

- [ ] `npx tsc --noEmit` passes with zero errors across the whole repo.
- [ ] `grep -ri "gemini" api/ src/` returns nothing (naming fully migrated to Groq).
- [ ] `grep -n "EBAY_SOLD" -r api/ src/` shows the enum value still exists in
  `MarketSource` (for future use) but is never assigned anywhere in
  `api/_lib/market/`.
- [ ] Manual end-to-end scan test produces a response where every dollar
  figure traces to a real `valuation_sources` row (spot-check 2-3 prices
  against actual eBay listing URLs returned).
- [ ] Confirm `is_asking_price: true` and `market_source: "ebay_active_listings"`
  on every response — no path can claim sold-price data.
- [ ] Confirm a Groq outage (temporarily set an invalid `GROQ_API_KEY`)
  degrades to default condition/no-explanation rather than failing the whole
  `/api/identify` request.
