# Play Store Listing Prep — Design

Status: Approved
Date: 2026-06-23

## Goal

Produce everything needed for a Google Play Console submission — hosted
legal pages, store assets, listing copy, and compliance answers — without
actually submitting. This is the first of three independent sub-projects
identified during the codebase audit (the others are billing integration and
secrets rotation, each to get their own spec).

## Non-goals

- No actual Play Console submission. Submission stays blocked until billing
  integration lands — listing a paywall that cannot charge anyone risks
  rejection or bad reviews. This is an explicit gate, not a soft preference.
- No AAB build, signing, or `versionCode` automation changes.
- No final subscription pricing. Tier names/limits already exist
  server-side (`free`, `collector`, `connoisseur`, `vault` — see
  `api/_lib/subscriptions.ts`), but no prices have been decided. Listing
  copy uses clearly marked placeholder pricing text.
- No billing work of any kind (that's the separate billing-integration spec).
- No secrets rotation (that's the separate secrets spec).

## 1. Hosted legal pages

The Play Console "Privacy Policy" field requires a publicly reachable URL.
The current privacy policy and terms only exist as in-app routes
(`app/legal/privacy-policy.tsx`, `app/legal/terms.tsx`), which Play Console
cannot crawl.

Add two server-rendered HTML routes to the existing Vercel deployment (same
project that already serves `/api/*`), reusing the same copy as the in-app
versions:

- `/privacy-policy`
- `/terms`

Both pages get a support contact line: **itzpiyush20@gmail.com**. The in-app
routes are left as-is (no need to fetch remotely; just keep both copies in
sync manually since this content changes rarely).

## 2. Store assets

- **Feature graphic** (1024×500, required): a simple branded banner
  generated from the existing `assets/adaptive-icon.png` plus the app name,
  built as a static SVG/PNG. No external design tool.
- **Screenshots** (min 2, phone aspect ratio, required): captured by running
  the app (Expo dev build or emulator) and screenshotting the Scan, Results,
  and Profile/Subscription screens.
- **App icon**: the existing 512×512 `assets/adaptive-icon.png` is reused
  as-is for the Play Console icon slot — no new asset needed.

## 3. Listing copy

- **Title**: "Watch Identifier"
- **Category**: Lifestyle
- **Short description** (≤80 chars) and **full description** (≤4000 chars)
  covering: photo-based watch identification, market valuation estimate
  (caveated as active-listing-based, "not sold prices" — matching the
  in-app disclaimer from `api/_lib/market/ebay.ts`), and the 7-day free
  trial followed by subscription tiers. Pricing is written as a clearly
  marked placeholder (e.g. "Plans starting at $X.XX/mo — final pricing
  TBD") to be replaced once billing integration locks in real prices.

## 4. Compliance answers (reference doc, not code)

Play Console only accepts these through its own form UI, so this is a
reference document for whoever fills out the console, not code:

- **Content rating**: Everyone / general audience — no violence, gambling,
  or mature content.
- **Data safety form**, derived from actual app behavior:
  - Camera permission — photos are processed for identification and never
    stored server-side (confirmed in `api/identify.ts`); only the local
    device keeps the image URI (`src/database/db.ts`).
  - Account email — collected via Supabase auth for login/sync.
  - Usage analytics events — logged server-side to the `analytics_events`
    table.
  - Crash reporting — server-side Sentry capture in the identify pipeline.
- **Support email**: itzpiyush20@gmail.com
- **Distribution**: worldwide, no country restrictions.

## Deliverables

1. `/privacy-policy` and `/terms` static routes on the Vercel deployment.
2. Feature graphic + 2-3 screenshots, saved to a `store-assets/` directory.
3. Listing copy (title, short/full description) as a text file for
   pasting into Play Console.
4. A compliance reference doc (content rating, data safety, support email,
   distribution) for pasting into Play Console.
