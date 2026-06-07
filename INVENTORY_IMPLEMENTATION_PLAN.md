# Inventory Management System - Implementation Plan

## Overview
Implement a comprehensive inventory management system that automatically tracks stock levels, deducts inventory on order creation, refills on order deletion, and allows manual stock management through purchases.

## Current State Analysis

### Existing Tables
- ✅ `ingredients` - Stores ingredient definitions (name, unit, allergen_info)
- ✅ `menu_item_ingredients` - Links menu items to ingredients with `quantity`
- ✅ `orders` - Order records
- ✅ `order_items` - Order line items with `menu_item_id` and `quantity`

### Missing Components
- ❌ Inventory/Stock tracking table
- ❌ Purchase/Stock Receipts table
- ❌ Inventory Transactions (audit trail)
- ❌ Suppliers table
- ❌ Auto-deduction logic
- ❌ Stock refill on order deletion
- ❌ Low stock alerts
- ❌ Purchase management UI

---

## Database Schema Design

### 1. Suppliers Table
```sql
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
```

**Purpose**: Store supplier information (optional - can be null for local purchases)

---

### 2. Inventory/Stock Table
```sql
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
```

**Purpose**: Track current stock levels for each ingredient per tenant

---

### 3. Inventory Transactions Table (Audit Trail)
```sql
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
```

**Purpose**: Complete audit trail of all inventory movements

---

### 4. Purchases/Stock Receipts Table
```sql
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
```

**Purpose**: Track purchase orders/receipts

---

### 5. Purchase Items Table
```sql
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
```

**Purpose**: Line items for each purchase

---

## Business Logic Flow

### 1. Order Creation → Auto-Deduct Inventory

**Trigger**: When an order is created with status 'pending' or 'confirmed'

**Process**:
1. For each `order_item`:
   - Get `menu_item_id` and `quantity`
   - Find all `menu_item_ingredients` for this menu item
   - For each ingredient:
     - Calculate: `deduction = menu_item_ingredients.quantity * order_item.quantity`
     - Check if sufficient stock exists
     - Deduct from `inventory.current_stock`
     - Create `inventory_transaction` with type 'order_deduction'
     - Link transaction to order via `reference_id`

**Implementation**: Server action or database trigger

---

### 2. Order Deletion → Refill Inventory

**Trigger**: When an order is deleted or status changed to 'cancelled'

**Process**:
1. Find all `inventory_transactions` linked to this order (type = 'order_deduction')
2. For each transaction:
   - Add quantity back to `inventory.current_stock`
   - Create new `inventory_transaction` with type 'order_refund'
   - Link to original order via `reference_id`

**Implementation**: Server action with transaction reversal

---

### 3. Purchase Creation → Add Stock

**Trigger**: When a purchase is created/completed

**Process**:
1. For each `purchase_item`:
   - Add `quantity` to `inventory.current_stock` for the ingredient
   - Create `inventory_transaction` with type 'purchase'
   - Link to purchase via `reference_id`

**Implementation**: Server action

---

### 4. Low Stock Alerts

**Trigger**: When `inventory.current_stock <= inventory.min_stock_level`

**Process**:
- Display alerts in dashboard
- Show in inventory management page
- Optional: Email notifications

---

## UI Components Needed

### 1. Inventory Management Page (`/inventory`)
- **Stock Overview**: Table showing all ingredients with current stock, unit, min/max levels
- **Low Stock Alerts**: Highlighted items below min level
- **Stock History**: View inventory transactions
- **Manual Adjustment**: Add/remove stock manually (creates adjustment transaction)

### 2. Purchases Management Page (`/purchases`)
- **Purchase List**: All purchases with supplier, date, total
- **Create Purchase**: Form to add new purchase
  - Select supplier (or "Local Purchase")
  - Add items (ingredient, quantity, unit price)
  - Calculate total
  - Save and update inventory
- **Purchase Details**: View purchase items and transactions

### 3. Suppliers Management (`/suppliers` or in Settings)
- **Supplier List**: All suppliers
- **Add/Edit Supplier**: Form with contact details
- **Link to Purchases**: Show purchase history per supplier

### 4. Dashboard Integration
- **Low Stock Widget**: Show items below min level
- **Recent Purchases**: Last 5 purchases
- **Stock Value**: Total inventory value (if unit prices tracked)

---

## Database Functions/Triggers

### Function: `deduct_inventory_for_order(order_id uuid)`
- Called when order is created
- Loops through order_items
- Deducts stock for each ingredient
- Creates transactions
- Returns success/error

