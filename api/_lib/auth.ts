import { env } from "./env";

/**
 * Resolves a TRUSTED userId from the request.
 *
 * Production: verifies the Supabase access token in `Authorization: Bearer ...`
 * by calling Supabase's /auth/v1/user. A spoofed body `userId` is never trusted.
 *
 * Dev (no Supabase env): falls back to the body userId so the pipeline is
 * testable locally, and logs a warning.
 */
export async function resolveUserId(
  authHeader: string | undefined,
  bodyUserId: string | undefined
): Promise<string | null> {
  if (env.supabase.isConfigured) {
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    try {
      const resp = await fetch(`${env.supabase.url}/auth/v1/user`, {
        headers: {
          apikey: env.supabase.serviceRoleKey!,
          Authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) return null;
      const user = (await resp.json()) as { id?: string };
      return user.id ?? null;
    } catch {
      return null;
    }
  }

  // Dev fallback only.
  if (bodyUserId) {
    console.warn("[auth] Supabase not configured — trusting body userId (DEV ONLY)");
    return bodyUserId;
  }
  return null;
}
