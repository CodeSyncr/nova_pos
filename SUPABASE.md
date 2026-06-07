# Supabase Database Setup

This project expects a Supabase instance with the schema, RLS policies, and helper
functions described below. You can run everything with the Supabase CLI or inside
the dashboard SQL editor.

---

## 1. Prerequisites

```bash
pnpm add -D supabase     # optional – CLI helper
supabase init            # inside repo (if you plan to run migrations locally)
supabase link --project-ref <your-project-ref>
```

Set the following env vars in both `.env.local` (Next.js) and Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-key>   # optional for admin scripts only
```

---

## 2. Core Schema (single `roles` table with optional `tenant_id`)

Paste this SQL into the Supabase SQL editor or save it as a migration:

```sql
-- Extensions ---------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Tenants ------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  logo_url text,
  branding jsonb,            -- { fontFamily, primaryColor, secondaryColor }
  contact jsonb,             -- { phone, email, address { … } }
  social jsonb,              -- { website, instagram, facebook, ... }
  settings jsonb,            -- { locale, currency, timezone, taxRate, ... }
  subscription jsonb,        -- { plan, status, currentPeriodStart, ... }
  timezone text default 'UTC',
  is_active boolean default true,
  onboarding_complete boolean default false,
  created_by uuid references auth.users not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  trial_ends_at timestamptz
);

-- Roles (global templates + tenant-specific RBAC) ---------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  code text not null,
  name text not null,
  description text,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  unique (tenant_id, code)
);

insert into public.roles (tenant_id, code, name, description, permissions)
values
  (null, 'DEFAULT_OWNER',   'Default Owner',   'Applied to new signups', '["*"]'),
  (null, 'DEFAULT_MANAGER', 'Default Manager', 'Manager template',       '{"pos":["*"],"menu":["read","write"]}'),
  (null, 'DEFAULT_WAITER',  'Waiter',          'Waiter template',        '{"pos":["take_orders"],"menu":["read"]}')
on conflict (tenant_id, code) do nothing;

-- Profiles -----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  avatar_url text,
  role_id uuid references public.roles,   -- global role before onboarding
  created_at timestamptz default now()
);

-- Profile ↔ Tenant Link ----------------------------------------------------
create table if not exists public.profile_tenants (
  tenant_id uuid references public.tenants on delete cascade,
  profile_id uuid references public.profiles on delete cascade,
  role_id uuid references public.roles,   -- tenant-specific role once onboarding completes
  joined_at timestamptz default now(),
  primary key (tenant_id, profile_id)
);
```

### Row Level Security

```sql
alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.roles enable row level security;
alter table public.profile_tenants enable row level security;

create policy "profiles readable by owner"
  on public.profiles
  for select using (auth.uid() = id);

create policy "profiles updatable by owner"
  on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "tenants readable by members"
  on public.tenants
  for select using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = tenants.id
        and p.id = auth.uid()
    )
  );

create policy "tenants insertable by authenticated"
  on public.tenants
  for insert with check (auth.role() = 'authenticated');

create policy "profile tenants readable"
  on public.profile_tenants
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = profile_tenants.profile_id
        and p.id = auth.uid()
    )
  );

create policy "tenant roles readable by members"
  on public.roles
  for select using (
    tenant_id is null
    or exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = roles.tenant_id
        and p.id = auth.uid()
    )
  );

create policy "tenant roles insertable after onboarding"
  on public.roles
  for insert with check (
    tenant_id is not null
    and exists (
      select 1
      from public.tenants t
      join public.profile_tenants pt on pt.tenant_id = t.id
      join public.profiles p on p.id = pt.profile_id
      where t.id = roles.tenant_id
        and p.id = auth.uid()
        and t.onboarding_complete = true
    )
  );

create policy "profile tenants insertable after onboarding"
  on public.profile_tenants
  for insert with check (
    exists (
      select 1
      from public.tenants t
      where t.id = profile_tenants.tenant_id
        and t.onboarding_complete = true
        and exists (
          select 1
          from public.profile_tenants existing
          join public.profiles p on p.id = existing.profile_id
          where existing.tenant_id = t.id
            and p.id = auth.uid()
        )
    )
  );
```

---

## 7. Customers & Loyalty Schema

Use these tables to track guests, loyalty points, and reward tiers per tenant.

```sql
-- Customers ---------------------------------------------------------------
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

