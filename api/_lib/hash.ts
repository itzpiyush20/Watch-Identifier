import { createHash } from "node:crypto";

/** Stable cache key for an image payload. SHA-256 of the raw base64 (non-security
 *  use — just a content key). Strips any data-URL prefix first. */
export function imageHash(imageBase64: string): string {
  const data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  return createHash("sha256").update(data).digest("hex");
}

/** Approximate decoded byte size of a base64 string without allocating a Buffer. */
export function base64Bytes(b64: string): number {
  const data = b64.replace(/^data:image\/\w+;base64,/, "");
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}
