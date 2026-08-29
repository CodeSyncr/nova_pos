-- Razorpay POS (Ezetap) card-machine transactions
--
-- Mirrors the transactions a physical POS terminal (DigiPOS) reports to the
-- Ezetap merchant portal, so the web POS can show "payment received on the
-- card machine" alongside its own orders.
--
-- Source of truth stays the Ezetap portal; this table is a synced copy keyed
-- on `external_id` (the portal's own transaction ID) so repeated syncs of an
-- overlapping date range are idempotent.
--
-- Reconciliation:
--   order_id is nullable. A row lands unmatched, then gets linked to an order
--   either automatically (amount + time-window match) or by hand in the UI.
--   match_type records which, so an operator can tell a guess from a decision.

create table if not exists public.pos_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,

  -- Provenance -------------------------------------------------------------
  provider text not null default 'razorpay_pos',
  -- Ezetap portal transaction ID, e.g. 260829104626370E732958523
  external_id text not null,

  -- Money ------------------------------------------------------------------
  amount numeric(10, 2) not null,
  tip numeric(10, 2) default 0,
  cash_at_pos numeric(10, 2) default 0,
  currency text not null default 'INR',

  -- How it was paid --------------------------------------------------------
  -- mode: UPI | CARD | CASH | WALLET | ...   (portal "Mode")
  mode text,
  -- txn_type: Charge | Refund | Void | PreAuth ...  (portal "Txn Type")
  txn_type text,
  -- status: SETTLED | SETTLEMENT_PENDING | EXPIRED | FAILED | VOID ...
  status text,

  -- Card detail (null for UPI) ---------------------------------------------
  card_last4 text,
  card_type text,        -- DEBIT / CREDIT
  card_brand text,       -- VISA / MASTERCARD / RUPAY
  auth_code text,
  rrn text,              -- retrieval reference number, the bank-side handle

  -- Terminal identity ------------------------------------------------------
  device_serial text,
  mid text,
  tid text,
  acquiring_bank text,
  -- Portal login the txn was booked under (the device operator).
  portal_username text,

  -- Timing -----------------------------------------------------------------
  txn_at timestamptz not null,
  settled_on timestamptz,

  -- Reconciliation ---------------------------------------------------------
  order_id uuid references public.orders on delete set null,
  -- auto   -> linked by the matcher on a unique amount + time-window hit
  -- manual -> an operator picked the order
  -- null   -> not linked yet
  match_type text check (match_type in ('auto', 'manual')),
  matched_at timestamptz,

  -- Everything the portal CSV gave us, verbatim, for later forensics.
  raw jsonb,

  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The idempotency key that makes re-syncing safe.
  unique (tenant_id, provider, external_id)
);

create index if not exists pos_transactions_tenant_txn_at_idx
  on public.pos_transactions (tenant_id, txn_at desc);

-- Drives the "unmatched payments" queue.
create index if not exists pos_transactions_unmatched_idx
  on public.pos_transactions (tenant_id, txn_at desc)
  where order_id is null;

create index if not exists pos_transactions_order_idx
  on public.pos_transactions (order_id)
  where order_id is not null;

-- Portal credentials, per tenant.
--
-- Kept out of env vars because pos_global is multi-tenant: each tenant has its
-- own Ezetap login. Access is service-role only (see the RLS policies below) so
-- the password never reaches the browser.
create table if not exists public.pos_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  provider text not null default 'razorpay_pos',

  portal_username text not null,
  -- Stored reversibly on purpose: the portal needs the cleartext password to
  -- derive its login hash, so this cannot be a one-way digest. Protected by
  -- RLS (service-role only) rather than by hashing.
  portal_password text not null,

  -- Set false to pause syncing without deleting the credentials.
  is_active boolean not null default true,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, provider)
);

-- Row level security -------------------------------------------------------

alter table public.pos_transactions enable row level security;
alter table public.pos_provider_credentials enable row level security;

-- Transactions are readable/writable by members of the owning tenant.
create policy "pos_transactions tenant scoped" on public.pos_transactions for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = pos_transactions.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = pos_transactions.tenant_id and p.id = auth.uid()
  )
);

-- Credentials are deliberately NOT exposed to tenant members: no policy is
-- created for authenticated users, so only the service-role key can touch this
-- table. That keeps the portal password server-side even for tenant admins.
