import * as Sentry from "@sentry/node";
import { env } from "./env.js";

let initialized = false;

function ensureInit(): void {
  if (initialized) return;
  initialized = true;
  if (!env.sentryDsn) return;
  Sentry.init({ dsn: env.sentryDsn, tracesSampleRate: 0 });
}

/** No-ops cleanly when SENTRY_DSN_SERVER is unset. */
export function captureException(err: unknown): void {
  ensureInit();
  if (!env.sentryDsn) return;
  Sentry.captureException(err);
}
