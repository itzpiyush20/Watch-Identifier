/** Server-only environment access. Throws loudly if a required secret is
 *  missing so misconfiguration fails at the edge, not deep in the pipeline.
 *  NEVER import this from client (src/) code. */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  openrouter: {
    get apiKey() {
      return required("OPENROUTER_API_KEY");
    },
    model: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
  },
  ebay: {
    get clientId() {
      return required("EBAY_CLIENT_ID");
    },
    get clientSecret() {
      return required("EBAY_CLIENT_SECRET");
    },
    marketplaceId: process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
  },
  supabase: {
    url: optional("SUPABASE_URL"),
    serviceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
    get isConfigured() {
      return !!(this.url && this.serviceRoleKey);
    },
  },
  redis: {
    url: optional("UPSTASH_REDIS_REST_URL"),
    token: optional("UPSTASH_REDIS_REST_TOKEN"),
    get isConfigured() {
      return !!(this.url && this.token);
    },
  },
  sentryDsn: optional("SENTRY_DSN_SERVER"),
  isProd: process.env.VERCEL_ENV === "production",
} as const;
