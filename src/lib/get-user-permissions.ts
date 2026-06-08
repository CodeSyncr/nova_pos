import { createSupabaseServerComponentClient } from '@/lib/supabase/server'
import type { PermissionsMap } from '@/lib/permissions'

export type UserContext = {
	userId: string
	tenantId: string
	permissions: PermissionsMap | null // null = owner/full access
	roleId: string | null
	roleName: string | null
}

/**
 * Gets the current user's tenant context and permissions.
 * Use in server components to enforce role-based access.
 */
export async function getUserContext(): Promise<UserContext | null> {
	const supabase = await createSupabaseServerComponentClient()
	const { data: { user } } = await supabase.auth.getUser()

	if (!user) return null

	// Get user's profile_tenant
	const { data: pt } = await supabase
		.from('profile_tenants')
		.select('tenant_id, role_id')
		.eq('profile_id', user.id)
		.single()

	if (!pt) return null

	let permissions: PermissionsMap | null = null
	let roleName: string | null = null

	if (pt.role_id) {
		const { data: role } = await supabase
			.from('roles')
			.select('permissions, name')
			.eq('id', pt.role_id)
			.single()

		if (role) {
			permissions = role.permissions as PermissionsMap | null
			roleName = role.name
		}
	}

	return {
		userId: user.id,
		tenantId: pt.tenant_id,
		permissions,
		roleId: pt.role_id,
		roleName
	}
}
