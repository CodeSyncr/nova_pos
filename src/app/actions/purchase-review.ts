'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { unmaterialisePurchase } from '@/lib/purchase-materialise'

/**
 * Review queue for purchases the chat AI spotted, plus the spend analytics
 * built from approved ones.
 *
 * Everything here reads through the caller's own session, so the
 * `pending_purchases` RLS policy (which requires the `purchases` permission)
 * is what actually gates access. An employee calling these gets an empty list
 * or a permission error from the database — not a UI-only hide.
 */

async function requireUser() {
	const supabase = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')
	return { supabase, userId: user.id }
}

export type PendingPurchase = {
	id: string
	itemName: string
	category: string
	quantity: number | null
	unit: string | null
	amount: number | null
	supplierName: string | null
	purchasedOn: string | null
	confidence: number
	status: 'pending' | 'approved' | 'rejected'
	reportedByName: string | null
	/** The original message, so a reviewer can check the AI against the wording. */
	sourceText: string | null
	createdAt: string
}

/**
 * True when the caller may see the purchase queue.
 *
 * Used to decide whether to render the review inbox and the insights panel at
 * all. The data itself is protected by RLS regardless.
 */
export async function canReviewPurchases(): Promise<boolean> {
	try {
		const { supabase } = await requireUser()
		const { error } = await supabase.from('pending_purchases').select('id').limit(1)
		return !error
	} catch {
		return false
	}
}

export async function getPendingPurchases(
	status: 'pending' | 'approved' | 'rejected' = 'pending'
): Promise<PendingPurchase[]> {
	const { supabase } = await requireUser()

	const { data, error } = await supabase
		.from('pending_purchases')
		.select(
			`id, item_name, category, quantity, unit, amount, supplier_name, purchased_on,
			 confidence, status, raw_extraction, created_at,
			 profiles:reported_by ( full_name )`
		)
		.eq('status', status)
		.order('created_at', { ascending: false })
		.limit(200)

	if (error) throw new Error(error.message)

	return (data ?? []).map((row) => {
		const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
		const raw = row.raw_extraction as { source?: string } | null
		return {
			id: row.id as string,
			itemName: row.item_name as string,
			category: row.category as string,
			quantity: row.quantity == null ? null : Number(row.quantity),
			unit: row.unit as string | null,
			amount: row.amount == null ? null : Number(row.amount),
			supplierName: row.supplier_name as string | null,
			purchasedOn: row.purchased_on as string | null,
			confidence: Number(row.confidence ?? 0),
			status: row.status as PendingPurchase['status'],
			reportedByName: (p as { full_name?: string } | null)?.full_name ?? null,
			sourceText: raw?.source ?? null,
			createdAt: row.created_at as string
		}
	})
}

/**
 * Approves a pending purchase, creating the real records.
 *
 * The reviewer's edits win over the AI's values — the whole point of the queue
 * is that a human corrects the extraction before it reaches reporting.
 *
 * An ingredient is matched by name or created, so a purchase logged from chat
 * lands in the same inventory vocabulary as one entered by hand.
 */
export async function approvePendingPurchase(
	id: string,
	edits?: {
		itemName?: string
		category?: string
		quantity?: number | null
		unit?: string | null
		amount?: number | null
		supplierName?: string | null
		purchasedOn?: string | null
	}
): Promise<{ success: true; purchaseId: string }> {
	const { supabase, userId } = await requireUser()

	const { data: pending, error: loadError } = await supabase
		.from('pending_purchases')
		.select('*')
		.eq('id', id)
		.maybeSingle()

	if (loadError) throw new Error(loadError.message)
	if (!pending) throw new Error('Purchase not found, or you do not have access to it')
	if (pending.status !== 'pending') throw new Error('This purchase has already been reviewed')

	const merged = {
		itemName: edits?.itemName ?? (pending.item_name as string),
		category: edits?.category ?? (pending.category as string),
		quantity: edits?.quantity !== undefined ? edits.quantity : (pending.quantity as number | null),
		unit: edits?.unit !== undefined ? edits.unit : (pending.unit as string | null),
		amount: edits?.amount !== undefined ? edits.amount : (pending.amount as number | null),
		supplierName:
			edits?.supplierName !== undefined
				? edits.supplierName
				: (pending.supplier_name as string | null),
		purchasedOn:
			edits?.purchasedOn ?? (pending.purchased_on as string | null) ?? new Date().toISOString().slice(0, 10)
	}

	const tenantId = pending.tenant_id as string

	// Resolve the supplier by name, creating one if this is a new vendor.
	let supplierId: string | null = null
	if (merged.supplierName) {
		const { data: supplier } = await supabase
			.from('suppliers')
			.select('id')
			.eq('tenant_id', tenantId)
			.ilike('name', merged.supplierName)
			.maybeSingle()

		if (supplier) {
			supplierId = supplier.id as string
		} else {
			const { data: created } = await supabase
				.from('suppliers')
				.insert({ tenant_id: tenantId, name: merged.supplierName })
				.select('id')
				.maybeSingle()
			supplierId = (created?.id as string) ?? null
		}
	}

	const { data: purchase, error: purchaseError } = await supabase
		.from('purchases')
		.insert({
			tenant_id: tenantId,
			supplier_id: supplierId,
			purchase_date: merged.purchasedOn,
			total_amount: merged.amount,
			notes: `Logged from chat: ${merged.itemName}`,
			status: 'completed',
			created_by: userId
		})
		.select('id')
		.single()

	if (purchaseError) throw new Error(purchaseError.message)

	// Match the ingredient by name, or add it to the catalogue.
	let ingredientId: string | null = null
	const { data: ingredient } = await supabase
		.from('ingredients')
		.select('id')
		.eq('tenant_id', tenantId)
		.ilike('name', merged.itemName)
		.maybeSingle()

	if (ingredient) {
		ingredientId = ingredient.id as string
	} else {
		const { data: created } = await supabase
			.from('ingredients')
			.insert({ tenant_id: tenantId, name: merged.itemName, unit: merged.unit })
			.select('id')
			.maybeSingle()
		ingredientId = (created?.id as string) ?? null
	}

	if (ingredientId) {
		await supabase.from('purchase_items').insert({
			purchase_id: purchase.id,
			ingredient_id: ingredientId,
			quantity: merged.quantity ?? 0,
			unit_price:
				merged.amount && merged.quantity ? merged.amount / merged.quantity : merged.amount ?? 0,
			total_price: merged.amount ?? 0
		})
	}

	const { error: updateError } = await supabase
		.from('pending_purchases')
		.update({
			status: 'approved',
			reviewed_by: userId,
			reviewed_at: new Date().toISOString(),
			purchase_id: purchase.id,
			// Persist the corrections so analytics reflect what was approved,
			// not what the model first guessed.
			item_name: merged.itemName,
			category: merged.category,
			quantity: merged.quantity,
			unit: merged.unit,
			amount: merged.amount,
			supplier_name: merged.supplierName,
			purchased_on: merged.purchasedOn,
			updated_at: new Date().toISOString()
		})
		.eq('id', id)

	if (updateError) throw new Error(updateError.message)

	revalidatePath('/chat')
	revalidatePath('/purchases')
	return { success: true, purchaseId: purchase.id as string }
}

