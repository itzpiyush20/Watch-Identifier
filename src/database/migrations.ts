import type { SQLiteDatabase } from "expo-sqlite";

interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    async up(db) {
      await db.execAsync("PRAGMA journal_mode = WAL;");

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL
        );
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS scan_cache (
          image_hash   TEXT PRIMARY KEY,
          response_payload TEXT NOT NULL,
          cached_at    INTEGER NOT NULL,
          expires_at   INTEGER NOT NULL
        );
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS local_portfolio (
          id                   TEXT PRIMARY KEY,
          user_id              TEXT,
          brand                TEXT NOT NULL,
          model_family         TEXT NOT NULL,
          reference_number     TEXT,
          image_uri            TEXT,
          market_data_json     TEXT NOT NULL,
          confidence_score     REAL NOT NULL,
          authenticity_caution TEXT NOT NULL,
          scanned_at           INTEGER NOT NULL,
          synced               INTEGER NOT NULL DEFAULT 0,
          expires_at           INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_portfolio_user ON local_portfolio(user_id);
        CREATE INDEX IF NOT EXISTS idx_portfolio_scanned ON local_portfolio(scanned_at DESC);
        CREATE INDEX IF NOT EXISTS idx_portfolio_synced ON local_portfolio(synced) WHERE synced = 0;
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON scan_cache(expires_at);
      `);
    },
  },
  {
    version: 2,
    async up(db) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS preferences (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  // Ensure migration table exists before we query it.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = await db.getAllAsync<{ version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version ASC;"
  );
  const appliedVersions = new Set(applied.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;
    await migration.up(db);
    await db.runAsync(
      "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?);",
      [migration.version, Date.now()]
    );
  }
}
