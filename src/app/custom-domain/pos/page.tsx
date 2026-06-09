import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerComponentClient } from '@/lib/supabase/server'
import { POSInterface } from '@/components/pos/pos-interface'
import { CustomDomainLogin } from '@/components/pos/custom-domain-login'
import { LogOutButton } from '@/components/pos/log-out-button'
import { ShieldAlert } from 'lucide-react'

export const dynamic = 'force-dynamic'

type TenantRecord = {
	id: string
	name: string
	logo_url: string | null
	branding: Record<string, unknown> | null
	settings: Record<string, unknown> | null
}

export default async function CustomDomainPOSPage() {
	const headersList = await headers()
	const tenantId = headersList.get('x-tenant-id')

	if (!tenantId) {
		notFound()
	}

	// 1. Fetch Tenant details
	const supabaseAdmin = createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
	)

	const { data: tenant } = await supabaseAdmin
		.from('tenants')
		.select('id, name, logo_url, branding, settings')
		.eq('id', tenantId)
		.maybeSingle<TenantRecord>()

	if (!tenant) {
		notFound()
	}

	// 2. Fetch User session
	const supabaseServer = await createSupabaseServerComponentClient()
	const {
		data: { user }
	} = await supabaseServer.auth.getUser()

	// 3. Unauthenticated -> Show login UI
	if (!user) {
		return <CustomDomainLogin tenant={tenant} />
	}

	// 4. Authenticated -> Check profile access
	const { data: profileTenant } = await supabaseServer
		.from('profile_tenants')
		.select('tenant_id')
		.eq('profile_id', user.id)
		.eq('tenant_id', tenantId)
		.maybeSingle()

	if (!profileTenant) {
		// User is logged in but has no permission to manage this specific tenant
		const primaryColor = (tenant.branding?.primaryColor as string) || '#E0342A'
		return (
			<div className="relative min-h-screen bg-black text-white flex items-center justify-center px-6">
				<div className="w-full max-w-md rounded-[32px] border border-red-500/20 bg-red-500/5 p-8 backdrop-blur-2xl text-center space-y-6">
					<div className="mx-auto h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20 text-red-400">
						<ShieldAlert className="h-8 w-8" />
					</div>
					<h2 className="text-2xl font-bold tracking-tight">Access Denied</h2>
					<p className="text-white/60 text-sm">
						Your account <strong className="text-white">{user.email}</strong> is not registered as staff at{' '}
						<strong>{tenant.name}</strong>.
					</p>
					<div className="pt-4 flex flex-col gap-2">
						<LogOutButton primaryColor={primaryColor} />
					</div>
				</div>
			</div>
		)
	}

	// 5. Authorized -> Fetch menu categories & items
	const { data: categories } = await supabaseServer
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
		.eq('tenant_id', tenantId)
		.eq('menu_items.is_active', true)
		.order('position', { ascending: true })

	const { data: toppings } = await supabaseServer
		.from('toppings')
		.select('id, name, price, description, category')
		.eq('tenant_id', tenant.id)

	const currencySymbol =
		((tenant.settings?.currencySymbol as string) ?? '₹') || '₹'
	const taxRate = ((tenant.settings?.taxRate as number) ?? 0) || 0

	// 6. Render POSInterface
	return (
		<POSInterface
			categories={categories ?? []}
			tenant={tenant}
			currencySymbol={currencySymbol}
			taxRate={taxRate}
			toppings={toppings ?? []}
		/>
	)
}