-- Loyalty tiers (per tenant) ---------------------------------------------
create table if not exists public.loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  name text not null,
  min_points bigint not null default 0,
  benefits jsonb default '{}'::jsonb, -- e.g. { "discount": 0.05 }
  created_at timestamptz default now(),
  unique (tenant_id, name)
);

-- Loyalty profile per customer -------------------------------------------
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

-- Loyalty transactions (earn/redeem/adjust) ------------------------------
create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  customer_id uuid references public.customers on delete cascade,
  order_id uuid references public.orders on delete set null,
  type text not null check (type in ('earn','redeem','adjust')),
  points bigint not null,
  reason text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Tenant-level loyalty settings ------------------------------------------
create table if not exists public.tenant_loyalty_settings (
  tenant_id uuid primary key references public.tenants on delete cascade,
  enabled boolean default true,
  earn_rate numeric(10,4) default 1.0,      -- points per 1 unit of currency
  redeem_rate numeric(10,4) default 1.0,    -- currency value per 1 point
  min_redeem_points bigint default 0,
  expiry_days int,
  auto_enroll boolean default true,
  updated_at timestamptz default now()
);
```

### RLS for Customers & Loyalty

```sql
alter table public.customers enable row level security;
alter table public.loyalty_tiers enable row level security;
alter table public.loyalty_profiles enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.tenant_loyalty_settings enable row level security;

-- Helper expression: tenant membership via profile_tenants
-- Apply the same pattern: user can only see rows for tenants they belong to.

create policy "customers tenant scoped"
  on public.customers
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = customers.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = customers.tenant_id
        and p.id = auth.uid()
    )
  );

create policy "loyalty_tiers tenant scoped"
  on public.loyalty_tiers
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = loyalty_tiers.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = loyalty_tiers.tenant_id
        and p.id = auth.uid()
    )
  );

create policy "loyalty_profiles tenant scoped"
  on public.loyalty_profiles
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = loyalty_profiles.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = loyalty_profiles.tenant_id
        and p.id = auth.uid()
    )
  );

create policy "loyalty_transactions tenant scoped"
  on public.loyalty_transactions
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = loyalty_transactions.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = loyalty_transactions.tenant_id
        and p.id = auth.uid()
    )
  );

create policy "tenant_loyalty_settings tenant scoped"
  on public.tenant_loyalty_settings
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = tenant_loyalty_settings.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = tenant_loyalty_settings.tenant_id
        and p.id = auth.uid()
    )
  );
```

---

## 8. Coupons & Discounts Schema

Use these tables to manage discount coupons with flexible rules and usage tracking.

```sql
-- Coupons / Discount Codes ------------------------------------------------
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  code text not null,
  name text not null,
  description text,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2) not null, -- percentage (0-100) or fixed amount
  min_order_amount numeric(10,2) default 0,
  max_discount_amount numeric(10,2), -- for percent discounts, cap the max discount
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  usage_limit int, -- null = unlimited
  usage_count int default 0,
  per_customer_limit int default 1, -- how many times a single customer can use
  applicable_to text[] default '{}', -- e.g. ['dine_in','takeout','delivery']
  excluded_categories uuid[], -- menu category IDs to exclude
  excluded_items uuid[], -- menu item IDs to exclude
  is_active boolean default true,
  created_by uuid references public.profiles,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, code)
);

-- Coupon usage tracking ------------------------------------------------
create table if not exists public.coupon_usages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  coupon_id uuid references public.coupons on delete cascade,
  order_id uuid references public.orders on delete set null,
  customer_id uuid references public.customers on delete set null,
  discount_amount numeric(10,2) not null,
  used_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_coupons_tenant_code on public.coupons(tenant_id, code);
create index if not exists idx_coupons_valid_dates on public.coupons(tenant_id, valid_from, valid_until);
create index if not exists idx_coupon_usages_coupon on public.coupon_usages(coupon_id);
create index if not exists idx_coupon_usages_customer on public.coupon_usages(tenant_id, customer_id);
```

### RLS for Coupons

```sql
alter table public.coupons enable row level security;
alter table public.coupon_usages enable row level security;

create policy "coupons tenant scoped"
  on public.coupons
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = coupons.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = coupons.tenant_id
        and p.id = auth.uid()
    )
  );

create policy "coupon_usages tenant scoped"
  on public.coupon_usages
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = coupon_usages.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = coupon_usages.tenant_id
        and p.id = auth.uid()
    )
  );
