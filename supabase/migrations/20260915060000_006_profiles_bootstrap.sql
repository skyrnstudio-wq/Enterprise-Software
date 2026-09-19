-- ============================================================================
-- Migration 006 — Profiles self-bootstrap (execution-plan.md Phase 2 step 6)
-- Simran QC Platform · Phase 2 (identity)
-- Edge cases: 2.15 (role from profiles, never JWT); least-privilege onboarding.
-- ============================================================================

-- Every new auth.users row gets a profile automatically; without this the
-- first sign-in dead-ends (auth_role() returns null and every RLS policy
-- denies). The FIRST EVER user is the platform ADMIN (no chicken-and-egg:
-- someone must administer before any admin exists to promote them). Everyone
-- after that enters as QC_INSPECTOR — least privilege; an existing admin
-- promotes them via the profile row (no self-service role changes, §4).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_any_admin boolean;
begin
  select exists (select 1 from public.profiles where role = 'ADMIN')
  into has_any_admin;

  insert into public.profiles (id, full_name, role, mfa_enforced)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when has_any_admin then 'QC_INSPECTOR' else 'ADMIN' end,
    false
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The function writes profiles on behalf of the new user: invoker rights would
-- hit RLS with no role yet. Restrict direct execution; the trigger runs as
-- owner.
revoke execute on function public.handle_new_user() from public;
