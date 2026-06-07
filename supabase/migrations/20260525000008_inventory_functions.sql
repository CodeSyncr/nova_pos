create or replace function public.deduct_inventory_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_order_item record;
  v_menu_item_ingredient record;
  v_deduction_amount numeric(10, 3);
  v_ingredient_unit text;
begin
  select tenant_id into v_tenant_id from public.orders where id = p_order_id;
  if v_tenant_id is null then
    raise exception 'Order not found';
  end if;

  for v_order_item in
    select oi.id, oi.menu_item_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    for v_menu_item_ingredient in
      select mii.ingredient_id, mii.quantity as recipe_quantity, i.unit
      from public.menu_item_ingredients mii
      join public.ingredients i on i.id = mii.ingredient_id
      where mii.menu_item_id = v_order_item.menu_item_id
    loop
      v_deduction_amount := v_menu_item_ingredient.recipe_quantity * v_order_item.quantity;
      v_ingredient_unit := v_menu_item_ingredient.unit;

      insert into public.inventory (tenant_id, ingredient_id, current_stock, unit)
      values (v_tenant_id, v_menu_item_ingredient.ingredient_id, 0, v_ingredient_unit)
      on conflict (tenant_id, ingredient_id) do nothing;

      update public.inventory
      set current_stock = current_stock - v_deduction_amount,
          last_updated_at = now()
      where tenant_id = v_tenant_id
        and ingredient_id = v_menu_item_ingredient.ingredient_id;

      insert into public.inventory_transactions (
        tenant_id, ingredient_id, transaction_type, quantity, unit, reference_type, reference_id
      )
      values (
        v_tenant_id,
        v_menu_item_ingredient.ingredient_id,
        'order_deduction',
        -v_deduction_amount,
        v_ingredient_unit,
        'order',
        p_order_id
      );
    end loop;
  end loop;
end;
$$;

create or replace function public.refund_inventory_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_transaction record;
begin
  select tenant_id into v_tenant_id from public.orders where id = p_order_id;
  if v_tenant_id is null then
    raise exception 'Order not found';
  end if;

  for v_transaction in
    select it.ingredient_id, it.quantity, it.unit
    from public.inventory_transactions it
    where it.reference_type = 'order'
      and it.reference_id = p_order_id
      and it.transaction_type = 'order_deduction'
  loop
    update public.inventory
    set current_stock = current_stock + abs(v_transaction.quantity),
        last_updated_at = now()
    where tenant_id = v_tenant_id and ingredient_id = v_transaction.ingredient_id;

    insert into public.inventory_transactions (
      tenant_id, ingredient_id, transaction_type, quantity, unit, reference_type, reference_id
    )
    values (
      v_tenant_id,
      v_transaction.ingredient_id,
      'order_refund',
      abs(v_transaction.quantity),
      v_transaction.unit,
      'order',
      p_order_id
    );
  end loop;
end;
$$;

create or replace function public.add_stock_from_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_purchase_item record;
begin
  select tenant_id into v_tenant_id from public.purchases where id = p_purchase_id;
  if v_tenant_id is null then
    raise exception 'Purchase not found';
  end if;

  for v_purchase_item in
    select pi.ingredient_id, pi.quantity, pi.unit
    from public.purchase_items pi
    where pi.purchase_id = p_purchase_id
  loop
    insert into public.inventory (tenant_id, ingredient_id, current_stock, unit)
    values (v_tenant_id, v_purchase_item.ingredient_id, 0, v_purchase_item.unit)
    on conflict (tenant_id, ingredient_id) do nothing;

    update public.inventory
    set current_stock = current_stock + v_purchase_item.quantity,
        last_updated_at = now()
    where tenant_id = v_tenant_id and ingredient_id = v_purchase_item.ingredient_id;

    insert into public.inventory_transactions (
      tenant_id, ingredient_id, transaction_type, quantity, unit, reference_type, reference_id
    )
    values (
      v_tenant_id,
      v_purchase_item.ingredient_id,
      'purchase',
      v_purchase_item.quantity,
      v_purchase_item.unit,
      'purchase',
      p_purchase_id
    );
  end loop;
end;
$$;

grant execute on function public.deduct_inventory_for_order(uuid) to authenticated;
grant execute on function public.refund_inventory_for_order(uuid) to authenticated;
grant execute on function public.add_stock_from_purchase(uuid) to authenticated;