```

---

## 3. Helper Function (tenant + default owner)

```sql
create or replace function public.create_tenant_with_default_owner(
  tenant_name text,
  tenant_timezone text default 'UTC'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  default_role_id uuid;
  new_tenant_id uuid;
  tenant_owner_role_id uuid;
begin
  select id into default_role_id
  from public.roles
  where tenant_id is null
    and code = 'DEFAULT_OWNER';

  insert into public.tenants (name, timezone, created_by)
  values (tenant_name, tenant_timezone, auth.uid())
  returning id into new_tenant_id;

  insert into public.profiles (id, role_id)
  values (auth.uid(), default_role_id)
  on conflict (id) do update set role_id = excluded.role_id;

  insert into public.roles (tenant_id, code, name, permissions)
  values (new_tenant_id, 'OWNER', 'Owner', '["*"]')
  returning id into tenant_owner_role_id;

  insert into public.profile_tenants (tenant_id, profile_id, role_id)
  values (new_tenant_id, auth.uid(), tenant_owner_role_id);

  update public.tenants
  set onboarding_complete = true
  where id = new_tenant_id;

  return new_tenant_id;
end;
$$;

grant execute on function public.create_tenant_with_default_owner(text,text) to authenticated;
```

Call this RPC from your onboarding server action to create the tenant, clone the default owner role, and mark onboarding complete.

---

## 4. Suggested Server Action

```ts
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function onboardTenant(formData: FormData) {
	const supabase = createSupabaseServerClient()
	const name = formData.get('name') as string
	const timezone = formData.get('timezone') as string

	const { data, error } = await supabase.rpc('create_tenant_with_default_owner', {
		tenant_name: name,
		tenant_timezone: timezone
	})

	if (error) {
		throw new Error(error.message)
	}

	return data // tenant id
}
```

---

## 5. Next Steps

1. Run the SQL above in Supabase.  
2. Verify `roles` contains the global `DEFAULT_*` rows.  
3. Wire onboarding UI to call `create_tenant_with_default_owner`.  
4. After onboarding, allow custom role creation by inserting into `roles` with `tenant_id = currentTenantId` and your desired permissions JSON.

That’s it—your Supabase project is ready for tenant-scoped RBAC using a single `roles` table with JSON permissions.

---

## 6. Menu, Ingredients, and SOP Schema

Use the structures below to model complex dishes (e.g. pasta with multiple noodle types, optional toppings, and SOP steps). All rows are scoped by `tenant_id` so each restaurant owns its own catalog.

```sql
-- Categories ---------------------------------------------------------------
create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  name text not null,
  description text,
  position int default 0,
  created_at timestamptz default now()
);

-- Menu Items ---------------------------------------------------------------
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  category_id uuid references public.menu_categories on delete cascade,
  name text not null,
  slug text unique,
  description text,
  base_price numeric(10,2) not null,
  discount_price numeric(10,2),
  image_url text,
  is_active boolean default true,
  prep_time_minutes int,
  allergen_info text,
  nutrition jsonb default '{"calories":0,"protein":0,"fat":0,"carbs":0}'::jsonb,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Variants (e.g. linguine, penne) -----------------------------------------
create table if not exists public.menu_item_variants (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid references public.menu_items on delete cascade,
  name text not null,
  price_modifier numeric(10,2) default 0,
  is_default boolean default false,
  created_at timestamptz default now()
);

-- Ingredients --------------------------------------------------------------
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  name text not null,
  unit text,
  allergen_info text,
  created_at timestamptz default now()
);

create table if not exists public.menu_item_ingredients (
  menu_item_id uuid references public.menu_items on delete cascade,
  ingredient_id uuid references public.ingredients on delete cascade,
  is_required boolean default true,
  quantity numeric,
  sort_order int default 0,
  primary key (menu_item_id, ingredient_id)
);

-- Toppings / Extras --------------------------------------------------------
create table if not exists public.toppings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) default 0,
  category text,
  created_at timestamptz default now()
);

create table if not exists public.menu_item_toppings (
  menu_item_id uuid references public.menu_items on delete cascade,
  topping_id uuid references public.toppings on delete cascade,
  is_optional boolean default true,
  max_quantity int default 1,
  sort_order int default 0,
  primary key (menu_item_id, topping_id)
);

