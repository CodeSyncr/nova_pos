-- Fix recursion in the conversation_members policies.
--
-- THE BREAKAGE
-- The chat migration wrote:
--     create policy "members managed by conversation admins"
--       on public.conversation_members for all using (
--         ... exists (select 1 from public.conversation_members cm ...)
--       )
-- A policy ON conversation_members that reads conversation_members re-enters
-- itself, so Postgres aborts with "infinite recursion detected in policy for
-- relation conversation_members". Because the policy is FOR ALL, it applies to
-- SELECT too, which poisoned every read of the table.
--
-- The same trap as the profiles/profile_tenants loop fixed in the previous
-- migration, but self-referential rather than mutual: a policy must never
-- query its own table directly.
--
-- THE FIX
-- Move the admin check into a SECURITY DEFINER function, which runs with RLS
-- suspended inside its body and so does not re-trigger the policy.

-- Is the caller an admin of this conversation?
create or replace function public.is_conversation_admin(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id
      and profile_id = (select auth.uid())
      and role = 'admin'
  );
$$;

grant execute on function public.is_conversation_admin(uuid) to authenticated;

-- ── conversation_members ────────────────────────────────────────────────────

drop policy if exists "members managed by conversation admins" on public.conversation_members;
drop policy if exists "members visible in own conversations" on public.conversation_members;

-- Read: members of the conversation can see who else is in it.
create policy "members visible in own conversations" on public.conversation_members
  for select using (public.is_conversation_member(conversation_id));

-- Write: you may always manage your own row (read state, mute, leaving), and
-- conversation admins may manage anyone's. Split from the read policy so a
-- FOR ALL rule never governs SELECT again.
create policy "members insertable by admins or self" on public.conversation_members
  for insert with check (
    profile_id = (select auth.uid())
    or public.is_conversation_admin(conversation_id)
  );

create policy "members updatable by admins or self" on public.conversation_members
  for update using (
    profile_id = (select auth.uid())
    or public.is_conversation_admin(conversation_id)
  ) with check (
    profile_id = (select auth.uid())
    or public.is_conversation_admin(conversation_id)
  );

create policy "members removable by admins or self" on public.conversation_members
  for delete using (
    profile_id = (select auth.uid())
    or public.is_conversation_admin(conversation_id)
  );

-- ── conversations ───────────────────────────────────────────────────────────

-- This one read conversation_members directly, so it depended on that table's
-- (previously recursive) policy. Route it through the helper as well.
drop policy if exists "conversations updated by admins" on public.conversations;

create policy "conversations updated by admins" on public.conversations
  for update using (public.is_conversation_admin(id))
  with check (public.is_conversation_admin(id));
