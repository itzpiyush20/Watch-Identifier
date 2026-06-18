/**
 * Premium entitlement check seam. Wired to RevenueCat / a Supabase
 * `subscriptions` table in Phase 7. Until then it always returns false so the
 * free-tier quota applies to everyone (safe default).
 */
export async function isPremiumUser(_userId: string): Promise<boolean> {
  return false;
}
