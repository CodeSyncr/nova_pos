'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { checkSubdomainAvailability } from './tenant'
import { createCloudflareSubdomain } from './cloudflare'

// ── Platform Subdomain Actions ────────────────────────────────────────────────

/**
 * Set subdomain for an existing tenant
 */
export async function setTenantSubdomain(tenantId: string, subdomain: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to set a subdomain.')
	}

	const { data: profileTenant } = await supabase
		.from('profile_tenants')
		.select('tenant_id')
		.eq('profile_id', user.id)
		.eq('tenant_id', tenantId)
		.single()

	if (!profileTenant) {
		throw new Error('Unauthorized: You do not have access to this tenant.')
	}

	const availability = await checkSubdomainAvailability(subdomain)
	if (!availability.available) {
		throw new Error(availability.message)
	}

	const slug = subdomain.toLowerCase().trim()

	try {
		const cloudflareResult = await createCloudflareSubdomain(slug)
		if (!cloudflareResult.success) {
			throw new Error(
				cloudflareResult.error || 'Failed to create DNS record in Cloudflare'
			)
		}
	} catch (error) {
		console.error('Error creating Cloudflare subdomain:', error)
		throw new Error(
			error instanceof Error
				? error.message
				: 'Failed to create DNS record. Please try again.'
		)
	}

	const { error: updateError } = await supabase
		.from('tenants')
		.update({
			slug,
			updated_at: new Date().toISOString()
		})
		.eq('id', tenantId)

	if (updateError) {
		try {
			const { deleteCloudflareSubdomain } = await import('./cloudflare')
			await deleteCloudflareSubdomain(slug)
		} catch {
			// Ignore cleanup errors
		}
		throw new Error(updateError.message)
	}

	revalidatePath('/dashboard')
	revalidatePath('/subdomain-setup')

	return {
		success: true,
		slug,
		message: `Subdomain ${slug}.novapos.in has been set up successfully!`
	}
}

/**
 * Mark subdomain setup as skipped for a tenant
 */
export async function skipSubdomainSetup(tenantId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to skip subdomain setup.')
	}

	const { data: profileTenant } = await supabase
		.from('profile_tenants')
		.select('tenant_id')
		.eq('profile_id', user.id)
		.eq('tenant_id', tenantId)
		.single()

	if (!profileTenant) {
		throw new Error('Unauthorized: You do not have access to this tenant.')
	}

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) || {}

	const { error: updateError } = await supabase
		.from('tenants')
		.update({
			settings: {
				...currentSettings,
				subdomain_skipped: true,
				subdomain_skipped_at: new Date().toISOString()
			},
			updated_at: new Date().toISOString()
		})
		.eq('id', tenantId)

	if (updateError) {
		throw new Error(updateError.message)
	}

	revalidatePath('/dashboard')
	revalidatePath('/subdomain-setup')

	return {
		success: true,
		message: 'Subdomain setup skipped. You can set it up later in settings.'
	}
}

// ── Custom Domain & Landing Page Actions ─────────────────────────────────────

export type LandingPageTemplate = 'minimal' | 'restaurant' | 'pizza'

export interface LandingPageConfig {
	template: LandingPageTemplate
	headline: string
	subheadline: string
	cta_text: string
	cta_url: string
	bg_color: string
	accent_color: string
	logo_url: string | null
	show_pos_link: boolean
}

async function requireTenantOwner(tenantId: string) {
	const supabase = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) throw new Error('You must be signed in.')

	const { data: profileTenant } = await supabase
		.from('profile_tenants')
		.select('tenant_id')
		.eq('profile_id', user.id)
		.eq('tenant_id', tenantId)
		.single()

	if (!profileTenant)
		throw new Error('Unauthorized: You do not have access to this tenant.')

	return { supabase, user }
}

/**
 * Save / update the custom domain for a tenant.
 * Pass null to remove the custom domain.
 */
export async function setCustomDomain(
	tenantId: string,
	domain: string | null
): Promise<{ success: boolean; message: string }> {
	const { supabase } = await requireTenantOwner(tenantId)

	if (domain !== null) {
		const cleaned = domain.toLowerCase().trim()
		if (!/^[a-z0-9][a-z0-9.\-]*\.[a-z]{2,}$/.test(cleaned)) {
			throw new Error('Invalid domain format. Use e.g. pizzeriacafe.in')
		}

		const { data: existing } = await supabase
			.from('tenants')
			.select('id')
			.eq('custom_domain', cleaned)
			.neq('id', tenantId)
			.maybeSingle()

		if (existing) {
			throw new Error('This domain is already registered by another tenant.')
		}

		const { error } = await supabase
			.from('tenants')
			.update({
				custom_domain: cleaned,
				updated_at: new Date().toISOString()
			})
			.eq('id', tenantId)

		if (error) throw new Error(error.message)

		revalidatePath('/settings')
		return {
			success: true,
			message: `Custom domain ${cleaned} saved. Point your CNAME to novapos.in to activate it.`
		}
	} else {
		const { error } = await supabase
			.from('tenants')
			.update({
				custom_domain: null,
				updated_at: new Date().toISOString()
			})
			.eq('id', tenantId)

		if (error) throw new Error(error.message)

		revalidatePath('/settings')
		return { success: true, message: 'Custom domain removed.' }
	}
}

/**
 * Save the landing page configuration for a tenant.
 */
export async function saveLandingPage(
	tenantId: string,
	config: LandingPageConfig
): Promise<{ success: boolean; message: string }> {
	const { supabase } = await requireTenantOwner(tenantId)

	const { error } = await supabase
		.from('tenants')
		.update({
			landing_page: config,
			updated_at: new Date().toISOString()
		})
		.eq('id', tenantId)

	if (error) throw new Error(error.message)

	revalidatePath('/settings')
	return { success: true, message: 'Landing page saved.' }
}

/**
 * Verify that the given domain's CNAME points to our platform.
 */
export async function verifyCustomDomain(domain: string): Promise<{
	verified: boolean
	cname: string | null
	message: string
}> {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

	const res = await fetch(
		`${appUrl}/api/verify-domain?domain=${encodeURIComponent(domain)}`,
		{ cache: 'no-store' }
	)

	if (!res.ok) {
		return {
			verified: false,
			cname: null,
			message: 'DNS verification request failed. Please try again.'
		}
	}

	return res.json()
}
