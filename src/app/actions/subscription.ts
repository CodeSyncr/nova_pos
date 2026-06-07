'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SubscriptionPlan } from '@/lib/subscription-plans'

export type SubscriptionStatus =
	| 'trial'
	| 'active'
	| 'past_due'
	| 'canceled'
	| 'expired'

export interface Subscription {
	plan: SubscriptionPlan
	status: SubscriptionStatus
	currentPeriodStart: string
	currentPeriodEnd: string
	cancelAtPeriodEnd: boolean
	trialEndsAt?: string
	razorpaySubscriptionId?: string
	razorpayPlanId?: string
}

export async function getCurrentSubscription(
	tenantId: string
): Promise<Subscription | null> {
	const supabase = await createSupabaseServerClient()

	const { data: tenant, error } = await supabase
		.from('tenants')
		.select('subscription')
		.eq('id', tenantId)
		.single()

	if (error || !tenant) {
		return null
	}

	return (tenant.subscription as Subscription) || null
}

export async function updateSubscription(
	tenantId: string,
	subscription: Partial<Subscription>
): Promise<{ success: boolean; subscription: Subscription }> {
	const supabase = await createSupabaseServerClient()

	// Get current subscription
	const { data: currentTenant, error: fetchError } = await supabase
		.from('tenants')
		.select('subscription')
		.eq('id', tenantId)
		.single()

	if (fetchError) {
		throw new Error('Failed to fetch current subscription')
	}

	const currentSubscription = (currentTenant.subscription as Subscription) || {}

	// Merge with new subscription data
	const updatedSubscription: Subscription = {
		...currentSubscription,
		...subscription
	} as Subscription

	// Update tenant subscription
	const { error: updateError } = await supabase
		.from('tenants')
		.update({
			subscription: updatedSubscription,
			updated_at: new Date().toISOString()
		})
		.eq('id', tenantId)

	if (updateError) {
		throw new Error(updateError.message)
	}

	revalidatePath('/subscription')
	revalidatePath('/settings')

	return {
		success: true,
		subscription: updatedSubscription
	}
}

export async function cancelSubscription(tenantId: string): Promise<{
	success: boolean
}> {
	const supabase = await createSupabaseServerClient()

	// Get current subscription
	const { data: currentTenant, error: fetchError } = await supabase
		.from('tenants')
		.select('subscription')
		.eq('id', tenantId)
		.single()

	if (fetchError) {
		throw new Error('Failed to fetch current subscription')
	}

	const currentSubscription = (currentTenant.subscription as Subscription) || {}

	// Set cancelAtPeriodEnd to true
	const updatedSubscription: Subscription = {
		...currentSubscription,
		cancelAtPeriodEnd: true
	} as Subscription

	const { error: updateError } = await supabase
		.from('tenants')
		.update({
			subscription: updatedSubscription,
			updated_at: new Date().toISOString()
		})
		.eq('id', tenantId)

	if (updateError) {
		throw new Error(updateError.message)
	}

	revalidatePath('/subscription')
	revalidatePath('/settings')

	return { success: true }
}

export async function reactivateSubscription(
	tenantId: string
): Promise<{ success: boolean }> {
	const supabase = await createSupabaseServerClient()

	// Get current subscription
	const { data: currentTenant, error: fetchError } = await supabase
		.from('tenants')
		.select('subscription')
		.eq('id', tenantId)
		.single()

	if (fetchError) {
		throw new Error('Failed to fetch current subscription')
	}

	const currentSubscription = (currentTenant.subscription as Subscription) || {}

	// Set cancelAtPeriodEnd to false
	const updatedSubscription: Subscription = {
		...currentSubscription,
		cancelAtPeriodEnd: false
	} as Subscription

	const { error: updateError } = await supabase
		.from('tenants')
		.update({
			subscription: updatedSubscription,
			updated_at: new Date().toISOString()
		})
		.eq('id', tenantId)

	if (updateError) {
		throw new Error(updateError.message)
	}

	revalidatePath('/subscription')
	revalidatePath('/settings')

	return { success: true }
}

// Placeholder for Razorpay integration
export async function createRazorpaySubscription(
	tenantId: string,
	planId: SubscriptionPlan
): Promise<{
	success: boolean
	subscriptionId?: string
	error?: string
}> {
	// TODO: Integrate with Razorpay API
	// This is a placeholder function
	// Parameters: tenantId, planId will be used when implementing Razorpay
	// You'll need to:
	// 1. Create a Razorpay plan
	// 2. Create a Razorpay subscription
	// 3. Store the subscription ID in the database
	// 4. Set up webhooks for subscription events

	// Suppress unused parameter warnings for now
	void tenantId
	void planId

	return {
		success: false,
		error: 'Razorpay integration pending'
	}
}
