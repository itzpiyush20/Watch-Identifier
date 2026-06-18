/**
 * Maps a user country to an eBay marketplace + display currency + FX/adjustment.
 * eBay has no active India Browse marketplace, so IN sources USD (EBAY_US) data
 * and converts to INR with a configurable FX rate and a market-adjustment factor
 * (import duty / grey-market premium). These values move to remote config later;
 * env overrides let ops tune them without a redeploy.
 */
export interface RegionConfig {
  ebayMarketplace: string;
  displayCurrency: string;
  /** Multiply a USD price by this to reach displayCurrency. 1 when same currency. */
  fxFromSourceCurrency: number;
  sourceCurrency: string;
  /** Multiply the converted price to reflect local market reality (e.g. duties). */
  marketAdjustment: number;
}

const USD_TO_INR = Number(process.env.FX_USD_TO_INR || "84");
const IN_MARKET_ADJUSTMENT = Number(process.env.IN_MARKET_ADJUSTMENT || "1.0");

const REGIONS: Record<string, RegionConfig> = {
  IN: {
    ebayMarketplace: "EBAY_US",
    displayCurrency: "INR",
    sourceCurrency: "USD",
    fxFromSourceCurrency: USD_TO_INR,
    marketAdjustment: IN_MARKET_ADJUSTMENT,
  },
  US: { ebayMarketplace: "EBAY_US", displayCurrency: "USD", sourceCurrency: "USD", fxFromSourceCurrency: 1, marketAdjustment: 1 },
  GB: { ebayMarketplace: "EBAY_GB", displayCurrency: "GBP", sourceCurrency: "GBP", fxFromSourceCurrency: 1, marketAdjustment: 1 },
  DE: { ebayMarketplace: "EBAY_DE", displayCurrency: "EUR", sourceCurrency: "EUR", fxFromSourceCurrency: 1, marketAdjustment: 1 },
};

export function regionForCountry(countryCode: string): RegionConfig {
  return REGIONS[countryCode.toUpperCase()] ?? REGIONS.US!;
}
