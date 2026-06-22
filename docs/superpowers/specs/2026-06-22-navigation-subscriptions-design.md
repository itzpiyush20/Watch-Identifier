# Navigation, Profile/Settings, and Subscription Tiers — Design

Status: Approved
Date: 2026-06-22

## Goal

Turn the current flat-stack app into a "ready for listing" structure with
standard Home / Scan / Profile navigation, a Settings screen, account
deletion, and a real (but payment-stubbed) subscription tier system with a
7-day full-featured trial for new signups. This is the first of two sub-projects
the user requested; richer per-scan result detail is a separate, later spec
(see "Locked constraint for that spec" below).

## Non-goals

- No real Google Play Billing / RevenueCat purchase flow yet. The "Subscribe"
  button calls a stubbed handler ("Available in the production build").
  Wiring `react-native-purchases` is deferred to when the project moves to
  an EAS/dev-client build — that's required for testing real purchases
  regardless of this decision, since Play Billing cannot be exercised in
  Expo Go under any circumstances.
- No Razorpay or any non-Play-Billing processor — Google Play policy requires
  Play Billing for in-app digital subscriptions that gate in-app functionality
  (which is exactly what scan-count tiers are). Confirmed with user.
- No retroactive trial backfill for accounts created before this ships
  (moot right now — all existing test accounts were deleted by explicit user
  request on 2026-06-22; the database currently has zero users).
- No literal "priority queue" or "extended cache TTL" perks — both were
  rejected during design as unimplementable with the current synchronous,
  globally-cached architecture. Tiers differentiate only on scan volume and
  portfolio history retention, both real and implementable today.
- No richer per-scan result detail in this spec — locked constraint carried
  forward: any future result-detail fields must ship identically across all
  tiers (free included). Tiers gate volume/history, never information quality.

## 1. Navigation structure

Replace the current root `Stack` (`index` / `scan` / `results` / `(auth)`)
with:

```
app/
  (auth)/login.tsx, signup.tsx        — unchanged, outside tabs
  (tabs)/
    _layout.tsx                       — Tabs navigator: Home, Scan, Profile
    index.tsx                         — Home (moved from app/index.tsx, unchanged content)
    profile.tsx                       — new
  scan.tsx                            — unchanged content, now reached via tab intercept
  results.tsx                         — unchanged, pushed from scan flow
  settings.tsx                        — new, pushed from Profile
  subscription.tsx                    — new, pushed from Profile
  legal/privacy-policy.tsx            — new
  legal/terms.tsx                     — new
  _layout.tsx                         — root Stack, now wraps (tabs) + scan + results + settings + subscription + legal + (auth)
```

The Scan tab does not render inline content. Its tab button is intercepted
(`listeners: { tabPress: (e) => { e.preventDefault(); router.push("/scan"); } }`)
so tapping it pushes the existing full-screen camera modal exactly as today
(slide-from-bottom, no header) instead of mounting the camera permanently
inside a tab. Tab icons use `@expo/vector-icons` (Ionicons) — already bundled
with Expo, no new dependency.

The "Log Out" button currently in the Home header (`app/index.tsx`) moves to
Profile — standard practice (account actions live in Profile, not Home).

## 2. Profile screen (`app/(tabs)/profile.tsx`)

- Email (from the Supabase session already in `useAuth()`)
- Tier badge + status line, e.g. "Trial — 5 days left", "Free", "Collector",
  "Connoisseur", "Vault ⭐" — from the entitlement endpoint (Section 5)
- Scans remaining today: "7 of 10 scans left today" or "Unlimited" for Vault
- "Upgrade" row (hidden for Vault tier) → pushes to `app/subscription.tsx`
- "Settings" row → pushes to `app/settings.tsx`
- "Sign Out" button

## 3. Settings screen (`app/settings.tsx`)

- Region/currency picker: India (₹) / United States ($) / United Kingdom (£)
  / Germany (€) — the 4 regions already defined in `api/_lib/regions.ts`.
  Selection persists in a new local SQLite `preferences` key-value table
  (new migration, version 2, following the exact pattern of the existing
  versioned migrations in `src/database/migrations.ts`), and replaces the
  hardcoded `countryCode: "IN"` in `ScanScreen.tsx`.
- App version/build number, read from `app.config.ts` via `Constants.expoConfig`.
- "Privacy Policy" → pushes to `app/legal/privacy-policy.tsx` (static content
  drafted as part of this work, covering camera use, what's stored locally
  vs. synced to Supabase, and third-party data sharing with eBay/Groq).
- "Terms of Service" → pushes to `app/legal/terms.tsx` (static content).
- **Caveat carried into the plan:** Play Console's app-listing form also asks
  for a separately *hosted* Privacy Policy URL outside the app binary. That's
  a hosting/ops task (e.g. GitHub Pages) outside this codebase — the in-app
  screen satisfies in-app disclosure requirements but not that separate field.
- "Delete my account" → confirmation alert, then calls `DELETE /api/account`
  (Section 6).

## 4. Account deletion

New endpoint `DELETE /api/account`:
- Requires a valid Supabase access token (`resolveUserId`, same as
  `/api/identify`) — no token, no dev fallback (deletion must never be
  spoofable).
- Calls Supabase Admin REST `DELETE /auth/v1/admin/users/{id}` with the
  service-role key (same trust model as `api/_lib/auth.ts`).
