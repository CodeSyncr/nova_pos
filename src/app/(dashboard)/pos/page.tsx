import { redirect } from 'next/navigation'
import { createSupabaseServerComponentClient } from '@/lib/supabase/server'
import { POSInterface } from '@/components/pos/pos-interface'
import type { DiscountRecord } from '@/lib/discount-engine'

type TenantRecord = {
	id: string
	name: string
	branding: Record<string, unknown> | null
	settings: Record<string, unknown> | null
}

type ProfileTenantRow = {
	tenant_id: string
	tenant: TenantRecord | null
}

export default async function POSPage() {
	const supabase = await createSupabaseServerComponentClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		redirect('/login')
	}

	const { data: pts } = await supabase
		.from('profile_tenants')
		.select(
			`
        tenant_id,
        tenant:tenant_id (
          id,
          name,
          branding,
          settings
        )
      `
		)
		.eq('profile_id', user.id)
		.limit(1)

	const data = pts && pts.length > 0 ? pts[0] : null
	const tenantData = Array.isArray(data?.tenant) ? data.tenant[0] : data?.tenant
	const tenant = tenantData as unknown as TenantRecord | null

	if (!tenant) {
		redirect('/tenant')
	}

	const { data: categories } = await supabase
		.from('menu_categories')
		.select(
			`
        id,
        name,
        description,
        position,
        menu_items (
          id,
          name,
          description,
          base_price,
          image_url,
          is_active,
          menu_item_variants ( id, name, price_modifier, is_default ),
          menu_item_toppings (
            topping: topping_id ( id, name, price, description )
          )
        )
      `
		)
		.eq('tenant_id', tenant.id)
		.eq('menu_items.is_active', true)
		.order('position', { ascending: true })

	const { data: toppings } = await supabase
		.from('toppings')
		.select('id, name, price, description, category')
		.eq('tenant_id', tenant.id)

	// Rule-based discounts for the auto-apply preview in the cart. Narrowed to
	// rows that are switched on and inside their validity window; the engine
	// re-checks day/time windows, usage caps and rules on every cart change.
	const nowIso = new Date().toISOString()
	const { data: discounts } = await supabase
		.from('discounts')
		.select(
			`
        id,
        name,
        description,
        discount_type,
        discount_value,
        max_discount_amount,
        rules,
        rule_match,
        auto_apply,
        priority,
        is_stackable,
        stackable_with_coupons,
        valid_from,
        valid_until,
        active_days,
        start_time,
        end_time,
        usage_limit,
        usage_count,
        per_customer_limit,
        is_active
      `
		)
		.eq('tenant_id', tenant.id)
		.eq('is_active', true)
		.lte('valid_from', nowIso)
		.or(`valid_until.is.null,valid_until.gte.${nowIso}`)
		.order('priority', { ascending: false })

	const currencySymbol =
		((tenant.settings?.currencySymbol as string) ?? '₹') || '₹'
	const taxRate = ((tenant.settings?.taxRate as number) ?? 0) || 0
	const timeZone = (tenant.settings?.timezone as string | undefined) ?? null

	return (
		<POSInterface
			categories={categories ?? []}
			tenant={tenant}
			currencySymbol={currencySymbol}
			taxRate={taxRate}
			toppings={toppings ?? []}
			discounts={(discounts ?? []) as unknown as DiscountRecord[]}
			timeZone={timeZone}
		/>
	)
}
