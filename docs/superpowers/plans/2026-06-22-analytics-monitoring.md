# Phase 8 Analytics & Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 8 of the locked roadmap — Sentry error monitoring (client + server) and a lightweight Supabase-backed product-analytics event log, including a thumbs-up/down rating control on the results screen — exactly as approved in `docs/superpowers/specs/2026-06-22-analytics-monitoring-design.md`.

**Architecture:** A new `analytics_events` Supabase table is written to only by the server (service-role REST insert, same pattern as `api/_lib/auth.ts`). Client UI actions POST to a new `/api/track` endpoint; server-known outcomes (`scan_completed`, `scan_failed`, `quota_exceeded`) are written in-process from `api/identify.ts` via a shared `trackEvent()` helper, skipping the HTTP hop. Sentry is wired on both sides behind the existing `EXPO_PUBLIC_SENTRY_DSN` / `SENTRY_DSN_SERVER` env vars and no-ops with an empty DSN.

**Tech Stack:** `@sentry/node` (server), `@sentry/react-native` (client), Supabase REST (service-role key), existing Zod schemas in `src/types/index.ts`.

**Testing note (deviation from default TDD steps):** This repo has zero existing automated tests (`jest --passWithNoTests`, no `*.test.ts` files), and the approved spec's Section 6 explicitly designates **manual verification** as the testing strategy for this phase (no new test framework as a side effect). Each task below therefore ends with a manual verification step instead of a unit test, per the spec's stated non-goal. `npx tsc --noEmit` is run after every code task as the only automated gate.

---

### Task 1: `analytics_events` Supabase migration

**Files:**
- Create: `supabase/migrations/002_analytics_events.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 002: analytics events
-- Apply via: supabase db push  (or paste into Supabase SQL editor)

-- =========================================================================
-- analytics_events — lightweight product-analytics + rating event log.
-- Written ONLY by the server (service-role key bypasses RLS). No anon/
-- authenticated policy is defined, so direct client access is denied by
-- default once RLS is enabled.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name  TEXT        NOT NULL,
  properties  JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
  ON public.analytics_events (event_name, created_at);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) may read/write.
```

- [ ] **Step 2: Apply the migration**

Run in the Supabase SQL editor (or `supabase db push` if the CLI is linked
to the project), then confirm in the Table Editor that `analytics_events`
exists with columns `id, user_id, event_name, properties, created_at`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_analytics_events.sql
git commit -m "Add analytics_events table for Phase 8 event logging"
```

---

### Task 2: Shared `TrackEvent` schema

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the schema**

Add this block after the `ApiErrorSchema` export (after line 107, i.e. right
before the `Local persistence` section comment):

```typescript
// ---------------------------------------------------------------------------
// API: POST /api/track
// ---------------------------------------------------------------------------

export const TrackEventSchema = z.object({
  event_name: z.string().min(1).max(64),
  properties: z.record(z.unknown()).optional(),
});
export type TrackEvent = z.infer<typeof TrackEventSchema>;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "Add TrackEvent schema for analytics endpoint"
```

---

### Task 3: Server `trackEvent()` helper

**Files:**
- Create: `api/_lib/analytics.ts`

- [ ] **Step 1: Write the helper**

```typescript
import { env } from "./env.js";

/**
 * Best-effort insert into analytics_events via Supabase REST + service-role
 * key (same trust model as api/_lib/auth.ts). Never throws — a dropped
 * analytics write must never fail the request that triggered it.
 */
