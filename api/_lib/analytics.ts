import { env } from "./env.js";

/**
 * Best-effort insert into analytics_events via Supabase REST + service-role
 * key (same trust model as api/_lib/auth.ts). Never throws — a dropped
 * analytics write must never fail the request that triggered it.
 */
export async function trackEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
  userId?: string | null
): Promise<void> {
  if (!env.supabase.isConfigured) return;

  try {
    const resp = await fetch(`${env.supabase.url}/rest/v1/analytics_events`, {
      method: "POST",
      headers: {
        apikey: env.supabase.serviceRoleKey!,
        Authorization: `Bearer ${env.supabase.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId ?? null,
        event_name: eventName,
        properties,
      }),
    });
    if (!resp.ok) {
      console.error(`[analytics] insert failed for "${eventName}": ${resp.status}`);
    }
  } catch (err) {
    console.error(`[analytics] insert threw for "${eventName}":`, err);
  }
}