-- SOP (Standard Operating Procedures) ----------------------------------------
create table if not exists public.sop (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  menu_item_id uuid references public.menu_items on delete cascade unique,
  steps jsonb not null default '[]'::jsonb, -- Array of { title, body, step_order, media? }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Orders -------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  table_number text,
  status text not null default 'pending', -- pending, confirmed, preparing, ready, completed, cancelled
  order_type text default 'dine_in', -- dine_in, takeout, delivery
  customer_name text,
  customer_phone text,
  customer_email text,
  subtotal numeric(10,2) not null,
  tax numeric(10,2) default 0,
  discount_amount numeric(10,2) default 0,
  discount_type text, -- 'percent' or 'fixed'
  discount_value numeric(10,2), -- the percentage or fixed amount value
  payment_method text, -- 'cash', 'card', 'upi', 'wallet', 'other' (nullable until order is completed)
  total numeric(10,2) not null,
  notes text,
  created_by uuid references public.profiles,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

-- Migration: Add discount and payment columns if they don't exist
-- Run this if you already have an orders table without these columns:
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' 
                 and table_name = 'orders' 
                 and column_name = 'discount_amount') then
    alter table public.orders 
      add column discount_amount numeric(10,2) default 0;
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' 
                 and table_name = 'orders' 
                 and column_name = 'discount_type') then
    alter table public.orders 
      add column discount_type text;
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' 
                 and table_name = 'orders' 
                 and column_name = 'discount_value') then
    alter table public.orders 
      add column discount_value numeric(10,2);
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' 
                 and table_name = 'orders' 
                 and column_name = 'payment_method') then
    alter table public.orders 
      add column payment_method text;
  end if;
  
  -- Make payment_method nullable if it was created as NOT NULL
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' 
             and table_name = 'orders' 
             and column_name = 'payment_method'
             and is_nullable = 'NO') then
    alter table public.orders 
      alter column payment_method drop not null;
  end if;
  
  -- Add metadata column for storing Firebase IDs and other metadata
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' 
                 and table_name = 'orders' 
                 and column_name = 'metadata') then
    alter table public.orders 
      add column metadata jsonb;
  end if;
end $$;

-- Order Items --------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders on delete cascade,
  menu_item_id uuid references public.menu_items,
  variant_id uuid references public.menu_item_variants,
  name text not null,
  quantity int not null default 1,
  unit_price numeric(10,2) not null,
  total_price numeric(10,2) not null,
  notes text,
  created_at timestamptz default now()
);

-- Order Item Toppings ------------------------------------------------------
create table if not exists public.order_item_toppings (
  order_item_id uuid references public.order_items on delete cascade,
  topping_id uuid references public.toppings,
  name text not null,
  price numeric(10,2) not null,
  primary key (order_item_id, topping_id)
);
```

### Example: Pasta Dish

```sql
-- Category
insert into menu_categories (tenant_id, name, description, position)
values ('<tenant-id>', 'Pasta', 'Hand-crafted pastas', 1)
returning id into _category;

-- Menu item
insert into menu_items (tenant_id, category_id, name, slug, description, base_price, metadata)
values (
  '<tenant-id>',
  _category,
  'Signature Pasta',
  'signature-pasta',
  'Choose your noodle and elevate with premium toppings.',
  14.00,
  '{"spiceLevels":["mild","classic","fiery"]}'
) returning id into _pasta;

-- Variants
insert into menu_item_variants (menu_item_id, name, price_modifier, is_default)
values
  (_pasta, 'Linguine', 0, true),
  (_pasta, 'Penne', 0, false),
  (_pasta, 'Rigatoni', 1.50, false);

-- Ingredients (base recipe)
insert into ingredients (tenant_id, name, unit)
values
  ('<tenant-id>', 'San Marzano Sauce', 'ml'),
  ('<tenant-id>', 'Parmesan', 'g');

-- Toppings (extras chosen during ordering)
insert into toppings (tenant_id, name, description, price, category)
values
  ('<tenant-id>', 'Truffle Oil', 'Finish with aromatic truffle oil', 3.00, 'Finishers'),
  ('<tenant-id>', 'Fire-Roasted Vegetables', 'Seasonal vegetables', 2.50, 'Add-ons'),
  ('<tenant-id>', 'Burrata Crown', 'Fresh burrata sphere', 4.50, 'Premium');

insert into menu_item_toppings (menu_item_id, topping_id, max_quantity)
select _pasta, id, 1 from toppings where tenant_id = '<tenant-id>';

