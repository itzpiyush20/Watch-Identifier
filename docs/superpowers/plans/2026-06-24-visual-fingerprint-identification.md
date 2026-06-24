# Visual Fingerprint Identification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan builds on the existing worktree `C:\Users\itzpi\OneDrive\Desktop\Watch Identifier\.claude\worktrees\collection-sharing` (branch `worktree-collection-sharing`) — do NOT create a fresh worktree.**

**Goal:** Extend the Groq identification prompt/schema with structured case/dial/strap detail, build deterministic multi-query eBay search fallback from it, and surface it as a "Specifications" card on the Results screen.

**Architecture:** Extend `GeminiRawSchema`/the prompt in `api/_lib/gemini.ts` with a `visual_fingerprint` block; construct ordered search query strings server-side from already-validated fields (not model-generated text); change `MarketQuery` to accept multiple query strings tried in order; add a new Results screen card. No new native dependencies — this is a pure API/schema/UI change, verifiable via Metro reload alone.

**Tech Stack:** TypeScript, Zod, Groq (OpenAI-compatible chat completions API), eBay Browse API, Expo Router, React Native.

---

## Task 1: Extend the Groq prompt and raw schema

**Files:**
- Modify: `api/_lib/gemini.ts`

- [ ] **Step 1: Extend `GeminiRawSchema`**

Find:
```ts
const GeminiRawSchema = z.object({
  brand: z.string(),
  model_family: z.string(),
  reference_number: z.string().nullable(),
  confidence_score: z.number().min(0).max(1),
  possible_matches: z
    .array(
      z.object({
        brand: z.string(),
        model_family: z.string(),
        reference_number: z.string().nullable(),
        confidence_score: z.number().min(0).max(1),
      })
    )
    .max(5),
  authenticity: z.object({
    level: z.enum(["none", "review_suggested", "high_caution"]),
    note: z.string(),
  }),
  additional_image_hint: z.string().nullable(),
});
```

Replace with:
```ts
const GeminiRawSchema = z.object({
  brand: z.string(),
  model_family: z.string(),
  reference_number: z.string().nullable(),
  confidence_score: z.number().min(0).max(1),
  possible_matches: z
    .array(
      z.object({
        brand: z.string(),
        model_family: z.string(),
        reference_number: z.string().nullable(),
        confidence_score: z.number().min(0).max(1),
      })
    )
    .max(5),
  authenticity: z.object({
    level: z.enum(["none", "review_suggested", "high_caution"]),
    note: z.string(),
  }),
  additional_image_hint: z.string().nullable(),
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
});
```

- [ ] **Step 2: Extend `PROMPT_SINGLE`**

Find:
```ts
const PROMPT_SINGLE = `You are an expert horologist. Identify the wristwatch in the image (the dial/front).
Return STRICT JSON only, matching this schema exactly:
{
  "brand": string,                       // best-guess brand, or "Unknown"
  "model_family": string,                // e.g. "Submariner", or "Unknown"
  "reference_number": string | null,     // ONLY if visibly legible; else null. NEVER invent one.
  "confidence_score": number,            // 0..1 overall confidence in brand+model_family
  "possible_matches": [                  // up to 5 alternatives, most likely first
    { "brand": string, "model_family": string, "reference_number": string | null, "confidence_score": number }
  ],
  "authenticity": {                      // ADVISORY only, never definitive
    "level": "none" | "review_suggested" | "high_caution",
    "note": string                       // short, hedged observation; do not assert "fake"
  },
  "additional_image_hint": string | null // ONE specific extra photo that would most raise confidence
                                          // (e.g. "macro shot of caseback engraving"), or null if not needed
}
Rules:
- Weigh evidence in this order, highest first: (1) text/logo/wordmark printed or engraved on the dial,
  bezel, or case, (2) handset and indices shape, (3) bezel/case architecture, (4) overall styling impression.
  Higher-ranked evidence always overrides a lower-ranked guess — read printed text literally, do not
  override it with a "looks like" brand guess.
- Base brand and model_family on at least two independent visual indicators (e.g. logo text AND case/bezel
  shape) before committing to a specific answer; if you only have one weak signal, lower confidence_score
  and prefer "Unknown" or a hedged possible_matches list instead of a single confident answer.
- reference_number must be copied verbatim from text actually visible in the image. NEVER infer or
  pattern-match a reference number from the brand/model alone — if it is not legibly printed or engraved
  in the photo, use null.
