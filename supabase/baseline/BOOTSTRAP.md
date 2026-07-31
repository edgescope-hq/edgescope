# EdgeScope Clean-Environment Bootstrap

## Intended Use

This bootstrap path rebuilds the full EdgeScope schema in a **disposable empty
Postgres/Supabase project**. It is **not** for upgrading an existing deployed
database — use the Supabase migration runner (`supabase migration up`) for that.

## Source of Truth

| Artifact | Role |
|----------|------|
| `supabase/baseline/20260710000000_launch_baseline_schema.sql` | Clean-install foundation (current snapshot) |
| `supabase/migrations/*.sql` | Forward-only changes; see post-baseline list below — pre-baseline files are legacy history |
| Generated types (`src/integrations/supabase/types.ts`) | Derived from the validated schema — must match baseline + migrations |

## Bootstrap Steps

```bash
# Set this only to an empty local/disposable Postgres connection. Never use production.
export DISPOSABLE_DATABASE_URL='postgresql://...'

# 1. Apply the baseline exactly once to the empty database.
psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/baseline/20260710000000_launch_baseline_schema.sql

# 2. Apply post-baseline migrations (listed under Post-Baseline Migrations below)
psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260710001000_create_private_trade_screenshots_bucket.sql
psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260710002000_create_trade_screenshot_storage_policies.sql
psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260710003000_create_auth_user_trigger.sql
psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260710004000_restore_function_execute_privileges.sql
psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260710005000_restrict_generate_edge_id.sql
psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260712010000_harden_community_screenshots_and_account_purge.sql
```

## What the Baseline Covers

The baseline snapshot includes all **columns, constraints, indexes, policies,
enums, and core functions** required by the current shipped app, including:

- Core tables: profiles, trading_accounts, trades, trade_screenshots,
  account_guardrails, trading_preferences, community_*, notebook_entries,
  sticky_notes, invites, user_roles
- Intro/deletion/purge columns on profiles (has_seen_intro, deletion_*,
  deletion_purge_*)
- RLS policies for all tables
- Row-level security triggers
- All application enums (trade_result, trade_direction, market_type, etc.)
- generate_edge_id, has_role, assign_trade_number, set_updated_at functions

## Post-Baseline Migrations

These six forward-only migrations must be applied **after** the baseline:

| Migration | Adds |
|-----------|------|
| `20260710001000_create_private_trade_screenshots_bucket.sql` | Storage bucket setup |
| `20260710002000_create_trade_screenshot_storage_policies.sql` | Storage bucket policies |
| `20260710003000_create_auth_user_trigger.sql` | Auth user trigger |
| `20260710004000_restore_function_execute_privileges.sql` | Function execute privileges |
| `20260710005000_restrict_generate_edge_id.sql` | generate_edge_id restriction |
| `20260712010000_harden_community_screenshots_and_account_purge.sql` | Purge RPCs, comment coordinate trigger, screenshot integrity trigger |

```bash
for f in supabase/migrations/20260710001000*.sql \
         supabase/migrations/20260710002000*.sql \
         supabase/migrations/20260710003000*.sql \
         supabase/migrations/20260710004000*.sql \
         supabase/migrations/20260710005000*.sql \
         supabase/migrations/20260712010000*.sql; do
  psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

## Historical Migrations

Pre-baseline migrations (`20260615_*` through `20260709_*`) are **legacy history** — they use plain CREATE statements and will **fail** if replayed on top of the baseline. They exist only in the migration history for deployed environments and are **not** part of the clean-bootstrap path.

## Validation

Run the transactional SQL regression plan after bootstrap:

```bash
psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/20260712010000_security_and_purge_regression.sql
```

## Notes

- The baseline is **not** deployed as a chronological migration — it lives
  under `supabase/baseline/` and is used only for clean builds.
- Historical migrations under `supabase/migrations/` are never deleted or
  rewritten.
- Generated types should be regenerated after any schema change:
  `supabase gen types typescript --local > src/integrations/supabase/types.ts`
