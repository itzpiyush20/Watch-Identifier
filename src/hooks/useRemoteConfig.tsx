import React, { createContext, useContext, useEffect, useState } from "react";
import {
  fetchRemoteConfig,
  DEFAULT_REMOTE_CONFIG,
  type RemoteConfigData,
} from "@/services/remoteConfig";
import { useAuth } from "./useAuth";

const RemoteConfigContext = createContext<RemoteConfigData>(DEFAULT_REMOTE_CONFIG);

export function RemoteConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<RemoteConfigData>(DEFAULT_REMOTE_CONFIG);
  const { session } = useAuth();

  useEffect(() => {
    // Only query backend settings once we have an authenticated user session
    // (remote_config RLS only allows selects to authenticated roles)
    if (!session) {
      setConfig(DEFAULT_REMOTE_CONFIG);
      return;
    }

    let active = true;
    fetchRemoteConfig().then((data) => {
      if (active) {
        setConfig(data);
      }
    });

    return () => {
      active = false;
    };
  }, [session]);

  return (
    <RemoteConfigContext.Provider value={config}>
      {children}
    </RemoteConfigContext.Provider>
  );
}

export function useRemoteConfig(): RemoteConfigData {
  return useContext(RemoteConfigContext);
}
