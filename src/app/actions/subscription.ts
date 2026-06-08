'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SubscriptionPlan } from '@/lib/subscription-plans'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription-plans'
import Razorpay from 'razorpay'

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
	razorpayOrderId?: string
	razorpayPaymentId?: string
}

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || ''
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || ''

function getRazorpay() {
	if (!razorpayKeyId || !razorpayKeySecret) {
		throw new Error('Razorpay credentials not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your environment.')
	}
	return new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
}

// ─── Get Current Subscription ────────────────────────────────────────────────

export async function getCurrentSubscription(
	tenantId: string
): Promise<Subscription | null> {
	const supabase = await createSupabaseServerClient()

	const { data: tenant, error } = await supabase
		.from('tenants')
		.select('subscription, trial_ends_at')
		.eq('id', tenantId)
		.single()

	if (error || !tenant) return null

	const subscription = (tenant.subscription as Subscription) || null
	if (!subscription) return null

	// Check if trial has expired
	if (subscription.status === 'trial' && subscription.trialEndsAt) {
		const trialEnd = new Date(subscription.trialEndsAt)
		if (new Date() > trialEnd) {
			// Auto-expire the trial
			subscription.status = 'expired'
			await supabase
				.from('tenants')
				.update({ subscription: { ...subscription, status: 'expired' } })
				.eq('id', tenantId)
		}
	}

	return subscription
}

// ─── Check if subscription is active (trial or paid) ─────────────────────────

export async function isSubscriptionActive(tenantId: string): Promise<{
	active: boolean
	status: SubscriptionStatus | null
	daysRemaining?: number
}> {
	const subscription = await getCurrentSubscription(tenantId)

	if (!subscription) return { active: false, status: null }

	if (subscription.status === 'active') {
		return { active: true, status: 'active' }
	}

	if (subscription.status === 'trial' && subscription.trialEndsAt) {
		const trialEnd = new Date(subscription.trialEndsAt)
		const now = new Date()
		if (now < trialEnd) {
			const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
			return { active: true, status: 'trial', daysRemaining }
		}
		return { active: false, status: 'expired' }
	}

	return { active: false, status: subscription.status }
}

// ─── Create Razorpay Order ───────────────────────────────────────────────────

export async function createRazorpayOrder(
	tenantId: string,
	planId: SubscriptionPlan
): Promise<{
	success: boolean
	orderId?: string
	amount?: number
	currency?: string
	keyId?: string
	error?: string
}> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId)
	if (!plan || plan.price === 0) {
		return { success: false, error: 'Invalid plan' }
	}

	try {
		const razorpay = getRazorpay()

		const order = await razorpay.orders.create({
			amount: plan.price * 100, // Razorpay uses paise
			currency: plan.currency || 'INR',
			receipt: `rcpt_${Date.now()}`,
			notes: {
				tenant_id: tenantId,
				plan_id: planId,
				user_id: user.id
			}
		})

		return {
			success: true,
			orderId: order.id,
			amount: plan.price * 100,
			currency: plan.currency || 'INR',
			keyId: razorpayKeyId
		}
	} catch (err: any) {
		console.error('Razorpay order creation failed:', {
			message: err.message,
			statusCode: err.statusCode,
			error: err.error,
			stack: err.stack
		})
		const errorMsg = err.error?.description || err.message || 'Failed to create payment order'
		return {
			success: false,
			error: errorMsg
		}
	}
}

// ─── Verify Payment & Activate Subscription ─────────────────────────────────

