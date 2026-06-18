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

export const IdentificationSchema = z.object({
  brand: z.string(),
  model_family: z.string(),
  reference_number: z.string().nullable(),
  search_string: z.string(),
  confidence_score: z.number().min(0).max(1),
  possible_matches: z.array(PossibleMatchSchema),
  authenticity_caution: AuthenticityCautionSchema,
  verification_required: z.boolean(),
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
  imageBase64: z.string().min(1),
  countryCode: z.string().length(2), // ISO 3166-1 alpha-2, e.g. "IN"
  userId: z.string().uuid().optional(),
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
}
