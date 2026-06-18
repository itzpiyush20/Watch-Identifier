import { Redis } from "@upstash/redis";
import { env } from "./env";

/** Lazily-created Upstash client. Returns null when Redis isn't configured so
 *  callers can degrade gracefully (cache skipped, quota fails open in dev). */
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  if (!env.redis.isConfigured) {
    client = null;
    return null;
  }
  client = new Redis({ url: env.redis.url!, token: env.redis.token! });
  return client;
}
