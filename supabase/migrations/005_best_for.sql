-- Migration 005: "Best For" specialty tag
-- Apply via: supabase db push  (or paste into Supabase SQL editor)

ALTER TABLE public.portfolio ADD COLUMN IF NOT EXISTS best_for TEXT;

-- No RLS policy changes needed -- the existing portfolio_owner_update policy
-- (auth.uid() = user_id) already covers writes to this new column.
