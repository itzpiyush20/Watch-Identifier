import { useState, useCallback, useEffect } from "react";
import { randomUUID } from "expo-crypto";
import type { PortfolioEntry, IdentifyResponse } from "@/types";
import {
  listPortfolioEntries,
  insertPortfolioEntry,
  deletePortfolioEntry,
  serializeMarketData,
  serializeAuthenticityCaution,
} from "@/database";
import { syncPortfolio } from "@/services/syncService";
import { useDatabase } from "./useDatabase";

interface UsePortfolioReturn {
  entries: PortfolioEntry[];
  loading: boolean;
  save: (
    response: IdentifyResponse,
    imageUri: string | null,
    userId: string | null
  ) => Promise<string>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function usePortfolio(userId?: string | null): UsePortfolioReturn {
  const { db } = useDatabase();
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      const rows = await listPortfolioEntries(db, userId);
      setEntries(rows);
    } finally {
      setLoading(false);
    }
  }, [db, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Background Sync Effect
  useEffect(() => {
    if (!db || !userId) return;

    let active = true;
    const runBackgroundSync = async () => {
      await syncPortfolio(db, userId);
      if (active) {
        // Refresh local state to reflect updated sync flags
        const rows = await listPortfolioEntries(db, userId);
        setEntries(rows);
      }
    };

    void runBackgroundSync();

    return () => {
      active = false;
    };
  }, [db, userId]);

  const save = useCallback(
    async (
      response: IdentifyResponse,
      imageUri: string | null,
      userId: string | null
    ): Promise<string> => {
      if (!db) throw new Error("Database not ready");
      const id = randomUUID();
      const entry: Omit<PortfolioEntry, "synced"> = {
        id,
        user_id: userId,
        brand: response.identification.brand,
        model_family: response.identification.model_family,
        reference_number: response.identification.reference_number,
        image_uri: imageUri,
        market_data_json: serializeMarketData(response.market),
        confidence_score: response.identification.confidence_score,
        authenticity_caution: serializeAuthenticityCaution(
          response.identification.authenticity_caution
        ),
        scanned_at: Date.now(),
        expires_at: null,
      };
      await insertPortfolioEntry(db, entry);
      await refresh();
      return id;
    },
    [db, refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!db) throw new Error("Database not ready");
      await deletePortfolioEntry(db, id);
      await refresh();
    },
    [db, refresh]
  );

  return { entries, loading, save, remove, refresh };
}
