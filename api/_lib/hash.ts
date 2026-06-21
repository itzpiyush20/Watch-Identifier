import { createHash } from "node:crypto";

/** Stable cache key for one or more image payloads. SHA-256 of the raw base64s
 *  joined in order (non-security use — just a content key). Strips any
 *  data-URL prefix first. Used so a front+back scan caches separately from a
 *  front-only scan of the same dial. */
export function imageHash(images: (string | undefined)[]): string {
  const data = images
    .filter((img): img is string => !!img)
    .map((img) => img.replace(/^data:image\/\w+;base64,/, ""))
    .join("|");
  return createHash("sha256").update(data).digest("hex");
}

/** Approximate decoded byte size of a base64 string without allocating a Buffer. */
export function base64Bytes(b64: string): number {
  const data = b64.replace(/^data:image\/\w+;base64,/, "");
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}
