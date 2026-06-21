import { getRedis } from "./redis.js";

const FREE_SCANS_PER_DAY = 3;
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
 * Reserve one scan against the user's daily quota (reserve-then-refund pattern).
 * Premium users bypass entirely. Fails OPEN if Redis is unconfigured (dev).
 */
export async function reserveScan(userId: string, isPremium: boolean): Promise<QuotaResult> {
  if (isPremium) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, limit: Number.POSITIVE_INFINITY };
  }
  const redis = getRedis();
  if (!redis) {
    return { allowed: true, remaining: FREE_SCANS_PER_DAY, limit: FREE_SCANS_PER_DAY };
  }

  const k = key(userId);
  const count = await redis.incr(k);
  if (count === 1) {
    await redis.expire(k, WINDOW_SECONDS);
  }

  if (count > FREE_SCANS_PER_DAY) {
    await redis.decr(k); // we did not consume a scan
    return { allowed: false, remaining: 0, limit: FREE_SCANS_PER_DAY };
  }

  return {
    allowed: true,
    remaining: Math.max(0, FREE_SCANS_PER_DAY - count),
    limit: FREE_SCANS_PER_DAY,
  };
}

/** Refund a previously reserved scan when downstream processing fails. */
export async function refundScan(userId: string, isPremium: boolean): Promise<void> {
  if (isPremium) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.decr(key(userId));
  } catch {
    /* best-effort */
  }
}
