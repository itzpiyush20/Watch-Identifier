import { getRedis } from "./redis.js";

const WINDOW_SECONDS = 24 * 60 * 60;

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

function key(userId: string): string {
  // Fixed 24h window bucket per user.
  const bucket = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  return `quota:${userId}:${bucket}`;
}

/**
 * Reserve one scan against the user's daily limit (reserve-then-refund
 * pattern). `limit === null` means unlimited (Vault tier) and bypasses
 * Redis entirely. Fails OPEN if Redis is unconfigured (dev).
 */
export async function reserveScan(userId: string, limit: number | null): Promise<QuotaResult> {
  if (limit === null) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit: Number.POSITIVE_INFINITY };
  }
  const redis = getRedis();
  if (!redis) {
    return { allowed: true, remaining: limit, limit };
  }

  const k = key(userId);
  const count = await redis.incr(k);
  if (count === 1) {
    await redis.expire(k, WINDOW_SECONDS);
  }

  if (count > limit) {
    await redis.decr(k); // we did not consume a scan
    return { allowed: false, remaining: 0, limit };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    limit,
  };
}

/** Refund a previously reserved scan when downstream processing fails. */
export async function refundScan(userId: string, limit: number | null): Promise<void> {
  if (limit === null) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.decr(key(userId));
  } catch {
    /* best-effort */
  }
}

/** Non-consuming read of the current quota state — used by GET /api/entitlement
 *  so checking your remaining quota never itself counts as a scan. */
export async function peekQuota(userId: string, limit: number | null): Promise<QuotaResult> {
  if (limit === null) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit: Number.POSITIVE_INFINITY };
  }
  const redis = getRedis();
  if (!redis) {
    return { allowed: true, remaining: limit, limit };
  }
  const count = (await redis.get<number>(key(userId))) ?? 0;
  return { allowed: count < limit, remaining: Math.max(0, limit - count), limit };
}
