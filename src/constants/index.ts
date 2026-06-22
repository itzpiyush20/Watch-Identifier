/** App-wide constants. Business values that may change at runtime live in
 *  Supabase remote config (Phase 5); these are safe build-time defaults. */

export const CACHE_TTL = {
  /** Identification results rarely change for the same image. */
  IDENTIFICATION_MS: 180 * 24 * 60 * 60 * 1000, // 180 days
  /** Pricing is volatile; refresh weekly. */
  PRICING_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

export const IMAGE = {
  MAX_LONGEST_EDGE: 1600,
  COMPRESS_QUALITY: 0.85, // 0..1 for expo-image-manipulator
  MAX_UPLOAD_BYTES: 2 * 1024 * 1024, // 2 MB hard cap (matches API rejection)
} as const;

export const CONFIDENCE = {
  HIGH: 0.85,
  MEDIUM: 0.6,
} as const;

export interface RegionOption {
  code: string;
  label: string;
  currencySymbol: string;
}

/** Mirrors the 4 regions defined server-side in api/_lib/regions.ts. */
export const REGIONS: RegionOption[] = [
  { code: "IN", label: "India", currencySymbol: "₹" },
  { code: "US", label: "United States", currencySymbol: "$" },
  { code: "GB", label: "United Kingdom", currencySymbol: "£" },
  { code: "DE", label: "Germany", currencySymbol: "€" },
];

export const ENTITLEMENT = {
  PREMIUM: "premium_access",
} as const;

export const ADS = {
  INTERSTITIAL_EVERY_N_SCANS: 2,
} as const;

export const DISCLAIMERS = {
  VALUATION:
    "Estimated values are derived from marketplace data and do not constitute professional appraisals.",
  ASKING_PRICE:
    "These figures reflect current asking prices from active listings, not realized sale prices.",
  IDENTIFICATION:
    "Identification is AI-assisted and may be inaccurate. Verify reference numbers against the case-back and original documents.",
  AUTHENTICITY:
    "Authenticity notes are advisory only and cannot confirm or deny a watch's authenticity. Consult an authorized dealer.",
} as const;

/** Feature flags — overridable by remote config in Phase 5. */
export const FEATURE_FLAGS = {
  authenticityCaution: true,
  tradeInCta: true,
  ads: true,
} as const;
