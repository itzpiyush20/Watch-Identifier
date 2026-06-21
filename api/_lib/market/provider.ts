import type { MarketRange } from "../../../src/types/index.js";
import type { RegionConfig } from "../regions.js";

export interface MarketQuery {
  searchString: string;
  region: RegionConfig;
}

/** The seam that lets us swap eBay (active) for WatchCharts/Chrono24/Marketplace
 *  Insights (sold) later without touching the handler. */
export interface MarketDataProvider {
  readonly name: string;
  getRange(query: MarketQuery): Promise<MarketRange>;
}
