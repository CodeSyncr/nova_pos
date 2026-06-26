import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

function corsResponse(data: any, status = 200) {
	return NextResponse.json(data, {
		status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Cache-Control': 'no-store, max-age=0'
		}
	})
}

export async function OPTIONS() {
	return new NextResponse(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	})
}

export async function GET(request: NextRequest) {
	try {
		const origin = request.headers.get('origin') || ''
		const referer = request.headers.get('referer') || ''

		const isAllowed =
			origin.includes('pizzeriada.cafe') ||
			referer.includes('pizzeriada.cafe') ||
			origin.includes('pizzeriacafe.in') ||
			referer.includes('pizzeriacafe.in') ||
			origin.includes('localhost') ||
			referer.includes('localhost') ||
			origin.includes('127.0.0.1') ||
			referer.includes('127.0.0.1')

		if (!isAllowed) {
			return corsResponse({ error: 'Unauthorized origin.' }, 403)
		}

		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id') || ''
		const phone = searchParams.get('phone') || ''
		const tenantIdParam = searchParams.get('tenantId') || ''

		if (!id && (!phone || !tenantIdParam)) {
			return corsResponse({ error: 'Missing customer ID or phone/tenantId parameters.' }, 400)
		}

		const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
		const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

		if (!supabaseUrl || !supabaseKey) {
			return corsResponse({ error: 'Server configuration error.' }, 500)
		}

		const supabase = createClient(supabaseUrl, supabaseKey)

		// 1. Fetch customer details (by ID or Phone fallback)
		let customer = null
		let customerError = null

		if (id) {
			const { data, error } = await supabase
				.from('customers')
				.select('id, tenant_id, full_name, phone, email, created_at')
				.eq('id', id)
				.single()
			customer = data
			customerError = error
		} else {
			// Normalize phone: strip everything except digits
			const digits = phone.replace(/[^\d]/g, '')
			// Get last 10 digits (the local number without country code)
			const last10 = digits.length >= 10 ? digits.slice(-10) : digits

			let customerQuery = supabase
				.from('customers')
				.select('id, tenant_id, full_name, phone, email, created_at')
				.eq('tenant_id', tenantIdParam)

			// Try multiple common phone storage formats
			customerQuery = customerQuery.or(
				`phone.eq.${last10},phone.eq.+91${last10},phone.eq.+91 ${last10},phone.ilike.%${last10}`
			)

			const { data, error } = await customerQuery.limit(1)
			customer = data && data.length > 0 ? data[0] : null
			customerError = error

		}

		if (customerError || !customer) {
			console.error('[Membership API Error]: Customer not found:', id || phone, customerError)
			return corsResponse({ error: 'Customer not found.' }, 404)
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
			.eq('customer_id', customer.id)
			.maybeSingle()

		if (loyaltyError) {
			console.warn('[Membership API Error] Failed to read loyalty profile:', loyaltyError)
		}

		// Dynamically determine current tier based on point balance
		const pointsBalance = loyalty?.points_balance ?? 0
		const sortedTiers = [...(allTiers || [])].sort((a, b) => b.min_points - a.min_points)
		const matchedTier = sortedTiers.find(t => pointsBalance >= t.min_points)

		// Fallback to a standard Classic profile if points are below lowest tier points requirement
		const activeLoyalty = {
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
			.eq('customer_id', customer.id)
			.order('created_at', { ascending: false })
			.limit(8)

		// 4. Fetch the associated tenant (restaurant details + styling profile)
		const { data: tenant, error: tenantError } = await supabase
			.from('tenants')
			.select('id, name, slug, logo_url, branding, contact, social')
			.eq('id', tenantId)
			.single()

		if (tenantError || !tenant) {
			console.error('[Membership API Error] Tenant not found for customer:', tenantId, tenantError)
			return corsResponse({ error: 'Associated tenant not found.' }, 404)
		}

		// 6. Fetch tenant-level loyalty settings
		const { data: loyaltySettings } = await supabase
			.from('tenant_loyalty_settings')
			.select('enabled, earn_rate, redeem_rate, min_redeem_points, expiry_days, rules')
			.eq('tenant_id', tenantId)
			.maybeSingle()

		return corsResponse({
			customer,
			loyalty: activeLoyalty,
			transactions: transactions || [],
			tenant,
			allTiers: allTiers || [],
			loyaltySettings: loyaltySettings || null
		})
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Internal Server Error'
		console.error('[Membership API GET error]:', err)
		return corsResponse({ error: msg }, 500)
	}
}
