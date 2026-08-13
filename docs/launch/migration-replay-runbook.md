# Supabase Baseline And Migration Replay Runbook

Last checked: 2026-07-09

## Launch decision

Do not try to make every historical migration replayable before launch. The current
`supabase/migrations` folder contains several schema snapshots and follow-up
patches that collide when replayed from an empty database.

The launch-safe path is a current-production schema baseline for new
environments:

- Existing production/staging projects keep their already-applied migration
  history.
- New launch environments start from one verified baseline schema dump.
- Future schema changes are added as normal timestamped migrations after that
  baseline.

This protects existing data and avoids weakening RLS just to make legacy replay
work.

## Current app schema assumptions

The app currently expects these public tables and storage objects to exist:

- Core user/journal: `profiles`, `user_roles`, `invites`, `trades`,
  `trade_screenshots`, `sticky_notes`, `notebook_entries`
- Trading configuration: `trading_accounts`, `trading_preferences`,
  `account_guardrails`
- Community: `community_groups`, `community_group_members`,
  `community_group_invitations`, `community_trade_comments`,
  `community_trade_shares`, `community_trade_reactions`,
  `community_notifications`
- Storage: private `trade-screenshots` bucket with RLS-backed object policies
- Functions/triggers: profile creation trigger, updated-at triggers,
  trade-number assignment, role/group helper functions

The baseline must include the final current version of those tables, functions,
triggers, indexes, RLS policies, and storage bucket metadata/policies.

## Exact conflicts in legacy migrations

These files contain overlapping schema snapshots or object definitions and
should not be replayed together from zero:

- `20260615083729_0be18de3-ca10-44df-9da0-c26afd433b98.sql`
- `20260616172902_0962a63b-a0bf-44b9-8bac-b3a9e9f0f2c8.sql`
- `20260625102459_5ffaa3d6-cb34-4958-9d97-759b0e174c48.sql`
- `20260626042933_38a8d770-0d49-48db-b3f8-3b1370a5aa49.sql`
- `20260626140001_b9d46b0e-88c9-4195-a689-29942fcc7f88.sql`

Representative duplicate/conflicting objects:

- Types: `public.app_role`, `public.market_type`, `public.trade_direction`,
  `public.trade_result`, `public.trade_grade`, `public.trading_session`,
  `public.screenshot_kind`
- Tables: `public.profiles`, `public.user_roles`, `public.invites`,
  `public.trades`, `public.trade_screenshots`, `public.sticky_notes`,
  `public.notebook_entries`, `public.trading_accounts`,
  `public.trading_preferences`, `public.account_guardrails`
- Community tables duplicated between
  `20260626044213_fbe1d625-befe-4962-b188-caa7af965cc7.sql` and
  `20260626140001_b9d46b0e-88c9-4195-a689-29942fcc7f88.sql`
- Columns: `public.trades.account_id`, `public.trades.killzone`,
  `public.invites.disabled`, `public.account_guardrails.daily_loss_reminder`,
  `public.sticky_notes.kind`
- Functions: `public.set_updated_at`, `public.has_role`,
  `public.handle_new_user`, `public.assign_trade_number`,
  `public.generate_edge_id`, `public.is_group_member`,
  `public.is_group_owner`
- Triggers: `on_auth_user_created`, `trg_profiles_updated_at`,
  `trg_trades_updated_at`, `trg_trades_assign_number`,
  `trading_accounts_set_updated_at`, `set_sticky_notes_updated_at`,
  `notebook_set_updated_at`, `account_guardrails_set_updated_at`
- Policies: repeated own-row policies for profiles, trades, screenshots,
  notes, invites, preferences, accounts, guardrails, and community tables

Later migrations such as
`20260707170000_launch_blocker_security_fixes.sql` intentionally replace
specific policies. Keep those fixes in the post-baseline history.

## How to create the baseline

Perform this against the current production Supabase project after confirming it
contains all launch fixes:

1. Freeze schema changes during the baseline capture.
2. Create a schema-only dump from production. Do not include customer data.
3. Include `public`, `storage`, required extensions, functions, triggers,
   indexes, constraints, RLS enablement, and policies.
4. Confirm the dump preserves the private `trade-screenshots` bucket and its
   storage policies.
5. Save the reviewed dump as:

```text
supabase/migrations/20260710000000_launch_baseline.sql
```

Use the actual capture date/time if different. The important part is that this
baseline becomes the first migration in the clean replay set.

## Where the baseline belongs

Use a clean baseline migration set for new environments. Do not place the
baseline next to all legacy migrations and then run the entire folder from zero.

Repository workflow:

1. Preserve legacy pre-baseline SQL outside the active replay path:

```text
supabase/migrations_legacy_pre_baseline/
```

2. Keep the reviewed baseline SQL as the first file in:

```text
supabase/migrations/20260710000000_launch_baseline.sql
```

3. Keep only migrations created after the baseline timestamp alongside it in
   `supabase/migrations`.

EdgeScope now follows this layout. This keeps history available for audit while
preventing Supabase CLI from replaying conflicting legacy files into fresh
databases.

## Future migrations after baseline

After the baseline is created:

- Every schema change must be a new timestamped migration after the baseline.
- Do not edit the baseline for routine changes after it is used.
- Use idempotent patterns where appropriate: `create table if not exists`,
  guarded `alter table ... add column if not exists`, and `drop policy if exists`
  followed by `create policy` for intentional policy replacements.
- Do not loosen RLS to simplify migrations.
- Do not make `trade-screenshots` public.

## Validation checklist

Before using the baseline for launch:

1. Create a disposable Supabase project.
2. Apply only the clean baseline migration set.
3. Verify the app can sign up, create a profile, create an account, log a trade,
   upload/delete screenshots, and use community sharing/comments.
4. Verify RLS:
   - user-owned tables reject cross-user access
   - group data requires membership
   - comments require the trade to be shared to the same group
   - screenshot objects stay private
5. Run app checks:
   - lint
   - typecheck
   - production build
6. Generate fresh Supabase TypeScript types from the disposable project and diff
   them against `src/integrations/supabase/types.ts`.

## Manual Supabase notes

Supabase migration history is stored in the remote database. For existing
production/staging projects, do not mark old migrations as reverted or delete
remote history casually.

For a brand-new environment using the baseline branch:

- Start from an empty project.
- Apply the baseline migration set only.
- If the Supabase CLI asks about remote migration repair, use repair commands
  only on the new disposable project, not production.

## What not to do

- Do not run the current legacy migration folder from zero and treat failures as
  launch-safe.
- Do not rewrite already-applied production migration history without a separate
  migration repair plan.
- Do not directly patch hundreds of historical statements unless each change is
  reviewed against production.
- Do not weaken RLS policies to make replay easier.
- Do not make the `trade-screenshots` bucket public.
