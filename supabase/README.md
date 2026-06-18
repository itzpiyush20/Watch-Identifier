# Supabase Setup

## Apply migrations

Option A — Supabase CLI (recommended):
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Option B — Supabase SQL editor:
Paste each migration file in order into the SQL editor at app.supabase.com.

## Tables

| Table | Purpose |
|-------|---------|
| `portfolio` | Cloud mirror of `local_portfolio`; `image_uri` never synced |
| `remote_config` | Feature flags, FX rates, partner links — read by all authed users |

## RLS summary
- `portfolio`: owner-only select/insert/update/delete (`auth.uid() = user_id`)
- `remote_config`: authenticated read, service-role write only

## Soft-delete sync strategy
- Local `synced = 0` → needs push to Supabase.
- Cloud `deleted_at IS NOT NULL` → soft-deleted; local should remove row.
- Conflict resolution: `updated_at` wins (last-write-wins). Implemented in Phase 5.
