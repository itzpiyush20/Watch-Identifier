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
  if (!env.firebase.isConfigured) return;

  try {
    const resp = await fetch(
      `https://firestore.googleapis.com/v1/projects/${env.firebase.projectId}/databases/(default)/documents/analytics_events?key=${env.firebase.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            user_id: { stringValue: userId ?? "" },
            event_name: { stringValue: eventName },
            properties: { stringValue: JSON.stringify(properties) },
            created_at: { timestampValue: new Date().toISOString() },
          },
        }),
      }
    );
    if (!resp.ok) {
      console.error(`[analytics] insert failed for "${eventName}": ${resp.status}`);
    }
  } catch (err) {
    console.error(`[analytics] insert threw for "${eventName}":`, err);
  }
}
