-- Rule-based discount system
--
-- Adds tenant-scoped `discounts` that are evaluated automatically against an
-- in-progress order. Each discount carries:
--   * a value          (percent / fixed, with an optional cap for percent)
--   * a set of rules   (jsonb array of {field, operator, value} conditions)
--   * a validity window (valid_from / valid_until timestamptz => date + time)
--   * an optional recurring window (active_days + start_time / end_time)
--   * stacking flags   (is_stackable, stackable_with_coupons)
--
-- Rule shape stored in `rules`:
--   [{ "field": "order_total", "operator": "gte", "value": 1200 }]
-- Supported fields  : order_total, item_count, order_type, contains_category,
--                     contains_item, customer_type
-- Supported operators: gte, gt, lte, lt, eq, neq, in, not_in
-- `rule_match` decides whether ALL or ANY of the rules must pass.

create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  name text not null,
  description text,

  -- Value ------------------------------------------------------------------
  discount_type text not null default 'percent'
    check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10, 2) not null check (discount_value >= 0),
  -- Caps a percent discount, e.g. "10% off, up to 300".
  max_discount_amount numeric(10, 2)
    check (max_discount_amount is null or max_discount_amount >= 0),

  -- Rules ------------------------------------------------------------------
  rules jsonb not null default '[]'::jsonb,
  rule_match text not null default 'all' check (rule_match in ('all', 'any')),

  -- Auto apply -------------------------------------------------------------
  -- auto_apply = true  -> engine applies it silently when rules pass
  -- auto_apply = false -> stays available for manual application by staff
  auto_apply boolean not null default true,
  -- Higher priority is considered first when picking the winning discount.
  priority int not null default 0,

  -- Stacking / clubbing ----------------------------------------------------
  -- is_stackable           -> may be combined with other stackable discounts
  -- stackable_with_coupons -> may be combined with a customer coupon code
  is_stackable boolean not null default false,
  stackable_with_coupons boolean not null default false,

  -- Validity window (date + time) -----------------------------------------
  valid_from timestamptz not null default now(),
  -- null => open ended
  valid_until timestamptz,
  -- Recurring weekly window. 0 = Sunday .. 6 = Saturday. Empty = every day.
  active_days smallint[] not null default '{}'::smallint[],
  -- Recurring daily window ("happy hour"). Both null => all day.
  -- end_time < start_time is treated as an overnight window by the engine.
  start_time time,
  end_time time,

  -- Usage caps -------------------------------------------------------------
  usage_limit int check (usage_limit is null or usage_limit > 0),
  usage_count int not null default 0,
  per_customer_limit int check (per_customer_limit is null or per_customer_limit > 0),

  is_active boolean not null default true,
  created_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint discounts_validity_window
    check (valid_until is null or valid_until > valid_from),
  constraint discounts_percent_bounds
    check (discount_type <> 'percent' or discount_value <= 100),
  constraint discounts_rules_is_array
    check (jsonb_typeof(rules) = 'array'),
  constraint discounts_active_days_valid
    check (
      active_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    )
);

-- Audit trail: one row per discount actually applied to an order. Drives both
-- usage_limit and per_customer_limit enforcement.
create table if not exists public.discount_usages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  discount_id uuid not null references public.discounts on delete cascade,
  order_id uuid references public.orders on delete set null,
  customer_id uuid references public.customers on delete set null,
  customer_phone text,
  discount_amount numeric(10, 2) not null,
  used_at timestamptz not null default now()
);

-- Per-discount breakdown of what was applied to an order, e.g.
-- [{ "id": "...", "name": "Bulk order 10%", "type": "percent",
--    "value": 10, "amount": 150 }]
-- `orders.discount_amount` remains the single source of truth for the total so
-- existing bill/analytics code keeps working unchanged.
alter table public.orders
  add column if not exists applied_discounts jsonb not null default '[]'::jsonb;

create index if not exists idx_discounts_tenant_active
  on public.discounts (tenant_id, is_active);
create index if not exists idx_discounts_validity
  on public.discounts (tenant_id, valid_from, valid_until);
create index if not exists idx_discounts_auto_apply
  on public.discounts (tenant_id, auto_apply, is_active);
create index if not exists idx_discount_usages_discount
  on public.discount_usages (discount_id);
create index if not exists idx_discount_usages_order
  on public.discount_usages (order_id);
create index if not exists idx_discount_usages_customer
  on public.discount_usages (tenant_id, customer_phone);

-- Row level security ---------------------------------------------------------

alter table public.discounts enable row level security;
alter table public.discount_usages enable row level security;

drop policy if exists "discounts tenant scoped" on public.discounts;
create policy "discounts tenant scoped" on public.discounts for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = discounts.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = discounts.tenant_id and p.id = auth.uid()
  )
);

drop policy if exists "discount_usages tenant scoped" on public.discount_usages;
create policy "discount_usages tenant scoped" on public.discount_usages for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = discount_usages.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = discount_usages.tenant_id and p.id = auth.uid()
  )
);

-- Atomically log a redemption and bump the counter, so concurrent tills at the
-- same store cannot both slip past the last unit of a usage_limit.
create or replace function public.record_discount_usage(
  p_tenant_id uuid,
  p_discount_id uuid,
  p_order_id uuid,
  p_customer_phone text,
  p_amount numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  if p_customer_phone is not null and length(trim(p_customer_phone)) > 0 then
    select id into v_customer_id
    from public.customers
    where tenant_id = p_tenant_id
      and phone = trim(p_customer_phone)
    limit 1;
  end if;

  insert into public.discount_usages (
    tenant_id, discount_id, order_id, customer_id, customer_phone, discount_amount
  )
  values (
    p_tenant_id,
    p_discount_id,
    p_order_id,
    v_customer_id,
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    p_amount
  );

  update public.discounts
  set usage_count = usage_count + 1,
      updated_at = now()
  where id = p_discount_id
    and tenant_id = p_tenant_id;
end;
$$;

-- How many times a given phone number has already redeemed a discount.
create or replace function public.discount_usage_count_for_customer(
  p_tenant_id uuid,
  p_discount_id uuid,
  p_customer_phone text
)
returns int
language sql
security invoker
set search_path = public
as $$
  select coalesce(count(*), 0)::int
  from public.discount_usages du
  where du.tenant_id = p_tenant_id
    and du.discount_id = p_discount_id
    and du.customer_phone is not null
    and du.customer_phone = nullif(trim(coalesce(p_customer_phone, '')), '');
$$;

grant execute on function public.record_discount_usage(uuid, uuid, uuid, text, numeric) to authenticated;
grant execute on function public.discount_usage_count_for_customer(uuid, uuid, text) to authenticated;
