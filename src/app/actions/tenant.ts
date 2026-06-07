'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

type OnboardingProfilePayload = {
	businessType: string
	ownerName: string
	ownerRole: string
	experienceLevel: string
}

type TenantAddress = {
	street: string
	city: string
	state: string
	pincode: string
	country: string
}

type TenantBranding = {
	fontFamily: string
	primaryColor: string
	secondaryColor: string
}

type TenantSocial = {
	website?: string
	instagram?: string
	facebook?: string
}

type TenantSettings = {
	timezone: string
	currency: string
	currencySymbol: string
	locale: string
	taxRate: number
}

export type TenantCreationPayload = {
	name: string
	logoUrl?: string
	address: TenantAddress
	contactEmail: string
	contactPhone: string
	social: TenantSocial
	settings: TenantSettings
	branding: TenantBranding
}

const TRIAL_DAYS = 14
const SUBSCRIPTION_DAYS = 30

export async function saveOnboardingProfile(payload: OnboardingProfilePayload) {
	const supabase = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to continue onboarding.')
	}

	const { error } = await supabase.from('profiles').upsert(
		{
			id: user.id,
			full_name: payload.ownerName
		},
		{
			onConflict: 'id'
		}
	)

	if (error) {
		throw new Error(error.message)
	}

	return { ok: true }
}

export async function checkSubdomainAvailability(subdomain: string) {
	const supabase = await createSupabaseServerClient()

	// Validate subdomain format
	if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
		return {
			available: false,
			valid: false,
			message:
				'Subdomain can only contain lowercase letters, numbers, and hyphens. Must start and end with a letter or number.'
		}
	}

	if (subdomain.length < 3) {
		return {
			available: false,
			valid: false,
			message: 'Subdomain must be at least 3 characters long'
		}
	}

	if (subdomain.length > 63) {
		return {
			available: false,
			valid: false,
			message: 'Subdomain must be less than 63 characters'
		}
	}

	// Check if subdomain is already taken
	const { data, error } = await supabase
		.from('tenants')
		.select('id')
		.eq('slug', subdomain)
		.maybeSingle()

	if (error) {
		throw new Error(error.message)
	}

	if (data) {
		return {
			available: false,
			valid: true,
			message: 'This subdomain is already taken'
		}
	}

	return {
		available: true,
		valid: true,
		message: 'Subdomain is available'
	}
}

export async function createTenantWorkspace(payload: TenantCreationPayload) {
	const supabase = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to create a tenant.')
	}

	const { data: tenantId, error: rpcError } = await supabase.rpc(
		'create_tenant_with_default_owner',
		{
			tenant_name: payload.name,
			tenant_timezone: payload.settings.timezone
		}
	)

	if (rpcError) {
		throw new Error(rpcError.message)
	}

	const now = new Date()
	const subscriptionPeriodEnd = addDays(now, SUBSCRIPTION_DAYS)
	const trialEndsAt = addDays(now, TRIAL_DAYS)

	const contact = {
		email: payload.contactEmail,
		phone: payload.contactPhone,
		address: payload.address
	}

	const updatedSettings = {
		currency: payload.settings.currency,
		currencySymbol: payload.settings.currencySymbol,
		timezone: payload.settings.timezone,
		locale: payload.settings.locale,
		taxRate: payload.settings.taxRate
	}

	const subscription = {
		plan: 'trial',
		status: 'trial',
		currentPeriodStart: now.toISOString(),
		currentPeriodEnd: subscriptionPeriodEnd.toISOString(),
		cancelAtPeriodEnd: false,
		trialEndsAt: trialEndsAt.toISOString()
	}

	const { error: updateError } = await supabase
		.from('tenants')
		.update({
			logo_url: payload.logoUrl ?? null,
			branding: payload.branding,
			contact,
			social: payload.social,
			settings: updatedSettings,
			subscription,
			timezone: payload.settings.timezone,
			is_active: true,
			updated_at: now.toISOString(),
			trial_ends_at: trialEndsAt.toISOString()
		})
		.eq('id', tenantId)

	if (updateError) {
		throw new Error(updateError.message)
	}

	return {
		tenantId,
		tenantName: payload.name
	}
}

function addDays(date: Date, days: number) {
	const newDate = new Date(date)
	newDate.setDate(newDate.getDate() + days)
	return newDate
}
