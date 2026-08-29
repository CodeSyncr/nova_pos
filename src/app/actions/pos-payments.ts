'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { EzetapError, fetchTransactions } from '@/lib/ezetap'
import {
	createAdminClient,
	syncTenantPosTransactions,
	autoMatchUnlinked,
	SUCCESSFUL_STATUSES,
	type SyncResult
} from '@/lib/pos-sync'

/**
 * Confirms the signed-in user actually belongs to `tenantId`.
 *
 * Everything below reaches for the service-role client (portal credentials are
 * deliberately invisible to RLS), which means RLS is no longer doing the
 * tenant scoping for us — so it has to be checked explicitly here.
 */
async function assertTenantAccess(tenantId: string): Promise<string> {
	const supabase = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data, error } = await supabase
		.from('profile_tenants')
		.select('tenant_id')
		.eq('tenant_id', tenantId)
		.eq('profile_id', user.id)
		.maybeSingle()

	if (error) throw new Error(error.message)
	if (!data) throw new Error('Unauthorized: not a member of this tenant')

	return user.id
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type PosTransaction = {
	id: string
	externalId: string
	txnAt: string
	amount: number
	tip: number
	mode: string | null
	txnType: string | null
	status: string | null
	cardLast4: string | null
	cardType: string | null
	cardBrand: string | null
	authCode: string | null
	rrn: string | null
	deviceSerial: string | null
	acquiringBank: string | null
	settledOn: string | null
	orderId: string | null
	matchType: 'auto' | 'manual' | null
	/** Populated when the txn is linked to an order. */
	orderNumber: string | null
	orderTotal: number | null
}

export type { SyncResult }

// ─── Credentials ─────────────────────────────────────────────────────────────

export type PosCredentialStatus = {
	configured: boolean
	portalUsername: string | null
	isActive: boolean
	lastSyncAt: string | null
	lastSyncStatus: string | null
	lastSyncError: string | null
}

/** Credential status for the settings UI. Never returns the password. */
export async function getPosCredentialStatus(tenantId: string): Promise<PosCredentialStatus> {
	await assertTenantAccess(tenantId)
	const admin = createAdminClient()

	const { data, error } = await admin
		.from('pos_provider_credentials')
		.select('portal_username, is_active, last_sync_at, last_sync_status, last_sync_error')
		.eq('tenant_id', tenantId)
		.eq('provider', 'razorpay_pos')
		.maybeSingle()

	if (error) throw new Error(error.message)
	if (!data) {
		return {
			configured: false,
			portalUsername: null,
			isActive: false,
			lastSyncAt: null,
			lastSyncStatus: null,
			lastSyncError: null
		}
	}

	return {
		configured: true,
		portalUsername: data.portal_username as string,
		isActive: data.is_active as boolean,
		lastSyncAt: data.last_sync_at as string | null,
		lastSyncStatus: data.last_sync_status as string | null,
		lastSyncError: data.last_sync_error as string | null
	}
}

export async function savePosCredentials(
	tenantId: string,
	portalUsername: string,
	portalPassword: string
): Promise<{ success: true }> {
	await assertTenantAccess(tenantId)

	if (!portalUsername.trim() || !portalPassword) {
		throw new Error('Portal username and password are both required')
	}

	// Verify the credentials before storing them, so a typo surfaces here
	// rather than as a silently failing nightly sync.
	const today = new Date()
	try {
		await fetchTransactions({
			username: portalUsername.trim(),
			password: portalPassword,
			startDate: today,
			endDate: today,
			max: 1
		})
	} catch (error) {
		if (error instanceof EzetapError) {
			throw new Error(`Could not sign in to the Ezetap portal: ${error.message}`)
		}
		throw error
	}

	const admin = createAdminClient()
	const { error } = await admin.from('pos_provider_credentials').upsert(
		{
			tenant_id: tenantId,
			provider: 'razorpay_pos',
			portal_username: portalUsername.trim(),
			portal_password: portalPassword,
			is_active: true,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'tenant_id,provider' }
	)

	if (error) throw new Error(error.message)

	revalidatePath('/pos-payments')
	return { success: true }
}

