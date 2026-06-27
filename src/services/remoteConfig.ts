import { db } from "./firebase";

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

// Local build-time defaults if Firestore is offline or not authenticated yet
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
 * Fetches dynamic configs from Firestore remote_config/default document.
 * Falls back to default values on error or network failure.
 */
export async function fetchRemoteConfig(): Promise<RemoteConfigData> {
  try {
    const docSnap = await db.collection("remote_config").doc("default").get();

    if (!docSnap.exists) {
      console.warn("[RemoteConfig] No remote config document found. Using defaults.");
      return DEFAULT_REMOTE_CONFIG;
    }

    const data = docSnap.data();
    if (!data) {
      return DEFAULT_REMOTE_CONFIG;
    }
    const config = { ...DEFAULT_REMOTE_CONFIG };

    if (data.feature_flags) {
      config.feature_flags = {
        ...DEFAULT_REMOTE_CONFIG.feature_flags,
        ...data.feature_flags,
      };
    }
    if (data.fx_usd_to_inr !== undefined) {
      config.fx_usd_to_inr = Number(data.fx_usd_to_inr) || DEFAULT_REMOTE_CONFIG.fx_usd_to_inr;
    }
    if (data.in_market_adjustment !== undefined) {
      config.in_market_adjustment =
        Number(data.in_market_adjustment) || DEFAULT_REMOTE_CONFIG.in_market_adjustment;
    }
    if (data.ebay_asking_discount !== undefined) {
      config.ebay_asking_discount =
        Number(data.ebay_asking_discount) || DEFAULT_REMOTE_CONFIG.ebay_asking_discount;
    }
    if (data.free_scans_per_day !== undefined) {
      config.free_scans_per_day =
        Number(data.free_scans_per_day) || DEFAULT_REMOTE_CONFIG.free_scans_per_day;
    }
    if (data.partner_whatsapp_number !== undefined) {
      config.partner_whatsapp_number =
        typeof data.partner_whatsapp_number === "string" ? data.partner_whatsapp_number : null;
    }

    return config;
  } catch (err) {
    console.warn(
      "[RemoteConfig] Could not load remote config from Firestore (falling back to defaults). " +
        "Make sure Firestore is enabled in your Firebase Console and the device is connected to the internet.",
      err
    );
    return DEFAULT_REMOTE_CONFIG;
  }
}