- Lower confidence_score when the image is blurry, partial, or ambiguous.
- Set additional_image_hint only when confidence_score < 0.85; otherwise null.
- Output ONLY the JSON object, no markdown, no prose.`;
```

Replace with:
```ts
const PROMPT_SINGLE = `You are an expert horologist. Identify the wristwatch in the image (the dial/front).
Return STRICT JSON only, matching this schema exactly:
{
  "brand": string,                       // best-guess brand, or "Unknown"
  "model_family": string,                // e.g. "Submariner", or "Unknown"
  "reference_number": string | null,     // ONLY if visibly legible; else null. NEVER invent one.
  "confidence_score": number,            // 0..1 overall confidence in brand+model_family
  "possible_matches": [                  // up to 5 alternatives, most likely first
    { "brand": string, "model_family": string, "reference_number": string | null, "confidence_score": number }
  ],
  "authenticity": {                      // ADVISORY only, never definitive
    "level": "none" | "review_suggested" | "high_caution",
    "note": string                       // short, hedged observation; do not assert "fake"
  },
  "additional_image_hint": string | null, // ONE specific extra photo that would most raise confidence
                                          // (e.g. "macro shot of caseback engraving"), or null if not needed
  "visual_fingerprint": {                // structural/visual detail, or null if too obscured to assess
    "case": {
      "shape": string | null,            // e.g. "Round", "Tonneau", "Rectangular"; null if unclear
      "material_appearance": string | null, // e.g. "Stainless Steel", "Gold-plated"; null if unclear
      "bezel_type": string | null        // e.g. "Fixed", "Rotating Diver", "Fluted"; null if unclear
    },
    "dial": {
      "primary_color": string | null,
      "texture_pattern": string | null,  // e.g. "Sunburst", "Matte", "Guilloche"; null if unclear
      "hour_markers_type": string | null, // e.g. "Roman Numerals", "Baton Indices"; null if unclear
      "hands_style": string | null       // e.g. "Dauphine", "Sword"; null if unclear
    },
    "strap_or_bracelet": {
      "type": string | null,             // e.g. "Oyster Bracelet", "Leather Strap", "NATO Strap"
      "color": string | null,
      "material": string | null          // e.g. "Metal", "Leather", "Silicone"
    },
    "complications_visible": string[]    // plain labels only, e.g. ["date window"]. NEVER state a
                                          // position (e.g. "at 3 o'clock") or an exact sub-dial count —
                                          // those are precise spatial claims you are prone to inventing.
  },
  "visual_fingerprint_confidence": number // 0..1 confidence in the visual_fingerprint block specifically,
                                          // independent of confidence_score (which is about brand/model)
}
Rules:
- Weigh evidence in this order, highest first: (1) text/logo/wordmark printed or engraved on the dial,
  bezel, or case, (2) handset and indices shape, (3) bezel/case architecture, (4) overall styling impression.
  Higher-ranked evidence always overrides a lower-ranked guess — read printed text literally, do not
  override it with a "looks like" brand guess.
- Base brand and model_family on at least two independent visual indicators (e.g. logo text AND case/bezel
  shape) before committing to a specific answer; if you only have one weak signal, lower confidence_score
  and prefer "Unknown" or a hedged possible_matches list instead of a single confident answer.
- reference_number must be copied verbatim from text actually visible in the image. NEVER infer or
  pattern-match a reference number from the brand/model alone — if it is not legibly printed or engraved
  in the photo, use null.
- Every visual_fingerprint field is null if not clearly visible — never guess a specific value with no
  visual basis, the same discipline already applied to reference_number.
- If the whole watch is too obscured, blurry, or partial to assess case/dial/strap detail at all, set
  visual_fingerprint to null entirely rather than guessing at any of its fields.
- Lower confidence_score when the image is blurry, partial, or ambiguous.
- Set additional_image_hint only when confidence_score < 0.85; otherwise null.
- Output ONLY the JSON object, no markdown, no prose.`;
```

- [ ] **Step 3: Extend `PROMPT_WITH_BACK`**

