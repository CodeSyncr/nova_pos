-- Let teammates see each other's names.
--
-- profiles' only SELECT policy was `auth.uid() = id`, so a user could read
-- nothing but their own row. That is fine for a profile screen and fatal for
-- chat: the member picker comes back empty, a 1:1 conversation cannot resolve
-- who it is with, and group messages render every sender as "Someone".
--
-- This adds read access limited to people who share a tenant with you. It
-- exposes only what profiles holds — full_name and avatar_url — and only to
-- colleagues in the same restaurant, which is what a team chat requires.
-- The existing self-only insert/update policies are untouched, so nobody
-- gains the ability to modify anyone else's profile.

create policy "profiles readable by tenant co-members" on public.profiles
  for select using (
    exists (
      select 1
      from public.profile_tenants mine
      join public.profile_tenants theirs
        on theirs.tenant_id = mine.tenant_id
      where mine.profile_id = (select auth.uid())
        and theirs.profile_id = profiles.id
    )
  );
