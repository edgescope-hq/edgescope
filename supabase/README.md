# Supabase Migration Notes

The current `supabase/migrations` folder is production history, not a clean
fresh-database replay set.

Before public launch, new Supabase environments should be created from a reviewed
current-schema baseline as documented in
`docs/launch/migration-replay-runbook.md`.

Do not run the legacy migration folder from zero for launch database creation.
It contains duplicate schema snapshots and policy definitions that conflict when
replayed together.
