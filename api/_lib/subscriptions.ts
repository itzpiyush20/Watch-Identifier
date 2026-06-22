import { env } from "./env.js";
import type { Tier } from "../../src/types/index.js";

export const TIER_LIMITS: Record<Tier, number | null> = {
  trial: 10,
  free: 3,
  collector: 15,
  connoisseur: 50,
  vault: null, // unlimited
};

export const TIER_UNLIMITED_HISTORY: Record<Tier, boolean> = {
  trial: true,
  free: false,
  collector: false,
  connoisseur: true,
  vault: true,
};

interface SubscriptionRow {
  tier: Tier;
  status: "active" | "expired" | "cancelled";
  trial_ends_at: string | null;
  expires_at: string | null;
}

export interface EffectiveTier {
  tier: Tier;
  trialEndsAt: string | null;
}

/**
 * Resolves a user's effective tier at request time (no cron job needed):
 * a `trial` row past its trial_ends_at, or any inactive/expired row,
 * resolves to `free`. A missing row (account predates this feature, or
 * Supabase is unconfigured) also resolves to `free` — the safe default.
 */
export async function getEffectiveTier(userId: string): Promise<EffectiveTier> {
  if (!env.supabase.isConfigured) return { tier: "free", trialEndsAt: null };

  let row: SubscriptionRow | null = null;
  try {
    const resp = await fetch(
      `${env.supabase.url}/rest/v1/subscriptions?user_id=eq.${userId}&select=tier,status,trial_ends_at,expires_at`,
      {
        headers: {
          apikey: env.supabase.serviceRoleKey!,
          Authorization: `Bearer ${env.supabase.serviceRoleKey}`,
        },
      }
    );
    if (resp.ok) {
      const rows = (await resp.json()) as SubscriptionRow[];
      row = rows[0] ?? null;
    }
  } catch {
    // fall through to the free default below
  }

  if (!row) return { tier: "free", trialEndsAt: null };
  if (row.status !== "active") return { tier: "free", trialEndsAt: row.trial_ends_at };

  if (row.tier === "trial") {
    if (row.trial_ends_at && new Date(row.trial_ends_at) < new Date()) {
      return { tier: "free", trialEndsAt: row.trial_ends_at };
    }
    return { tier: "trial", trialEndsAt: row.trial_ends_at };
  }

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { tier: "free", trialEndsAt: null };
  }

  return { tier: row.tier, trialEndsAt: null };
}