Find:
```ts
const PROMPT_WITH_BACK = `You are an expert horologist. Identify the wristwatch from these two images:
the FIRST image is the dial/front, the SECOND image is the case back.
Return STRICT JSON only, matching this schema exactly:
{
  "brand": string,                       // best-guess brand, or "Unknown"
  "model_family": string,                // e.g. "Submariner", or "Unknown"
  "reference_number": string | null,     // ONLY if visibly legible; else null. NEVER invent one.
  "confidence_score": number,            // 0..1 overall confidence in brand+model_family
  "possible_matches": [                  // up to 5 alternatives, most likely first
    { "brand": string, "model_family": string, "reference_number": string | null, "confidence_score": number }
  ],
  "authenticity": {                      // ADVISORY only, never definitive
    "level": "none" | "review_suggested" | "high_caution",
    "note": string                       // short, hedged observation; do not assert "fake"
  },
  "additional_image_hint": string | null // ONE specific extra photo that would most raise confidence
                                          // (e.g. "macro shot of the movement"), or null if not needed
}
Rules:
- Weigh evidence in this order, highest first: (1) text/logo/wordmark printed or engraved on the dial,
  bezel, or case, (2) serial/reference engravings on the case back, (3) handset/index shape, (4) bezel/case
  architecture, (5) overall styling impression. Higher-ranked evidence always overrides a lower-ranked
  guess — read printed text literally, do not override it with a "looks like" brand guess.
- Base brand and model_family on at least two independent visual indicators (e.g. logo text AND case back
  markings) before committing to a specific answer; if you only have one weak signal, lower confidence_score
  and prefer "Unknown" or a hedged possible_matches list instead of a single confident answer.
- reference_number must be copied verbatim from text actually visible in either image. NEVER infer or
  pattern-match a reference number from the brand/model alone — if it is not legibly printed or engraved
  in the photos, use null.
- Use the case back to cross-check authenticity: look for a serial/model number, hallmark or "Swiss Made"
  style stamps, engraving quality and font consistency, and whether case-back text/markings plausibly match
  the brand read from the front. Inconsistency between front branding and case-back markings should raise
  authenticity_caution toward "review_suggested" or "high_caution".
- Lower confidence_score when either image is blurry, partial, or ambiguous.
- Set additional_image_hint only when confidence_score < 0.85; otherwise null.
- Output ONLY the JSON object, no markdown, no prose.`;
```

Replace with:
```ts
const PROMPT_WITH_BACK = `You are an expert horologist. Identify the wristwatch from these two images:
the FIRST image is the dial/front, the SECOND image is the case back.
Return STRICT JSON only, matching this schema exactly:
{
  "brand": string,                       // best-guess brand, or "Unknown"
  "model_family": string,                // e.g. "Submariner", or "Unknown"
  "reference_number": string | null,     // ONLY if visibly legible; else null. NEVER invent one.
  "confidence_score": number,            // 0..1 overall confidence in brand+model_family
  "possible_matches": [                  // up to 5 alternatives, most likely first
    { "brand": string, "model_family": string, "reference_number": string | null, "confidence_score": number }
  ],
  "authenticity": {                      // ADVISORY only, never definitive
    "level": "none" | "review_suggested" | "high_caution",
    "note": string                       // short, hedged observation; do not assert "fake"
  },
  "additional_image_hint": string | null, // ONE specific extra photo that would most raise confidence
                                          // (e.g. "macro shot of the movement"), or null if not needed
  "visual_fingerprint": {                // structural/visual detail, or null if too obscured to assess
    "case": {
      "shape": string | null,
      "material_appearance": string | null,
      "bezel_type": string | null
    },
    "dial": {
      "primary_color": string | null,
      "texture_pattern": string | null,
      "hour_markers_type": string | null,
      "hands_style": string | null
    },
    "strap_or_bracelet": {
      "type": string | null,
      "color": string | null,
      "material": string | null
    },
    "complications_visible": string[]    // plain labels only, e.g. ["date window"]. NEVER state a
                                          // position (e.g. "at 3 o'clock") or an exact sub-dial count.
  },
  "visual_fingerprint_confidence": number // 0..1 confidence in visual_fingerprint, independent of
                                          // confidence_score
}
Rules:
- Weigh evidence in this order, highest first: (1) text/logo/wordmark printed or engraved on the dial,
  bezel, or case, (2) serial/reference engravings on the case back, (3) handset/index shape, (4) bezel/case
  architecture, (5) overall styling impression. Higher-ranked evidence always overrides a lower-ranked
  guess — read printed text literally, do not override it with a "looks like" brand guess.
