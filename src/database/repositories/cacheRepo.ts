import type { SQLiteDatabase } from "expo-sqlite";
import { IdentifyResponseSchema, type IdentifyResponse } from "@/types";
import { CACHE_TTL } from "@/constants";

interface CacheRow {
  image_hash: string;
  response_payload: string;
  cached_at: number;
  expires_at: number;
}

/** Returns a cached IdentifyResponse if it exists and has not expired.
 *  Validates the stored JSON against the current schema so schema drift
 *  returns null rather than bad data. */
export async function getCachedResponse(
  db: SQLiteDatabase,
  imageHash: string
): Promise<IdentifyResponse | null> {
  const row = await db.getFirstAsync<CacheRow>(
    "SELECT * FROM scan_cache WHERE image_hash = ? AND expires_at > ?;",
    [imageHash, Date.now()]
  );
  if (!row) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.response_payload);
  } catch {
    return null;
  }

  const result = IdentifyResponseSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/** Persists an IdentifyResponse. Uses the shorter pricing TTL (7 days) since
 *  identification and pricing are bundled and pricing is more volatile. */
export async function setCachedResponse(
  db: SQLiteDatabase,
  imageHash: string,
  response: IdentifyResponse
): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    `INSERT OR REPLACE INTO scan_cache (image_hash, response_payload, cached_at, expires_at)
     VALUES (?, ?, ?, ?);`,
    [imageHash, JSON.stringify(response), now, now + CACHE_TTL.PRICING_MS]
  );
}

export async function deleteCachedResponse(
  db: SQLiteDatabase,
  imageHash: string
): Promise<void> {
  await db.runAsync("DELETE FROM scan_cache WHERE image_hash = ?;", [imageHash]);
}
