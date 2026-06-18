# The Watch Identifier — Architecture

## System overview

```
┌────────────────────────┐        HTTPS         ┌─────────────────────────┐
│  React Native (Expo)   │  ───────────────▶    │   Vercel Functions      │
│  Android, offline-first│   POST /api/identify │   (secret-holding proxy)│
│                        │ ◀───────────────     │                         │
│  • expo-camera         │   structured JSON    │  • Zod validation       │
│  • expo-sqlite (truth) │                      │  • server cache         │
│  • zustand state       │                      │  • rate limit (Upstash) │
│  • Supabase client     │                      │  • Gemini 2.0 Flash-Lite│
└──────────┬─────────────┘                      │  • MarketDataProvider   │
           │                                     └──────────┬──────────────┘
           │ auth + sync                                    │
           ▼                                                ▼
   ┌────────────────┐                            ┌────────────────────┐
   │  Supabase      │                            │  Gemini API        │
   │  Auth+Postgres │                            │  eBay Browse API   │
   │  RLS, remote   │                            │  (active listings) │
   │  config        │                            └────────────────────┘
   └────────────────┘
```

## Key decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| Routing | **expo-router** (`app/` dir) instead of `src/navigation` | File-based routing is the Expo default; deviates from the spec's `src/navigation` for a strong reason. Screen *components* still live in `src/screens`; `app/` files are thin route wrappers. |
| Secrets | All AI/eBay/service-role keys server-side on Vercel | `EXPO_PUBLIC_*` is embedded in the APK and readable. Client only calls the proxy. |
| Market data | `MarketDataProvider` interface; eBay active listings + discount for MVP | eBay Browse returns active asking prices only; sold data is gated. Swappable later (WatchCharts/Chrono24/Marketplace Insights). |
| Identification | brand + model_family primary; reference_number = suggestion | Gemini hallucinates reference numbers; gate behind confidence + `verification_required`. |
| Auth | Required to scan (no logged-out mode) | Lets the 3/24h quota be enforced server-side by `userId`. |
| Validation | Zod at every boundary | "Never trust upstream" made enforceable. |
| State | zustand | Light, no boilerplate, fits offline-first. |
| Local DB | expo-sqlite is the source of truth | Offline-first; Supabase is a sync/backup mirror. |

## Data flow (scan)
Capture → resize 800px + compress → MD5 hash → local cache check →
(miss) POST /api/identify → server cache check → Gemini → MarketDataProvider →
build range → return → persist to SQLite → background sync to Supabase.

## Folder map
- `app/` — expo-router routes (thin).
- `src/screens` — screen components.
- `src/components` — reusable UI.
- `src/services` — API client, Supabase, RevenueCat, analytics, market provider.
- `src/database` — SQLite schema, migrations, repositories, cache.
- `src/hooks` — React hooks.
- `src/utils` — pure helpers (formatting, hashing, image).
- `src/constants`, `src/types`, `src/theme` — shared.
- `api/` — Vercel serverless functions.
- `supabase/` — SQL migrations, RLS policies, indexes.
