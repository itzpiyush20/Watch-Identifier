import { useCallback } from "react";
import type { IdentifyResponse } from "@/types";
import { getCachedResponse, setCachedResponse } from "@/database";
import { useDatabase } from "./useDatabase";

export interface ScanCacheHook {
  get: (imageHash: string) => Promise<IdentifyResponse | null>;
  set: (imageHash: string, response: IdentifyResponse) => Promise<void>;
}

/** Two-tier cache: this hook wraps the LOCAL (SQLite) tier.
 *  The server has its own Redis cache (Phase 2). A local hit saves a
 *  round-trip + quota; a local miss hits the server which may itself hit Redis. */
export function useScanCache(): ScanCacheHook {
  const { db } = useDatabase();

  const get = useCallback(
    async (imageHash: string): Promise<IdentifyResponse | null> => {
      if (!db) return null;
      return getCachedResponse(db, imageHash);
    },
    [db]
  );

  const set = useCallback(
    async (imageHash: string, response: IdentifyResponse): Promise<void> => {
      if (!db) return;
      await setCachedResponse(db, imageHash, response);
    },
    [db]
  );

  return { get, set };
}
