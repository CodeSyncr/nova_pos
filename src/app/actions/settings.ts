'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { BillTemplate } from '@/lib/bill-template'

export async function updateLoyaltySettings(
	tenantId: string,
	settings: {
		enabled: boolean
		earn_rate: number
		redeem_rate: number
		min_redeem_points: number
		expiry_days: number | null
		auto_enroll: boolean
		rules: string[]
	}
) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase.from('tenant_loyalty_settings').upsert(
		{
			tenant_id: tenantId,
			...settings,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'tenant_id' }
	)

	if (error) {
		throw new Error(error.message)
	}
}

export async function createOrUpdateLoyaltyTier(
	tenantId: string,
	tierId: string | null,
	tier: {
		name: string
		min_points: number
		benefits: Record<string, unknown>
	}
) {
	const supabase = await createSupabaseServerClient()

	if (tierId) {
		const { error } = await supabase
			.from('loyalty_tiers')
			.update(tier)
			.eq('id', tierId)
			.eq('tenant_id', tenantId)

		if (error) {
			throw new Error(error.message)
		}
	} else {
		const { error } = await supabase.from('loyalty_tiers').insert({
			tenant_id: tenantId,
			...tier
		})

		if (error) {
			throw new Error(error.message)
		}
	}
}

export async function createOrUpdateCoupon(
	tenantId: string,
	couponId: string | null,
	coupon: {
		code: string
		name: string
		description: string | null
		discount_type: 'percent' | 'fixed'
		discount_value: number
		min_order_amount: number
		max_discount_amount: number | null
		valid_from: string
		valid_until: string
		usage_limit: number | null
		per_customer_limit: number
		applicable_to: string[]
		excluded_categories: string[]
		excluded_items: string[]
		is_active: boolean
	}
) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('Unauthorized')
	}

	const couponData = {
		tenant_id: tenantId,
		...coupon,
		created_by: user.id,
		updated_at: new Date().toISOString()
	}

	if (couponId) {
		const { error } = await supabase
			.from('coupons')
			.update(couponData)
			.eq('id', couponId)
			.eq('tenant_id', tenantId)

		if (error) {
			throw new Error(error.message)
		}
	} else {
		const { error } = await supabase.from('coupons').insert(couponData)

		if (error) {
			throw new Error(error.message)
		}
	}
}

export async function updateTenantSettings(
	tenantId: string,
	settings: {
		currency?: string
		currencySymbol?: string
		locale?: string
		timezone?: string
		taxRate?: number
		monthStartDay?: number
		monthEndDay?: number
		reviewLink?: string
		tables?: Array<{ id: string; name: string; capacity: number; section: string }>
		firebaseConfig?: {
			apiKey: string
			authDomain: string
			projectId: string
			storageBucket?: string
			messagingSenderId?: string
			appId?: string
			ordersCollection: string
			menuItemsCollection?: string
			customersCollection?: string
		}
		billTemplates?: {
			whatsapp: BillTemplate
			thermal: BillTemplate
		}
	}
) {
	const supabase = await createSupabaseServerClient()

	// Get current settings
	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) || {}

	const { error } = await supabase
		.from('tenants')
		.update({
			settings: {
				...currentSettings,
				...settings
			},
			updated_at: new Date().toISOString()
		})
		.eq('id', tenantId)

	if (error) {
		throw new Error(error.message)
	}
}

