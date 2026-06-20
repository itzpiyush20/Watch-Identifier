import { supabase } from "./supabase";

export interface RemoteConfigData {
  feature_flags: {
    authenticityCaution: boolean;
    tradeInCta: boolean;
    ads: boolean;
  };
  fx_usd_to_inr: number;
  in_market_adjustment: number;
  ebay_asking_discount: number;
  free_scans_per_day: number;
  partner_whatsapp_number: string | null;
}

// Local build-time defaults if Supabase is offline or not authenticated yet
export const DEFAULT_REMOTE_CONFIG: RemoteConfigData = {
  feature_flags: {
    authenticityCaution: true,
    tradeInCta: true,
    ads: true,
  },
  fx_usd_to_inr: 84,
  in_market_adjustment: 1.0,
  ebay_asking_discount: 0.85,
  free_scans_per_day: 3,
  partner_whatsapp_number: null,
};

/**
 * Fetches dynamic configs from Supabase remote_config table.
 * Falls back to default values on error or network failure.
 */
export async function fetchRemoteConfig(): Promise<RemoteConfigData> {
  try {
    const { data, error } = await supabase
      .from("remote_config")
      .select("key, value");

    if (error) {
      console.warn("[RemoteConfig] Failed to fetch remote config:", error.message);
      return DEFAULT_REMOTE_CONFIG;
    }

    const config = { ...DEFAULT_REMOTE_CONFIG };

    for (const item of data || []) {
      const { key, value } = item;
      if (key === "feature_flags") {
        config.feature_flags = {
          ...DEFAULT_REMOTE_CONFIG.feature_flags,
          ...value,
        };
      } else if (key === "fx_usd_to_inr") {
        config.fx_usd_to_inr = Number(value) || DEFAULT_REMOTE_CONFIG.fx_usd_to_inr;
      } else if (key === "in_market_adjustment") {
        config.in_market_adjustment =
          Number(value) || DEFAULT_REMOTE_CONFIG.in_market_adjustment;
      } else if (key === "ebay_asking_discount") {
        config.ebay_asking_discount =
          Number(value) || DEFAULT_REMOTE_CONFIG.ebay_asking_discount;
      } else if (key === "free_scans_per_day") {
        config.free_scans_per_day =
          Number(value) || DEFAULT_REMOTE_CONFIG.free_scans_per_day;
      } else if (key === "partner_whatsapp_number") {
        config.partner_whatsapp_number = typeof value === "string" ? value : null;
      }
    }

    return config;
  } catch (err) {
    console.error("[RemoteConfig] Unexpected error loading config:", err);
    return DEFAULT_REMOTE_CONFIG;
  }
}
