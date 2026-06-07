create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  name text not null,
  description text,
  position int default 0,
  created_at timestamptz default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  category_id uuid references public.menu_categories on delete cascade,
  name text not null,
  slug text,
  description text,
  base_price numeric(10, 2) not null,
  discount_price numeric(10, 2),
  image_url text,
  is_active boolean default true,
  prep_time_minutes int,
  allergen_info text,
  nutrition jsonb default '{"calories":0,"protein":0,"fat":0,"carbs":0}'::jsonb,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (tenant_id, slug)
);

create table if not exists public.menu_item_variants (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid references public.menu_items on delete cascade,
  name text not null,
  price_modifier numeric(10, 2) default 0,
  is_default boolean default false,
  created_at timestamptz default now()
);

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

create table if not exists public.toppings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) default 0,
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

create table if not exists public.sop (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  menu_item_id uuid references public.menu_items on delete cascade unique,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  table_number text,
  status text not null default 'pending',
  order_type text default 'dine_in',
  customer_name text,
  customer_phone text,
  customer_email text,
  subtotal numeric(10, 2) not null,
  tax numeric(10, 2) default 0,
  discount_amount numeric(10, 2) default 0,
  discount_type text,
  discount_value numeric(10, 2),
  payment_method text,
  total numeric(10, 2) not null,
  notes text,
  metadata jsonb,
  created_by uuid references public.profiles,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

alter table public.loyalty_transactions
  add constraint loyalty_transactions_order_id_fkey
  foreign key (order_id) references public.orders (id) on delete set null;

alter table public.coupon_usages
  add constraint coupon_usages_order_id_fkey
  foreign key (order_id) references public.orders (id) on delete set null;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders on delete cascade,
  menu_item_id uuid references public.menu_items,
  variant_id uuid references public.menu_item_variants,
  name text not null,
  quantity int not null default 1,
  unit_price numeric(10, 2) not null,
  total_price numeric(10, 2) not null,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.order_item_toppings (
  order_item_id uuid references public.order_items on delete cascade,
  topping_id uuid references public.toppings,
  name text not null,
  price numeric(10, 2) not null,
  primary key (order_item_id, topping_id)
);

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  number text not null,
  capacity int default 4,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (tenant_id, number)
);
