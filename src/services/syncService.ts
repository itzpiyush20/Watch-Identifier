import { supabase } from "./supabase";
import { listUnsyncedEntries, markSynced } from "@/database";
import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Synchronizes unsynced local portfolio entries from SQLite to the Supabase cloud database.
 * Filters entries by the active userId and updates the synced state locally on success.
 */
export async function syncPortfolio(
  db: SQLiteDatabase,
  userId: string
): Promise<void> {
  try {
    const unsynced = await listUnsyncedEntries(db);
    if (unsynced.length === 0) {
      return;
    }

    // Filter to ensure we only sync entries belonging to the current user
    const userUnsynced = unsynced.filter(
      (entry) => entry.user_id === userId || !entry.user_id
    );

    if (userUnsynced.length === 0) {
      return;
    }

    const rowsToSync = userUnsynced.map((entry) => ({
      id: entry.id,
      user_id: userId, // Bind to authenticated user
      brand: entry.brand,
      model_family: entry.model_family,
      reference_number: entry.reference_number,
      market_data_json: JSON.parse(entry.market_data_json),
      confidence_score: entry.confidence_score,
      authenticity_caution: JSON.parse(entry.authenticity_caution),
      scanned_at: new Date(entry.scanned_at).toISOString(),
    }));

    const { error } = await supabase
      .from("portfolio")
      .upsert(rowsToSync, { onConflict: "id" });

    if (error) {
      console.error("[SyncService] Supabase sync failed:", error.message);
      return;
    }

    const syncedIds = userUnsynced.map((entry) => entry.id);
    await markSynced(db, syncedIds);
    console.log(
      `[SyncService] Successfully synchronized ${syncedIds.length} entries to the cloud.`
    );
  } catch (err) {
    console.error("[SyncService] Unexpected sync error:", err);
  }
}
