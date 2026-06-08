// Permission checking utilities for role-based access control

export type PermissionsMap = Record<string, string[]>

/**
 * Check if a user with given permissions can access a specific route.
 * A user can access a route if they have ANY permission in that category.
 * No permissions object = owner/full access.
 * Empty array for a category = no access.
 */
export function canAccessRoute(
	permissions: PermissionsMap | string[] | null | undefined,
	route: string
): boolean {
	// No permissions defined = full access (owner)
	if (!permissions) return true

	// Legacy array format — ['*'] or ['all'] means full access
	if (Array.isArray(permissions)) {
		return permissions.includes('*') || permissions.includes('all')
	}

	const category = routeToCategory[route]
	if (!category) return true // Unknown route = allow

	const categoryPerms = permissions[category]

	// Category not in permissions or empty array = no access
	if (!categoryPerms || !Array.isArray(categoryPerms) || categoryPerms.length === 0) return false

	// Has at least one permission in this category = can access the page
	return true
}

// Maps routes to their permission category
const routeToCategory: Record<string, string> = {
	'/dashboard': 'dashboard',
	'/pos': 'pos',
	'/menu': 'menu',
	'/orders': 'orders',
	'/inventory': 'inventory',
	'/purchases': 'purchases',
	'/customers': 'customers',
	'/staff': 'staff',
	'/analytics': 'analytics',
	'/reports': 'reports',
	'/subscription': 'settings',
	'/settings': 'settings'
}

/**
 * Check a specific permission (category + action)
 */
export function hasPermission(
	permissions: PermissionsMap | string[] | null | undefined,
	category: string,
	action: string
): boolean {
	if (!permissions) return true

	if (Array.isArray(permissions)) {
		return permissions.includes('*') || permissions.includes('all')
	}

	const categoryPerms = permissions[category]
	if (!categoryPerms || !Array.isArray(categoryPerms)) return false
	if (categoryPerms.includes('all') || categoryPerms.includes('*')) return true
	return categoryPerms.includes(action)
}

/**
 * Checks if user has 'view_own' permission (waiter sees only their own data)
 */
export function isOwnDataOnly(
	permissions: PermissionsMap | string[] | null | undefined,
	category: string
): boolean {
	if (!permissions) return false // owner sees all
	if (Array.isArray(permissions)) return false

	const categoryPerms = permissions[category]
	if (!categoryPerms || !Array.isArray(categoryPerms)) return true
	if (categoryPerms.includes('all') || categoryPerms.includes('*')) return false
	if (categoryPerms.includes('view')) return false // has full view

	// Has view_own = can only see their own
	return categoryPerms.includes('view_own')
}

/**
 * Check if user can write/edit in a category
 */
export function canWrite(
	permissions: PermissionsMap | string[] | null | undefined,
	category: string
): boolean {
	if (!permissions) return true // owner
	if (Array.isArray(permissions)) {
		return permissions.includes('*') || permissions.includes('all')
	}

	const categoryPerms = permissions[category]
	if (!categoryPerms || !Array.isArray(categoryPerms)) return false
	if (categoryPerms.includes('all') || categoryPerms.includes('*')) return true
	return categoryPerms.includes('write') || categoryPerms.includes('edit') || categoryPerms.includes('create')
}
