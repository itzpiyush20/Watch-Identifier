import { env } from "../env";
import { MarketSource, type MarketRange } from "../../../src/types";
import { DISCLAIMERS } from "./disclaimers";
import type { MarketDataProvider, MarketQuery } from "./provider";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

/** Discount applied to active asking prices to approximate realized value.
 *  Configurable; documented as a heuristic, not a sold-price source. */
const ASKING_TO_ESTIMATE = Number(process.env.EBAY_ASKING_DISCOUNT || "0.85");
const SAMPLE_LIMIT = 30;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const basic = Buffer.from(`${env.ebay.clientId}:${env.ebay.clientSecret}`).toString("base64");
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });
  if (!resp.ok) throw new Error(`eBay token error ${resp.status}`);
  const json = (await resp.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

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
