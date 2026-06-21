import * as Crypto from "expo-crypto";

/** Generates an MD5 hex digest of one or more base64-encoded image strings.
 *  Used as the local scan_cache key. Strips any data-URL prefix first
 *  so the key is stable regardless of how the base64 arrives. A front+back
 *  scan hashes differently from a front-only scan of the same dial. */
export async function hashImageBase64(
  ...images: (string | undefined)[]
): Promise<string> {
  const data = images
    .filter((img): img is string => !!img)
    .map((img) => img.replace(/^data:image\/\w+;base64,/, ""))
    .join("|");
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, data);
}
