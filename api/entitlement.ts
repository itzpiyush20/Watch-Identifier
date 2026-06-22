import type { VercelRequest, VercelResponse } from "@vercel/node";
import { EntitlementSchema } from "../src/types/index.js";
import { ErrorCode, sendError } from "./_lib/errors.js";
import { resolveUserId } from "./_lib/auth.js";
import { getEffectiveTier, TIER_LIMITS, TIER_UNLIMITED_HISTORY } from "./_lib/subscriptions.js";
import { peekQuota } from "./_lib/quota.js";
import { captureException } from "./_lib/sentry.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    return sendError(res, ErrorCode.METHOD_NOT_ALLOWED, "Use GET");
  }

  const userId = await resolveUserId(req.headers.authorization, undefined);
  if (!userId) {
    return sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required");
  }

  try {
    const { tier, trialEndsAt } = await getEffectiveTier(userId);
    const limit = TIER_LIMITS[tier];
    const quota = await peekQuota(userId, limit);

    const body = EntitlementSchema.parse({
      tier,
      scans_remaining: limit === null ? null : quota.remaining,
      scans_limit: limit,
      trial_ends_at: trialEndsAt,
      unlimited_history: TIER_UNLIMITED_HISTORY[tier],
    });
    res.status(200).json(body);
  } catch (err) {
    captureException(err);
    console.error("[entitlement] error", err);
    return sendError(res, ErrorCode.INTERNAL, "Unexpected error");
  }
}
