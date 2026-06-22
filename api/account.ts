import type { VercelRequest, VercelResponse } from "@vercel/node";
import { env } from "./_lib/env.js";
import { ErrorCode, sendError } from "./_lib/errors.js";
import { resolveUserId } from "./_lib/auth.js";
import { captureException } from "./_lib/sentry.js";

/**
 * Permanently deletes the authenticated user's Supabase Auth account.
 * portfolio and subscriptions rows cascade-delete via existing
 * ON DELETE CASCADE foreign keys; analytics_events.user_id is set to NULL
 * (ON DELETE SET NULL) so historical events survive anonymized.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "DELETE") {
    return sendError(res, ErrorCode.METHOD_NOT_ALLOWED, "Use DELETE");
  }

  const userId = await resolveUserId(req.headers.authorization, undefined);
  if (!userId) {
    return sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required");
  }

  if (!env.supabase.isConfigured) {
    return sendError(res, ErrorCode.INTERNAL, "Account deletion unavailable");
  }

  try {
    const resp = await fetch(`${env.supabase.url}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        apikey: env.supabase.serviceRoleKey!,
        Authorization: `Bearer ${env.supabase.serviceRoleKey}`,
      },
    });
    if (!resp.ok) {
      console.error(`[account] delete failed for ${userId}: ${resp.status}`);
      return sendError(res, ErrorCode.INTERNAL, "Failed to delete account");
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    captureException(err);
    console.error("[account] delete threw", err);
    return sendError(res, ErrorCode.INTERNAL, "Failed to delete account");
  }
}
