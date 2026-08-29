/**
 * Core Razorpay POS (Ezetap) sync, shared by the interactive server action and
 * the cron route.
 *
 * Lives outside `app/actions` on purpose: everything exported from a
 * `'use server'` module becomes a callable server action, and these helpers
 * skip the tenant-membership check because the cron job has no user session.
 * Callers reached from the browser MUST do their own authorization first.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchTransactions, type EzetapTransaction } from '@/lib/ezetap'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function createAdminClient(): SupabaseClient {
	if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing admin credentials')
	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	})
}

/**
 * Statuses that represent money actually taken. Only these are eligible for
 * matching to an order — an EXPIRED or FAILED attempt must never mark an order
 * as paid.
 */
export const SUCCESSFUL_STATUSES = new Set([
	'SETTLED',
	'SETTLEMENT_PENDING',
	'AUTHORIZED',
	'CAPTURED'
])

/** How far apart a terminal txn and an order may be and still be the same sale. */
const MATCH_WINDOW_MINUTES = 15

export type SyncResult = {
	fetched: number
	inserted: number
	updated: number
	autoMatched: number
}

/**
 * Links unmatched successful transactions to orders on an exact amount match
 * within a ±15 minute window.
 *
 * Deliberately conservative: a txn is linked only when exactly one candidate
 * order fits. Two orders of the same value close together are left for a human,
 * because guessing between them would silently mis-attribute revenue.
 */
export async function autoMatchUnlinked(tenantId: string): Promise<number> {
	const admin = createAdminClient()

	const { data: unmatched, error } = await admin
		.from('pos_transactions')
		.select('id, amount, txn_at, status')
		.eq('tenant_id', tenantId)
		.is('order_id', null)
		.order('txn_at', { ascending: false })
		.limit(500)

	if (error) throw new Error(error.message)
	if (!unmatched || unmatched.length === 0) return 0

	const candidates = unmatched.filter((t) =>
		SUCCESSFUL_STATUSES.has(String(t.status ?? '').toUpperCase())
	)
	if (candidates.length === 0) return 0

	// Orders already claimed by another txn are off the table.
	const { data: taken, error: takenError } = await admin
		.from('pos_transactions')
		.select('order_id')
		.eq('tenant_id', tenantId)
		.not('order_id', 'is', null)

	if (takenError) throw new Error(takenError.message)
	const claimedOrderIds = new Set((taken ?? []).map((r) => r.order_id as string))

	let matched = 0

	for (const txn of candidates) {
		const txnAt = new Date(txn.txn_at as string)
		const windowStart = new Date(txnAt.getTime() - MATCH_WINDOW_MINUTES * 60_000)
		const windowEnd = new Date(txnAt.getTime() + MATCH_WINDOW_MINUTES * 60_000)

		const { data: orders, error: ordersError } = await admin
			.from('orders')
			.select('id')
			.eq('tenant_id', tenantId)
			.eq('status', 'completed')
			.eq('total', txn.amount)
			.gte('completed_at', windowStart.toISOString())
			.lte('completed_at', windowEnd.toISOString())
			.limit(2)

		if (ordersError) throw new Error(ordersError.message)

		// 0 candidates -> nothing to link. 2+ -> ambiguous, needs a human.
		const available = (orders ?? []).filter((o) => !claimedOrderIds.has(o.id as string))
		if (available.length !== 1) continue

		const orderId = available[0]!.id as string

		const { error: linkError } = await admin
			.from('pos_transactions')
			.update({
				order_id: orderId,
				match_type: 'auto',
				matched_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', txn.id as string)

		if (linkError) throw new Error(linkError.message)

		claimedOrderIds.add(orderId)
		matched++
	}

	return matched
}

/**
 * Pulls terminal transactions for one tenant into `pos_transactions`, then
 * auto-matches the new ones.
 *
 * Safe to run repeatedly over an overlapping window: rows are upserted on
 * (tenant, provider, external_id), and a txn already linked to an order keeps
 * that link.
 *
 * NOTE: performs no authorization — see the module comment.
 */
export async function syncTenantPosTransactions(
	tenantId: string,
	days = 7
): Promise<SyncResult> {
	const admin = createAdminClient()

	const { data: creds, error: credsError } = await admin
		.from('pos_provider_credentials')
		.select('portal_username, portal_password, is_active')
		.eq('tenant_id', tenantId)
		.eq('provider', 'razorpay_pos')
		.maybeSingle()

	if (credsError) throw new Error(credsError.message)
	if (!creds) throw new Error('No Razorpay POS credentials configured for this tenant')
	if (!creds.is_active) throw new Error('Razorpay POS sync is paused for this tenant')

	const endDate = new Date()
	const startDate = new Date(endDate)
	startDate.setDate(startDate.getDate() - Math.max(0, days - 1))

	let transactions: EzetapTransaction[]
	try {
		transactions = await fetchTransactions({
			username: creds.portal_username as string,
			password: creds.portal_password as string,
			startDate,
			endDate
		})
	} catch (error) {
		// Record why the sync failed so the UI can show it instead of just
		// going quiet.
		const message = error instanceof Error ? error.message : 'Unknown error'
		await admin
			.from('pos_provider_credentials')
			.update({
				last_sync_at: new Date().toISOString(),
				last_sync_status: 'error',
				last_sync_error: message
			})
			.eq('tenant_id', tenantId)
			.eq('provider', 'razorpay_pos')
		throw error
	}

	// Which of these do we already have? Needed to report inserted vs updated.
	const externalIds = transactions.map((t) => t.externalId)
	const existingIds = new Set<string>()

	if (externalIds.length > 0) {
		const { data: existing, error: existingError } = await admin
			.from('pos_transactions')
			.select('external_id')
			.eq('tenant_id', tenantId)
			.eq('provider', 'razorpay_pos')
			.in('external_id', externalIds)

		if (existingError) throw new Error(existingError.message)
		for (const row of existing ?? []) existingIds.add(row.external_id as string)
	}

	if (transactions.length > 0) {
		const rows = transactions.map((t) => ({
			tenant_id: tenantId,
			provider: 'razorpay_pos',
			external_id: t.externalId,
			amount: t.amount,
			tip: t.tip,
			cash_at_pos: t.cashAtPos,
			mode: t.mode,
			txn_type: t.txnType,
			status: t.status,
			card_last4: t.cardLast4,
			card_type: t.cardType,
			card_brand: t.cardBrand,
			auth_code: t.authCode,
			rrn: t.rrn,
			device_serial: t.deviceSerial,
			mid: t.mid,
			tid: t.tid,
			acquiring_bank: t.acquiringBank,
			portal_username: t.portalUsername,
			txn_at: t.txnAt,
			settled_on: t.settledOn,
			raw: t.raw,
			synced_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		}))

		// No order_id in the payload, so an upsert refreshes status/settlement
		// without clobbering a link made earlier.
		const { error: upsertError } = await admin
			.from('pos_transactions')
			.upsert(rows, { onConflict: 'tenant_id,provider,external_id' })

		if (upsertError) throw new Error(upsertError.message)
	}

	const autoMatched = await autoMatchUnlinked(tenantId)

	await admin
		.from('pos_provider_credentials')
		.update({
			last_sync_at: new Date().toISOString(),
			last_sync_status: 'ok',
			last_sync_error: null
		})
		.eq('tenant_id', tenantId)
		.eq('provider', 'razorpay_pos')

	const inserted = transactions.filter((t) => !existingIds.has(t.externalId)).length

	return {
		fetched: transactions.length,
		inserted,
		updated: transactions.length - inserted,
		autoMatched
	}
}
