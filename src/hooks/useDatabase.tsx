import React, { createContext, useContext, useEffect, useState } from "react";
import type { SQLiteDatabase } from "expo-sqlite";
import { getDatabase } from "@/database";

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
    getDatabase()
      .then((db) => {
        if (!cancelled) setState({ db, ready: true, error: null });
      })
      .catch((err) => {
        if (!cancelled)
          setState({ db: null, ready: false, error: err as Error });
      });
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