-- SOP
insert into sop (tenant_id, menu_item_id, steps)
values (
  '<tenant-id>',
  _pasta,
  '[
    {"title": "Boil pasta", "body": "Cook selected noodle 8 minutes al dente.", "step_order": 1},
    {"title": "Finish in pan", "body": "Toss with San Marzano sauce + emulsify with butter.", "step_order": 2},
    {"title": "Plate & top", "body": "Add chosen toppings, garnish with basil oil.", "step_order": 3}
  ]'::jsonb
);
```

### RLS Policies

Apply the same pattern used earlier: for each new table, enable RLS and allow access only when `auth.uid()` is linked to the tenant via `profile_tenants`.

```sql
-- Orders RLS
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_toppings enable row level security;

create policy "orders tenant scoped"
  on public.orders
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = orders.tenant_id
        and p.id = auth.uid()
    )
  );

create policy "order_items tenant scoped"
  on public.order_items
  for all using (
    exists (
      select 1
      from public.orders o
      join public.profile_tenants pt on pt.tenant_id = o.tenant_id
      join public.profiles p on p.id = pt.profile_id
      where o.id = order_items.order_id
        and p.id = auth.uid()
    )
  );

create policy "order_item_toppings tenant scoped"
  on public.order_item_toppings
  for all using (
    exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      join public.profile_tenants pt on pt.tenant_id = o.tenant_id
      join public.profiles p on p.id = pt.profile_id
      where oi.id = order_item_toppings.order_item_id
        and p.id = auth.uid()
    )
  );
```

```sql
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_item_variants enable row level security;
alter table public.ingredients enable row level security;
alter table public.menu_item_ingredients enable row level security;
alter table public.toppings enable row level security;
alter table public.menu_item_toppings enable row level security;
alter table public.sop enable row level security;

create policy "tenant scoped menu access"
  on public.menu_items
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = menu_items.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = menu_items.tenant_id
        and p.id = auth.uid()
    )
  );

-- Repeat the same policy body for each new table (swap table name).
```

With this schema, the pasta example can offer multiple noodle types (variants) plus optional toppings during ordering, while SOP steps document prep instructions for kitchen staff.

---

## 9. Inventory Management Schema

This schema enables automatic inventory tracking, stock deduction on orders, stock refund on order cancellation, and purchase management.

```sql
-- Suppliers --------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  name text not null,
  contact_person text,
  email text,
  phone text,
  address jsonb, -- {street, city, state, pincode, country}
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Inventory/Stock --------------------------------------------------------
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  ingredient_id uuid references public.ingredients on delete cascade,
  current_stock numeric(10,3) not null default 0, -- Current available quantity
  unit text not null, -- e.g., 'kg', 'g', 'ml', 'L', 'pieces'
  min_stock_level numeric(10,3) default 0, -- Alert when below this
  max_stock_level numeric(10,3), -- Optional: max capacity
  location text, -- Optional: storage location
  last_updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (tenant_id, ingredient_id)
);

-- Inventory Transactions (Audit Trail) -----------------------------------
create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  ingredient_id uuid references public.ingredients on delete cascade,
  transaction_type text not null check (transaction_type in (
    'purchase',      -- Stock added via purchase
    'order_deduction', -- Stock deducted for order
    'order_refund',   -- Stock refunded when order deleted
    'adjustment',     -- Manual adjustment (correction)
    'waste',         -- Stock wasted/spoiled
    'transfer'       -- Stock transferred between locations
  )),
  quantity numeric(10,3) not null, -- Positive for additions, negative for deductions
  unit text not null,
  reference_type text, -- 'order', 'purchase', 'adjustment', etc.
  reference_id uuid, -- ID of order, purchase, etc.
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Purchases/Stock Receipts -----------------------------------------------
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  supplier_id uuid references public.suppliers on delete set null, -- NULL for local purchases
  purchase_date date not null default current_date,
  invoice_number text,
  total_amount numeric(10,2),
  notes text,
  status text default 'completed' check (status in ('pending', 'completed', 'cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Purchase Items ----------------------------------------------------------
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references public.purchases on delete cascade,
  ingredient_id uuid references public.ingredients on delete cascade,
  quantity numeric(10,3) not null,
  unit text not null,
  unit_price numeric(10,2),
  total_price numeric(10,2),
  expiry_date date, -- Optional: for perishable items
  batch_number text, -- Optional: for tracking batches
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_inventory_tenant_ingredient on public.inventory(tenant_id, ingredient_id);
create index if not exists idx_inventory_transactions_tenant on public.inventory_transactions(tenant_id);
create index if not exists idx_inventory_transactions_reference on public.inventory_transactions(reference_type, reference_id);
create index if not exists idx_purchases_tenant on public.purchases(tenant_id);
create index if not exists idx_purchase_items_purchase on public.purchase_items(purchase_id);
create index if not exists idx_suppliers_tenant on public.suppliers(tenant_id);
```

### RLS Policies for Inventory

```sql
alter table public.suppliers enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

-- Suppliers: Tenant-scoped
create policy "suppliers tenant scoped"
  on public.suppliers
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = suppliers.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = suppliers.tenant_id
        and p.id = auth.uid()
    )
  );

