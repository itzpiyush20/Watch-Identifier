-- Migration 001: initial schema
-- Apply via: supabase db push  (or paste into Supabase SQL editor)

-- =========================================================================
-- portfolio (cloud mirror of local_portfolio)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.portfolio (
  id                   UUID        PRIMARY KEY,
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand                TEXT        NOT NULL,
  model_family         TEXT        NOT NULL,
  reference_number     TEXT,
  -- image_uri is NEVER synced to the cloud (local on-device only)
  market_data_json     JSONB       NOT NULL,
  confidence_score     NUMERIC(4,3) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  authenticity_caution JSONB       NOT NULL,
  scanned_at           TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ           -- soft-delete for conflict-safe sync
);

CREATE INDEX idx_portfolio_user_scanned  ON public.portfolio(user_id, scanned_at DESC);
CREATE INDEX idx_portfolio_user_deleted  ON public.portfolio(user_id) WHERE deleted_at IS NULL;

-- Automatically bump updated_at on every write.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER portfolio_updated_at
  BEFORE UPDATE ON public.portfolio
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- Row-Level Security
-- =========================================================================
ALTER TABLE public.portfolio ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own rows.
CREATE POLICY "portfolio_owner_select" ON public.portfolio
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "portfolio_owner_insert" ON public.portfolio
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "portfolio_owner_update" ON public.portfolio
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "portfolio_owner_delete" ON public.portfolio
  FOR DELETE USING (auth.uid() = user_id);

-- =========================================================================
-- remote_config (feature flags + partner deep links + FX factors)
-- Readable by all authenticated users; writable by service role only.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.remote_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.remote_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "remote_config_read" ON public.remote_config
  FOR SELECT TO authenticated USING (true);

-- Seed defaults (safe to re-run; ON CONFLICT DO NOTHING).
INSERT INTO public.remote_config (key, value) VALUES
  ('feature_flags',           '{"authenticityCaution": true, "tradeInCta": true, "ads": true}'),
  ('fx_usd_to_inr',           '84'),
  ('in_market_adjustment',    '1.0'),
  ('ebay_asking_discount',    '0.85'),
  ('free_scans_per_day',      '3'),
  ('partner_whatsapp_number', 'null')
ON CONFLICT (key) DO NOTHING;
