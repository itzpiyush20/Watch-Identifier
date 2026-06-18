# API — `POST /api/identify` (Phase 2)

Secure Vercel proxy. The client holds **no** AI/eBay keys; all secrets are
server-side Vercel env vars.

## Pipeline
1. Validate body (Zod) + reject > 2 MB images
2. Verify Supabase bearer token → trusted `userId` (dev: body `userId` fallback)
3. Server cache lookup (Upstash, key = sha256(image)+currency) → return on hit
4. Reserve daily quota (3/24h free; premium bypass) — reserve-then-refund
5. Gemini 2.0 Flash-Lite identify → strict JSON, Zod-validated
6. `MarketDataProvider` (eBay active listings) → range, asking-price discount, FX→INR
7. Validate outgoing contract, cache 7d, return

## Request
```
POST /api/identify
Authorization: Bearer <supabase_access_token>
Content-Type: application/json

{ "imageBase64": "<base64>", "countryCode": "IN", "userId": "<uuid optional>" }
```

## Response (200)
`IdentifyResponse` — `{ identification, market, cached, request_id }`. See
[src/types/index.ts](../src/types/index.ts) for the authoritative schema.

## Errors
Structured `{ error: { code, message, retryable } }`:
`INVALID_PAYLOAD` 400 · `PAYLOAD_TOO_LARGE` 413 · `UNAUTHORIZED` 401 ·
`QUOTA_EXCEEDED` 429 · `IDENTIFICATION_FAILED` 422 · `UPSTREAM_UNAVAILABLE` 503 ·
`INTERNAL` 500.

## Env vars (Vercel project settings — SERVER, never EXPO_PUBLIC_)
`GEMINI_API_KEY`, `GEMINI_MODEL` (opt), `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`,
`EBAY_MARKETPLACE_ID` (opt), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN_SERVER` (opt),
`FX_USD_TO_INR` (opt, default 84), `IN_MARKET_ADJUSTMENT` (opt, default 1.0),
`EBAY_ASKING_DISCOUNT` (opt, default 0.85).

## Local dev
```bash
npm i -g vercel
vercel link
vercel env pull .env.local      # pulls server secrets you set in the dashboard
npm run api:dev                  # vercel dev  -> http://localhost:3000
```
Without Supabase env, auth falls back to body `userId` (logged warning).
Without Upstash env, cache is skipped and quota fails open — dev only.

## Typecheck
```bash
npx tsc -p tsconfig.api.json    # server-only check (no RN toolchain needed)
```

## Smoke test (PowerShell)
```powershell
$img = [Convert]::ToBase64String([IO.File]::ReadAllBytes("watch.jpg"))
$body = @{ imageBase64 = $img; countryCode = "IN"; userId = "00000000-0000-0000-0000-000000000001" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/identify" -Method Post -ContentType "application/json" -Body $body
```
