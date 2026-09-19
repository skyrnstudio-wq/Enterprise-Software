-- ============================================================================
-- Migration 010 — Repair: restore EXECUTE on RLS helper predicates
-- Simran QC Platform
--
-- Migration 009's blanket REVOKE also stripped EXECUTE on auth_role() and
-- is_quality_head() from `authenticated`. Those two are RLS *predicates* —
-- policies evaluate as the querying caller, so without EXECUTE every policy
-- that references them fails with "permission denied for function auth_role"
-- (profiles, items, batches, review — i.e. essentially the whole app).
--
-- This migration is idempotent and repairs any database that already ran the
-- over-broad 009. Fresh installs are also correct because 009 was amended —
-- this is the belt-and-braces restore for already-migrated environments.
-- ============================================================================

grant execute on function public.auth_role()       to authenticated;
grant execute on function public.is_quality_head() to authenticated;
