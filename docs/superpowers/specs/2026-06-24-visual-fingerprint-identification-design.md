# Visual Fingerprint Identification — Design

Status: Approved
Date: 2026-06-24

## Goal

Extend the Groq identification prompt/schema with structured visual detail
(case, dial, strap/bracelet, complications) and use it to build
multi-query eBay search fallback, surfaced as a "Specifications" card on
the Results screen. This is Phase 1 of a larger schema proposal (the
other two pieces — AI-generated share captions, and real image background
removal — are separate later phases; background removal in particular
needs its own feasibility/cost discussion before any commitment).

## Context

The existing pipeline already uses exactly this pattern —
`response_format: { type: "json_object" }` plus Zod validation
(`api/_lib/gemini.ts`, `GeminiRawSchema`) — so this is an extension of an
established pattern, not a new architecture.

## Non-goals

- No exact sub-dial position/count claims (e.g. "sub-dial at 3 o'clock
  shows day"). VLMs are prone to confidently inventing precise
  spatial/counting details; `complications_visible` is a plain label list
  instead, with no position or count claims.
- No per-field confidence scores on every visual_fingerprint sub-field —
  one overall `visual_fingerprint_confidence`, kept simple.
- No model-generated search query strings — queries are built
  deterministically server-side from already-extracted, already-validated
  structured fields, not free text the model invents.
- No changes to `WatchShareCard`/`CollectionShareCard` or AI-generated
  captions — that's a separate, later phase.
- No image background removal/isolation — flagged as needing its own
  feasibility/cost discussion (likely a paid segmentation API or a real
  ML library, not a free side-effect of a richer prompt) before any
  commitment to build it.

## 1. Prompt/schema extension

**Files:** `api/_lib/gemini.ts`

Add to both `PROMPT_SINGLE` and `PROMPT_WITH_BACK`, and to `GeminiRawSchema`:

```ts
visual_fingerprint: z
  .object({
    case: z.object({
      shape: z.string().nullable(),
      material_appearance: z.string().nullable(),
      bezel_type: z.string().nullable(),
    }),
    dial: z.object({
      primary_color: z.string().nullable(),
      texture_pattern: z.string().nullable(),
      hour_markers_type: z.string().nullable(),
      hands_style: z.string().nullable(),
    }),
    strap_or_bracelet: z.object({
      type: z.string().nullable(),
      color: z.string().nullable(),
      material: z.string().nullable(),
    }),
    complications_visible: z.array(z.string()).max(6),
  })
  .nullable(),
visual_fingerprint_confidence: z.number().min(0).max(1),
```

Prompt instructions added alongside the existing rules:
- Each visual_fingerprint field is null if not clearly visible/legible —
  never guess a specific value with no visual basis (same discipline
  already applied to `reference_number`).
- `complications_visible` lists plain labels only (e.g. "date window",
  "chronograph sub-dials", "moonphase") — never a position (e.g. "at 3
  o'clock") or an exact count.
- `visual_fingerprint_confidence` reflects confidence in the
  visual_fingerprint block specifically, independent of the main
  `confidence_score` (which is about brand/model_family).
- If the whole watch is too obscured/blurry to assess visual details,
  set `visual_fingerprint` to `null` entirely rather than guessing.

## 2. Server-side multi-query construction

**Files:** `api/_lib/gemini.ts` (where `Identification` is assembled)

Instead of asking the model for `optimized_search_queries`, build them
deterministically from already-validated fields, most-specific-first:

```ts
function buildSearchQueries(r: {
  brand: string;
  model_family: string;
  reference_number: string | null;
  visual_fingerprint: VisualFingerprint | null;
}): string[] {
  const queries: string[] = [];
  const base = [r.brand, r.model_family].filter((x) => x && x !== "Unknown");

  if (r.reference_number) {
    queries.push([...base, r.reference_number].join(" "));
  }
  if (base.length > 0) {
    queries.push(base.join(" "));
  }
  if (r.visual_fingerprint?.case.shape || r.visual_fingerprint?.dial.primary_color) {
    queries.push(
      [
        r.brand !== "Unknown" ? r.brand : null,
        r.visual_fingerprint.case.shape,
        r.visual_fingerprint.dial.primary_color,
      ]
        .filter(Boolean)
        .join(" ")
    );
  }
  return queries.length > 0 ? queries : [r.brand];
}
```

This produces up to 3 ordered queries (exact reference → brand+model →
broad visual fallback), de-duplicated implicitly by construction order.

## 3. Types

**Files:** `src/types/index.ts`

Add `VisualFingerprintSchema` (mirrors the Zod shape in section 1) and
extend `IdentificationSchema` with:
```ts
visual_fingerprint: VisualFingerprintSchema.nullable(),
visual_fingerprint_confidence: z.number().min(0).max(1),
search_queries: z.array(z.string()).min(1),
```
`search_string` (already existing, used by the WhatsApp trade-in message,
analytics, and Home-screen portfolio-entry reconstruction) is unchanged —
`search_queries[0]` and `search_string` will typically be the same value,
but they serve different purposes and both stay.

## 4. Multi-query eBay fallback

**Files:** `api/_lib/market/provider.ts`, `api/_lib/market/ebay.ts`,
`api/identify.ts`

`MarketQuery.searchString: string` becomes `searchStrings: string[]`.
`EbayMarketProvider.getRange` tries each string in order via the existing
single-query logic, returning the first that yields `prices.length > 0`;
if all queries return zero results, it falls through to today's `empty`
result. `api/identify.ts`'s call site changes from
`searchString: identification.search_string` to
`searchStrings: identification.search_queries`.

This fixes a real gap: today, an overly-specific reference-number search
can return zero eBay matches even when a broader brand+model search
would have worked, silently producing "no market data" for a watch that
genuinely has comparable listings.

## 5. Results screen — Specifications card

**Files:** `app/results.tsx`

A new card, styled consistently with the screen's *current* plain dark
card pattern (border + radius + padding, matching `detailsCard` /
`valuationCard`) — **not** the new luxury Home-screen design system from
the separate, not-yet-applied Home redesign phase. Rendered only when
`identification.visual_fingerprint` is non-null; each row only appears if
that specific field is non-null (no "Unknown" clutter). A short
disclaimer line at the bottom — "AI-estimated from photos; verify before
purchase or insurance decisions" — matches the existing
market-disclaimer/authenticity-caution pattern already used elsewhere on
this screen, rather than hiding the whole section behind an opaque
confidence threshold.

Rows, in order, each skipped if null: Case shape, Case material, Bezel
type, Dial color, Dial texture, Hour markers, Hands style,
Strap/bracelet type, Strap/bracelet material, Complications (joined list,
only if non-empty array).

## Testing

No automated test convention exists for this codebase's screens/API
handlers beyond Zod validation. Verification is manual:

- Scan a watch with clearly visible case/dial detail — confirm the
  Specifications card appears with the expected fields populated, no
  "Unknown" rows.
- Scan a heavily obscured/blurry watch — confirm `visual_fingerprint` is
  null and the Specifications card doesn't render at all (not an
  empty/broken card).
- Confirm a watch whose exact reference-number search would return zero
  eBay results (e.g. an obscure microbrand) now falls back to a
  brand+model query and returns a market range, where it previously
  returned "no market data."
- Confirm existing `search_string`-dependent features (WhatsApp trade-in
  message, Home-screen portfolio reconstruction, analytics events) are
  unaffected by this change.
