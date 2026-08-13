BEGIN;

-- The launch baseline intentionally granted broad default table privileges to
-- Data API roles. The ingestion spine defines a narrower contract, so revoke
-- inherited ACLs before granting only the operations each table supports.
-- RLS protects rows, but it does not govern TRUNCATE, REFERENCES, or TRIGGER.
REVOKE ALL ON TABLE public.evidence_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.source_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ingestion_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.source_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trade_source_events FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.evidence_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.source_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ingestion_runs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.source_events TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.trade_source_events TO authenticated;

-- Future public tables must opt into Data API privileges explicitly instead of
-- inheriting every table privilege from the baseline-era default ACL.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

COMMIT;
