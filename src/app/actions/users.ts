'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Create admin client for user management
function createSupabaseAdminClient() {
	if (!supabaseUrl || !supabaseServiceKey) {
		throw new Error('Missing Supabase admin credentials')
	}
	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	})
}

export type TenantUser = {
	id: string
	email: string
	full_name: string | null
	avatar_url: string | null
	role_id: string | null
	role: {
		id: string
		name: string
		code: string
	} | null
	joined_at: string
}

export async function getTenantUsers(tenantId: string): Promise<TenantUser[]> {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('Unauthorized')
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

	// Get all users for this tenant
	const { data, error } = await supabase
		.from('profile_tenants')
		.select(
			`
			profile_id,
			role_id,
			joined_at,
			profile:profiles(
				id,
				full_name,
				avatar_url
			)
		`
		)
		.eq('tenant_id', tenantId)

	if (error) {
		throw new Error(error.message)
	}

	// Get user emails from auth.users (requires admin client)
	const adminClient = createSupabaseAdminClient()
	// const userIds = (data || []).map((pt) => pt.profile_id)

	const users: TenantUser[] = []

	for (const profileTenant of data || []) {
		const profile = Array.isArray(profileTenant.profile)
			? profileTenant.profile[0]
			: profileTenant.profile

		if (!profile) continue

		// Get user email from auth
		const {
			data: { user: authUser },
			error: userError
		} = await adminClient.auth.admin.getUserById(profile.id)

		if (userError || !authUser) continue

		// Get role if exists
		let role = null
		if (profileTenant.role_id) {
			const { data: roleData } = await supabase
				.from('roles')
				.select('id, name, code')
				.eq('id', profileTenant.role_id)
				.single()

			if (roleData) {
				role = roleData
			}
		}

		users.push({
			id: profile.id,
			email: authUser.email || '',
			full_name: profile.full_name,
			avatar_url: profile.avatar_url,
			role_id: profileTenant.role_id,
			role,
			joined_at: profileTenant.joined_at
		})
	}

	return users
}

export async function createTenantUser(
	tenantId: string,
	data: {
		email: string
		password: string
		full_name?: string
		role_id?: string
	}
) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('Unauthorized')
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

	// Create user using admin client
	const adminClient = createSupabaseAdminClient()

	const {
		data: { user: newUser },
		error: createError
	} = await adminClient.auth.admin.createUser({
		email: data.email,
		password: data.password,
		email_confirm: true // Auto-confirm email
	})

	if (createError || !newUser) {
		throw new Error(createError?.message || 'Failed to create user')
	}

	// Create profile
	const { error: profileError } = await supabase.from('profiles').insert({
		id: newUser.id,
		full_name: data.full_name || null
	})

	if (profileError) {
		// If profile creation fails, try to clean up the user
		await adminClient.auth.admin.deleteUser(newUser.id)
		throw new Error(profileError.message)
	}

	// Add user to tenant
	const { error: tenantError } = await supabase.from('profile_tenants').insert({
		tenant_id: tenantId,
		profile_id: newUser.id,
		role_id: data.role_id || null
	})

	if (tenantError) {
		// Clean up on error
		await supabase.from('profiles').delete().eq('id', newUser.id)
		await adminClient.auth.admin.deleteUser(newUser.id)
		throw new Error(tenantError.message)
	}

	revalidatePath('/settings')
	return { id: newUser.id, email: newUser.email }
}

export async function updateTenantUserRole(
	tenantId: string,
	userId: string,
	roleId: string | null
) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('Unauthorized')
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

	// Update user role in tenant
	const { error } = await supabase
		.from('profile_tenants')
		.update({ role_id: roleId })
		.eq('tenant_id', tenantId)
		.eq('profile_id', userId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/settings')
}

export async function removeTenantUser(tenantId: string, userId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('Unauthorized')
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

	// Prevent removing yourself
	if (userId === user.id) {
		throw new Error('You cannot remove yourself from the tenant')
	}

	// Remove user from tenant
	const { error } = await supabase
		.from('profile_tenants')
		.delete()
		.eq('tenant_id', tenantId)
		.eq('profile_id', userId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/settings')
}
