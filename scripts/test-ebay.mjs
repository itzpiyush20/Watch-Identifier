// Standalone smoke test for eBay credentials — run with: node scripts/test-ebay.mjs
// Loads .env manually (no dotenv dependency in this project) and exercises the
// real client-credentials OAuth flow + Browse API search.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const clientId = process.env.EBAY_CLIENT_ID;
const clientSecret = process.env.EBAY_CLIENT_SECRET;
const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";

if (!clientId || !clientSecret) {
  console.error("Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET in .env");
  process.exit(1);
}

async function getAppToken() {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Token request failed: ${resp.status} ${text}`);
  }
  return JSON.parse(text);
}

async function searchBrowse(token, query) {
  const params = new URLSearchParams({
    q: query,
    limit: "10",
    category_ids: "31387", // Wristwatches
    filter: "buyingOptions:{FIXED_PRICE}",
  });
  const resp = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
      },
    }
  );
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Browse search failed: ${resp.status} ${text}`);
  }
  return JSON.parse(text);
}

(async () => {
  console.log("1. Requesting app token...");
  const tokenResp = await getAppToken();
  console.log(`   OK — token expires in ${tokenResp.expires_in}s, scope: ${tokenResp.scope?.split(" ").length ?? 0} scope(s)`);

  console.log('2. Searching Browse API for "Rolex Submariner"...');
  const search = await searchBrowse(tokenResp.access_token, "Rolex Submariner");
  const items = search.itemSummaries ?? [];
  console.log(`   OK — ${items.length} item(s) returned (total available: ${search.total ?? "?"})`);

  for (const item of items.slice(0, 5)) {
    console.log(`   - ${item.title} — ${item.price?.value} ${item.price?.currency}`);
  }

  if (items.length === 0) {
    console.warn("   No items returned — check marketplace/category filters.");
  } else {
    console.log("\nEbay credentials are working end-to-end.");
  }
})().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