- `portfolio` and `subscriptions` rows cascade-delete automatically via the
  existing `ON DELETE CASCADE` (migration 001) / new `ON DELETE CASCADE`
  (Section 7) on `user_id`. `analytics_events.user_id` is `ON DELETE SET NULL`
  (already in migration 002) — historical events survive anonymized, by design.
- Client, on success: clears local SQLite `local_portfolio` rows for that
  `user_id`, signs out, redirects to `(auth)/login`.

## 5. Quota/entitlement endpoint

New endpoint `GET /api/entitlement` (replaces the no-cost-quota-peek need):
- Requires auth (same as account deletion — this is account-specific data).
- Resolves the user's effective tier (Section 7) and a non-consuming quota
  peek (new `peekQuota(userId, limit)` in `api/_lib/quota.ts` — reads the
  Redis counter without incrementing it, unlike `reserveScan`).
- Response: `{ tier, scans_remaining: number | null, scans_limit: number | null, trial_ends_at: string | null, unlimited_history: boolean }`
  (`null` for limit/remaining means unlimited — Vault, or trial which is
  capped at 10 not unlimited so trial always returns numbers).
- Profile screen calls this on focus. Home screen (Section 8) also calls it
  once to decide whether to apply the retention filter.

## 6. Subscription/Paywall screen (`app/subscription.tsx`)

- Lists Collector (₹99), Connoisseur (₹199), Vault (₹399) with their scan
  count and history-retention perk, current tier visually highlighted.
- Each "Subscribe" button calls `purchaseTier(tier)` from a new
  `src/services/billing.ts`. For this pass, that function is a stub:

  ```typescript
  export async function purchaseTier(tier: PaidTier): Promise<void> {
    Alert.alert(
      "Coming Soon",
      "Subscriptions will be available once the app ships its production build."
    );
  }
  ```

  This deliberately does **not** write to the `subscriptions` table — no
  real payment occurred, so nothing should unlock. Honest stub, not a fake
  unlock.

## 7. Subscription data model

New Supabase migration (003), `subscriptions` table:

```sql
CREATE TABLE public.subscriptions (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier           TEXT NOT NULL CHECK (tier IN ('trial','free','collector','connoisseur','vault')) DEFAULT 'trial',
  status         TEXT NOT NULL CHECK (status IN ('active','expired','cancelled')) DEFAULT 'active',
  trial_ends_at  TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,   -- for paid tiers once real billing is wired; unused for now
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_owner_select" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
-- No insert/update policy: only the trigger below (SECURITY DEFINER) and the
-- service role may write.

CREATE OR REPLACE FUNCTION public.provision_trial_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, tier, trial_ends_at)
  VALUES (NEW.id, 'trial', NOW() + INTERVAL '7 days');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_provision_trial
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_trial_subscription();
```

Server helper `api/_lib/subscriptions.ts`:

```typescript
export type Tier = "trial" | "free" | "collector" | "connoisseur" | "vault";

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

export async function getEffectiveTier(userId: string): Promise<Tier> {
  // REST GET subscriptions?user_id=eq.<id>, service-role key.
  // No row -> "free". tier === "trial" and trial_ends_at in the past -> "free".
  // status !== "active" -> "free". Otherwise return the stored tier.
}
```

`api/identify.ts` calls `getEffectiveTier(userId)` instead of the current
`isPremiumUser(userId)`, then `reserveScan(userId, limit)` where `limit` comes
from `TIER_LIMITS[tier]` (a `null` limit bypasses Redis entirely, exactly like
today's premium-bypass branch). `api/_lib/premium.ts` is deleted — superseded
by tiers (free tier replaces "not premium", vault replaces "premium").

## 8. Portfolio history retention

`usePortfolio` (or the Home screen's render path) filters out
`local_portfolio` rows older than 90 days when the user's tier has
`TIER_UNLIMITED_HISTORY[tier] === false`. Filtered rows are hidden from the
grid, never deleted from SQLite or Supabase — if the user upgrades later,
their full history reappears immediately, no data was ever lost. When rows
are hidden, Home shows a small disclosure: "N older scans hidden — upgrade
to Connoisseur or Vault to see your full history."

## Testing plan (manual — consistent with Phase 8's established approach; no test framework in this repo)

- Apply migration 003, confirm signing up a fresh account creates a
  `subscriptions` row with `tier='trial'` and `trial_ends_at` ~7 days out.
- Confirm `/api/entitlement` returns `{ tier: "trial", scans_remaining: 10, ... }`
  for that fresh account, and that a scan decrements `scans_remaining` without
  touching the row in `subscriptions`.
- Manually set `trial_ends_at` to a past timestamp in the Supabase dashboard,
  re-check `/api/entitlement` returns `tier: "free"`, `scans_limit: 3`.
- Confirm the Scan tab still opens the exact same full-screen camera UI as
  before this change (no regression).
- Confirm Settings region picker persists across an app restart (kills and
  reopens Expo Go).
- Confirm "Delete my account" actually removes the user from Supabase Auth,
  cascades the `portfolio` and `subscriptions` rows, clears local SQLite data,
  and returns to the login screen.
- Confirm the Subscribe buttons show the "Coming Soon" alert and do **not**
  change the tier shown on Profile.
