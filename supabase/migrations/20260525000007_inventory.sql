create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  name text not null,
  contact_person text,
  email text,
  phone text,
  address jsonb,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  ingredient_id uuid references public.ingredients on delete cascade,
  current_stock numeric(10, 3) not null default 0,
  unit text not null,
  min_stock_level numeric(10, 3) default 0,
  max_stock_level numeric(10, 3),
  location text,
  last_updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (tenant_id, ingredient_id)
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  ingredient_id uuid references public.ingredients on delete cascade,
  transaction_type text not null check (
    transaction_type in (
      'purchase',
      'order_deduction',
      'order_refund',
      'adjustment',
      'waste',
      'transfer'
    )
  ),
  quantity numeric(10, 3) not null,
  unit text not null,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  supplier_id uuid references public.suppliers on delete set null,
  purchase_date date not null default current_date,
  invoice_number text,
  total_amount numeric(10, 2),
  notes text,
  status text default 'completed' check (status in ('pending', 'completed', 'cancelled')),
  created_by uuid references public.profiles (id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references public.purchases on delete cascade,
  ingredient_id uuid references public.ingredients on delete cascade,
  quantity numeric(10, 3) not null,
  unit text not null,
  unit_price numeric(10, 2),
  total_price numeric(10, 2),
  expiry_date date,
  batch_number text,
  created_at timestamptz default now()
);

create index if not exists idx_inventory_tenant_ingredient on public.inventory (tenant_id, ingredient_id);
create index if not exists idx_inventory_transactions_tenant on public.inventory_transactions (tenant_id);
create index if not exists idx_inventory_transactions_reference on public.inventory_transactions (reference_type, reference_id);
create index if not exists idx_purchases_tenant on public.purchases (tenant_id);
create index if not exists idx_purchase_items_purchase on public.purchase_items (purchase_id);
create index if not exists idx_suppliers_tenant on public.suppliers (tenant_id);

alter table public.suppliers enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

create policy "suppliers tenant scoped" on public.suppliers for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = suppliers.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = suppliers.tenant_id and p.id = auth.uid()
  )
);

create policy "inventory tenant scoped" on public.inventory for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = inventory.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = inventory.tenant_id and p.id = auth.uid()
  )
);

create policy "inventory_transactions tenant scoped" on public.inventory_transactions for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = inventory_transactions.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = inventory_transactions.tenant_id and p.id = auth.uid()
  )
);

create policy "purchases tenant scoped" on public.purchases for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = purchases.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = purchases.tenant_id and p.id = auth.uid()
  )
);

create policy "purchase_items tenant scoped" on public.purchase_items for all using (
  exists (
    select 1 from public.purchases pur
    join public.profile_tenants pt on pt.tenant_id = pur.tenant_id
    join public.profiles pf on pf.id = pt.profile_id
    where pur.id = purchase_items.purchase_id and pf.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.purchases pur
    join public.profile_tenants pt on pt.tenant_id = pur.tenant_id
    join public.profiles pf on pf.id = pt.profile_id
    where pur.id = purchase_items.purchase_id and pf.id = auth.uid()
  )
);
