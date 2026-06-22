-- Migration 003: subscriptions
-- Apply via: supabase db push  (or paste into Supabase SQL editor)

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id        UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier           TEXT        NOT NULL CHECK (tier IN ('trial','free','collector','connoisseur','vault')) DEFAULT 'trial',
  status         TEXT        NOT NULL CHECK (status IN ('active','expired','cancelled')) DEFAULT 'active',
  trial_ends_at  TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
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

DROP TRIGGER IF EXISTS on_auth_user_created_provision_trial ON auth.users;
CREATE TRIGGER on_auth_user_created_provision_trial
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_trial_subscription();
