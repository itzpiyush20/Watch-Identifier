import React, { createContext, useContext, useEffect, useState } from "react";
import type { SQLiteDatabase } from "expo-sqlite";

interface DatabaseContextValue {
  db: SQLiteDatabase | null;
  ready: boolean;
  error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  db: null,
  ready: false,
  error: null,
});

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DatabaseContextValue>({
    db: null,
    ready: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // Lazy-import so any import-time crash is caught here, not at module load
        const { getDatabase } = await import("@/database");
        const db = await getDatabase();
        if (!cancelled) setState({ db, ready: true, error: null });
      } catch (err) {
        console.error("[DatabaseProvider] Failed to initialize DB:", err);
        if (!cancelled)
          setState({ db: null, ready: false, error: err as Error });
        // NOTE: We intentionally do NOT re-throw — the app still renders
        // without a database so the user sees an error state rather than
        // a black screen crash.
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DatabaseContext.Provider value={state}>
      {children}
    </DatabaseContext.Provider>
  );
}

/** Returns the initialized SQLite database. Throws if called before the
 *  provider has finished initializing — use `ready` to gate renders. */
export function useDatabase(): DatabaseContextValue {
  return useContext(DatabaseContext);
}
