alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_item_variants enable row level security;
alter table public.ingredients enable row level security;
alter table public.menu_item_ingredients enable row level security;
alter table public.toppings enable row level security;
alter table public.menu_item_toppings enable row level security;
alter table public.sop enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_toppings enable row level security;
alter table public.tables enable row level security;

-- Tenant-scoped tables (direct tenant_id)
create policy "menu_categories tenant scoped" on public.menu_categories for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = menu_categories.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = menu_categories.tenant_id and p.id = auth.uid()
  )
);

create policy "menu_items tenant scoped" on public.menu_items for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = menu_items.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = menu_items.tenant_id and p.id = auth.uid()
  )
);

create policy "ingredients tenant scoped" on public.ingredients for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = ingredients.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = ingredients.tenant_id and p.id = auth.uid()
  )
);

create policy "toppings tenant scoped" on public.toppings for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = toppings.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = toppings.tenant_id and p.id = auth.uid()
  )
);

create policy "sop tenant scoped" on public.sop for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = sop.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = sop.tenant_id and p.id = auth.uid()
  )
);

create policy "tables tenant scoped" on public.tables for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = tables.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = tables.tenant_id and p.id = auth.uid()
  )
);

create policy "orders tenant scoped" on public.orders for all using (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = orders.tenant_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profile_tenants pt
    join public.profiles p on p.id = pt.profile_id
    where pt.tenant_id = orders.tenant_id and p.id = auth.uid()
  )
);

-- Child tables via menu_items
create policy "menu_item_variants tenant scoped" on public.menu_item_variants for all using (
  exists (
    select 1 from public.menu_items mi
    join public.profile_tenants pt on pt.tenant_id = mi.tenant_id
    join public.profiles p on p.id = pt.profile_id
    where mi.id = menu_item_variants.menu_item_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.menu_items mi
    join public.profile_tenants pt on pt.tenant_id = mi.tenant_id
    join public.profiles p on p.id = pt.profile_id
    where mi.id = menu_item_variants.menu_item_id and p.id = auth.uid()
  )
);

create policy "menu_item_ingredients tenant scoped" on public.menu_item_ingredients for all using (
  exists (
    select 1 from public.menu_items mi
    join public.profile_tenants pt on pt.tenant_id = mi.tenant_id
    join public.profiles p on p.id = pt.profile_id
    where mi.id = menu_item_ingredients.menu_item_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.menu_items mi
    join public.profile_tenants pt on pt.tenant_id = mi.tenant_id
    join public.profiles p on p.id = pt.profile_id
    where mi.id = menu_item_ingredients.menu_item_id and p.id = auth.uid()
  )
);

create policy "menu_item_toppings tenant scoped" on public.menu_item_toppings for all using (
  exists (
    select 1 from public.menu_items mi
    join public.profile_tenants pt on pt.tenant_id = mi.tenant_id
    join public.profiles p on p.id = pt.profile_id
    where mi.id = menu_item_toppings.menu_item_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.menu_items mi
    join public.profile_tenants pt on pt.tenant_id = mi.tenant_id
    join public.profiles p on p.id = pt.profile_id
    where mi.id = menu_item_toppings.menu_item_id and p.id = auth.uid()
  )
);

create policy "order_items tenant scoped" on public.order_items for all using (
  exists (
    select 1 from public.orders o
    join public.profile_tenants pt on pt.tenant_id = o.tenant_id
    join public.profiles p on p.id = pt.profile_id
    where o.id = order_items.order_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.orders o
    join public.profile_tenants pt on pt.tenant_id = o.tenant_id
    join public.profiles p on p.id = pt.profile_id
    where o.id = order_items.order_id and p.id = auth.uid()
  )
);

create policy "order_item_toppings tenant scoped" on public.order_item_toppings for all using (
  exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.profile_tenants pt on pt.tenant_id = o.tenant_id
    join public.profiles p on p.id = pt.profile_id
    where oi.id = order_item_toppings.order_item_id and p.id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.profile_tenants pt on pt.tenant_id = o.tenant_id
    join public.profiles p on p.id = pt.profile_id
    where oi.id = order_item_toppings.order_item_id and p.id = auth.uid()
  )
);
