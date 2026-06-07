/**
 * Utility functions for subdomain handling
 */

/**
 * Get subdomain from request headers (set by middleware)
 */
export function getSubdomainFromHeaders(headers: Headers): string | null {
	return headers.get('x-subdomain') || null
}

/**
 * Get subdomain from hostname
 */
export function getSubdomainFromHost(hostname: string): string | null {
	const parts = hostname.split('.')
	if (parts.length < 3) {
		return null
	}
	return parts[0] || null
}

/**
 * Validate subdomain format
 */
export function isValidSubdomain(subdomain: string): boolean {
	if (!subdomain || subdomain.length < 3 || subdomain.length > 63) {
		return false
	}
	// Only lowercase letters, numbers, and hyphens
	// Must start and end with a letter or number
	return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)
}

