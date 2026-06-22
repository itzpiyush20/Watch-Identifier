import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Entitlement } from "@/types";
import { fetchEntitlement } from "@/services/entitlement";
import { useAuth } from "./useAuth";

interface EntitlementContextValue {
  entitlement: Entitlement | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextValue>({
  entitlement: null,
  loading: true,
  refresh: async () => {},
});

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.access_token) {
      setEntitlement(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await fetchEntitlement(session.access_token);
    setEntitlement(data);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <EntitlementContext.Provider value={{ entitlement, loading, refresh }}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement(): EntitlementContextValue {
  return useContext(EntitlementContext);
}
