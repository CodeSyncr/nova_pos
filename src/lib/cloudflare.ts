/**
 * Cloudflare API integration for DNS management
 * Handles subdomain creation and DNS record management
 */

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4'
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'novapos.in'
const TARGET_IP = process.env.TARGET_IP || '127.0.0.1' // Your server IP or CNAME target

export interface CloudflareDNSRecord {
	id?: string
	type: 'A' | 'CNAME' | 'TXT'
	name: string
	content: string
	ttl?: number
	proxied?: boolean
}

export interface CloudflareResponse<T> {
	success: boolean
	result: T
	errors: Array<{ code: number; message: string }>
}

/**
 * Create a DNS record for a subdomain
 */
export async function createSubdomainDNS(
	subdomain: string
): Promise<CloudflareResponse<CloudflareDNSRecord>> {
	if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
		throw new Error('Cloudflare credentials not configured')
	}

	const recordName = `${subdomain}.${ROOT_DOMAIN}`

	// Check if record already exists
	const existing = await getDNSRecord(recordName)
	if (existing) {
		return {
			success: true,
			result: existing,
			errors: []
		}
	}

	const response = await fetch(
		`${CLOUDFLARE_API_URL}/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				type: 'CNAME', // Use CNAME for flexibility, or 'A' for direct IP
				name: subdomain,
				content: TARGET_IP, // Your main domain or IP
				ttl: 3600, // 1 hour
				proxied: true // Enable Cloudflare proxy for SSL and protection
			})
		}
	)

	const data = await response.json()

	if (!data.success) {
		throw new Error(
			`Cloudflare API error: ${data.errors?.map((e: { message: string }) => e.message).join(', ') || 'Unknown error'}`
		)
	}

	return data
}

/**
 * Get an existing DNS record
 */
export async function getDNSRecord(
	recordName: string
): Promise<CloudflareDNSRecord | null> {
	if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
		return null
	}

	try {
		const response = await fetch(
			`${CLOUDFLARE_API_URL}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=${recordName}`,
			{
				headers: {
					Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
					'Content-Type': 'application/json'
				}
			}
		)

		const data = await response.json()

		if (data.success && data.result && data.result.length > 0) {
			return data.result[0]
		}

		return null
	} catch (error) {
		console.error('Error fetching DNS record:', error)
		return null
	}
}

/**
 * Delete a DNS record
 */
export async function deleteSubdomainDNS(subdomain: string): Promise<boolean> {
	if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
		throw new Error('Cloudflare credentials not configured')
	}

	const recordName = `${subdomain}.${ROOT_DOMAIN}`
	const existing = await getDNSRecord(recordName)

	if (!existing || !existing.id) {
		return true // Already deleted or doesn't exist
	}

	const response = await fetch(
		`${CLOUDFLARE_API_URL}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${existing.id}`,
		{
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
				'Content-Type': 'application/json'
			}
		}
	)

	const data = await response.json()
	return data.success
}

/**
 * Update DNS record (e.g., change target)
 */
export async function updateSubdomainDNS(
	subdomain: string,
	updates: Partial<CloudflareDNSRecord>
): Promise<CloudflareResponse<CloudflareDNSRecord>> {
	if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
		throw new Error('Cloudflare credentials not configured')
	}

	const recordName = `${subdomain}.${ROOT_DOMAIN}`
	const existing = await getDNSRecord(recordName)

	if (!existing || !existing.id) {
		throw new Error('DNS record not found')
	}

	const response = await fetch(
		`${CLOUDFLARE_API_URL}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${existing.id}`,
		{
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				...existing,
				...updates
			})
		}
	)

	const data = await response.json()

	if (!data.success) {
		throw new Error(
			`Cloudflare API error: ${data.errors?.map((e: { message: string }) => e.message).join(', ') || 'Unknown error'}`
		)
	}

	return data
}
