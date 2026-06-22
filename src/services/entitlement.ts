import Constants from "expo-constants";
import { EntitlementSchema, type Entitlement } from "@/types";

const apiBaseUrl: string = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "";

export async function fetchEntitlement(accessToken: string): Promise<Entitlement | null> {
  if (!apiBaseUrl) return null;
  try {
    const resp = await fetch(`${apiBaseUrl}/api/entitlement`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const parsed = EntitlementSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
