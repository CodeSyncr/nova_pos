-- Internal team chat, with AI purchase capture.
--
-- Three concerns, kept separate on purpose:
--
--   1. Messaging      — conversations / members / messages / receipts
--   2. Access control — role-gated channels, enforced in RLS so an employee
--                       cannot see a restricted channel even by calling the
--                       API directly
--   3. AI capture     — purchases spotted in messages land in a REVIEW QUEUE.
--                       Nothing reaches purchases/purchase_items until a human
--                       approves, because an LLM misreading "12kg" as "120kg"
--                       would otherwise silently corrupt inventory and spend.

-- ── Conversations ───────────────────────────────────────────────────────────

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,

  -- direct  -> exactly two members, no name
  -- group   -> named, any number of members
  -- channel -> named, role-gated via required_permission below
  kind text not null default 'direct'
    check (kind in ('direct', 'group', 'channel')),

  name text,
  description text,
  avatar_url text,

  -- Role gate for `channel` conversations. When set, a profile must hold this
  -- permission category to see the conversation at all — it does not appear in
  -- their list and its messages are unreadable. Null means "members only",
  -- which is how direct and group chats work.
  required_permission text,

  created_by uuid references public.profiles on delete set null,

  -- Denormalised so the conversation list can sort and preview without
  -- touching the messages table for every row.
  last_message_at timestamptz,
  last_message_preview text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_tenant_recent
  on public.conversations (tenant_id, last_message_at desc nulls last);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,

  role text not null default 'member' check (role in ('member', 'admin')),

  -- Drives unread counts without scanning messages.
  last_read_at timestamptz,
  -- Per-member mute, so a noisy group does not force leaving it.
  muted_until timestamptz,

  joined_at timestamptz not null default now(),

  primary key (conversation_id, profile_id)
);

-- The primary key leads with conversation_id, so "which conversations am I in"
-- needs its own index — that query runs on every chat page load and inside
-- every RLS check below.
create index if not exists idx_conversation_members_profile
  on public.conversation_members (profile_id);

-- ── Messages ────────────────────────────────────────────────────────────────

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  tenant_id uuid not null references public.tenants on delete cascade,
  sender_id uuid references public.profiles on delete set null,

  -- text | image | file | system
  -- `system` is for "X added Y to the group" style notices, which have no
  -- sender and are rendered differently.
  kind text not null default 'text' check (kind in ('text', 'image', 'file', 'system')),

  body text,

  -- Attachment, when kind is image/file.
  attachment_url text,
  attachment_name text,
  attachment_size int,
  attachment_mime text,

  -- Threaded replies (WhatsApp-style quote).
  reply_to_id uuid references public.messages on delete set null,

  edited_at timestamptz,
  -- Soft delete so "this message was deleted" can be rendered in place.
  deleted_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_time
  on public.messages (conversation_id, created_at desc);

create index if not exists idx_messages_tenant_time
  on public.messages (tenant_id, created_at desc);

-- Per-member read receipts (the WhatsApp double-tick).
create table if not exists public.message_reads (
  message_id uuid not null references public.messages on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

create index if not exists idx_message_reads_profile
  on public.message_reads (profile_id);

-- ── AI capture ──────────────────────────────────────────────────────────────

-- Purchases the AI spotted in chat, awaiting human approval.
--
-- Deliberately NOT wired into purchases/purchase_items until approved: an
-- extraction error would otherwise flow straight into financial reporting.
create table if not exists public.pending_purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,

  -- Where it came from, so a reviewer can read the original wording.
  message_id uuid references public.messages on delete set null,
  conversation_id uuid references public.conversations on delete set null,
  reported_by uuid references public.profiles on delete set null,

  -- What the AI extracted -------------------------------------------------
  item_name text not null,
  -- vegetables | fruits | dairy | meat | grains | beverages | packaging |
  -- supplies | other  — drives the spend-by-category breakdown.
  category text not null default 'other',
  quantity numeric(10, 3),
  unit text,
  amount numeric(10, 2),
  supplier_name text,
  purchased_on date,

  -- 0..1 from the extractor. Low-confidence rows are surfaced for review but
  -- never auto-approved.
  confidence numeric(3, 2) default 0.5,

  -- The raw model output, so a prompt change can be replayed against history.
  raw_extraction jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles on delete set null,
  reviewed_at timestamptz,
  -- Set on approval, linking through to the real record it became.
  purchase_id uuid references public.purchases on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One extraction per message: re-running the detector must not duplicate.
  unique (message_id)
);

