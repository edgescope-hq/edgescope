# Supabase Migration Notes

`supabase/migrations` is the active clean replay and forward-migration set. It
starts with the reviewed `20260710000000_launch_baseline.sql` snapshot and then
contains only newer forward migrations.

Production records `20260710000000` as its baseline cutover version. The
baseline SQL represents the schema that already existed at that cutover and
must not be replayed against production.

The original pre-baseline migration history is preserved unchanged under
`supabase/migrations_legacy_pre_baseline/`. Never combine that archive with the
active baseline during replay.

See `supabase/baseline/BOOTSTRAP.md` and
`docs/launch/migration-replay-runbook.md` for the validated bootstrap and
production-migration workflows.
