/** Server-side copy of the valuation disclaimers, kept here so the API bundle
 *  has no dependency on client constants. Must stay in sync with
 *  src/constants/index.ts DISCLAIMERS. */
export const DISCLAIMERS = {
  combined:
    "Estimated values are derived from active marketplace listings (asking prices), not realized sale prices, and do not constitute professional appraisals.",
} as const;