- Base brand and model_family on at least two independent visual indicators (e.g. logo text AND case back
  markings) before committing to a specific answer; if you only have one weak signal, lower confidence_score
  and prefer "Unknown" or a hedged possible_matches list instead of a single confident answer.
- reference_number must be copied verbatim from text actually visible in either image. NEVER infer or
  pattern-match a reference number from the brand/model alone — if it is not legibly printed or engraved
  in the photos, use null.
- Use the case back to cross-check authenticity: look for a serial/model number, hallmark or "Swiss Made"
  style stamps, engraving quality and font consistency, and whether case-back text/markings plausibly match
  the brand read from the front. Inconsistency between front branding and case-back markings should raise
  authenticity_caution toward "review_suggested" or "high_caution".
- Every visual_fingerprint field is null if not clearly visible — never guess a specific value with no
  visual basis, the same discipline already applied to reference_number.
- If the whole watch is too obscured, blurry, or partial to assess case/dial/strap detail at all, set
  visual_fingerprint to null entirely rather than guessing at any of its fields.
- Lower confidence_score when either image is blurry, partial, or ambiguous.
- Set additional_image_hint only when confidence_score < 0.85; otherwise null.
- Output ONLY the JSON object, no markdown, no prose.`;
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck` (from `C:\Users\itzpi\OneDrive\Desktop\Watch Identifier\.claude\worktrees\collection-sharing`)
Expected: errors referencing `IdentificationSchema.parse(identification)` at the bottom of this same file (`identifyWithGemini`'s return statement) — that's expected, fixed in Task 2/3, not this step. No errors should appear in any OTHER file.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/gemini.ts
git commit -m "Extend Groq prompt and raw schema with visual fingerprint detail"
```

---

## Task 2: Server-side multi-query construction

**Files:**
- Modify: `api/_lib/gemini.ts`

- [ ] **Step 1: Add the query-building helper**

Add this function above `identifyWithGemini` (after `PROMPT_WITH_BACK`, before `export async function identifyWithGemini`):

```ts
/**
 * Builds ordered eBay search queries from already-validated fields, most
 * specific first — never from model-generated free text, to keep the same
 * hallucination discipline applied to reference_number.
 */
function buildSearchQueries(r: {
  brand: string;
  model_family: string;
  reference_number: string | null;
  visual_fingerprint: z.infer<typeof GeminiRawSchema>["visual_fingerprint"];
}): string[] {
  const queries: string[] = [];
  const base = [r.brand, r.model_family].filter((x) => x && x !== "Unknown");

  if (r.reference_number && base.length > 0) {
    queries.push([...base, r.reference_number].join(" "));
  }
  if (base.length > 0) {
    queries.push(base.join(" "));
  }
  const vf = r.visual_fingerprint;
  if (vf && (vf.case.shape || vf.dial.primary_color)) {
    const broad = [
      r.brand !== "Unknown" ? r.brand : null,
      vf.case.shape,
      vf.dial.primary_color,
    ].filter((x): x is string => Boolean(x));
    if (broad.length > 0) {
      queries.push(broad.join(" "));
    }
  }
  return queries.length > 0 ? queries : [r.brand];
}
```

- [ ] **Step 2: Wire it into the `identification` assembly**

Find (near the bottom of `identifyWithGemini`):
```ts
  const r = raw.data;
  const searchString = [r.brand, r.model_family, r.reference_number]
    .filter((x) => x && x !== "Unknown")
    .join(" ")
    .trim();

  // verification_required whenever confidence is sub-high OR a reference number
  // is asserted (highest hallucination risk).
  const verificationRequired = r.confidence_score < 0.85 || r.reference_number != null;

  const identification: Identification = {
    brand: r.brand,
    model_family: r.model_family,
    reference_number: r.reference_number,
    search_string: searchString || r.brand,
    confidence_score: r.confidence_score,
    possible_matches: r.possible_matches,
    authenticity_caution: { level: r.authenticity.level, note: r.authenticity.note },
    verification_required: verificationRequired,
    additional_image_hint: r.additional_image_hint,
  };
```

Replace with:
```ts
  const r = raw.data;
  const searchString = [r.brand, r.model_family, r.reference_number]
    .filter((x) => x && x !== "Unknown")
    .join(" ")
    .trim();

  // verification_required whenever confidence is sub-high OR a reference number
  // is asserted (highest hallucination risk).
  const verificationRequired = r.confidence_score < 0.85 || r.reference_number != null;

  const identification: Identification = {
    brand: r.brand,
    model_family: r.model_family,
    reference_number: r.reference_number,
    search_string: searchString || r.brand,
    search_queries: buildSearchQueries(r),
    confidence_score: r.confidence_score,
    possible_matches: r.possible_matches,
    authenticity_caution: { level: r.authenticity.level, note: r.authenticity.note },
    verification_required: verificationRequired,
    additional_image_hint: r.additional_image_hint,
    visual_fingerprint: r.visual_fingerprint,
    visual_fingerprint_confidence: r.visual_fingerprint_confidence,
  };
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: errors about `search_queries`/`visual_fingerprint`/`visual_fingerprint_confidence` not existing on the `Identification` type — expected, fixed in Task 3.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/gemini.ts
git commit -m "Build deterministic multi-query search strings from validated fields"
```

---

## Task 3: Extend the Identification type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `VisualFingerprintSchema`**

Find:
```ts
export const IdentificationSchema = z.object({
  brand: z.string(),
  model_family: z.string(),
  reference_number: z.string().nullable(),
  search_string: z.string(),
  confidence_score: z.number().min(0).max(1),
  possible_matches: z.array(PossibleMatchSchema),
  authenticity_caution: AuthenticityCautionSchema,
  verification_required: z.boolean(),
  additional_image_hint: z.string().nullable(),
});
export type Identification = z.infer<typeof IdentificationSchema>;
```

Replace with:
```ts
export const VisualFingerprintSchema = z.object({
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
});
export type VisualFingerprint = z.infer<typeof VisualFingerprintSchema>;

export const IdentificationSchema = z.object({
  brand: z.string(),
  model_family: z.string(),
  reference_number: z.string().nullable(),
  search_string: z.string(),
  search_queries: z.array(z.string()).min(1),
  confidence_score: z.number().min(0).max(1),
  possible_matches: z.array(PossibleMatchSchema),
  authenticity_caution: AuthenticityCautionSchema,
  verification_required: z.boolean(),
  additional_image_hint: z.string().nullable(),
  visual_fingerprint: VisualFingerprintSchema.nullable(),
  visual_fingerprint_confidence: z.number().min(0).max(1),
});
export type Identification = z.infer<typeof IdentificationSchema>;
```

- [ ] **Step 2: Fix the two `Identification` object literals in `app/(tabs)/index.tsx`**

`PortfolioEntry` (the local SQLite/Supabase row) has never stored
`visual_fingerprint` data — it only has brand/model/reference/market/etc.
Two places in `app/(tabs)/index.tsx` reconstruct an `IdentifyResponse`'s
`identification` field from a `PortfolioEntry` row, and both will now fail
to typecheck since `search_queries`/`visual_fingerprint`/
`visual_fingerprint_confidence` are required on `Identification` but
missing from these object literals. `null`/`0` are the correct safe
defaults — the Specifications card added in Task 7 simply won't render
for reopened portfolio entries, same as it already shows nothing extra
for them today.

In `app/(tabs)/index.tsx`, find (inside `handleCardPress`):
```ts
      const response: IdentifyResponse = {
        identification: {
          brand: entry.brand,
          model_family: entry.model_family,
          reference_number: entry.reference_number,
          search_string: `${entry.brand} ${entry.model_family}`,
          confidence_score: entry.confidence_score,
          possible_matches: [],
          authenticity_caution: authenticity,
          verification_required:
            entry.confidence_score < 0.85 || entry.reference_number != null,
          additional_image_hint: null,
        },
        market: market,
        cached: true,
        request_id: entry.id,
      };
```

Replace with:
```ts
      const response: IdentifyResponse = {
        identification: {
          brand: entry.brand,
          model_family: entry.model_family,
          reference_number: entry.reference_number,
          search_string: `${entry.brand} ${entry.model_family}`,
          search_queries: [`${entry.brand} ${entry.model_family}`],
          confidence_score: entry.confidence_score,
          possible_matches: [],
          authenticity_caution: authenticity,
          verification_required:
            entry.confidence_score < 0.85 || entry.reference_number != null,
          additional_image_hint: null,
          visual_fingerprint: null,
          visual_fingerprint_confidence: 0,
        },
        market: market,
        cached: true,
        request_id: entry.id,
      };
```

Then find (inside `handleCardLongPress`'s "Share" `onPress`):
```ts
            const identification: Identification = {
              brand: entry.brand,
              model_family: entry.model_family,
              reference_number: entry.reference_number,
              search_string: `${entry.brand} ${entry.model_family}`,
              confidence_score: entry.confidence_score,
              possible_matches: [],
              authenticity_caution: JSON.parse(entry.authenticity_caution),
              verification_required: false,
              additional_image_hint: null,
            };
```

Replace with:
```ts
            const identification: Identification = {
              brand: entry.brand,
              model_family: entry.model_family,
              reference_number: entry.reference_number,
              search_string: `${entry.brand} ${entry.model_family}`,
              search_queries: [`${entry.brand} ${entry.model_family}`],
              confidence_score: entry.confidence_score,
              possible_matches: [],
              authenticity_caution: JSON.parse(entry.authenticity_caution),
              verification_required: false,
              additional_image_hint: null,
              visual_fingerprint: null,
              visual_fingerprint_confidence: 0,
            };
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: no errors anywhere in the project.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts "app/(tabs)/index.tsx"
git commit -m "Add VisualFingerprint type and extend Identification schema"
```

---

## Task 4: Multi-query MarketQuery interface

**Files:**
- Modify: `api/_lib/market/provider.ts`

- [ ] **Step 1: Change the interface**

Find:
```ts
export interface MarketQuery {
  searchString: string;
  region: RegionConfig;
}
```

Replace with:
```ts
export interface MarketQuery {
  searchStrings: string[];
  region: RegionConfig;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: errors in `api/_lib/market/ebay.ts` (destructures `searchString` from `MarketQuery`) and `api/identify.ts` (passes `searchString:`) — both expected, fixed in Tasks 5 and 6.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/market/provider.ts
git commit -m "Change MarketQuery to accept multiple ordered search strings"
```

---

## Task 5: Multi-query eBay fallback

**Files:**
- Modify: `api/_lib/market/ebay.ts`

- [ ] **Step 1: Restructure `getRange` to try each query in order**

Find:
```ts
export class EbayMarketProvider implements MarketDataProvider {
  readonly name = "ebay";

  async getRange({ searchString, region }: MarketQuery): Promise<MarketRange> {
    const empty: MarketRange = {
      low_estimate: null,
      median_estimate: null,
      high_estimate: null,
      currency: region.displayCurrency,
      market_source: MarketSource.NONE,
      sample_size: 0,
      is_asking_price: true,
      disclaimer: DISCLAIMERS.combined,
    };

    if (!searchString.trim()) return empty;

    let token: string;
    try {
      token = await getAppToken();
    } catch {
      return empty; // pricing is best-effort; identification still returns
    }

    const params = new URLSearchParams({
      q: searchString,
      limit: String(SAMPLE_LIMIT),
      category_ids: "31387", // Wristwatches
      filter: "buyingOptions:{FIXED_PRICE}",
    });

    let resp: Response;
    try {
      resp = await fetch(`${BROWSE_URL}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": region.ebayMarketplace,
        },
      });
    } catch {
      return empty;
    }
    if (!resp.ok) return empty;

    const json = (await resp.json()) as {
      itemSummaries?: { price?: { value?: string; currency?: string } }[];
    };

    const prices = (json.itemSummaries ?? [])
      .map((it) => Number(it.price?.value))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) return empty;

    // Trim outliers (parts/lots/typos) before computing the band.
    const trimmed = prices.slice(
      Math.floor(prices.length * 0.1),
      Math.ceil(prices.length * 0.9)
    );
    const sample = trimmed.length >= 3 ? trimmed : prices;

    const convert = (usd: number) =>
      Math.round(usd * region.fxFromSourceCurrency * region.marketAdjustment * ASKING_TO_ESTIMATE);

    return {
      low_estimate: convert(percentile(sample, 10)),
      median_estimate: convert(percentile(sample, 50)),
      high_estimate: convert(percentile(sample, 90)),
      currency: region.displayCurrency,
      market_source: MarketSource.EBAY_ACTIVE,
      sample_size: sample.length,
      is_asking_price: true,
      disclaimer: DISCLAIMERS.combined,
    };
  }
}
```

Replace with:
```ts
export class EbayMarketProvider implements MarketDataProvider {
  readonly name = "ebay";

  private emptyRange(region: RegionConfig): MarketRange {
    return {
      low_estimate: null,
      median_estimate: null,
      high_estimate: null,
      currency: region.displayCurrency,
      market_source: MarketSource.NONE,
      sample_size: 0,
      is_asking_price: true,
      disclaimer: DISCLAIMERS.combined,
    };
  }

  private async searchOnce(
    searchString: string,
    region: RegionConfig,
    token: string
  ): Promise<MarketRange | null> {
    const params = new URLSearchParams({
      q: searchString,
      limit: String(SAMPLE_LIMIT),
      category_ids: "31387", // Wristwatches
      filter: "buyingOptions:{FIXED_PRICE}",
    });

    let resp: Response;
    try {
      resp = await fetch(`${BROWSE_URL}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": region.ebayMarketplace,
        },
      });
    } catch {
      return null;
    }
    if (!resp.ok) return null;

    const json = (await resp.json()) as {
      itemSummaries?: { price?: { value?: string; currency?: string } }[];
    };

    const prices = (json.itemSummaries ?? [])
      .map((it) => Number(it.price?.value))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) return null;

    // Trim outliers (parts/lots/typos) before computing the band.
    const trimmed = prices.slice(
      Math.floor(prices.length * 0.1),
      Math.ceil(prices.length * 0.9)
    );
    const sample = trimmed.length >= 3 ? trimmed : prices;

    const convert = (usd: number) =>
      Math.round(usd * region.fxFromSourceCurrency * region.marketAdjustment * ASKING_TO_ESTIMATE);

    return {
      low_estimate: convert(percentile(sample, 10)),
      median_estimate: convert(percentile(sample, 50)),
      high_estimate: convert(percentile(sample, 90)),
      currency: region.displayCurrency,
      market_source: MarketSource.EBAY_ACTIVE,
      sample_size: sample.length,
      is_asking_price: true,
      disclaimer: DISCLAIMERS.combined,
    };
  }

  async getRange({ searchStrings, region }: MarketQuery): Promise<MarketRange> {
    const queries = searchStrings.filter((s) => s.trim().length > 0);
    if (queries.length === 0) return this.emptyRange(region);

    let token: string;
    try {
      token = await getAppToken();
    } catch {
      return this.emptyRange(region); // pricing is best-effort; identification still returns
    }

    for (const query of queries) {
      const result = await this.searchOnce(query, region, token);
      if (result) return result;
    }
    return this.emptyRange(region);
  }
}
```

- [ ] **Step 2: Add the `RegionConfig` import**

Find:
```ts
import { env } from "../env.js";
import { MarketSource, type MarketRange } from "../../../src/types/index.js";
import { DISCLAIMERS } from "./disclaimers.js";
import type { MarketDataProvider, MarketQuery } from "./provider.js";
```

Replace with:
```ts
import { env } from "../env.js";
import { MarketSource, type MarketRange } from "../../../src/types/index.js";
import { DISCLAIMERS } from "./disclaimers.js";
import type { MarketDataProvider, MarketQuery } from "./provider.js";
import type { RegionConfig } from "../regions.js";
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: errors only in `api/identify.ts` (the call site), fixed in Task 6.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/market/ebay.ts
git commit -m "Try each search query in order, falling back on empty results"
```

---

## Task 6: Update the identify handler call site

**Files:**
- Modify: `api/identify.ts`

- [ ] **Step 1: Change the `getRange` call**

Find:
```ts
    // 6. Market range (best-effort; never blocks identification result).
    const market = await marketProvider.getRange({
      searchString: identification.search_string,
      region,
    });
