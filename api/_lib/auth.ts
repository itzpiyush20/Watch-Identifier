import { env } from "./env.js";

/**
 * Resolves a TRUSTED userId from the request.
 *
 * Production: verifies the Firebase ID token in `Authorization: Bearer ...`
 * by calling Firebase's identitytoolkit REST API. A spoofed body `userId` is never trusted.
 *
 * Dev (no Firebase env): falls back to the body userId so the pipeline is
 * testable locally, and logs a warning.
 */
export async function resolveUserId(
  authHeader: string | undefined,
  bodyUserId: string | undefined
): Promise<string | null> {
  if (env.firebase.isConfigured) {
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    try {
      const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.firebase.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ idToken: token }),
        }
      );
      if (!resp.ok) return null;
      const data = (await resp.json()) as { users?: { localId: string }[] };
      return data.users?.[0]?.localId ?? null;
    } catch {
      return null;
    }
  }

  // Dev fallback only.
  if (bodyUserId) {
    console.warn("[auth] Firebase not configured — trusting body userId (DEV ONLY)");
    return bodyUserId;
  }
  return null;
}