export async function trackEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
  userId?: string | null
): Promise<void> {
  if (!env.supabase.isConfigured) return;

  try {
    const resp = await fetch(`${env.supabase.url}/rest/v1/analytics_events`, {
      method: "POST",
      headers: {
        apikey: env.supabase.serviceRoleKey!,
        Authorization: `Bearer ${env.supabase.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId ?? null,
        event_name: eventName,
        properties,
      }),
    });
    if (!resp.ok) {
      console.error(`[analytics] insert failed for "${eventName}": ${resp.status}`);
    }
  } catch (err) {
    console.error(`[analytics] insert threw for "${eventName}":`, err);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/analytics.ts
git commit -m "Add server-side trackEvent helper for analytics_events inserts"
```

---

### Task 4: Server Sentry helper

**Files:**
- Create: `api/_lib/sentry.ts`
- Modify: `package.json` (new dependency)

- [ ] **Step 1: Install the SDK**

Run: `npm install @sentry/node`
Expected: `@sentry/node` added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the helper**

```typescript
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/_lib/sentry.ts package.json package-lock.json
git commit -m "Add server-side Sentry capture helper (no-ops without DSN)"
```

---

### Task 5: `POST /api/track` endpoint

**Files:**
- Create: `api/track.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { TrackEventSchema } from "../src/types/index.js";
import { ErrorCode, sendError } from "./_lib/errors.js";
import { resolveUserId } from "./_lib/auth.js";
import { trackEvent } from "./_lib/analytics.js";
import { captureException } from "./_lib/sentry.js";

/**
 * Best-effort analytics sink for client-emitted events (scan_started,
 * trade_in_clicked, signup_completed, login_completed, result_rated).
 * Auth is optional: an absent/invalid token logs the event with a null
 * user_id rather than rejecting the request — analytics must never block
 * on auth.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    return sendError(res, ErrorCode.METHOD_NOT_ALLOWED, "Use POST");
  }

  const parsed = TrackEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, ErrorCode.INVALID_PAYLOAD, "Invalid track payload");
  }

  let userId: string | null = null;
  try {
    userId = await resolveUserId(req.headers.authorization, undefined);
  } catch (err) {
    captureException(err);
  }

  try {
    await trackEvent(parsed.data.event_name, parsed.data.properties ?? {}, userId);
  } catch (err) {
    captureException(err);
  }

  res.status(200).json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `vercel dev` (or `npm run api:dev`), then in another terminal:

```bash
curl -X POST http://localhost:3000/api/track \
  -H "Content-Type: application/json" \
  -d '{"event_name":"smoke_test","properties":{"ok":true}}'
```

Expected: `{"ok":true}` response, and a new row with `event_name = 'smoke_test'`
visible in the `analytics_events` table in the Supabase dashboard.

- [ ] **Step 4: Commit**

```bash
git add api/track.ts
git commit -m "Add POST /api/track endpoint for client-emitted analytics events"
```

---

### Task 6: Wire server-known events + Sentry into `api/identify.ts`

**Files:**
- Modify: `api/identify.ts`

- [ ] **Step 1: Add imports**

At the top of `api/identify.ts`, after the existing `EbayMarketProvider` import:

```typescript
import { EbayMarketProvider } from "./_lib/market/ebay.js";
import { trackEvent } from "./_lib/analytics.js";
import { captureException } from "./_lib/sentry.js";
```

- [ ] **Step 2: Track `quota_exceeded`**

Replace:

```typescript
  const quota = await reserveScan(userId, premium);
  if (!quota.allowed) {
    return sendError(res, ErrorCode.QUOTA_EXCEEDED, "Daily free scan limit reached");
  }
```

with:

```typescript
  const quota = await reserveScan(userId, premium);
  if (!quota.allowed) {
    await trackEvent("quota_exceeded", {}, userId);
    return sendError(res, ErrorCode.QUOTA_EXCEEDED, "Daily free scan limit reached");
  }
```

- [ ] **Step 3: Track `scan_completed`**

Replace:

```typescript
    await cache.set(cacheKey, response, RESPONSE_TTL_MS);
    res.status(200).json(response);
    return;
```

with:

```typescript
    await cache.set(cacheKey, response, RESPONSE_TTL_MS);
    await trackEvent(
      "scan_completed",
      {
        confidence_band: confidenceBand(identification.confidence_score),
        verification_required: identification.verification_required,
      },
      userId
    );
    res.status(200).json(response);
    return;
```

- [ ] **Step 4: Track `scan_failed` and forward to Sentry**

Replace the `catch` block:

```typescript
  } catch (err) {
    await refundScan(userId, premium); // did not deliver a result
    if (err instanceof ApiException) {
      return sendError(res, err.code, err.message);
    }
    console.error(`[identify] ${requestId}`, err);
    return sendError(res, ErrorCode.INTERNAL, "Unexpected error");
  }
```

with:

```typescript
  } catch (err) {
    await refundScan(userId, premium); // did not deliver a result
    captureException(err);
    if (err instanceof ApiException) {
      await trackEvent("scan_failed", { error_code: err.code }, userId);
      return sendError(res, err.code, err.message);
    }
    console.error(`[identify] ${requestId}`, err);
    await trackEvent("scan_failed", { error_code: ErrorCode.INTERNAL }, userId);
    return sendError(res, ErrorCode.INTERNAL, "Unexpected error");
  }
```

- [ ] **Step 5: Import `confidenceBand`**

Update the existing types import line:

```typescript
import {
  IdentifyRequestSchema,
  IdentifyResponseSchema,
  type IdentifyResponse,
} from "../src/types/index.js";
```

to:

```typescript
import {
  IdentifyRequestSchema,
  IdentifyResponseSchema,
  confidenceBand,
  type IdentifyResponse,
} from "../src/types/index.js";
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run a real scan through the app (or `curl` the endpoint directly) and confirm
in the Supabase dashboard that a `scan_completed` row appears with the
correct `confidence_band`. Then temporarily break the upstream Groq call
(e.g. an invalid `GROQ_API_KEY`) and confirm a `scan_failed` row appears with
`error_code: "UPSTREAM_UNAVAILABLE"`, and that the API response/behavior is
otherwise unchanged.

- [ ] **Step 8: Commit**

```bash
git add api/identify.ts
git commit -m "Track scan_completed/scan_failed/quota_exceeded and report errors to Sentry"
```

---

### Task 7: Client Sentry wiring

**Files:**
- Create: `src/services/sentry.ts`
- Modify: `app/_layout.tsx`
- Modify: `src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Install the SDK**

Run: `npx expo install @sentry/react-native`
Expected: `@sentry/react-native` added to `dependencies` in `package.json`
at a version compatible with the installed Expo SDK.

- [ ] **Step 2: Write the client Sentry service**

```typescript
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

const dsn: string = (Constants.expoConfig?.extra?.sentryDsn as string) ?? "";

export const sentryEnabled = !!dsn;

/** No-ops cleanly when EXPO_PUBLIC_SENTRY_DSN is unset. */
export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0 });
}

