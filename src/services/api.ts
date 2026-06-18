import Constants from "expo-constants";
import {
  IdentifyResponseSchema,
  ApiErrorSchema,
  type IdentifyResponse,
} from "@/types";

const apiBaseUrl: string = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
  }
}

export interface IdentifyParams {
  imageBase64: string;
  countryCode: string;
  /** Supabase access token; sent as Bearer for server-side user verification. */
  accessToken?: string;
  /** Dev fallback when Supabase isn't configured server-side. */
  userId?: string;
}

/** Calls the secure Vercel proxy. The client never holds AI/eBay keys. */
export async function identifyWatch({
  imageBase64,
  countryCode,
  accessToken,
  userId,
}: IdentifyParams): Promise<IdentifyResponse> {
  if (!apiBaseUrl) {
    throw new ApiClientError("CONFIG", "API base URL is not configured", false);
  }

  let resp: Response;
  try {
    resp = await fetch(`${apiBaseUrl}/api/identify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ imageBase64, countryCode, userId }),
    });
  } catch {
    throw new ApiClientError("NETWORK", "Network request failed", true);
  }

  const json: unknown = await resp.json().catch(() => null);

  if (!resp.ok) {
    const parsed = ApiErrorSchema.safeParse(json);
    if (parsed.success) {
      const { code, message, retryable } = parsed.data.error;
      throw new ApiClientError(code, message, retryable);
    }
    throw new ApiClientError("INTERNAL", `Request failed (${resp.status})`, resp.status >= 500);
  }

  const parsed = IdentifyResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError("BAD_RESPONSE", "Unexpected response from server", true);
  }
  return parsed.data;
}