### Function: `refund_inventory_for_order(order_id uuid)`
- Called when order is deleted/cancelled
- Reverses all deductions for that order
- Creates refund transactions

### Function: `add_stock_from_purchase(purchase_id uuid)`
- Called when purchase is completed
- Adds stock for each purchase_item
- Creates purchase transactions

---

## RLS Policies

All new tables need RLS policies:
- `inventory`: Tenant-scoped (users can only see their tenant's inventory)
- `inventory_transactions`: Tenant-scoped
- `purchases`: Tenant-scoped
- `purchase_items`: Tenant-scoped (via purchase)
- `suppliers`: Tenant-scoped

---

## Migration Strategy

### Phase 1: Database Setup
1. Create all new tables
2. Add RLS policies
3. Create database functions
4. Initialize inventory for existing ingredients (set current_stock = 0)

### Phase 2: Backend Logic
1. Create server actions for:
   - `deductInventoryForOrder(orderId)`
   - `refundInventoryForOrder(orderId)`
   - `createPurchase(purchaseData)`
   - `adjustInventory(ingredientId, quantity, reason)`
   - `getInventory(tenantId)`
   - `getLowStockItems(tenantId)`

2. Update `createOrder` action to call `deductInventoryForOrder`
3. Update order deletion to call `refundInventoryForOrder`

### Phase 3: UI Implementation
1. Inventory management page
2. Purchases management page
3. Suppliers management (in settings or separate page)
4. Dashboard widgets
5. Low stock alerts

### Phase 4: Testing & Refinement
1. Test order creation → stock deduction
2. Test order deletion → stock refund
3. Test purchase creation → stock addition
4. Test low stock alerts
5. Test edge cases (insufficient stock, negative stock, etc.)

---

## Edge Cases to Handle

1. **Insufficient Stock**: 
   - Check before deducting
   - Show warning/error if stock insufficient
   - Option: Allow negative stock with alert

2. **Order Modification**:
   - If order items change, recalculate deductions
   - Refund old quantities, deduct new quantities

3. **Partial Order Cancellation**:
   - If only some items cancelled, refund only those items

4. **Unit Mismatches**:
   - Ensure ingredient unit matches inventory unit
   - Handle conversions if needed (e.g., kg to g)

5. **Concurrent Updates**:
   - Use database transactions to prevent race conditions
   - Lock inventory rows during updates

---

## Additional Features (Future Enhancements)

1. **Stock Valuation**: Track cost per unit, calculate total inventory value
2. **Expiry Tracking**: Alert when items near expiry date
3. **Batch Tracking**: Track specific batches for recalls
4. **Multi-Location**: Support multiple storage locations
5. **Stock Transfers**: Move stock between locations
6. **Waste Tracking**: Record spoiled/wasted items
7. **Reorder Points**: Auto-suggest when to reorder
8. **Supplier Performance**: Track delivery times, quality
9. **Purchase Orders**: Create POs before receiving stock
10. **Inventory Reports**: Stock levels, movements, valuation over time

---

## File Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── inventory/
│   │   │   └── page.tsx          # Inventory management page
│   │   └── purchases/
│   │       └── page.tsx           # Purchases management page
│   └── actions/
│       ├── inventory.ts          # Inventory server actions
│       └── purchases.ts          # Purchase server actions
├── components/
│   ├── inventory/
│   │   ├── inventory-table.tsx
│   │   ├── stock-adjustment-form.tsx
│   │   └── low-stock-alert.tsx
│   └── purchases/
│       ├── purchase-form.tsx
│       ├── purchase-list.tsx
│       └── purchase-item-form.tsx
└── lib/
    └── inventory-calculations.ts  # Helper functions
```

---

## Next Steps

1. **Review this plan** - Confirm requirements and approach
2. **Create database schema** - Add SQL to SUPABASE.md
3. **Implement backend logic** - Server actions and database functions
4. **Build UI components** - Inventory and purchase management pages
5. **Integrate with orders** - Auto-deduction and refund logic
6. **Add dashboard widgets** - Low stock alerts and overview
7. **Test thoroughly** - All flows and edge cases

---

## Questions to Consider

1. Should we allow negative stock (backorders)?
2. Do we need to track cost per unit for inventory valuation?
3. Should purchases require approval workflow?
4. Do we need expiry date tracking for all items or just perishables?
5. Should we support unit conversions (e.g., 1kg = 1000g)?
6. Do we need multi-currency support for purchases?

---

**Ready to proceed?** Let me know if you want any changes to this plan before implementation!