```

Replace with:
```ts
    // 6. Market range (best-effort; never blocks identification result).
    const market = await marketProvider.getRange({
      searchStrings: identification.search_queries,
      region,
    });
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors anywhere in the project.

- [ ] **Step 3: Commit**

```bash
git add api/identify.ts
git commit -m "Pass multi-query search strings to the market provider"
```

---

## Task 7: Specifications card on Results screen

**Files:**
- Modify: `app/results.tsx`

- [ ] **Step 1: Add the card**

Find the "Suggested Additional Image" block (so the new card is inserted right after it, before "Result Rating"):
```tsx
        {/* Suggested Additional Image */}
        {identification.additional_image_hint && (
          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>📷 Improve Accuracy</Text>
            <Text style={styles.hintBody}>{identification.additional_image_hint}</Text>
          </View>
        )}

        {/* Result Rating */}
```

Replace with:
```tsx
        {/* Suggested Additional Image */}
        {identification.additional_image_hint && (
          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>📷 Improve Accuracy</Text>
            <Text style={styles.hintBody}>{identification.additional_image_hint}</Text>
          </View>
        )}

        {/* Specifications */}
        {identification.visual_fingerprint && (
          <View style={styles.specsCard}>
            <Text style={styles.kicker}>SPECIFICATIONS</Text>
            {identification.visual_fingerprint.case.shape && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Case shape</Text>
                <Text style={styles.specValue}>{identification.visual_fingerprint.case.shape}</Text>
              </View>
            )}
            {identification.visual_fingerprint.case.material_appearance && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Case material</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.case.material_appearance}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.case.bezel_type && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Bezel type</Text>
                <Text style={styles.specValue}>{identification.visual_fingerprint.case.bezel_type}</Text>
              </View>
            )}
            {identification.visual_fingerprint.dial.primary_color && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Dial color</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.dial.primary_color}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.dial.texture_pattern && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Dial texture</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.dial.texture_pattern}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.dial.hour_markers_type && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Hour markers</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.dial.hour_markers_type}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.dial.hands_style && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Hands style</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.dial.hands_style}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.strap_or_bracelet.type && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Strap/bracelet</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.strap_or_bracelet.type}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.strap_or_bracelet.material && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Strap material</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.strap_or_bracelet.material}
                </Text>
              </View>
            )}
            {identification.visual_fingerprint.complications_visible.length > 0 && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Complications</Text>
                <Text style={styles.specValue}>
                  {identification.visual_fingerprint.complications_visible.join(", ")}
                </Text>
              </View>
            )}
            <Text style={styles.disclaimer}>
              AI-estimated from photos; verify before purchase or insurance decisions.
            </Text>
          </View>
        )}

        {/* Result Rating */}
```