export function captureClientException(error: unknown): void {
  if (!dsn) return;
  Sentry.captureException(error);
}
```

- [ ] **Step 3: Initialize and wrap the root in `app/_layout.tsx`**

Add the import and init call at the top of the file (after the existing
imports, before `LoadingScreen`):

```typescript
import * as Sentry from "@sentry/react-native";
import { initSentry } from "@/services/sentry";

initSentry();
```

Change the final export from:

```typescript
export default function RootLayout() {
```

to:

```typescript
function RootLayout() {
```

and add at the very end of the file, replacing the closing `}` of the file:

```typescript
export default Sentry.wrap(RootLayout);
```

- [ ] **Step 4: Forward render-crash errors caught by `ErrorBoundary`**

In `src/components/ErrorBoundary.tsx`, add the import:

```typescript
import { captureClientException } from "@/services/sentry";
```

and update `componentDidCatch`:

```typescript
  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info);
    captureClientException(error);
  }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

With `EXPO_PUBLIC_SENTRY_DSN` left empty, run the app (`npx expo start`) and
confirm it boots normally (no crash from `Sentry.wrap`/`Sentry.init` with an
empty DSN). Then, temporarily set a real test DSN in `.env`, restart, force
a render crash (e.g. temporarily throw inside a component), confirm the
`ErrorBoundary` fallback UI shows AND the error appears in the Sentry
project dashboard. Revert the forced crash and the temporary DSN change
before committing.

- [ ] **Step 7: Commit**

```bash
git add src/services/sentry.ts app/_layout.tsx src/components/ErrorBoundary.tsx package.json package-lock.json
git commit -m "Wire client Sentry init + crash reporting (no-ops without DSN)"
```

