create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  full_name text not null,
  phone text,
  email text,
  tags text[] default '{}',
  notes text,
  birthday date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, phone),
  unique (tenant_id, email)
);

create table if not exists public.loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  name text not null,
  min_points bigint not null default 0,
  benefits jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (tenant_id, name)
);

create table if not exists public.loyalty_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  customer_id uuid references public.customers on delete cascade,
  points_balance bigint not null default 0,
  tier_id uuid references public.loyalty_tiers,
  joined_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, customer_id)
);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  customer_id uuid references public.customers on delete cascade,
  order_id uuid,
  type text not null check (type in ('earn', 'redeem', 'adjust')),
  points bigint not null,
  reason text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.tenant_loyalty_settings (
  tenant_id uuid primary key references public.tenants on delete cascade,
  enabled boolean default true,
  earn_rate numeric(10, 4) default 1.0,
  redeem_rate numeric(10, 4) default 1.0,
  min_redeem_points bigint default 0,
  expiry_days int,
  auto_enroll boolean default true,
  updated_at timestamptz default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  code text not null,
  name text not null,
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10, 2) not null,
  min_order_amount numeric(10, 2) default 0,
  max_discount_amount numeric(10, 2),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  usage_limit int,
  usage_count int default 0,
  per_customer_limit int default 1,
  applicable_to text[] default '{}',
  excluded_categories uuid[],
  excluded_items uuid[],
  is_active boolean default true,
  created_by uuid references public.profiles,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, code)
);

create table if not exists public.coupon_usages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  coupon_id uuid references public.coupons on delete cascade,
  order_id uuid,
  customer_id uuid references public.customers on delete set null,
  discount_amount numeric(10, 2) not null,
  used_at timestamptz default now()
);

create index if not exists idx_coupons_tenant_code on public.coupons (tenant_id, code);
create index if not exists idx_coupons_valid_dates on public.coupons (tenant_id, valid_from, valid_until);
create index if not exists idx_coupon_usages_coupon on public.coupon_usages (coupon_id);
create index if not exists idx_coupon_usages_customer on public.coupon_usages (tenant_id, customer_id);

alter table public.customers enable row level security;
alter table public.loyalty_tiers enable row level security;
alter table public.loyalty_profiles enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.tenant_loyalty_settings enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_usages enable row level security;

create policy "customers tenant scoped" on public.customers for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = customers.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = customers.tenant_id and p.id = auth.uid()
  )
);

create policy "loyalty_tiers tenant scoped" on public.loyalty_tiers for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = loyalty_tiers.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = loyalty_tiers.tenant_id and p.id = auth.uid()
  )
);

create policy "loyalty_profiles tenant scoped" on public.loyalty_profiles for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = loyalty_profiles.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = loyalty_profiles.tenant_id and p.id = auth.uid()
  )
);

create policy "loyalty_transactions tenant scoped" on public.loyalty_transactions for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = loyalty_transactions.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = loyalty_transactions.tenant_id and p.id = auth.uid()
  )
);

create policy "tenant_loyalty_settings tenant scoped" on public.tenant_loyalty_settings for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = tenant_loyalty_settings.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = tenant_loyalty_settings.tenant_id and p.id = auth.uid()
  )
);

create policy "coupons tenant scoped" on public.coupons for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = coupons.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = coupons.tenant_id and p.id = auth.uid()
  )
);

create policy "coupon_usages tenant scoped" on public.coupon_usages for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = coupon_usages.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = coupon_usages.tenant_id and p.id = auth.uid()
  )
);