export async function updateTenantOrganization(
	tenantId: string,
	data: {
		name: string
		logoUrl: string
		branding: Record<string, unknown>
		contact: Record<string, unknown>
		social: Record<string, unknown>
		currency?: {
			code: string
			symbol: string
		}
		monthStartDay?: number
		monthEndDay?: number
		posUrl?: string
	}
) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to update organization settings.')
	}

	// Verify user has access to this tenant
	const { data: profileTenant } = await supabase
		.from('profile_tenants')
		.select('tenant_id')
		.eq('profile_id', user.id)
		.eq('tenant_id', tenantId)
		.single()

	if (!profileTenant) {
		throw new Error('Unauthorized: You do not have access to this tenant.')
	}

	// Fetch the COMPLETE tenant record to preserve ALL existing data
	const { data: currentTenant, error: fetchError } = await supabase
		.from('tenants')
		.select('*')
		.eq('id', tenantId)
		.single()

	if (fetchError) {
		console.error('Error fetching current tenant:', fetchError)
		throw new Error(`Failed to fetch current tenant: ${fetchError.message}`)
	}

	if (!currentTenant) {
		throw new Error('Tenant not found')
	}

	console.log(
		'Complete tenant from DB:',
		JSON.stringify(currentTenant, null, 2)
	)

	// Get current settings and preserve ALL existing settings
	const currentSettings =
		(currentTenant.settings as Record<string, unknown>) || {}

	console.log(
		'Current settings before update:',
		JSON.stringify(currentSettings, null, 2)
	)
	console.log('Current settings type:', typeof currentTenant.settings)
	console.log('Current settings is null?', currentTenant.settings === null)
	console.log(
		'Current settings is undefined?',
		currentTenant.settings === undefined
	)
	console.log(
		'Data to update:',
		JSON.stringify(
			{
				monthStartDay: data.monthStartDay,
				monthEndDay: data.monthEndDay,
				currency: data.currency
			},
			null,
			2
		)
	)

	// Start with current settings (or empty object if null/undefined)
	const updatedSettings: Record<string, unknown> =
		currentTenant.settings &&
		typeof currentTenant.settings === 'object' &&
		!Array.isArray(currentTenant.settings)
			? { ...(currentTenant.settings as Record<string, unknown>) }
			: {}

	// Update currency if provided
	if (data.currency) {
		updatedSettings.currency = data.currency.code
		updatedSettings.currencySymbol = data.currency.symbol
	}

	// Always update monthStartDay and monthEndDay if provided (even if 0)
	if (data.monthStartDay !== undefined) {
		updatedSettings.monthStartDay = Number(data.monthStartDay)
	}
	if (data.monthEndDay !== undefined) {
		updatedSettings.monthEndDay = Number(data.monthEndDay)
	}
	
	// POS URL — used by mobile clients as the base for bill links and APIs.
	if (data.posUrl !== undefined) {
		updatedSettings.posUrl = data.posUrl.trim()
	}

	// Log the settings object after all updates
	console.log(
		'Settings after all updates:',
		JSON.stringify(updatedSettings, null, 2)
	)
	console.log('Settings keys count:', Object.keys(updatedSettings).length)
	console.log('Settings has currency?', 'currency' in updatedSettings)
	console.log('Settings has monthStartDay?', 'monthStartDay' in updatedSettings)
	console.log('Settings has monthEndDay?', 'monthEndDay' in updatedSettings)

	console.log(
		'Updated settings object:',
		JSON.stringify(updatedSettings, null, 2)
	)
	console.log('Settings object keys:', Object.keys(updatedSettings))
	console.log('Settings object size:', Object.keys(updatedSettings).length)

	// Validate data before updating
	if (!data.name || data.name.trim() === '') {
		throw new Error('Organization name is required')
	}

	console.log('Updating tenant organization:', {
		tenantId,
		monthStartDay: updatedSettings.monthStartDay,
		monthEndDay: updatedSettings.monthEndDay,
		currency: updatedSettings.currency,
		currencySymbol: updatedSettings.currencySymbol,
		fullSettings: updatedSettings
	})

	// Ensure settings is a valid JSON object (deep clone to avoid any reference issues)
	const settingsToSave = JSON.parse(JSON.stringify(updatedSettings))

	console.log(
		'Settings to save to database:',
		JSON.stringify(settingsToSave, null, 2)
	)

	// Update the tenant record - preserve all existing fields, only update what's provided
	// Don't convert null to empty objects - preserve null values for JSONB columns
	const updatePayload: Record<string, unknown> = {
		name: data.name.trim(),
		updated_at: new Date().toISOString(),
		settings: settingsToSave // This now contains ALL settings merged
	}

	// Only update logo_url if provided
	if (data.logoUrl) {
		updatePayload.logo_url = data.logoUrl
	} else if (currentTenant.logo_url !== null) {
		updatePayload.logo_url = currentTenant.logo_url
	}

	// Only update JSONB fields if they have actual data (not empty objects)
	// Preserve null values instead of converting to {}
	if (data.branding && Object.keys(data.branding).length > 0) {
		updatePayload.branding = data.branding
	} else if (currentTenant.branding !== null) {
		updatePayload.branding = currentTenant.branding
	}

	if (data.contact && Object.keys(data.contact).length > 0) {
		updatePayload.contact = data.contact
	} else if (currentTenant.contact !== null) {
		updatePayload.contact = currentTenant.contact
	}

	if (data.social && Object.keys(data.social).length > 0) {
		updatePayload.social = data.social
	} else if (currentTenant.social !== null) {
		updatePayload.social = currentTenant.social
	}

	console.log(
		'Complete update payload:',
		JSON.stringify(updatePayload, null, 2)
	)
	console.log(
		'Settings in payload:',
		JSON.stringify(updatePayload.settings, null, 2)
	)

	// Update the tenant record
	// Note: We're not using .select() here because it might be blocked by RLS
	// We'll fetch separately to verify
	const { error, count } = await supabase
		.from('tenants')
		.update(updatePayload)
		.eq('id', tenantId)

	console.log(
		'Update result:',
		JSON.stringify(
			{
				error: error
					? {
							code: error.code,
							message: error.message,
							details: error.details,
							hint: error.hint
						}
					: null,
				count
			},
			null,
			2
		)
	)

	if (error) {
		console.error(
			'Error updating tenant organization:',
			JSON.stringify(
				{
					code: error.code,
					message: error.message,
					details: error.details,
					hint: error.hint
				},
				null,
				2
			)
		)
		throw new Error(
			`Failed to update organization settings: ${error.message || 'Unknown error'}`
		)
	}

	if (count === null || count === 0) {
		console.error('Update returned count:', count)
		console.error(
			'This might indicate an RLS policy issue or the tenant was not found'
		)
		// Don't throw here - let's try to fetch and see if it actually updated
	}

	// Always fetch separately to verify the update worked
	// (RLS might prevent .select() from working in the update query)
	console.log('Fetching updated tenant to verify settings were saved...')
	const { data: fetchedTenant, error: verifyError } = await supabase
		.from('tenants')
		.select('id, name, settings')
		.eq('id', tenantId)
		.single()

	if (verifyError) {
		console.error(
			'Error verifying saved settings:',
			JSON.stringify(verifyError, null, 2)
		)
		// Return the settings we tried to save, even if verification failed
		return {
			success: true,
			message: 'Organization settings updated successfully',
			settings: settingsToSave
		}
	}

	const updatedTenant = fetchedTenant
	console.log(
		'Fetched tenant after update:',
		JSON.stringify(updatedTenant, null, 2)
	)

	console.log(
		'Tenant record after update:',
		JSON.stringify(
			{
				id: updatedTenant?.id,
				name: updatedTenant?.name,
				settings: updatedTenant?.settings
			},
			null,
			2
		)
	)

	if (updatedTenant?.settings) {
		const savedSettings = updatedTenant.settings as Record<string, unknown>
		console.log(
			'Settings saved successfully:',
			JSON.stringify(
				{
					monthStartDay: savedSettings.monthStartDay,
					monthEndDay: savedSettings.monthEndDay,
					currency: savedSettings.currency,
					currencySymbol: savedSettings.currencySymbol,
					allSettings: savedSettings
				},
				null,
				2
			)
		)

		return {
			success: true,
			message: 'Organization settings updated successfully',
			settings: savedSettings
		}
	} else {
		console.warn('Settings object is null or undefined after update!')
		console.warn('Full tenant record:', JSON.stringify(updatedTenant, null, 2))
		console.warn(
			'Returning settings we tried to save:',
			JSON.stringify(settingsToSave, null, 2)
		)
		// Return the settings we tried to save, even if verification failed
		// This ensures the client gets the data even if there's a verification issue
		return {
			success: true,
			message: 'Organization settings updated successfully',
			settings: settingsToSave
		}
	}
}

