-- Performance indexes for the hot read paths.
--
-- The core tables (orders, order_items, menu_items, customers, …) shipped with
-- no indexes beyond their primary keys, so every tenant-scoped read was a
-- sequential scan over the whole table. `tenant_id` alone is filtered in ~150
-- queries across the app.
--
-- Two things make the cost worse than it first looks:
--
--   1. Postgres does NOT auto-index foreign keys. order_items.order_id had no
--      index, so opening any order scanned every order item in the database.
--
--   2. Every RLS policy runs
--        exists (select 1 from profile_tenants pt join profiles p …)
--      per row. Without an index on profile_tenants.profile_id that subquery
--      was itself a sequential scan — a scan inside a scan.
--
-- Composite indexes lead with tenant_id because every query filters on it, and
-- a leading-column match lets the same index serve tenant-only lookups too.
--
-- CONCURRENTLY is deliberately not used: Supabase runs migrations in a
-- transaction, which forbids it. These tables are small enough that the brief
-- lock is not a concern; on a very large table, build them by hand instead.

-- ── Orders ──────────────────────────────────────────────────────────────────
-- Order lists, newest first.
create index if not exists idx_orders_tenant_created
  on public.orders (tenant_id, created_at desc);

-- Status filters (pending/completed boards).
create index if not exists idx_orders_tenant_status
  on public.orders (tenant_id, status);

-- Reports, tax summaries, and POS payment matching all range-scan on
-- completed_at for completed orders.
create index if not exists idx_orders_tenant_completed
  on public.orders (tenant_id, completed_at desc)
  where status = 'completed';

-- The POS transaction matcher looks up completed orders by exact amount within
-- a time window; without this it scans every order per transaction.
create index if not exists idx_orders_tenant_total_completed
  on public.orders (tenant_id, total, completed_at)
  where status = 'completed';

-- Customer order history by phone (used by the public /api/orders lookup).
create index if not exists idx_orders_tenant_phone
  on public.orders (tenant_id, customer_phone)
  where customer_phone is not null;

-- ── Order line items ────────────────────────────────────────────────────────
-- Foreign key, unindexed until now: this is the single biggest win for opening
-- an order or printing a bill.
create index if not exists idx_order_items_order
  on public.order_items (order_id);

-- Item-level sales reports group by menu item.
create index if not exists idx_order_items_menu_item
  on public.order_items (menu_item_id);

-- order_item_toppings already has primary key (order_item_id, topping_id),
-- whose leading column covers lookups by order item, so it needs nothing here.

-- ── Menu ────────────────────────────────────────────────────────────────────
create index if not exists idx_menu_items_tenant
  on public.menu_items (tenant_id);

create index if not exists idx_menu_items_category
  on public.menu_items (category_id);

create index if not exists idx_menu_categories_tenant
  on public.menu_categories (tenant_id);

create index if not exists idx_menu_item_variants_item
  on public.menu_item_variants (menu_item_id);

create index if not exists idx_menu_item_toppings_item
  on public.menu_item_toppings (menu_item_id);

create index if not exists idx_menu_item_ingredients_item
  on public.menu_item_ingredients (menu_item_id);

create index if not exists idx_toppings_tenant
  on public.toppings (tenant_id);

-- ── Customers & loyalty ─────────────────────────────────────────────────────
create index if not exists idx_customers_tenant
  on public.customers (tenant_id);

-- Phone is how customers are looked up at the till.
create index if not exists idx_customers_tenant_phone
  on public.customers (tenant_id, phone)
  where phone is not null;

create index if not exists idx_loyalty_profiles_tenant
  on public.loyalty_profiles (tenant_id);

create index if not exists idx_loyalty_transactions_tenant
  on public.loyalty_transactions (tenant_id);

create index if not exists idx_loyalty_transactions_order
  on public.loyalty_transactions (order_id);

-- ── Membership / access ─────────────────────────────────────────────────────
-- profile_tenants' primary key is (tenant_id, profile_id), so lookups by
-- profile alone — every page load, and every RLS check — could not use it.
create index if not exists idx_profile_tenants_profile
  on public.profile_tenants (profile_id);

-- ── Misc tenant-scoped tables ───────────────────────────────────────────────
create index if not exists idx_tables_tenant
  on public.tables (tenant_id);

create index if not exists idx_sop_tenant
  on public.sop (tenant_id);

create index if not exists idx_ingredients_tenant
  on public.ingredients (tenant_id);

-- Keeps the planner's row estimates honest immediately after the indexes land,
-- rather than waiting for autovacuum.
analyze public.orders;
analyze public.order_items;
analyze public.menu_items;
analyze public.customers;
analyze public.profile_tenants;
