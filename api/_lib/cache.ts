import { getRedis } from "./redis.js";

/** Server-side response cache. Degrades to a no-op when Redis is unconfigured. */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    if (!redis) return null;
    try {
      return (await redis.get<T>(key)) ?? null;
    } catch {
      return null; // cache must never break the request path
    }
  },

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    try {
      await redis.set(key, value, { px: ttlMs });
    } catch {
      /* swallow — best-effort */
    }
  },
};
