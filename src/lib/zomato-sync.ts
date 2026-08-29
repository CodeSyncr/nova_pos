/**
 * Core Zomato order sync, shared by the interactive server action and the cron
 * route.
 *
 * Lives outside `app/actions` for the same reason as pos-sync: everything a
 * `'use server'` module exports becomes a callable server action, and these
 * helpers skip the tenant-membership check because cron has no user session.
 * Callers reached from the browser MUST authorize first.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
	ZomatoError,
	fetchOrders,
	sessionExpiryFromToken,
	type ZomatoOrder,
	type ZomatoSession
} from '@/lib/zomato'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function createAdminClient(): SupabaseClient {
	if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing admin credentials')
	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	})
}

export const ZOMATO_PROVIDER = 'zomato'

export type ZomatoSyncResult = {
	fetched: number
	inserted: number
	updated: number
}

/** Reads the stored browser session for a tenant. */
export async function loadSession(tenantId: string): Promise<ZomatoSession> {
	const admin = createAdminClient()

	const { data, error } = await admin
		.from('pos_provider_credentials')
		.select('session_data, is_active')
		.eq('tenant_id', tenantId)
		.eq('provider', ZOMATO_PROVIDER)
		.maybeSingle()

	if (error) throw new Error(error.message)
	if (!data) throw new ZomatoError('Zomato is not connected for this tenant.', 'config', true)
	if (!data.is_active) throw new ZomatoError('Zomato sync is paused for this tenant.', 'config')

	const session = data.session_data as ZomatoSession | null
	if (!session?.cookies) {
		throw new ZomatoError('Stored Zomato session is empty — reconnect.', 'config', true)
	}

	return session
}

/**
 * Pulls Zomato orders into `zomato_orders`.
 *
 * Safe to re-run over an overlapping window: rows upsert on
 * (tenant_id, external_id), so a re-sync refreshes a status that changed
 * (PREPARING -> DELIVERED) without duplicating the order.
 *
 * NOTE: performs no authorization — see the module comment.
 */
export async function syncTenantZomatoOrders(
	tenantId: string,
	days = 7
): Promise<ZomatoSyncResult> {
	const admin = createAdminClient()
	const session = await loadSession(tenantId)

	const endDate = new Date()
	const startDate = new Date(endDate)
	startDate.setDate(startDate.getDate() - Math.max(0, days - 1))

	let orders: ZomatoOrder[]
	try {
		orders = await fetchOrders(session, startDate, endDate)
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		const needsReconnect = error instanceof ZomatoError && error.needsReconnect

		await admin
			.from('pos_provider_credentials')
			.update({
				last_sync_at: new Date().toISOString(),
				last_sync_status: needsReconnect ? 'reconnect_required' : 'error',
				last_sync_error: message
			})
			.eq('tenant_id', tenantId)
			.eq('provider', ZOMATO_PROVIDER)

		throw error
	}

	const externalIds = orders.map((o) => o.externalId)
	const existingIds = new Set<string>()

	if (externalIds.length > 0) {
		const { data: existing, error: existingError } = await admin
			.from('zomato_orders')
			.select('external_id')
			.eq('tenant_id', tenantId)
			.in('external_id', externalIds)

		if (existingError) throw new Error(existingError.message)
		for (const row of existing ?? []) existingIds.add(row.external_id as string)
	}

	if (orders.length > 0) {
		const rows = orders.map((o) => ({
			tenant_id: tenantId,
			external_id: o.externalId,
			res_id: o.resId,
			status: o.status,
			customer_name: o.customerName,
			items_summary: o.itemsSummary,
			amount: o.amount,
			ordered_at: o.orderedAt,
			raw: o.raw,
			synced_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		}))

		const { error: upsertError } = await admin
			.from('zomato_orders')
			.upsert(rows, { onConflict: 'tenant_id,external_id' })

		if (upsertError) throw new Error(upsertError.message)
	}

	await admin
		.from('pos_provider_credentials')
		.update({
			last_sync_at: new Date().toISOString(),
			last_sync_status: 'ok',
			last_sync_error: null,
			session_expires_at: sessionExpiryFromToken(session.cookies)
		})
		.eq('tenant_id', tenantId)
		.eq('provider', ZOMATO_PROVIDER)

	const inserted = orders.filter((o) => !existingIds.has(o.externalId)).length

	return {
		fetched: orders.length,
		inserted,
		updated: orders.length - inserted
	}
}
