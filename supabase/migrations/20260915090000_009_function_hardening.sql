-- ============================================================================
-- Migration 009 — Function hardening (Supabase security advisor remediation)
-- Simran QC Platform
--
-- 1. touch_ncr() had a role-mutable search_path (linter 0011) — pinned to ''.
-- 2. Postgres grants EXECUTE on every function to PUBLIC by default, which
--    exposed the SECURITY DEFINER helpers (trigger functions) via the
--    PostgREST RPC surface (linters 0028/0029). None of them is meant to be
--    called over the API: they fire from triggers only. Explicit REVOKE from
--    anon/authenticated/public closes the surface; trigger execution is
--    unaffected (triggers run as the table owner, not via grants).
-- ============================================================================

-- 1 — pin the search_path (linter 0011)
create or replace function public.touch_ncr()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 2 — no RPC surface for trigger-only helpers (linters 0028/0029).
--     EXCEPTION: auth_role()/is_quality_head() are RLS predicates — policies
--     evaluate as the caller, so `authenticated` MUST keep EXECUTE or every
--     query fails with "permission denied for function auth_role". They are
--     closed to anon/public, not to authenticated.
revoke execute on function public.auth_role()                       from anon, public;
grant  execute on function public.auth_role()                       to authenticated;
revoke execute on function public.is_quality_head()                 from anon, public;
grant  execute on function public.is_quality_head()                 to authenticated;
revoke execute on function public.forbid_approved_mutation()        from anon, authenticated, public;
revoke execute on function public.guard_batches_mutation()          from anon, authenticated, public;
revoke execute on function public.maintain_instruments_next_due()   from anon, authenticated, public;
revoke execute on function public.write_batch_audit()               from anon, authenticated, public;
revoke execute on function public.write_sign_off_audit()            from anon, authenticated, public;
revoke execute on function public.handle_new_user()                 from anon, authenticated, public;
revoke execute on function public.set_ncr_number()                  from anon, authenticated, public;
revoke execute on function public.touch_ncr()                       from anon, authenticated, public;
