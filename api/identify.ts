import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import {
  IdentifyRequestSchema,
  IdentifyResponseSchema,
  type IdentifyResponse,
} from "../src/types/index.js";
import { ApiException, ErrorCode, sendError } from "./_lib/errors.js";
import { resolveUserId } from "./_lib/auth.js";
import { isPremiumUser } from "./_lib/premium.js";
import { reserveScan, refundScan } from "./_lib/quota.js";
import { cache } from "./_lib/cache.js";
import { imageHash, base64Bytes } from "./_lib/hash.js";
import { regionForCountry } from "./_lib/regions.js";
import { identifyWithGemini } from "./_lib/gemini.js";
import { EbayMarketProvider } from "./_lib/market/ebay.js";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
const RESPONSE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // pricing TTL (shorter of the two)
const marketProvider = new EbayMarketProvider();

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const requestId = randomUUID();
  res.setHeader("x-request-id", requestId);

  if (req.method !== "POST") {
    return sendError(res, ErrorCode.METHOD_NOT_ALLOWED, "Use POST");
  }

  // 1. Validate input.
  const parsed = IdentifyRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, ErrorCode.INVALID_PAYLOAD, "Invalid request body");
  }
  const { imageBase64, countryCode, userId: bodyUserId } = parsed.data;

  if (base64Bytes(imageBase64) > MAX_UPLOAD_BYTES) {
    return sendError(res, ErrorCode.PAYLOAD_TOO_LARGE, "Image exceeds 2 MB limit");
  }

  // 2. Authenticate -> trusted userId.
  const userId = await resolveUserId(req.headers.authorization, bodyUserId);
  if (!userId) {
    return sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required");
  }

  // 3. Server cache (keyed by image + region; identical re-scans skip all cost).
  const region = regionForCountry(countryCode);
  const cacheKey = `identify:${imageHash(imageBase64)}:${region.displayCurrency}`;
  const cached = await cache.get<IdentifyResponse>(cacheKey);
  if (cached) {
    res.status(200).json({ ...cached, cached: true, request_id: requestId });
    return;
  }

  // 4. Quota (reserve-then-refund). Premium bypasses.
  const premium = await isPremiumUser(userId);
  const quota = await reserveScan(userId, premium);
  if (!quota.allowed) {
    return sendError(res, ErrorCode.QUOTA_EXCEEDED, "Daily free scan limit reached");
  }

  try {
    // 5. Identify.
    const identification = await identifyWithGemini(imageBase64);

    // 6. Market range (best-effort; never blocks identification result).
    const market = await marketProvider.getRange({
      searchString: identification.search_string,
      region,
    });

    // 7. Assemble + validate the outgoing contract.
    const response: IdentifyResponse = IdentifyResponseSchema.parse({
      identification,
      market,
      cached: false,
      request_id: requestId,
    });

    await cache.set(cacheKey, response, RESPONSE_TTL_MS);
    res.status(200).json(response);
    return;
  } catch (err) {
    await refundScan(userId, premium); // did not deliver a result
    if (err instanceof ApiException) {
      return sendError(res, err.code, err.message);
    }
    console.error(`[identify] ${requestId}`, err);
    return sendError(res, ErrorCode.INTERNAL, "Unexpected error");
  }
}

/** Raise the body size cap above Vercel's 1 MB default for base64 images. */
export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
};
