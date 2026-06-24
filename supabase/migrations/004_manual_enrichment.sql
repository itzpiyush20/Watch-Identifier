-- Migration 004: manual enrichment fields (Phase 1)
-- Apply via: supabase db push  (or paste into Supabase SQL editor)

ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS collection_name TEXT;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS purchase_date TEXT;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS purchase_price NUMERIC;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS purchase_currency TEXT;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS condition TEXT;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS ownership_status TEXT;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS box_available INTEGER;
ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS papers_available INTEGER;

-- box_available/papers_available are INTEGER (0/1), not BOOLEAN, to match
-- the 0/1 representation already used client-side for `synced` and to
-- avoid PostgREST's strict JSON-type coercion rejecting a JS number
-- payload against a boolean column.
