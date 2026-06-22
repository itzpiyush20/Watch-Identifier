import Constants from "expo-constants";

const apiBaseUrl: string = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "";

/**
 * Fire-and-forget product-analytics event. Never throws, never blocks the
 * caller — callers should invoke this with `void track(...)`, not `await`.
 */
export async function track(
  eventName: string,
  properties?: Record<string, unknown>,
  accessToken?: string
): Promise<void> {
  if (!apiBaseUrl) return;
  try {
    await fetch(`${apiBaseUrl}/api/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ event_name: eventName, properties }),
    });
  } catch (err) {
    console.warn(`[analytics] failed to track "${eventName}":`, err);
  }
}
