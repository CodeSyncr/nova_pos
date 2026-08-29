import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, syncTenantPosTransactions } from '@/lib/pos-sync'

/**
 * Scheduled Razorpay POS (Ezetap) sync.
 *
 * Walks every tenant with active portal credentials and pulls the last few
 * days of terminal transactions. Re-syncing an overlapping window is safe —
 * rows upsert on (tenant, provider, external_id) — and the overlap is
 * deliberate: it lets a transaction whose settlement status changed after the
 * first sync get refreshed.
 */

// Signing into the portal for several tenants is slow; keep this off the edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Days of history to re-pull each run. */
const SYNC_WINDOW_DAYS = 3

export async function GET(request: NextRequest) {
	return handlePosSync(request)
}

export async function POST(request: NextRequest) {
	return handlePosSync(request)
}

async function handlePosSync(request: NextRequest) {
	// When CRON_SECRET is set, require it. Left optional so this matches the
	// existing cron routes in deployments that have not configured one — but
	// set it: this endpoint drives outbound logins to the Ezetap portal.
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
			.select('tenant_id')
			.eq('provider', 'razorpay_pos')
			.eq('is_active', true)

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		if (!tenants || tenants.length === 0) {
			return NextResponse.json({ synced: 0, results: [] })
		}

		// Sequential on purpose: each tenant means a fresh portal login, and
		// hammering Ezetap with parallel sessions risks rate limiting.
		const results: {
			tenantId: string
			ok: boolean
			fetched?: number
			inserted?: number
			autoMatched?: number
			error?: string
		}[] = []

		for (const row of tenants) {
			const tenantId = row.tenant_id as string
			try {
				const result = await syncTenantPosTransactions(tenantId, SYNC_WINDOW_DAYS)
				results.push({
					tenantId,
					ok: true,
					fetched: result.fetched,
					inserted: result.inserted,
					autoMatched: result.autoMatched
				})
			} catch (err) {
				// One tenant's bad credentials must not stop the rest. The
				// failure is already recorded on their credentials row.
				results.push({
					tenantId,
					ok: false,
					error: err instanceof Error ? err.message : 'Unknown error'
				})
			}
		}

		return NextResponse.json({
			synced: results.filter((r) => r.ok).length,
			failed: results.filter((r) => !r.ok).length,
			results
		})
	} catch (err) {
		console.error('POS sync cron failed:', err)
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : 'Unknown error' },
			{ status: 500 }
		)
	}
}
