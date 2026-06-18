import * as Crypto from "expo-crypto";

/** Generates an MD5 hex digest of a base64-encoded image string.
 *  Used as the local scan_cache key. Strips any data-URL prefix first
 *  so the key is stable regardless of how the base64 arrives. */
export async function hashImageBase64(imageBase64: string): Promise<string> {
  const data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, data);
}
