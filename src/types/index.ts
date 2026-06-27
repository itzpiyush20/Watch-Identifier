/**
 * Core domain types + Zod schemas shared by client and API.
 * Zod is the single source of truth at every trust boundary: client->API,
 * Gemini->server, eBay->server. Types are inferred from the schemas so they
 * can never drift from validation.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Identification
// ---------------------------------------------------------------------------

export const ConfidenceBand = {
  HIGH: "high", // >= 0.85
  MEDIUM: "medium", // 0.60 - 0.84
  LOW: "low", // < 0.60 -> request more images
} as const;
export type ConfidenceBand = (typeof ConfidenceBand)[keyof typeof ConfidenceBand];

export function confidenceBand(score: number): ConfidenceBand {
  if (score >= 0.85) return ConfidenceBand.HIGH;
  if (score >= 0.6) return ConfidenceBand.MEDIUM;
  return ConfidenceBand.LOW;
}

export const PossibleMatchSchema = z.object({
  brand: z.string(),
  model_family: z.string(),
  reference_number: z.string().nullable(),
  confidence_score: z.number().min(0).max(1),
});
export type PossibleMatch = z.infer<typeof PossibleMatchSchema>;

/** Advisory only — never definitive. See decisions: counterfeit -> authenticity_caution. */
export const AuthenticityCautionSchema = z.object({
  level: z.enum(["none", "review_suggested", "high_caution"]),
  note: z.string(),
});
export type AuthenticityCaution = z.infer<typeof AuthenticityCautionSchema>;

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
  search_queries: z.array(z.string()), // empty when brand is unidentified — skips the market lookup
  confidence_score: z.number().min(0).max(1),
  possible_matches: z.array(PossibleMatchSchema),
  authenticity_caution: AuthenticityCautionSchema,
  verification_required: z.boolean(),
  additional_image_hint: z.string().nullable(),
  visual_fingerprint: VisualFingerprintSchema.nullable(),
  visual_fingerprint_confidence: z.number().min(0).max(1),
});
export type Identification = z.infer<typeof IdentificationSchema>;

// ---------------------------------------------------------------------------
// Market valuation
// ---------------------------------------------------------------------------

export const MarketSource = {
  EBAY_ACTIVE: "ebay_active_listings",
  EBAY_SOLD: "ebay_sold_listings",
  WATCHCHARTS: "watchcharts",
  CHRONO24: "chrono24",
  NONE: "none",
} as const;
export type MarketSource = (typeof MarketSource)[keyof typeof MarketSource];

export const MarketRangeSchema = z.object({
  low_estimate: z.number().nullable(),
  median_estimate: z.number().nullable(),
  high_estimate: z.number().nullable(),
  currency: z.string(), // ISO 4217, e.g. "INR", "USD"
  market_source: z.nativeEnum(MarketSource),
  sample_size: z.number().int().nonnegative(),
  /** True when derived from active asking prices, not realized sold prices. */
  is_asking_price: z.boolean(),
  disclaimer: z.string(),
});
export type MarketRange = z.infer<typeof MarketRangeSchema>;

// ---------------------------------------------------------------------------
// API: POST /api/identify
// ---------------------------------------------------------------------------

export const IdentifyRequestSchema = z.object({
  imageBase64: z.string().min(1), // front of the watch (dial)
  imageBase64Back: z.string().min(1).optional(), // case back, for authenticity checks
  countryCode: z.string().length(2), // ISO 3166-1 alpha-2, e.g. "IN"
  userId: z.string().min(1).optional(),
});
export type IdentifyRequest = z.infer<typeof IdentifyRequestSchema>;

export const IdentifyResponseSchema = z.object({
  identification: IdentificationSchema,
  market: MarketRangeSchema,
  cached: z.boolean(),
  request_id: z.string(),
});
export type IdentifyResponse = z.infer<typeof IdentifyResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ---------------------------------------------------------------------------
// API: POST /api/track
// ---------------------------------------------------------------------------

export const TrackEventSchema = z.object({
  event_name: z.string().min(1).max(64),
  properties: z.record(z.unknown()).optional(),
});
export type TrackEvent = z.infer<typeof TrackEventSchema>;

// ---------------------------------------------------------------------------
// Subscription tiers (shared by api/_lib/subscriptions.ts and the client)
// ---------------------------------------------------------------------------

export const TierSchema = z.enum(["trial", "free", "collector", "connoisseur", "vault"]);
export type Tier = z.infer<typeof TierSchema>;

// ---------------------------------------------------------------------------
// API: GET /api/entitlement
// ---------------------------------------------------------------------------

export const EntitlementSchema = z.object({
  tier: TierSchema,
  scans_remaining: z.number().nullable(), // null = unlimited
  scans_limit: z.number().nullable(), // null = unlimited
  trial_ends_at: z.string().nullable(),
  unlimited_history: z.boolean(),
});
export type Entitlement = z.infer<typeof EntitlementSchema>;

// ---------------------------------------------------------------------------
// Local persistence (mirrors SQLite schema, built in Phase 3)
// ---------------------------------------------------------------------------

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
  // "Best For" specialty tag — user-entered, not AI-inferred. One of:
  // Formal, Party, Sport / Active, Everyday / Casual, Dress, Travel.
  best_for?: string | null;
  receipt_image_uri?: string | null;
  certificate_image_uri?: string | null;
}
