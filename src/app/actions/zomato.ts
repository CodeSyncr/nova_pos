'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
	ZomatoError,
	checkSession,
	parseCurlSession,
	sessionExpiryFromToken
} from '@/lib/zomato'
import { startBrowserLogin, completeBrowserLogin } from '@/lib/zomato-browser'
import {
	createAdminClient,
	loadSession,
	syncTenantZomatoOrders,
	ZOMATO_PROVIDER,
	type ZomatoSyncResult
} from '@/lib/zomato-sync'

export type { ZomatoSyncResult }

/**
 * Confirms the signed-in user belongs to `tenantId`.
 *
 * Everything below uses the service-role client (the Zomato session is
 * deliberately invisible to RLS), so tenant scoping is checked here rather
 * than by RLS.
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

export type ZomatoOrderRow = {
	id: string
	externalId: string
	status: string | null
	customerName: string | null
	itemsSummary: string | null
	amount: number | null
	orderedAt: string
}

export type ZomatoConnectionStatus = {
	connected: boolean
	resId: string | null
	isActive: boolean
	lastSyncAt: string | null
	lastSyncStatus: string | null
	lastSyncError: string | null
	sessionExpiresAt: string | null
	/** True when the stored session is past its bExp and cannot be used. */
	expired: boolean
}

// ─── Connection ──────────────────────────────────────────────────────────────

export async function getZomatoStatus(tenantId: string): Promise<ZomatoConnectionStatus> {
	await assertTenantAccess(tenantId)
	const admin = createAdminClient()

	const { data, error } = await admin
		.from('pos_provider_credentials')
		.select('session_data, is_active, last_sync_at, last_sync_status, last_sync_error, session_expires_at')
		.eq('tenant_id', tenantId)
		.eq('provider', ZOMATO_PROVIDER)
		.maybeSingle()

	if (error) throw new Error(error.message)
	if (!data) {
		return {
			connected: false,
			resId: null,
			isActive: false,
			lastSyncAt: null,
			lastSyncStatus: null,
			lastSyncError: null,
			sessionExpiresAt: null,
			expired: false
		}
	}

	const session = data.session_data as { resId?: string } | null
	const expiresAt = data.session_expires_at as string | null

	return {
		connected: true,
		resId: session?.resId ?? null,
		isActive: data.is_active as boolean,
		lastSyncAt: data.last_sync_at as string | null,
		lastSyncStatus: data.last_sync_status as string | null,
		lastSyncError: data.last_sync_error as string | null,
		sessionExpiresAt: expiresAt,
		expired: expiresAt ? new Date(expiresAt).getTime() < Date.now() : false
	}
}

/**
 * Stores a Zomato session captured from the browser.
 *
 * Takes the raw "Copy as cURL" text from DevTools: Zomato's login is OTP-only
 * behind bot protection and cannot be automated, so a browser-minted session
 * is the only way in. The session is verified before being saved.
 */
export async function connectZomato(
	tenantId: string,
	curlCommand: string
): Promise<{ success: true; resId: string; expiresAt: string | null }> {
	await assertTenantAccess(tenantId)

	const session = parseCurlSession(curlCommand)

	if (!session.resId) {
		throw new Error(
			'Could not determine the Zomato outlet id — paste a request from the order history page.'
		)
	}

	// Verify before storing, so a stale copy-paste fails here rather than as a
	// silently broken sync later.
	const valid = await checkSession(session)
	if (!valid) {
		throw new Error('That Zomato session is not valid — copy a fresh request while signed in.')
	}

	const expiresAt = sessionExpiryFromToken(session.cookies)
	const admin = createAdminClient()

	const { error } = await admin.from('pos_provider_credentials').upsert(
		{
			tenant_id: tenantId,
			provider: ZOMATO_PROVIDER,
			session_data: session,
			session_expires_at: expiresAt,
			is_active: true,
			last_sync_status: null,
			last_sync_error: null,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'tenant_id,provider' }
	)

	if (error) throw new Error(error.message)

	revalidatePath('/zomato')
	return { success: true, resId: session.resId, expiresAt }
}

export async function disconnectZomato(tenantId: string): Promise<{ success: true }> {
	await assertTenantAccess(tenantId)
	const admin = createAdminClient()

	const { error } = await admin
		.from('pos_provider_credentials')
		.delete()
		.eq('tenant_id', tenantId)
		.eq('provider', ZOMATO_PROVIDER)

	if (error) throw new Error(error.message)

	revalidatePath('/zomato')
	return { success: true }
}

/** Live check that the stored session still authenticates. */
export async function verifyZomatoSession(tenantId: string): Promise<boolean> {
	await assertTenantAccess(tenantId)
	try {
		return await checkSession(await loadSession(tenantId))
	} catch {
		return false
	}
}

