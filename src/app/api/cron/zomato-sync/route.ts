import { NextRequest, NextResponse } from 'next/server'
import { ZomatoError } from '@/lib/zomato'
import { createAdminClient, syncTenantZomatoOrders, ZOMATO_PROVIDER } from '@/lib/zomato-sync'

/**
 * Scheduled Zomato order sync.
 *
 * Runs for every tenant with an active, unexpired session. A tenant whose
 * session has lapsed is skipped rather than retried — Zomato's login cannot be
 * automated, so only a person can fix it, and hammering the endpoint with a
 * dead session risks tripping their bot protection.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Days of history to re-pull each run; also refreshes statuses that changed. */
const SYNC_WINDOW_DAYS = 3

export async function GET(request: NextRequest) {
	return handleZomatoSync(request)
}

export async function POST(request: NextRequest) {
	return handleZomatoSync(request)
}

async function handleZomatoSync(request: NextRequest) {
	const cronSecret = process.env.CRON_SECRET
	if (cronSecret) {
		const auth = request.headers.get('authorization')
		if (auth !== `Bearer ${cronSecret}`) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
	}

	try {
		const admin = createAdminClient()

		const { data: tenants, error } = await admin
			.from('pos_provider_credentials')
			.select('tenant_id, session_expires_at')
			.eq('provider', ZOMATO_PROVIDER)
			.eq('is_active', true)

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		if (!tenants || tenants.length === 0) {
			return NextResponse.json({ synced: 0, results: [] })
		}

		const results: {
			tenantId: string
			ok: boolean
			skipped?: boolean
			fetched?: number
			inserted?: number
			error?: string
			needsReconnect?: boolean
		}[] = []

		const now = Date.now()

		for (const row of tenants) {
			const tenantId = row.tenant_id as string
			const expiresAt = row.session_expires_at as string | null

			// Known-dead session: skip without calling Zomato at all.
			if (expiresAt && new Date(expiresAt).getTime() < now) {
				results.push({ tenantId, ok: false, skipped: true, needsReconnect: true })
				continue
			}

			try {
				const result = await syncTenantZomatoOrders(tenantId, SYNC_WINDOW_DAYS)
				results.push({
					tenantId,
					ok: true,
					fetched: result.fetched,
					inserted: result.inserted
				})
			} catch (err) {
				// One tenant's dead session must not stop the rest; the failure is
				// already recorded on their credentials row.
				results.push({
					tenantId,
					ok: false,
					error: err instanceof Error ? err.message : 'Unknown error',
					needsReconnect: err instanceof ZomatoError && err.needsReconnect
				})
			}
		}

		return NextResponse.json({
			synced: results.filter((r) => r.ok).length,
			failed: results.filter((r) => !r.ok && !r.skipped).length,
			skipped: results.filter((r) => r.skipped).length,
			results
		})
	} catch (err) {
		console.error('Zomato sync cron failed:', err)
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : 'Unknown error' },
			{ status: 500 }
		)
	}
}
