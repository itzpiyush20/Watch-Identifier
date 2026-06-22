import type { VercelRequest, VercelResponse } from "@vercel/node";
import { TrackEventSchema } from "../src/types/index.js";
import { ErrorCode, sendError } from "./_lib/errors.js";
import { resolveUserId } from "./_lib/auth.js";
import { trackEvent } from "./_lib/analytics.js";
import { captureException } from "./_lib/sentry.js";

/**
 * Best-effort analytics sink for client-emitted events (scan_started,
 * trade_in_clicked, signup_completed, login_completed, result_rated).
 * Auth is optional: an absent/invalid token logs the event with a null
 * user_id rather than rejecting the request — analytics must never block
 * on auth.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    return sendError(res, ErrorCode.METHOD_NOT_ALLOWED, "Use POST");
  }

  const parsed = TrackEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, ErrorCode.INVALID_PAYLOAD, "Invalid track payload");
  }

  let userId: string | null = null;
  try {
    userId = await resolveUserId(req.headers.authorization, undefined);
  } catch (err) {
    captureException(err);
  }

  try {
    await trackEvent(parsed.data.event_name, parsed.data.properties ?? {}, userId);
  } catch (err) {
    captureException(err);
  }

  res.status(200).json({ ok: true });
}