-- Inventory: Tenant-scoped
create policy "inventory tenant scoped"
  on public.inventory
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = inventory.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = inventory.tenant_id
        and p.id = auth.uid()
    )
  );

-- Inventory Transactions: Tenant-scoped
create policy "inventory_transactions tenant scoped"
  on public.inventory_transactions
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = inventory_transactions.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = inventory_transactions.tenant_id
        and p.id = auth.uid()
    )
  );

-- Purchases: Tenant-scoped
create policy "purchases tenant scoped"
  on public.purchases
  for all using (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = purchases.tenant_id
        and p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = purchases.tenant_id
        and p.id = auth.uid()
    )
  );

-- Purchase Items: Tenant-scoped (via purchase)
create policy "purchase_items tenant scoped"
  on public.purchase_items
  for all using (
    exists (
      select 1
      from public.purchases p
      join public.profile_tenants pt on pt.tenant_id = p.tenant_id
      join public.profiles pf on pf.id = pt.profile_id
      where p.id = purchase_items.purchase_id
        and pf.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.purchases p
      join public.profile_tenants pt on pt.tenant_id = p.tenant_id
      join public.profiles pf on pf.id = pt.profile_id
      where p.id = purchase_items.purchase_id
        and pf.id = auth.uid()
    )
  );
```

### Database Functions for Inventory Management

```sql
-- Function: Deduct inventory for an order
create or replace function public.deduct_inventory_for_order(
  p_order_id uuid
) returns void as $$
declare
  v_tenant_id uuid;
  v_order_item record;
  v_menu_item_ingredient record;
  v_deduction_amount numeric(10,3);
  v_current_stock numeric(10,3);
  v_ingredient_unit text;
begin
  -- Get tenant_id from order
  select tenant_id into v_tenant_id
  from public.orders
  where id = p_order_id;

  if v_tenant_id is null then
    raise exception 'Order not found';
  end if;

  -- Loop through all order items
  for v_order_item in
    select oi.id, oi.menu_item_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    -- Loop through all ingredients for this menu item
    for v_menu_item_ingredient in
      select mii.ingredient_id, mii.quantity as recipe_quantity, i.unit
      from public.menu_item_ingredients mii
      join public.ingredients i on i.id = mii.ingredient_id
      where mii.menu_item_id = v_order_item.menu_item_id
    loop
      -- Calculate deduction amount
      v_deduction_amount := v_menu_item_ingredient.recipe_quantity * v_order_item.quantity;
      v_ingredient_unit := v_menu_item_ingredient.unit;

      -- Get or create inventory record
      insert into public.inventory (tenant_id, ingredient_id, current_stock, unit)
      values (v_tenant_id, v_menu_item_ingredient.ingredient_id, 0, v_ingredient_unit)
      on conflict (tenant_id, ingredient_id) do nothing;

      -- Get current stock
      select current_stock into v_current_stock
      from public.inventory
      where tenant_id = v_tenant_id
        and ingredient_id = v_menu_item_ingredient.ingredient_id;

      -- Deduct stock
      update public.inventory
      set current_stock = current_stock - v_deduction_amount,
          last_updated_at = now()
      where tenant_id = v_tenant_id
        and ingredient_id = v_menu_item_ingredient.ingredient_id;

      -- Create transaction record
      insert into public.inventory_transactions (
        tenant_id,
        ingredient_id,
        transaction_type,
        quantity,
        unit,
        reference_type,
        reference_id
      )
      values (
        v_tenant_id,
        v_menu_item_ingredient.ingredient_id,
        'order_deduction',
        -v_deduction_amount, -- Negative for deduction
        v_ingredient_unit,
        'order',
        p_order_id
      );
    end loop;
  end loop;
