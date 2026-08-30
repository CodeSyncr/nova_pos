-- Fix the circular RLS dependency introduced by the previous migration, and
-- make tenant co-membership actually readable.
--
-- THE BREAKAGE
-- profile_tenants' policy checks membership by joining `profiles`:
--     exists (select 1 from profiles p
--             where p.id = profile_tenants.profile_id and p.id = auth.uid())
-- The previous migration then added a `profiles` policy that reads
-- profile_tenants. Each policy therefore triggers the other, and Postgres
-- aborts the query — every profile_tenants read started returning 500.
--
-- THE FIX
-- Route both checks through SECURITY DEFINER functions. Those execute as the
-- function owner with RLS suspended inside the body, so the policies no longer
-- re-enter each other. This is the standard way out of policy recursion.
--
-- A SECOND, SEPARATE BUG
-- That profile_tenants policy is a roundabout way of writing
-- `profile_id = auth.uid()`, so a user could only ever see their OWN
-- membership row. Any "who else is in my restaurant" query — the chat member
-- picker, staff lists — came back with just the caller. It is widened here to
-- rows belonging to tenants the caller is a member of.
--
-- What that widening exposes: which colleagues belong to your own restaurant,
-- and their role id. It does not cross tenants, and it grants no write access.
-- A team chat cannot work without it.

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Is the caller a member of this tenant?
create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile_tenants
    where tenant_id = p_tenant_id
      and profile_id = (select auth.uid())
  );
$$;

-- Does the caller share any tenant with this profile?
create or replace function public.shares_tenant_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_tenants mine
    join public.profile_tenants theirs
      on theirs.tenant_id = mine.tenant_id
    where mine.profile_id = (select auth.uid())
      and theirs.profile_id = p_profile_id
  );
$$;

-- Callable by signed-in users; the bodies above are what enforce scope.
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.shares_tenant_with(uuid) to authenticated;

-- ── Rebuild the two policies ────────────────────────────────────────────────

-- profiles: readable by yourself, or by anyone sharing a tenant with you.
drop policy if exists "profiles readable by tenant co-members" on public.profiles;

create policy "profiles readable by tenant co-members" on public.profiles
  for select using (
    id = (select auth.uid())
    or public.shares_tenant_with(id)
  );

-- profile_tenants: readable for tenants you belong to, rather than only your
-- own row. No longer references `profiles`, which is what closes the loop.
drop policy if exists "profile tenants readable" on public.profile_tenants;

create policy "profile tenants readable by tenant members" on public.profile_tenants
  for select using (
    profile_id = (select auth.uid())
    or public.is_tenant_member(tenant_id)
  );