create index if not exists idx_pending_purchases_tenant_status
  on public.pending_purchases (tenant_id, status, created_at desc);

-- Spend-by-category reporting reads approved rows by date.
create index if not exists idx_pending_purchases_category
  on public.pending_purchases (tenant_id, category, purchased_on desc)
  where status = 'approved';

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.pending_purchases enable row level security;

-- Does the current user hold `permission_category` in this tenant?
--
-- SECURITY DEFINER so policies can consult roles without the caller needing
-- read access to the roles table. A null/empty permissions map means owner,
-- who holds everything.
create or replace function public.has_tenant_permission(
  p_tenant_id uuid,
  p_permission text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_tenants pt
    left join public.roles r on r.id = pt.role_id
    where pt.tenant_id = p_tenant_id
      and pt.profile_id = (select auth.uid())
      and (
        -- No role, or a role with no explicit permissions => owner-level.
        r.id is null
        or r.permissions is null
        or r.permissions = '[]'::jsonb
        or r.permissions ? p_permission
      )
  );
$$;

-- Is the current user a member of this conversation?
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.profile_id = (select auth.uid())
  );
$$;

-- Conversations: visible when you are a member AND, for a role-gated channel,
-- you hold the required permission. The permission check is here rather than
-- in the UI so a restricted channel stays invisible to direct API calls too.
create policy "conversations visible to members" on public.conversations
  for select using (
    public.is_conversation_member(id)
    and (
      required_permission is null
      or public.has_tenant_permission(tenant_id, required_permission)
    )
  );

create policy "conversations created by tenant members" on public.conversations
  for insert with check (
    exists (
      select 1 from public.profile_tenants pt
      where pt.tenant_id = conversations.tenant_id
        and pt.profile_id = (select auth.uid())
    )
  );

create policy "conversations updated by admins" on public.conversations
  for update using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversations.id
        and cm.profile_id = (select auth.uid())
        and cm.role = 'admin'
    )
  );

-- Membership rows are readable for conversations you belong to (so the UI can
-- render the member list), and self-serve for your own read/mute state.
create policy "members visible in own conversations" on public.conversation_members
  for select using (public.is_conversation_member(conversation_id));

create policy "members managed by conversation admins" on public.conversation_members
  for all using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_members.conversation_id
        and cm.profile_id = (select auth.uid())
        and cm.role = 'admin'
    )
  ) with check (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_members.conversation_id
        and cm.profile_id = (select auth.uid())
        and cm.role = 'admin'
    )
  );

-- Messages inherit the conversation's visibility, including the channel gate.
create policy "messages visible to conversation members" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.is_conversation_member(c.id)
        and (
          c.required_permission is null
          or public.has_tenant_permission(c.tenant_id, c.required_permission)
        )
    )
  );

create policy "messages sent by members" on public.messages
  for insert with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
  );

-- Authors may edit or soft-delete their own messages.
create policy "messages edited by author" on public.messages
  for update using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

create policy "read receipts by self" on public.message_reads
  for all using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- The purchase review queue is financial data: gated on the `purchases`
-- permission, so ordinary staff can report a purchase in chat but never see
-- the queue, the amounts, or the approval controls.
create policy "pending purchases for purchase managers" on public.pending_purchases
  for all using (public.has_tenant_permission(tenant_id, 'purchases'))
  with check (public.has_tenant_permission(tenant_id, 'purchases'));

-- ── Conversation list upkeep ────────────────────────────────────────────────

-- Keeps last_message_at / preview current so the conversation list stays a
-- single indexed read instead of a per-row subquery.
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = case
        when new.kind = 'image' then '📷 Photo'
        when new.kind = 'file' then '📎 ' || coalesce(new.attachment_name, 'File')
        else left(coalesce(new.body, ''), 120)
      end,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- ── Realtime ────────────────────────────────────────────────────────────────
-- Publishing these lets clients subscribe to live inserts. RLS still applies
-- to realtime payloads, so a restricted channel is not leaked through it.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
