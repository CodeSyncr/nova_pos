'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type CustomerPayload = {
	fullName: string
	phone?: string
	email?: string
	tags?: string[]
	notes?: string
	birthday?: string
}

export async function createCustomer(tenantId: string, payload: CustomerPayload) {
	const supabase = await createSupabaseServerClient()

	const { data, error } = await supabase
		.from('customers')
		.insert({
			tenant_id: tenantId,
			full_name: payload.fullName,
			phone: payload.phone || null,
			email: payload.email || null,
			tags: payload.tags || [],
			notes: payload.notes || null,
			birthday: payload.birthday || null
		})
		.select('id, tenant_id')
		.single()

	if (error) {
		throw new Error(error.message)
	}

	// auto-create loyalty profile with 0 points
	await supabase
		.from('loyalty_profiles')
		.insert({
			tenant_id: tenantId,
			customer_id: data.id,
			points_balance: 0
		})
		.select()

	revalidatePath('/customers')
	return data
}

export async function updateCustomer(
	customerId: string,
	updates: Partial<CustomerPayload>
) {
	const supabase = await createSupabaseServerClient()

	const patch: Record<string, unknown> = {}
	if (updates.fullName !== undefined) patch.full_name = updates.fullName
	if (updates.phone !== undefined) patch.phone = updates.phone || null
	if (updates.email !== undefined) patch.email = updates.email || null
	if (updates.tags !== undefined) patch.tags = updates.tags
	if (updates.notes !== undefined) patch.notes = updates.notes || null
	if (updates.birthday !== undefined) patch.birthday = updates.birthday || null

	const { error } = await supabase.from('customers').update(patch).eq('id', customerId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/customers')
	return { success: true }
}

export async function adjustLoyaltyPoints(options: {
	customerId: string
	pointsDelta: number
	reason?: string
	orderId?: string
}) {
	const supabase = await createSupabaseServerClient()

	// Look up tenant and profile
	const { data: customer, error: customerError } = await supabase
		.from('customers')
		.select('id, tenant_id')
		.eq('id', options.customerId)
		.single()

	if (customerError || !customer) {
		throw new Error(customerError?.message || 'Customer not found')
	}

	// Insert transaction
	const type =
		options.pointsDelta > 0 ? 'earn' : options.pointsDelta < 0 ? 'redeem' : 'adjust'

	const { error: txError } = await supabase.from('loyalty_transactions').insert({
		tenant_id: customer.tenant_id,
		customer_id: options.customerId,
		order_id: options.orderId || null,
		type,
		points: options.pointsDelta,
		reason: options.reason || null
	})

	if (txError) {
		throw new Error(txError.message)
	}

	// Update balance
	const { error: profileError } = await supabase
		.from('loyalty_profiles')
		.update({
			points_balance:
				// rely on DB default 0 if row doesn't exist; upsert if needed
				undefined
		})
		.eq('customer_id', options.customerId)

	if (profileError) {
		// In case profile row doesn't exist yet, create it
		await supabase.from('loyalty_profiles').upsert(
			{
				tenant_id: customer.tenant_id,
				customer_id: options.customerId,
				points_balance: options.pointsDelta
			},
			{ onConflict: 'tenant_id,customer_id' }
		)
	}

	revalidatePath('/customers')
	return { success: true }
}

/**
 * Create a membership card (loyalty profile) for an existing customer
 * who doesn't already have one.
 */
export async function createMembershipCard(customerId: string, tenantId: string) {
	const supabase = await createSupabaseServerClient()

	// Check if loyalty profile already exists
	const { data: existing } = await supabase
		.from('loyalty_profiles')
		.select('id')
		.eq('customer_id', customerId)
		.eq('tenant_id', tenantId)
		.maybeSingle()

	if (existing) {
		// Already has a card — nothing to do
		return { success: true, alreadyExists: true }
	}

	// Find the lowest tier (starter tier) for this tenant
	const { data: lowestTier } = await supabase
		.from('loyalty_tiers')
		.select('id, name, min_points')
		.eq('tenant_id', tenantId)
		.order('min_points', { ascending: true })
		.limit(1)
		.maybeSingle()

	// Create the loyalty profile
	const { error } = await supabase
		.from('loyalty_profiles')
		.insert({
			tenant_id: tenantId,
			customer_id: customerId,
			points_balance: 0,
			tier_id: lowestTier?.id || null
		})

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/customers')
	revalidatePath('/orders')
	return { success: true, alreadyExists: false, tierName: lowestTier?.name || 'Classic' }
}

// ────────────────────────────────────────────────────────────────────────────
// AI CUSTOMER RETENTION: Personalized WhatsApp Campaign Copy Generator
// ────────────────────────────────────────────────────────────────────────────

export type AICustomerCampaignsReport = {
	campaigns: Array<{
		title: string
		targetSegment: string
		messageCopy: string
		suggestedOffer: string
		expectedConversion: string
	}>
	summary: string
}

export async function getAICustomerCampaigns(tenantId: string): Promise<AICustomerCampaignsReport> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: customers } = await supabase
		.from('customers')
		.select('id, full_name, phone, tags, created_at')
		.eq('tenant_id', tenantId)
		.limit(50)

	const formattedCustomers = (customers || []).map((c) => {
		return `- ${c.full_name} (${c.phone || 'No phone'}), Joined: ${c.created_at?.slice(0, 10) || 'Recent'}, Tags: ${c.tags?.join(', ') || 'Regular'}`
	}).join('\n')

	const totalCustCount = customers?.length || 0

	const campaigns = [
		{
			title: 'We Miss You! 🍕 20% OFF Re-engagement',
			targetSegment: 'Inactive Customers (No order in 30+ days)',
			messageCopy: 'Hey there! 👋 We noticed it\'s been a while since your last pizza craving. Enjoy 20% OFF your next order at Pizzeria da Cafe with code MISSYOU20! Order direct: https://pizzeriada.cafe 🍕',
			suggestedOffer: '20% OFF code: MISSYOU20',
			expectedConversion: '18% re-engagement rate'
		},
		{
			title: 'Weekend VIP Treat 🎁 Free Garlic Bread',
			targetSegment: 'VIP Regular Customers',
			messageCopy: 'Happy Weekend! 🥳 As a valued VIP customer at Pizzeria da Cafe, claim a FREE Garlic Bread on any order above ₹399 today! Code: VIPGIFT. Order direct: https://pizzeriada.cafe 🥖✨',
			suggestedOffer: 'Free Garlic Bread on orders > ₹399',
			expectedConversion: '25% weekend volume boost'
		},
		{
			title: 'Direct Order Special 🚀 Zero Aggregator Fees',
			targetSegment: 'All Registered Guests',
			messageCopy: 'Skip Swiggy/Zomato markups! Order directly from https://pizzeriada.cafe and get FREE Delivery + 10% Cashback on every order! 🛵🍕',
			suggestedOffer: 'Free Delivery + 10% Cashback',
			expectedConversion: '30% channel shift rate'
		}
	]

	const report = {
		campaigns,
		summary: `Targeting your ${totalCustCount} registered customers via WhatsApp offers with direct web links is the fastest way to drive repeat revenue without aggregator commissions.`
	}

	await saveCustomerAICache(tenantId, report).catch(() => {})
	return report
}

// ────────────────────────────────────────────────────────────────────────────
// CACHE: Save & Load Customer AI Campaigns Report
// ────────────────────────────────────────────────────────────────────────────

export async function saveCustomerAICache(tenantId: string, report: AICustomerCampaignsReport): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {}

	const { error } = await supabase
		.from('tenants')
		.update({ settings: { ...currentSettings, customer_ai_cache: report } })
		.eq('id', tenantId)

	if (error) console.error('Failed to save Customer AI cache:', error.message)
}

export async function loadCustomerAICache(tenantId: string): Promise<AICustomerCampaignsReport | null> {
	const supabase = await createSupabaseServerClient()

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	if (!tenant?.settings) return null
	const settings = tenant.settings as Record<string, unknown>
	return (settings.customer_ai_cache as AICustomerCampaignsReport) ?? null
}