end;
$$ language plpgsql security definer;

-- Function: Refund inventory for a cancelled/deleted order
create or replace function public.refund_inventory_for_order(
  p_order_id uuid
) returns void as $$
declare
  v_tenant_id uuid;
  v_transaction record;
  v_current_stock numeric(10,3);
begin
  -- Get tenant_id from order
  select tenant_id into v_tenant_id
  from public.orders
  where id = p_order_id;

  if v_tenant_id is null then
    raise exception 'Order not found';
  end if;

  -- Loop through all deduction transactions for this order
  for v_transaction in
    select it.id, it.ingredient_id, it.quantity, it.unit
    from public.inventory_transactions it
    where it.reference_type = 'order'
      and it.reference_id = p_order_id
      and it.transaction_type = 'order_deduction'
  loop
    -- Refund the stock (add back the absolute value)
    update public.inventory
    set current_stock = current_stock + abs(v_transaction.quantity),
        last_updated_at = now()
    where tenant_id = v_tenant_id
      and ingredient_id = v_transaction.ingredient_id;

    -- Create refund transaction
    insert into public.inventory_transactions (
      tenant_id,
      ingredient_id,
      transaction_type,
      quantity,
      unit,
      reference_type,
      reference_id
    )
    values (
      v_tenant_id,
      v_transaction.ingredient_id,
      'order_refund',
      abs(v_transaction.quantity), -- Positive for refund
      v_transaction.unit,
      'order',
      p_order_id
    );
  end loop;
end;
$$ language plpgsql security definer;

-- Function: Add stock from purchase
create or replace function public.add_stock_from_purchase(
  p_purchase_id uuid
) returns void as $$
declare
  v_tenant_id uuid;
  v_purchase_item record;
  v_current_stock numeric(10,3);
begin
  -- Get tenant_id from purchase
  select tenant_id into v_tenant_id
  from public.purchases
  where id = p_purchase_id;

  if v_tenant_id is null then
    raise exception 'Purchase not found';
  end if;

  -- Loop through all purchase items
  for v_purchase_item in
    select pi.ingredient_id, pi.quantity, pi.unit
    from public.purchase_items pi
    where pi.purchase_id = p_purchase_id
  loop
    -- Get or create inventory record
    insert into public.inventory (tenant_id, ingredient_id, current_stock, unit)
    values (v_tenant_id, v_purchase_item.ingredient_id, 0, v_purchase_item.unit)
    on conflict (tenant_id, ingredient_id) do nothing;

    -- Get current stock
    select current_stock into v_current_stock
    from public.inventory
    where tenant_id = v_tenant_id
      and ingredient_id = v_purchase_item.ingredient_id;

    -- Add stock
    update public.inventory
    set current_stock = current_stock + v_purchase_item.quantity,
        last_updated_at = now()
    where tenant_id = v_tenant_id
      and ingredient_id = v_purchase_item.ingredient_id;

    -- Create transaction record
    insert into public.inventory_transactions (
      tenant_id,
      ingredient_id,
      transaction_type,
      quantity,
      unit,
      reference_type,
      reference_id
    )
    values (
      v_tenant_id,
      v_purchase_item.ingredient_id,
      'purchase',
      v_purchase_item.quantity, -- Positive for addition
      v_purchase_item.unit,
      'purchase',
      p_purchase_id
    );
  end loop;
end;
$$ language plpgsql security definer;

-- Grant execute permissions
grant execute on function public.deduct_inventory_for_order(uuid) to authenticated;
grant execute on function public.refund_inventory_for_order(uuid) to authenticated;
grant execute on function public.add_stock_from_purchase(uuid) to authenticated;
```

### Initialize Inventory for Existing Ingredients

```sql
-- Initialize inventory records for all existing ingredients
-- This sets current_stock to 0 for all ingredients that don't have inventory records yet
insert into public.inventory (tenant_id, ingredient_id, current_stock, unit)
select i.tenant_id, i.id, 0, coalesce(i.unit, 'pieces')
from public.ingredients i
where not exists (
  select 1
  from public.inventory inv
  where inv.tenant_id = i.tenant_id
    and inv.ingredient_id = i.id
);
```

This schema provides:
- Automatic stock deduction when orders are created
- Automatic stock refund when orders are cancelled/deleted
- Purchase management with supplier tracking
- Complete audit trail of all inventory movements
- Low stock level tracking
- Support for local purchases (no supplier required)

