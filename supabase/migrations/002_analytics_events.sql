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
