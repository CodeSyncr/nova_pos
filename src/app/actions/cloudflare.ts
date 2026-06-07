'use server'

import {
	createSubdomainDNS,
	deleteSubdomainDNS,
	getDNSRecord,
	type CloudflareDNSRecord
} from '@/lib/cloudflare'

/**
 * Server action to create a subdomain in Cloudflare
 */
export async function createCloudflareSubdomain(subdomain: string) {
	try {
		const result = await createSubdomainDNS(subdomain)
		return {
			success: true,
			record: result.result,
			message: `Subdomain ${subdomain}.novapos.in created successfully`
		}
	} catch (error) {
		console.error('Error creating Cloudflare subdomain:', error)
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to create subdomain'
		}
	}
}

/**
 * Server action to check if a DNS record exists
 */
export async function checkCloudflareSubdomain(subdomain: string) {
	try {
		const record = await getDNSRecord(`${subdomain}.novapos.in`)
		return {
			exists: !!record,
			record: record || null
		}
	} catch (error) {
		console.error('Error checking Cloudflare subdomain:', error)
		return {
			exists: false,
			record: null
		}
	}
}

/**
 * Server action to delete a subdomain from Cloudflare
 */
export async function deleteCloudflareSubdomain(subdomain: string) {
	try {
		await deleteSubdomainDNS(subdomain)
		return {
			success: true,
			message: `Subdomain ${subdomain}.novapos.in deleted successfully`
		}
	} catch (error) {
		console.error('Error deleting Cloudflare subdomain:', error)
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to delete subdomain'
		}
	}
}

