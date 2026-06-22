import { useState, useEffect, useCallback } from "react";
import { getPreference, setPreference } from "@/database";
import { useDatabase } from "./useDatabase";

const KEY = "country_code";
const DEFAULT_COUNTRY = "IN";

interface UseCountryCodeReturn {
  countryCode: string;
  setCountryCode: (code: string) => Promise<void>;
  loading: boolean;
}

export function useCountryCode(): UseCountryCodeReturn {
  const { db } = useDatabase();
  const [countryCode, setCode] = useState(DEFAULT_COUNTRY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    let active = true;
    getPreference(db, KEY).then((value) => {
      if (active) {
        setCode(value ?? DEFAULT_COUNTRY);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [db]);

  const setCountryCode = useCallback(
    async (code: string) => {
      if (!db) return;
      await setPreference(db, KEY, code);
      setCode(code);
    },
    [db]
  );

  return { countryCode, setCountryCode, loading };
}