---

### Task 8: Client analytics helper

**Files:**
- Create: `src/services/analytics.ts`

- [ ] **Step 1: Write the helper**

```typescript
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/analytics.ts
git commit -m "Add client-side track() helper for analytics events"
```

---

### Task 9: `scan_started` event

**Files:**
- Modify: `src/screens/ScanScreen.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { identifyWatch } from "@/services/api";
import { track } from "@/services/analytics";
```

- [ ] **Step 2: Fire the event at the start of the pipeline**

Replace:

```typescript
  const runPipeline = useCallback(
    async (front: RawCapture, back: RawCapture | null): Promise<void> => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
```

with:

```typescript
  const runPipeline = useCallback(
    async (front: RawCapture, back: RawCapture | null): Promise<void> => {
      void track("scan_started", { has_back_image: back != null }, session?.access_token);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run the app, capture a watch photo through the full pipeline, and confirm a
`scan_started` row appears in `analytics_events` in the Supabase dashboard.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ScanScreen.tsx
git commit -m "Track scan_started when the capture pipeline begins"
```

---

### Task 10: `trade_in_clicked` event and result rating UI

**Files:**
- Modify: `app/results.tsx`

- [ ] **Step 1: Add imports and local rating state**

Replace:

```typescript
import { useScanStore } from "@/store/scanStore";
import { useRemoteConfig } from "@/hooks/useRemoteConfig";
import { colors, spacing, typography, radius } from "@/theme";
import { formatCurrency } from "@/utils/format";

export default function ResultsScreen() {
  const router = useRouter();
  const { result, imageUri, clear } = useScanStore();
  const config = useRemoteConfig();
```

with:

```typescript
import { useScanStore } from "@/store/scanStore";
import { useRemoteConfig } from "@/hooks/useRemoteConfig";
import { useAuth } from "@/hooks/useAuth";
import { colors, spacing, typography, radius } from "@/theme";
import { formatCurrency } from "@/utils/format";
import { track } from "@/services/analytics";

export default function ResultsScreen() {
  const router = useRouter();
  const { result, imageUri, clear } = useScanStore();
  const config = useRemoteConfig();
  const { session } = useAuth();
  const [rating, setRating] = React.useState<"up" | "down" | null>(null);
```

- [ ] **Step 2: Destructure `request_id` and track `trade_in_clicked`**

Replace:

```typescript
  const { identification, market } = result;
```

with:

```typescript
  const { identification, market, request_id } = result;
```

Replace:

```typescript
  const handleTradeIn = () => {
    const number = config.partner_whatsapp_number;
    if (!number) return;
```

with:

```typescript
  const handleTradeIn = () => {
    void track(
      "trade_in_clicked",
      { request_id, brand: identification.brand, model_family: identification.model_family },
      session?.access_token
    );

    const number = config.partner_whatsapp_number;
    if (!number) return;
```

- [ ] **Step 3: Add a `handleRate` callback**

Add this right after the `handleTradeIn` function (before the
`hasCaution`/`isHighCaution` lines):

```typescript
  const handleRate = (value: "up" | "down") => {
    if (rating) return; // one rating per results view, matches spec
    setRating(value);
    void track(
      "result_rated",
      {
        request_id,
        brand: identification.brand,
        model_family: identification.model_family,
        reference_number: identification.reference_number,
        confidence_score: identification.confidence_score,
        rating: value,
      },
      session?.access_token
    );
  };
```

- [ ] **Step 4: Add the rating card to the JSX**

Insert this block right after the closing `)}` of the "Suggested Additional
Image" card and before the "Alternative Possible Matches" comment:

```typescript
        {/* Result Rating */}
        <View style={styles.ratingCard}>
          <Text style={styles.ratingTitle}>Was this identification correct?</Text>
          {rating ? (
            <Text style={styles.ratingThanks}>Thanks for the feedback.</Text>
          ) : (
            <View style={styles.ratingRow}>
              <Pressable
                style={styles.ratingBtn}
                onPress={() => handleRate("up")}
                accessibilityLabel="Rate identification as correct"
              >
                <Text style={styles.ratingBtnText}>👍 Yes</Text>
              </Pressable>
              <Pressable
                style={styles.ratingBtn}
                onPress={() => handleRate("down")}
                accessibilityLabel="Rate identification as incorrect"
              >
                <Text style={styles.ratingBtnText}>👎 No</Text>
              </Pressable>
            </View>
          )}
        </View>

```

