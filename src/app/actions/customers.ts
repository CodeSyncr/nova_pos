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


