import { Alert } from "react-native";
import type { Tier } from "@/types";

export type PaidTier = Exclude<Tier, "trial" | "free">;

/**
 * Stub: real Google Play Billing (via RevenueCat) is deferred until the
 * project moves to an EAS/dev-client build, which real purchases require
 * regardless — Play Billing cannot be exercised in Expo Go under any
 * circumstances. This intentionally does NOT grant the tier: no payment
 * occurred, so nothing should unlock.
 */
export async function purchaseTier(_tier: PaidTier): Promise<void> {
  Alert.alert(
    "Coming Soon",
    "Subscriptions will be available once the app ships its production build."
  );
}