- [ ] **Step 5: Add styles**

Add this block to the `styles` object, right after the `hintBody` style
definition (in the "Additional Image Hint Card" section):

```typescript
  // Rating Card
  ratingCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  ratingTitle: { ...typography.label, color: colors.textPrimary, fontSize: 13 },
  ratingThanks: { ...typography.body, color: colors.textSecondary, fontSize: 13 },
  ratingRow: { flexDirection: "row", gap: spacing.sm },
  ratingBtn: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  ratingBtnText: { ...typography.label, color: colors.textPrimary, fontSize: 14 },
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Open a scan result, tap "👍 Yes" and confirm the buttons are replaced with
"Thanks for the feedback" and a `result_rated` row (with `rating: "up"`)
appears in `analytics_events`. Scan again, tap "👎 No", confirm a row with
`rating: "down"`. Also tap "Request Professional Valuation" (if the partner
WhatsApp number feature flag is on) and confirm a `trade_in_clicked` row
appears.

- [ ] **Step 8: Commit**

```bash
git add app/results.tsx
git commit -m "Add result rating control and trade_in_clicked tracking to results screen"
```

---

### Task 11: `login_completed` and `signup_completed` events

**Files:**
- Modify: `app/(auth)/login.tsx`
- Modify: `app/(auth)/signup.tsx`

- [ ] **Step 1: Track `login_completed` in `login.tsx`**

Add the import:

```typescript
import { supabase } from "@/services/supabase";
import { track } from "@/services/analytics";
```

Replace:

```typescript
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        // Redirect will be handled by the layout listener
        router.replace("/");
      }
```

with:

```typescript
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        void track("login_completed", undefined, data.session?.access_token);
        // Redirect will be handled by the layout listener
        router.replace("/");
      }
```

- [ ] **Step 2: Track `signup_completed` in `signup.tsx`**

Add the import:

```typescript
import { supabase } from "@/services/supabase";
import { track } from "@/services/analytics";
```

Replace:

```typescript
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        // If email confirmation is required, let the user know, else they will be logged in.
        const session = data?.session;
        if (session) {
          router.replace("/");
        } else {
```

with:

```typescript
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        void track("signup_completed", undefined, data.session?.access_token);
        // If email confirmation is required, let the user know, else they will be logged in.
        const session = data?.session;
        if (session) {
          router.replace("/");
        } else {
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Sign up with a fresh test email and confirm a `signup_completed` row appears
in `analytics_events`. Log in with an existing account and confirm a
`login_completed` row appears.

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/login.tsx" "app/(auth)/signup.tsx"
git commit -m "Track login_completed and signup_completed events"
```

---

### Task 12: Final pass

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Confirm clean git state**

Run: `git status -sb`
Expected: working tree clean, all 11 prior commits present, branch ahead of
`origin/master`.

- [ ] **Step 3: Push**

Run: `git push origin master`

- [ ] **Step 4: End-to-end manual smoke test**

Walk through, in order, on a real device via Expo Go or a dev build:
1. Sign up (new account) → `signup_completed` logged.
2. Log out, log back in → `login_completed` logged.
3. Scan a watch end to end → `scan_started` then `scan_completed` logged,
   results screen renders, rating card visible.
4. Tap a rating button → `result_rated` logged, "Thanks for the feedback"
   shown.
5. If the partner WhatsApp number flag is on, tap "Request Professional
   Valuation" → `trade_in_clicked` logged, WhatsApp opens.
6. Scan a 4th time in the same day on a free (non-premium) account →
   `quota_exceeded` logged, quota error shown.

Confirm all six corresponding rows exist in `analytics_events` with sane
`properties`, and that no existing behavior (scan results, error messages,
WhatsApp deep link) regressed.
