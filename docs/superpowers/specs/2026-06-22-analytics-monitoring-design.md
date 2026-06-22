# Phase 8: Analytics & Monitoring — Design

Status: Approved
Date: 2026-06-22

## Goal

Add error monitoring (Sentry) and a lightweight product-analytics event log
(Supabase table), plus a user-facing rating control on scan results that feeds
the same event log. This is Phase 8 of the locked build roadmap (see project
memory `watch-identifier-decisions.md`): "8 analytics/monitoring."

## Non-goals

- No automatic model/prompt tuning from ratings. Ratings are recorded for
  manual review; any prompt changes based on them are a separate, future,
  human-driven task.
- No new analytics SaaS vendor (PostHog/Amplitude). Reuses the existing
  Supabase project already used for auth/sync/remote_config.
- No offline event queue / retry. Events are best-effort and may be dropped
  if the device is offline at the moment of the action — consistent with how
  market-data lookups already degrade.
- No automated test suite added as a side effect (none exists in the repo
  today); verification is manual.

## 1. Error monitoring (Sentry)

- **Client**: add `@sentry/react-native`. Initialize once in `app/_layout.tsx`
  via `Sentry.init({ dsn: config.sentryDsn, enabled: !!config.sentryDsn })`,
  reading `sentryDsn` already exposed through `app.config.ts`
  (`EXPO_PUBLIC_SENTRY_DSN`). Wrap the root export with `Sentry.wrap(...)`.
  With no DSN set (today's state), this no-ops — no behavior change until a
  real DSN is configured.
- **Server**: add `@sentry/node`. New `api/_lib/sentry.ts` exports a
  `captureException(err)` helper that lazily calls `Sentry.init({ dsn: env.sentryDsn })`
  on first use if `env.sentryDsn` (already defined in `api/_lib/env.ts:45`) is
  set, otherwise no-ops. Call this helper from the existing `catch` blocks in
  `api/identify.ts` (and other API handlers) alongside the existing
  `console.error` — purely additive, does not change response behavior or
  error codes returned to the client.

## 2. Product analytics — schema

New Supabase migration, `analytics_events` table:

```sql
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  event_name text not null,
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index analytics_events_event_created_idx
  on analytics_events (event_name, created_at);
```

No RLS policy is added — only the server (service-role key) ever writes to
this table, the same trust model already used by `api/_lib/auth.ts` for
resolving the user from a Supabase access token.

## 3. `/api/track` endpoint

- `POST /api/track`, body `{ event_name: string, properties?: object }`.
- Auth is optional: if an `Authorization: Bearer` header is present, resolve
  `user_id` via the existing `resolveUserId` helper; if absent or invalid,
  insert with `user_id: null` rather than rejecting the request. Analytics
  should never block on auth.
- Always responds `200` quickly. Insert is performed via the same
  fetch-with-service-role-key REST pattern as `api/_lib/auth.ts` (no new
  `@supabase/supabase-js` dependency on the server). Insert failures are
  logged via `console.error` (and `captureException`), never surfaced to the
  caller — this endpoint must never cause a user-visible failure.
- Server-known events are written directly via a shared `trackEvent()`
  helper (same insert logic, called in-process) from `api/identify.ts`,
  skipping the HTTP hop:
  - `scan_completed` — after a successful response, properties
    `{ confidence_band, verification_required }`.
  - `scan_failed` — in the catch block, properties `{ error_code }`.
  - `quota_exceeded` — when `reserveScan` returns `allowed: false`.

## 4. Client-emitted events

Fire-and-forget `POST /api/track` calls, swallow errors, never block UI:

- `scan_started` — on shutter press in the scan flow.
- `trade_in_clicked` — in `results.tsx` `handleTradeIn`.
- `signup_completed` / `login_completed` — in the respective `(auth)` screens.
- `result_rated` — see Section 5.

## 5. Result rating control

- UI: in `app/results.tsx`, below the confidence row, add "Was this
  identification correct?" with thumbs-up / thumbs-down buttons. Tapping
  either disables both buttons for that screen instance and shows "Thanks for
  the feedback." State is in-memory only (component state), not persisted
  across app restarts — a user can rate the same scan again after leaving and
  returning to results, which is acceptable for v1.
- On tap, POST `result_rated` with properties:
  ```json
  {
    "request_id": "...",
    "brand": "...",
    "model_family": "...",
    "reference_number": "... | null",
    "confidence_score": 0.0,
    "rating": "up" | "down"
  }
  ```
  `request_id` is already present on `IdentifyResponse`, linking the rating
  back to the specific scan/cache entry.
- No automated effect. Intended manual-review query:
  ```sql
  select brand, model_family, count(*) from analytics_events
  where event_name = 'result_rated' and properties->>'rating' = 'down'
  group by brand, model_family order by count(*) desc;
  ```

## 6. Verification plan (manual, no test framework added)

- Trigger each client event path (scan, signup, login, trade-in click,
  thumbs up/down) and confirm a matching row appears in `analytics_events`
  in the Supabase dashboard.
- Trigger a scan success and a scan failure (e.g. force a bad upstream
  response) and confirm `scan_completed` / `scan_failed` rows appear without
  changing the existing API response contract.
- Trigger quota exhaustion (4th scan in a day on a free account) and confirm
  a `quota_exceeded` row.
- Temporarily set a real Sentry DSN in `.env` / Vercel env, force a client and
  a server exception, confirm both show up in the Sentry project. Then
  confirm behavior is unchanged (no crash, normal error response) with the
  DSN unset.

## Open items deferred to later (explicitly out of scope here)

- Acting on rating data to adjust prompts/confidence thresholds.
- Dashboards/visualization on top of `analytics_events` (raw SQL queries are
  sufficient for now).
