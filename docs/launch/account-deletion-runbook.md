# Account Deletion Runbook

Last checked: 2026-07-09

## Status

EdgeScope supports scheduling account deletion with a 15-day grace period and cancellation before the scheduled date. Automated background purge is not wired yet. Until a scheduled job exists, use this internal manual purge runbook for accounts whose grace period has ended.

The user-facing settings and privacy pages must continue to say that final deletion is handled by the team/manual process until automation is live.

## Candidate query

Run this from a service-role/admin SQL console:

```sql
select id, deletion_requested_at, deletion_scheduled_for, deletion_cancelled_at
from public.profiles
where deletion_scheduled_for <= now()
  and deletion_cancelled_at is null
order by deletion_scheduled_for asc;
```

Only proceed when:

- `deletion_scheduled_for` is in the past.
- `deletion_cancelled_at` is null.
- The scheduled date is at least 15 days after the request timestamp.

## Purge steps

For each approved user id:

1. Record an internal audit note with the user id, admin name, timestamp, and reason.
2. List screenshot storage paths:

```sql
select storage_path
from public.trade_screenshots
where user_id = '<user-id>';
```

3. Remove those objects from the private `trade-screenshots` bucket using the Supabase dashboard, Storage API, or an admin-only script.
4. Delete the Supabase Auth user through the Auth Admin API or dashboard. The application schema uses foreign keys/cascades for user-owned database rows.
5. Verify no rows remain for that user in `profiles`, `trades`, `trade_screenshots`, `notebook_entries`, and `sticky_notes`.
6. Record completion in the audit note, including screenshot object count removed.

## Safety rules

- Do not directly delete from `auth.users` with ad hoc SQL.
- Do not make `trade-screenshots` public during cleanup.
- Do not purge users before the 15-day grace period ends.
- If the user cancels deletion before the scheduled date, do not purge.

## Automation follow-up

When a scheduled purge job is added, it should reuse the same checks:

- service-role only
- due scheduled date
- no cancellation timestamp
- storage cleanup before Auth Admin deletion
- audit logging for each purge