export async function rejectPendingPurchase(id: string): Promise<{ success: true }> {
	const { supabase, userId } = await requireUser()

	const { error } = await supabase
		.from('pending_purchases')
		.update({
			status: 'rejected',
			reviewed_by: userId,
			reviewed_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', id)
		.eq('status', 'pending')

	if (error) throw new Error(error.message)

	revalidatePath('/chat')
	return { success: true }
}

// ─── Insights ────────────────────────────────────────────────────────────────

export type CategorySpend = {
	category: string
	total: number
	itemCount: number
}

export type PurchaseInsights = {
	totalSpend: number
	vegetableSpend: number
	pendingCount: number
	byCategory: CategorySpend[]
	topItems: { name: string; total: number; count: number }[]
}

/**
 * Spend analytics from approved chat-logged purchases.
 *
 * Only approved rows count — a pending extraction is an unverified guess and
 * must not appear in a spend figure someone might act on.
 */
export async function getPurchaseInsights(
	startDate: string,
	endDate: string
): Promise<PurchaseInsights> {
	const { supabase } = await requireUser()

	const { data, error } = await supabase
		.from('pending_purchases')
		.select('category, item_name, amount, status, purchased_on')
		.gte('purchased_on', startDate.slice(0, 10))
		.lte('purchased_on', endDate.slice(0, 10))

	if (error) throw new Error(error.message)

	const rows = data ?? []
	const approved = rows.filter((r) => r.status === 'approved')

	const categoryMap = new Map<string, CategorySpend>()
	const itemMap = new Map<string, { name: string; total: number; count: number }>()
	let totalSpend = 0

	for (const row of approved) {
		const amount = Number(row.amount ?? 0)
		totalSpend += amount

		const category = (row.category as string) || 'other'
		const entry = categoryMap.get(category) ?? { category, total: 0, itemCount: 0 }
		entry.total += amount
		entry.itemCount++
		categoryMap.set(category, entry)

		const name = ((row.item_name as string) || 'unknown').toLowerCase()
		const item = itemMap.get(name) ?? { name, total: 0, count: 0 }
		item.total += amount
		item.count++
		itemMap.set(name, item)
	}

	return {
		totalSpend,
		vegetableSpend: categoryMap.get('vegetables')?.total ?? 0,
		pendingCount: rows.filter((r) => r.status === 'pending').length,
		byCategory: Array.from(categoryMap.values()).sort((a, b) => b.total - a.total),
		topItems: Array.from(itemMap.values())
			.sort((a, b) => b.total - a.total)
			.slice(0, 10)
	}
}

/**
 * Reverses an entry that was approved automatically.
 *
 * The AI can misread an amount and its confidence score is not trustworthy, so
 * anything that reached the books without review has to be one click from
 * being taken back out. Deletes the purchase and marks the entry rejected.
 */
export async function undoApprovedPurchase(id: string): Promise<{ success: true }> {
	const { supabase, userId } = await requireUser()

	// Reading through the session first means RLS decides whether this caller
	// is allowed to touch the row at all.
	const { data: row, error } = await supabase
		.from('pending_purchases')
		.select('id, purchase_id')
		.eq('id', id)
		.maybeSingle()

	if (error) throw new Error(error.message)
	if (!row) throw new Error('Entry not found, or you do not have access to it')

	if (row.purchase_id) {
		const url = process.env.NEXT_PUBLIC_SUPABASE_URL
		const key = process.env.SUPABASE_SERVICE_ROLE_KEY
		if (!url || !key) throw new Error('Missing admin credentials')
		const admin = createClient(url, key, {
			auth: { autoRefreshToken: false, persistSession: false }
		})
		await unmaterialisePurchase(admin, row.purchase_id as string)
	}

	const { error: updateError } = await supabase
		.from('pending_purchases')
		.update({
			status: 'rejected',
			purchase_id: null,
			reviewed_by: userId,
			reviewed_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', id)

	if (updateError) throw new Error(updateError.message)

	revalidatePath('/chat')
	revalidatePath('/purchases')
	return { success: true }
}