- [ ] **Step 2: Add the new styles**

Find:
```ts
  // Alternatives Card
  matchesCard: {
```

Replace with:
```ts
  // Specifications Card
  specsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },
  specLabel: { ...typography.caption, color: colors.textTertiary, fontSize: 12 },
  specValue: { ...typography.body, color: colors.textPrimary, fontSize: 13, textAlign: "right", flex: 1, marginLeft: spacing.sm },

  // Alternatives Card
  matchesCard: {
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/results.tsx
git commit -m "Add Specifications card to Results screen"
```

---

## Task 8: Manual verification pass

No automated test convention exists for screens/API handlers beyond Zod
validation in this codebase. No new native dependency was added in this
plan, so no EAS rebuild is needed — verify via Metro reload alone.

**Files:** none (verification only)

- [ ] **Step 1: Restart Metro and reload the app**

From `C:\Users\itzpi\OneDrive\Desktop\Watch Identifier\.claude\worktrees\collection-sharing`, run `npm start`, reload the app on the connected device.

- [ ] **Step 2: Scan a watch with clear case/dial detail**

Confirm the Results screen now shows a "Specifications" card with populated fields (whichever the model could actually see — case shape, dial color, etc.) and the disclaimer line. Confirm no "Unknown" or empty rows appear.

- [ ] **Step 3: Scan a heavily blurry/obscured watch**

Confirm `visual_fingerprint` comes back null (check Metro's console logs if needed) and the Specifications card doesn't render at all — not an empty card, no card.

- [ ] **Step 4: Verify the multi-query fallback**

Scan a watch where the exact reference-number search would likely return zero eBay results (e.g. a less common reference, or temporarily test by checking Metro logs for which query succeeded). Confirm a market range still renders rather than "no market data," and that this works even when the most-specific query fails.

- [ ] **Step 5: Verify existing `search_string`-dependent features are unaffected**

Tap "Request Professional Valuation" (WhatsApp CTA) — confirm the pre-filled message still includes the correct brand/model/reference. Reopen a previously-saved watch from Home — confirm it still opens correctly (this exercises the `app/(tabs)/index.tsx` reconstruction fixed in Task 3, which now includes the three new required fields with safe `null`/`0` defaults).

- [ ] **Step 6: Final commit (if any fixes were needed during manual testing)**

If manual testing surfaced bugs requiring code changes, fix them, re-run `npm run typecheck`, and commit each fix separately with a descriptive message before considering this plan complete.