// ─── Sync ────────────────────────────────────────────────────────────────────

/**
 * Pulls terminal transactions for the tenant, then auto-matches the new ones.
 * Thin authorized wrapper around the shared sync core.
 */
export async function syncPosTransactions(tenantId: string, days = 7): Promise<SyncResult> {
	await assertTenantAccess(tenantId)
	const result = await syncTenantPosTransactions(tenantId, days)
	revalidatePath('/pos-payments')
	return result
}

/** Re-runs the matcher without re-fetching from the portal. */
export async function rematchPosTransactions(tenantId: string): Promise<number> {
	await assertTenantAccess(tenantId)
	const matched = await autoMatchUnlinked(tenantId)
	revalidatePath('/pos-payments')
	return matched
}

// ─── Matching ────────────────────────────────────────────────────────────────

/** Links a transaction to an order by hand, overriding any auto match. */
export async function linkPosTransaction(
	tenantId: string,
	transactionId: string,
	orderId: string
): Promise<{ success: true }> {
	await assertTenantAccess(tenantId)
	const admin = createAdminClient()

	const { error } = await admin
		.from('pos_transactions')
		.update({
			order_id: orderId,
			match_type: 'manual',
			matched_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', transactionId)
		.eq('tenant_id', tenantId)

	if (error) throw new Error(error.message)

	revalidatePath('/pos-payments')
	return { success: true }
}

export async function unlinkPosTransaction(
	tenantId: string,
	transactionId: string
): Promise<{ success: true }> {
	await assertTenantAccess(tenantId)
	const admin = createAdminClient()

	const { error } = await admin
		.from('pos_transactions')
		.update({
			order_id: null,
			match_type: null,
			matched_at: null,
			updated_at: new Date().toISOString()
		})
		.eq('id', transactionId)
		.eq('tenant_id', tenantId)

	if (error) throw new Error(error.message)

	revalidatePath('/pos-payments')
	return { success: true }
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getPosTransactions(
	tenantId: string,
	startDate: string,
	endDate: string
): Promise<PosTransaction[]> {
	await assertTenantAccess(tenantId)
	const admin = createAdminClient()

	const { data, error } = await admin
		.from('pos_transactions')
		.select(
			`id, external_id, txn_at, amount, tip, mode, txn_type, status,
			 card_last4, card_type, card_brand, auth_code, rrn, device_serial,
			 acquiring_bank, settled_on, order_id, match_type,
			 orders ( id, table_number, total )`
		)
		.eq('tenant_id', tenantId)
		.gte('txn_at', startDate)
		.lte('txn_at', endDate)
		.order('txn_at', { ascending: false })

	if (error) throw new Error(error.message)

	return (data ?? []).map((row) => {
		// PostgREST types an embedded relation as an array even when the FK
		// makes it at most one row, so normalise before reading it.
		type EmbeddedOrder = { id: string; table_number: string | null; total: number }
		const embedded = row.orders as unknown as EmbeddedOrder | EmbeddedOrder[] | null
		const order = Array.isArray(embedded) ? (embedded[0] ?? null) : embedded

		return {
			id: row.id as string,
			externalId: row.external_id as string,
			txnAt: row.txn_at as string,
			amount: Number(row.amount),
			tip: Number(row.tip ?? 0),
			mode: row.mode as string | null,
			txnType: row.txn_type as string | null,
			status: row.status as string | null,
			cardLast4: row.card_last4 as string | null,
			cardType: row.card_type as string | null,
			cardBrand: row.card_brand as string | null,
			authCode: row.auth_code as string | null,
			rrn: row.rrn as string | null,
			deviceSerial: row.device_serial as string | null,
			acquiringBank: row.acquiring_bank as string | null,
			settledOn: row.settled_on as string | null,
			orderId: row.order_id as string | null,
			matchType: row.match_type as 'auto' | 'manual' | null,
			orderNumber: order?.table_number ?? null,
			orderTotal: order ? Number(order.total) : null
		}
	})
}

export type PosPaymentSummary = {
	/** Money actually taken on the terminal. */
	collected: number
	successCount: number
	failedCount: number
	matchedCount: number
	unmatchedCount: number
	/** Collected, split by payment mode (UPI / CARD / ...). */
	byMode: { mode: string; count: number; amount: number }[]
	/** Completed orders in range with no terminal payment linked. */
	ordersWithoutPayment: number
}

export async function getPosPaymentSummary(
	tenantId: string,
	startDate: string,
	endDate: string
): Promise<PosPaymentSummary> {
	const transactions = await getPosTransactions(tenantId, startDate, endDate)
	const admin = createAdminClient()

	const successful = transactions.filter((t) =>
		SUCCESSFUL_STATUSES.has(String(t.status ?? '').toUpperCase())
	)

	const modeMap = new Map<string, { mode: string; count: number; amount: number }>()
	for (const txn of successful) {
		const mode = txn.mode ?? 'UNKNOWN'
		const entry = modeMap.get(mode) ?? { mode, count: 0, amount: 0 }
		entry.count++
		entry.amount += txn.amount
		modeMap.set(mode, entry)
	}

	// Completed non-cash orders in range that no terminal txn accounts for —
	// the bucket worth investigating.
	const { data: orders, error } = await admin
		.from('orders')
		.select('id, payment_method')
		.eq('tenant_id', tenantId)
		.eq('status', 'completed')
		.gte('completed_at', startDate)
		.lte('completed_at', endDate)

	if (error) throw new Error(error.message)

	const linkedOrderIds = new Set(
		transactions.filter((t) => t.orderId).map((t) => t.orderId as string)
	)
	const ordersWithoutPayment = (orders ?? []).filter((o) => {
		const method = String(o.payment_method ?? '').toLowerCase()
		// Cash never appears on the terminal, so it is not a discrepancy.
		if (method === 'cash' || method === '') return false
		return !linkedOrderIds.has(o.id as string)
	}).length

	return {
		collected: successful.reduce((sum, t) => sum + t.amount, 0),
		successCount: successful.length,
		failedCount: transactions.length - successful.length,
		matchedCount: transactions.filter((t) => t.orderId).length,
		unmatchedCount: transactions.filter((t) => !t.orderId).length,
		byMode: Array.from(modeMap.values()).sort((a, b) => b.amount - a.amount),
		ordersWithoutPayment
	}
}

/**
 * Completed orders near a transaction, for the manual-match picker.
 * Widened to ±2h since a human is reviewing the options anyway.
 */
export async function getMatchCandidates(
	tenantId: string,
	transactionId: string
): Promise<{ id: string; tableNumber: string | null; total: number; completedAt: string }[]> {
	await assertTenantAccess(tenantId)
	const admin = createAdminClient()

	const { data: txn, error: txnError } = await admin
		.from('pos_transactions')
		.select('txn_at')
		.eq('id', transactionId)
		.eq('tenant_id', tenantId)
		.maybeSingle()

	if (txnError) throw new Error(txnError.message)
	if (!txn) throw new Error('Transaction not found')

	const txnAt = new Date(txn.txn_at as string)
	const windowStart = new Date(txnAt.getTime() - 120 * 60_000)
	const windowEnd = new Date(txnAt.getTime() + 120 * 60_000)

	const { data: orders, error } = await admin
		.from('orders')
		.select('id, table_number, total, completed_at')
		.eq('tenant_id', tenantId)
		.eq('status', 'completed')
		.gte('completed_at', windowStart.toISOString())
		.lte('completed_at', windowEnd.toISOString())
		.order('completed_at', { ascending: false })
		.limit(50)

	if (error) throw new Error(error.message)

	return (orders ?? []).map((o) => ({
		id: o.id as string,
		tableNumber: o.table_number as string | null,
		total: Number(o.total),
		completedAt: o.completed_at as string
	}))
}
