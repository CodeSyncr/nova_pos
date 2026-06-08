import { redirect } from 'next/navigation'
import { createSupabaseServerComponentClient } from '@/lib/supabase/server'
import { POSInterface } from '@/components/pos/pos-interface'
import { SubscriptionGuard } from '@/components/subscription-guard'

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

	const { data, error } = await supabase
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
		.single<ProfileTenantRow>()

	const tenant = data?.tenant ?? null

	if (error || !tenant) {
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

	const currencySymbol =
		((tenant.settings?.currencySymbol as string) ?? '₹') || '₹'
	const taxRate = ((tenant.settings?.taxRate as number) ?? 0) || 0

	return (
		<SubscriptionGuard>
			<POSInterface
				categories={categories ?? []}
				tenant={tenant}
				currencySymbol={currencySymbol}
				taxRate={taxRate}
				toppings={toppings ?? []}
			/>
		</SubscriptionGuard>
	)
}