// ─── OTP login ───────────────────────────────────────────────────────────────

/**
 * Sends a login OTP to `phone`.
 *
 * Driven through a real browser: Zomato is behind Akamai, which rejects plain
 * HTTP clients at verify time and rejects headless Chromium at the TLS layer.
 * See lib/zomato-browser.ts. The browser stays open between this call and
 * verifyZomatoOtp because the OTP is bound to that page's session.
 */
export async function sendZomatoOtp(
	tenantId: string,
	phone: string
): Promise<{ sent: true; phone: string }> {
	await assertTenantAccess(tenantId)

	await startBrowserLogin(tenantId, phone)

	return { sent: true, phone: phone.replace(/\D/g, '').slice(-10) }
}

/**
 * Verifies the OTP and stores the resulting session.
 *
 * An existing working session is only overwritten once the new login has
 * actually produced a merchant token, so a failed attempt cannot log the
 * tenant out.
 */
export async function verifyZomatoOtp(
	tenantId: string,
	otp: string
): Promise<{ success: true; resId: string; expiresAt: string | null }> {
	await assertTenantAccess(tenantId)

	const session = await completeBrowserLogin(tenantId, otp)

	if (!session.resId) {
		throw new Error('Logged in, but no Zomato outlet is mapped to this account.')
	}

	const expiresAt = sessionExpiryFromToken(session.cookies)
	const admin = createAdminClient()

	const { error } = await admin.from('pos_provider_credentials').upsert(
		{
			tenant_id: tenantId,
			provider: ZOMATO_PROVIDER,
			session_data: session,
			session_expires_at: expiresAt,
			is_active: true,
			last_sync_status: null,
			last_sync_error: null,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'tenant_id,provider' }
	)

	if (error) throw new Error(error.message)

	revalidatePath('/zomato')
	return { success: true, resId: session.resId, expiresAt }
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export async function syncZomatoOrders(
	tenantId: string,
	days = 7
): Promise<ZomatoSyncResult> {
	await assertTenantAccess(tenantId)
	try {
		const result = await syncTenantZomatoOrders(tenantId, days)
		revalidatePath('/zomato')
		return result
	} catch (error) {
		if (error instanceof ZomatoError && error.needsReconnect) {
			throw new Error(`${error.message} Reconnect from the Zomato page to resume syncing.`)
		}
		throw error
	}
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getZomatoOrders(
	tenantId: string,
	startDate: string,
	endDate: string
): Promise<ZomatoOrderRow[]> {
	await assertTenantAccess(tenantId)
	const admin = createAdminClient()

	const { data, error } = await admin
		.from('zomato_orders')
		.select('id, external_id, status, customer_name, items_summary, amount, ordered_at')
		.eq('tenant_id', tenantId)
		.gte('ordered_at', startDate)
		.lte('ordered_at', endDate)
		.order('ordered_at', { ascending: false })

	if (error) throw new Error(error.message)

	return (data ?? []).map((row) => ({
		id: row.id as string,
		externalId: row.external_id as string,
		status: row.status as string | null,
		customerName: row.customer_name as string | null,
		itemsSummary: row.items_summary as string | null,
		amount: row.amount == null ? null : Number(row.amount),
		orderedAt: row.ordered_at as string
	}))
}

export type ZomatoSummary = {
	orderCount: number
	revenue: number
	averageOrderValue: number
	/** Order counts keyed by Zomato status (DELIVERED, CANCELLED, …). */
	byStatus: { status: string; count: number; revenue: number }[]
}

/** Statuses that represent a completed, paid order. */
const DELIVERED_STATUSES = new Set(['DELIVERED'])

export async function getZomatoSummary(
	tenantId: string,
	startDate: string,
	endDate: string
): Promise<ZomatoSummary> {
	const orders = await getZomatoOrders(tenantId, startDate, endDate)

	const statusMap = new Map<string, { status: string; count: number; revenue: number }>()
	for (const order of orders) {
		const status = order.status ?? 'UNKNOWN'
		const entry = statusMap.get(status) ?? { status, count: 0, revenue: 0 }
		entry.count++
		entry.revenue += order.amount ?? 0
		statusMap.set(status, entry)
	}

	// Only delivered orders count as revenue — a cancelled order was never paid.
	const delivered = orders.filter((o) => DELIVERED_STATUSES.has(String(o.status ?? '').toUpperCase()))
	const revenue = delivered.reduce((sum, o) => sum + (o.amount ?? 0), 0)

	return {
		orderCount: orders.length,
		revenue,
		averageOrderValue: delivered.length > 0 ? revenue / delivered.length : 0,
		byStatus: Array.from(statusMap.values()).sort((a, b) => b.count - a.count)
	}
}
