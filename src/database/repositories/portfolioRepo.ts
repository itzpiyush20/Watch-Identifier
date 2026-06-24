import type { SQLiteDatabase } from "expo-sqlite";
import { MarketRangeSchema, AuthenticityCautionSchema, type PortfolioEntry } from "@/types";

type RawRow = {
  id: string;
  user_id: string | null;
  brand: string;
  model_family: string;
  reference_number: string | null;
  image_uri: string | null;
  market_data_json: string;
  confidence_score: number;
  authenticity_caution: string;
  scanned_at: number;
  synced: number;
  expires_at: number | null;
  collection_name: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  purchase_currency: string | null;
  condition: string | null;
  ownership_status: string | null;
  box_available: number | null;
  papers_available: number | null;
};

function rowToEntry(row: RawRow): PortfolioEntry {
  return {
    ...row,
    synced: (row.synced === 1 ? 1 : 0) as 0 | 1,
    box_available: row.box_available === 1 ? 1 : row.box_available === 0 ? 0 : null,
    papers_available: row.papers_available === 1 ? 1 : row.papers_available === 0 ? 0 : null,
  };
}

export async function insertPortfolioEntry(
  db: SQLiteDatabase,
  entry: Omit<PortfolioEntry, "synced">
): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_portfolio
       (id, user_id, brand, model_family, reference_number, image_uri,
        market_data_json, confidence_score, authenticity_caution,
        scanned_at, synced, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?);`,
    [
      entry.id,
      entry.user_id ?? null,
      entry.brand,
      entry.model_family,
      entry.reference_number ?? null,
      entry.image_uri ?? null,
      entry.market_data_json,
      entry.confidence_score,
      entry.authenticity_caution,
      entry.scanned_at,
      entry.expires_at ?? null,
    ]
  );
}

export async function getPortfolioEntry(
  db: SQLiteDatabase,
  id: string
): Promise<PortfolioEntry | null> {
  const row = await db.getFirstAsync<RawRow>(
    "SELECT * FROM local_portfolio WHERE id = ?;",
    [id]
  );
  return row ? rowToEntry(row) : null;
}

export async function listPortfolioEntries(
  db: SQLiteDatabase,
  userId?: string | null
): Promise<PortfolioEntry[]> {
  let rows: RawRow[];
  if (userId) {
    rows = await db.getAllAsync<RawRow>(
      "SELECT * FROM local_portfolio WHERE user_id = ? ORDER BY scanned_at DESC;",
      [userId]
    );
  } else {
    rows = await db.getAllAsync<RawRow>(
      "SELECT * FROM local_portfolio ORDER BY scanned_at DESC;"
    );
  }
  return rows.map(rowToEntry);
}

export async function deletePortfolioEntry(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  await db.runAsync("DELETE FROM local_portfolio WHERE id = ?;", [id]);
}

export type ManualEnrichmentUpdate = Partial<
  Pick<
    PortfolioEntry,
    | "brand"
    | "model_family"
    | "reference_number"
    | "collection_name"
    | "purchase_date"
    | "purchase_price"
    | "purchase_currency"
    | "condition"
    | "ownership_status"
    | "box_available"
    | "papers_available"
  >
>;

/**
 * Updates a portfolio entry's editable fields and resets synced to 0, so
 * the next sync pass pushes the change to Supabase — without this,
 * editing an already-synced row would never reach the cloud, since
 * syncPortfolio only ever looks at synced = 0 rows.
 */
export async function updatePortfolioEntry(
  db: SQLiteDatabase,
  id: string,
  updates: ManualEnrichmentUpdate
): Promise<void> {
  const fields = Object.keys(updates) as (keyof ManualEnrichmentUpdate)[];
  if (fields.length === 0) return;
  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => updates[f] ?? null);
  await db.runAsync(
    `UPDATE local_portfolio SET ${setClause}, synced = 0 WHERE id = ?;`,
    [...values, id]
  );
}

/** Returns all rows that have not yet been synced to Supabase. */
export async function listUnsyncedEntries(
  db: SQLiteDatabase
): Promise<PortfolioEntry[]> {
  const rows = await db.getAllAsync<RawRow>(
    "SELECT * FROM local_portfolio WHERE synced = 0 ORDER BY scanned_at ASC;"
  );
  return rows.map(rowToEntry);
}

/** Marks a list of portfolio entries as synced. */
export async function markSynced(
  db: SQLiteDatabase,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  await db.runAsync(
    `UPDATE local_portfolio SET synced = 1 WHERE id IN (${placeholders});`,
    ids
  );
}

/** Serializes a MarketRange to the JSON string stored in the DB.
 *  Validates before serializing so garbage never enters the DB. */
export function serializeMarketData(market: unknown): string {
  const parsed = MarketRangeSchema.parse(market);
  return JSON.stringify(parsed);
}

/** Deserializes and validates market_data_json from the DB. */
export function deserializeMarketData(json: string) {
  return MarketRangeSchema.parse(JSON.parse(json));
}

/** Serializes authenticity_caution for storage. */
export function serializeAuthenticityCaution(caution: unknown): string {
  const parsed = AuthenticityCautionSchema.parse(caution);
  return JSON.stringify(parsed);
}

/** Deserializes and validates authenticity_caution from the DB. */
export function deserializeAuthenticityCaution(json: string) {
  return AuthenticityCautionSchema.parse(JSON.parse(json));
}