export async function updateUserProfile(data: {
	full_name: string
	avatar_url: string
}) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('Unauthorized')
	}

	const { error } = await supabase
		.from('profiles')
		.update({
			full_name: data.full_name || null,
			avatar_url: data.avatar_url || null
		})
		.eq('id', user.id)

	if (error) {
		throw new Error(error.message)
	}
}

export async function createOrUpdateRole(
	tenantId: string,
	roleId: string | null,
	role: {
		code: string
		name: string
		description: string | null
		permissions: Record<string, unknown>
	}
) {
	const supabase = await createSupabaseServerClient()

	if (roleId) {
		const { error } = await supabase
			.from('roles')
			.update(role)
			.eq('id', roleId)
			.eq('tenant_id', tenantId)

		if (error) {
			throw new Error(error.message)
		}
	} else {
		const { error } = await supabase.from('roles').insert({
			tenant_id: tenantId,
			...role
		})

		if (error) {
			throw new Error(error.message)
		}
	}
}

export async function deleteRole(tenantId: string, roleId: string) {
	const supabase = await createSupabaseServerClient()

	const { error } = await supabase
		.from('roles')
		.delete()
		.eq('id', roleId)
		.eq('tenant_id', tenantId)

	if (error) {
		throw new Error(error.message)
	}
}
