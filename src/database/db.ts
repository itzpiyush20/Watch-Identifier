import * as SQLite from "expo-sqlite";
import { runMigrations } from "./migrations";

const DB_NAME = "watch_identifier.db";

let instance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (instance) return instance;
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await runMigrations(db);
  await purgeExpiredCache(db);
  instance = db;
  return db;
}

/** Deletes scan_cache rows whose expires_at is in the past. Called at startup
 *  and can be triggered again at app resume to keep the DB lean. */
export async function purgeExpiredCache(db: SQLite.SQLiteDatabase): Promise<number> {
  const result = await db.runAsync(
    "DELETE FROM scan_cache WHERE expires_at < ?;",
    [Date.now()]
  );
  return result.changes;
}
