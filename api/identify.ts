import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import {
  IdentifyRequestSchema,
  IdentifyResponseSchema,
  confidenceBand,
  type IdentifyResponse,
} from "../src/types/index.js";
import { ApiException, ErrorCode, sendError } from "./_lib/errors.js";
import { resolveUserId } from "./_lib/auth.js";
import { getEffectiveTier, TIER_LIMITS } from "./_lib/subscriptions.js";
import { reserveScan, refundScan } from "./_lib/quota.js";
import { cache } from "./_lib/cache.js";
import { imageHash, base64Bytes } from "./_lib/hash.js";
import { regionForCountry } from "./_lib/regions.js";
import { identifyWithGemini } from "./_lib/gemini.js";
import { EbayMarketProvider } from "./_lib/market/ebay.js";
import { trackEvent } from "./_lib/analytics.js";
import { captureException } from "./_lib/sentry.js";

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
  const { imageBase64, imageBase64Back, countryCode, userId: bodyUserId } = parsed.data;

  if (base64Bytes(imageBase64) > MAX_UPLOAD_BYTES) {
    return sendError(res, ErrorCode.PAYLOAD_TOO_LARGE, "Image exceeds 2 MB limit");
  }
  if (imageBase64Back && base64Bytes(imageBase64Back) > MAX_UPLOAD_BYTES) {
    return sendError(res, ErrorCode.PAYLOAD_TOO_LARGE, "Back image exceeds 2 MB limit");
  }

  // 2. Authenticate -> trusted userId.
  const userId = await resolveUserId(req.headers.authorization, bodyUserId);
  if (!userId) {
    return sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required");
  }

  // 3. Server cache (keyed by image(s) + region; identical re-scans skip all cost).
  const region = regionForCountry(countryCode);
  const cacheKey = `identify:${imageHash([imageBase64, imageBase64Back])}:${region.displayCurrency}`;
  const cached = await cache.get<IdentifyResponse>(cacheKey);
  if (cached) {
    res.status(200).json({ ...cached, cached: true, request_id: requestId });
    return;
  }

  // 4. Quota (reserve-then-refund). Vault tier bypasses entirely.
  const { tier } = await getEffectiveTier(userId);
  const limit = TIER_LIMITS[tier];
  const quota = await reserveScan(userId, limit);
  if (!quota.allowed) {
    await trackEvent("quota_exceeded", { tier }, userId);
    return sendError(res, ErrorCode.QUOTA_EXCEEDED, "Daily scan limit reached");
  }

  try {
    // 5. Identify.
    const identification = await identifyWithGemini(imageBase64, imageBase64Back);

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
    await trackEvent(
      "scan_completed",
      {
        confidence_band: confidenceBand(identification.confidence_score),
        verification_required: identification.verification_required,
        tier,
      },
      userId
    );
    res.status(200).json(response);
    return;
  } catch (err) {
    await refundScan(userId, limit); // did not deliver a result
    captureException(err);
    if (err instanceof ApiException) {
      await trackEvent("scan_failed", { error_code: err.code, tier }, userId);
      return sendError(res, err.code, err.message);
    }
    console.error(`[identify] ${requestId}`, err);
    await trackEvent("scan_failed", { error_code: ErrorCode.INTERNAL, tier }, userId);
    return sendError(res, ErrorCode.INTERNAL, "Unexpected error");
  }
}

/** Raise the body size cap above Vercel's 1 MB default — two base64 images
 *  (front + back, each up to 2 MB raw / ~2.7 MB base64) can approach 6 MB. */
export const config = {
  api: { bodyParser: { sizeLimit: "8mb" } },
};