export async function verifyAndActivateSubscription(
	tenantId: string,
	planId: SubscriptionPlan,
	paymentData: {
		razorpayOrderId: string
		razorpayPaymentId: string
		razorpaySignature: string
	}
): Promise<{ success: boolean; error?: string }> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	// Verify signature
	const crypto = await import('crypto')
	const expectedSignature = crypto
		.createHmac('sha256', razorpayKeySecret)
		.update(`${paymentData.razorpayOrderId}|${paymentData.razorpayPaymentId}`)
		.digest('hex')

	if (expectedSignature !== paymentData.razorpaySignature) {
		return { success: false, error: 'Payment verification failed' }
	}

	// Payment verified — activate subscription
	const now = new Date()
	const periodEnd = new Date(now)
	periodEnd.setMonth(periodEnd.getMonth() + 1)

	const updatedSubscription: Subscription = {
		plan: planId,
		status: 'active',
		currentPeriodStart: now.toISOString(),
		currentPeriodEnd: periodEnd.toISOString(),
		cancelAtPeriodEnd: false,
		razorpayOrderId: paymentData.razorpayOrderId,
		razorpayPaymentId: paymentData.razorpayPaymentId
	}

	const { error } = await supabase
		.from('tenants')
		.update({
			subscription: updatedSubscription,
			updated_at: now.toISOString()
		})
		.eq('id', tenantId)

	if (error) {
		return { success: false, error: error.message }
	}

	revalidatePath('/subscription')
	revalidatePath('/pos')
	revalidatePath('/dashboard')

	return { success: true }
}

// ─── Update Subscription ─────────────────────────────────────────────────────

export async function updateSubscription(
	tenantId: string,
	subscription: Partial<Subscription>
): Promise<{ success: boolean; subscription: Subscription }> {
	const supabase = await createSupabaseServerClient()

	const { data: currentTenant, error: fetchError } = await supabase
		.from('tenants')
		.select('subscription')
		.eq('id', tenantId)
		.single()

	if (fetchError) throw new Error('Failed to fetch current subscription')

	const currentSubscription = (currentTenant.subscription as Subscription) || {}
	const updatedSubscription: Subscription = {
		...currentSubscription,
		...subscription
	} as Subscription

	const { error: updateError } = await supabase
		.from('tenants')
		.update({
			subscription: updatedSubscription,
			updated_at: new Date().toISOString()
		})
		.eq('id', tenantId)

	if (updateError) throw new Error(updateError.message)

	revalidatePath('/subscription')
	return { success: true, subscription: updatedSubscription }
}

// ─── Cancel Subscription ─────────────────────────────────────────────────────

export async function cancelSubscription(tenantId: string): Promise<{ success: boolean }> {
	const supabase = await createSupabaseServerClient()

	const { data: currentTenant, error: fetchError } = await supabase
		.from('tenants')
		.select('subscription')
		.eq('id', tenantId)
		.single()

	if (fetchError) throw new Error('Failed to fetch current subscription')

	const currentSubscription = (currentTenant.subscription as Subscription) || {}
	const updatedSubscription: Subscription = {
		...currentSubscription,
		cancelAtPeriodEnd: true
	} as Subscription

	const { error } = await supabase
		.from('tenants')
		.update({ subscription: updatedSubscription, updated_at: new Date().toISOString() })
		.eq('id', tenantId)

	if (error) throw new Error(error.message)

	revalidatePath('/subscription')
	return { success: true }
}

// ─── Reactivate Subscription ─────────────────────────────────────────────────

export async function reactivateSubscription(tenantId: string): Promise<{ success: boolean }> {
	const supabase = await createSupabaseServerClient()

	const { data: currentTenant, error: fetchError } = await supabase
		.from('tenants')
		.select('subscription')
		.eq('id', tenantId)
		.single()

	if (fetchError) throw new Error('Failed to fetch current subscription')

	const currentSubscription = (currentTenant.subscription as Subscription) || {}
	const updatedSubscription: Subscription = {
		...currentSubscription,
		cancelAtPeriodEnd: false
	} as Subscription

	const { error } = await supabase
		.from('tenants')
		.update({ subscription: updatedSubscription, updated_at: new Date().toISOString() })
		.eq('id', tenantId)

	if (error) throw new Error(error.message)

	revalidatePath('/subscription')
	return { success: true }
}
