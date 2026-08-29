-- Zomato partner orders
--
-- Mirrors the orders shown on the Zomato merchant dashboard so they appear
-- alongside the restaurant's own orders in pos_global.
--
-- Auth model (important): Zomato partner login is OTP-only and sits behind
-- Akamai bot protection, so the login itself cannot be automated. Instead we
-- store a session captured from a real browser and use it until it lapses.
-- The session's outer bound is the `bExp` claim on Zomato's JWT — roughly 24
-- hours — after which someone must reconnect by hand. See
-- pos_provider_credentials.session_data below.

-- The existing credentials table was built for username/password providers
-- (Razorpay POS / Ezetap). Zomato is session-based, so widen it rather than
-- introducing a second near-identical table.
alter table public.pos_provider_credentials
  alter column portal_username drop not null,
  alter column portal_password drop not null;

-- Cookies + headers + res_id for session-based providers, e.g.
--   { "cookies": "zat=...; X-Zomato-Mx-Auth-Token=...",
--     "headers": { "x-zomato-csrft": "...", "x-zomato-mx-csrf-token": "..." },
--     "resId": "<zomato outlet id>" }
-- Service-role only, like the rest of this table: it is a live credential.
alter table public.pos_provider_credentials
  add column if not exists session_data jsonb;

-- When the stored session stops working, so the UI can prompt a reconnect
-- instead of silently returning nothing.
alter table public.pos_provider_credentials
  add column if not exists session_expires_at timestamptz;

create table if not exists public.zomato_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,

  -- Zomato's own order id (snippet.id), e.g. 8539105757.
  external_id text not null,
  -- The Zomato outlet this order belongs to (res_Id).
  res_id text not null,

  -- DELIVERED | PREPARING | READY | DISPATCHED | TIMEOUT | CANCELLED ...
  status text,
  customer_name text,
  -- Free-text item summary as Zomato renders it; the dashboard does not
  -- expose a structured line-item breakdown on this endpoint.
  items_summary text,
  amount numeric(10, 2),
  currency text not null default 'INR',

  ordered_at timestamptz not null,

  -- Optional link to a pos_global order, if the restaurant also rings it up
  -- internally. Left null for delivery-only orders, which is the normal case.
  order_id uuid references public.orders on delete set null,

  -- The raw snippet, so a parser change can be re-run against history.
  raw jsonb,

  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Makes re-syncing an overlapping window idempotent.
  unique (tenant_id, external_id)
);

create index if not exists zomato_orders_tenant_time_idx
  on public.zomato_orders (tenant_id, ordered_at desc);

create index if not exists zomato_orders_status_idx
  on public.zomato_orders (tenant_id, status);

alter table public.zomato_orders enable row level security;

create policy "zomato_orders tenant scoped" on public.zomato_orders for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = zomato_orders.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = zomato_orders.tenant_id and p.id = auth.uid()
  )
);
