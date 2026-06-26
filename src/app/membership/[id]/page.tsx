import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import {
	MembershipCardPortal,
	type CustomerData,
	type LoyaltyProfile,
	type LoyaltyTransaction,
	type TenantData
} from '@/components/membership/membership-card-portal'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface PageProps {
	params: Promise<{
		id: string
	}>
}

export default async function MembershipPage({ params }: PageProps) {
	const { id } = await params

	if (!id) {
		notFound()
	}

	// Instantiate Supabase Admin Client to query data bypassing client RLS policies safely
	const supabase = createClient(supabaseUrl, supabaseServiceKey, {
		auth: {
			persistSession: false,
			autoRefreshToken: false
		}
	})

	// 1. Fetch customer details
	const { data: customer, error: customerError } = await supabase
		.from('customers')
		.select('id, tenant_id, full_name, phone, email, created_at')
		.eq('id', id)
		.single()

	if (customerError || !customer) {
		console.error('[Membership Portal] Customer not found:', id, customerError)
		notFound()
	}

	const tenantId = customer.tenant_id

	// 1.5 Fetch all loyalty tiers for point milestone calculators and dynamic mapping
	const { data: allTiers } = await supabase
		.from('loyalty_tiers')
		.select('id, name, min_points, benefits')
		.eq('tenant_id', tenantId)
		.order('min_points', { ascending: true })

	// 2. Fetch loyalty profile
	const { data: loyalty, error: loyaltyError } = await supabase
		.from('loyalty_profiles')
		.select(`
			points_balance,
			joined_at
		`)
		.eq('customer_id', id)
		.maybeSingle()

	if (loyaltyError) {
		console.warn('[Membership Portal] Failed to read loyalty profile:', loyaltyError)
	}

	// Dynamically determine current tier based on point balance
	const pointsBalance = loyalty?.points_balance ?? 0
	const sortedTiers = [...(allTiers || [])].sort((a, b) => b.min_points - a.min_points)
	const matchedTier = sortedTiers.find(t => pointsBalance >= t.min_points)

	// Fallback to a standard Classic profile if points are below lowest tier points requirement
	const activeLoyalty: LoyaltyProfile = {
		points_balance: pointsBalance,
		joined_at: loyalty?.joined_at ?? customer.created_at,
		loyalty_tiers: matchedTier
			? {
					id: matchedTier.id,
					name: matchedTier.name,
					min_points: matchedTier.min_points,
					benefits: matchedTier.benefits || {}
				}
			: {
					id: null,
					name: 'Classic',
					min_points: 0,
					benefits: {}
				}
	}

	// 3. Fetch recent points transactions (up to last 8 items)
	const { data: transactions } = await supabase
		.from('loyalty_transactions')
		.select('id, type, points, reason, created_at')
		.eq('customer_id', id)
		.order('created_at', { ascending: false })
		.limit(8)

	// 4. Fetch the associated tenant (restaurant details + styling profile)
	const { data: tenant, error: tenantError } = await supabase
		.from('tenants')
		.select('id, name, slug, logo_url, branding, contact, social')
		.eq('id', tenantId)
		.single()

	if (tenantError || !tenant) {
		console.error('[Membership Portal] Tenant not found for customer:', tenantId, tenantError)
		notFound()
	}

	return (
		<MembershipCardPortal
			customer={customer as CustomerData}
			loyalty={activeLoyalty}
			transactions={(transactions || []) as LoyaltyTransaction[]}
			tenant={tenant as TenantData}
			allTiers={allTiers || []}
		/>
	)
}
