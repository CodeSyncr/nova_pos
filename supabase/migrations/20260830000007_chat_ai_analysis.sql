-- Multiple expense entries per message, plus stored AI analysis.
--
-- The chat migration put a `unique (message_id)` on pending_purchases, which
-- assumed one purchase per message. The house style is the opposite:
--     "204 dietcoke and ice, 305 instamart, 15000 rent, 2000 loan"
-- is four separate expenses in one line. That constraint silently discarded
-- all but the first.

alter table public.pending_purchases
  drop constraint if exists pending_purchases_message_id_key;

-- Which comma-separated part of the message this row came from, so re-running
-- the extractor updates entries in place instead of duplicating them.
alter table public.pending_purchases
  add column if not exists line_index int not null default 0;

alter table public.pending_purchases
  drop constraint if exists pending_purchases_message_line_key;

alter table public.pending_purchases
  add constraint pending_purchases_message_line_key
  unique (message_id, line_index);

-- What the AI made of a message, cached so the inline card does not re-run the
-- model on every render and every reader.
--
-- Readable by anyone who can read the message; the amounts live in
-- pending_purchases, which stays gated on the `purchases` permission, so
-- storing the analysis here does not leak figures to staff.
create table if not exists public.message_ai_analysis (
  message_id uuid primary key references public.messages on delete cascade,
  tenant_id uuid not null references public.tenants on delete cascade,

  -- purchase | list | none
  kind text not null default 'none' check (kind in ('purchase', 'list', 'none')),

  -- Purchase roll-up, so the card can show a total without reading the
  -- individual gated rows.
  entry_count int not null default 0,
  total_amount numeric(12, 2),

  -- For `list`: the spell-corrected text prepared for sending to a vendor.
  corrected_text text,

  created_at timestamptz not null default now()
);

create index if not exists idx_message_ai_analysis_tenant
  on public.message_ai_analysis (tenant_id, created_at desc);

alter table public.message_ai_analysis enable row level security;

-- Visible exactly where the underlying message is visible.
create policy "analysis visible with its message" on public.message_ai_analysis
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_ai_analysis.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );
