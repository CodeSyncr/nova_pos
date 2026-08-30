/**
 * Turns an approved expense into real purchase records.
 *
 * Shared by the manual review queue and the auto-approval path taken when the
 * person who wrote the message is already allowed to approve. Both must create
 * identical records, so the logic lives in one place.
 *
 * Takes a service-role client: the auto-approval path runs without a user
 * session, and the caller is responsible for having checked permission first.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type MaterialiseInput = {
	tenantId: string
	itemName: string
	quantity: number | null
	unit: string | null
	amount: number | null
	supplierName: string | null
	purchasedOn: string
	createdBy: string | null
}

/** Creates the purchase (and its line item), returning the new purchase id. */
export async function materialisePurchase(
	admin: SupabaseClient,
	input: MaterialiseInput
): Promise<string> {
	// Match the supplier by name, or add the vendor.
	let supplierId: string | null = null
	if (input.supplierName) {
		const { data: existing } = await admin
			.from('suppliers')
			.select('id')
			.eq('tenant_id', input.tenantId)
			.ilike('name', input.supplierName)
			.maybeSingle()

		if (existing) {
			supplierId = existing.id as string
		} else {
			const { data: created } = await admin
				.from('suppliers')
				.insert({ tenant_id: input.tenantId, name: input.supplierName })
				.select('id')
				.maybeSingle()
			supplierId = (created?.id as string) ?? null
		}
	}

	const { data: purchase, error } = await admin
		.from('purchases')
		.insert({
			tenant_id: input.tenantId,
			supplier_id: supplierId,
			purchase_date: input.purchasedOn,
			total_amount: input.amount,
			notes: `Logged from chat: ${input.itemName}`,
			status: 'completed',
			created_by: input.createdBy
		})
		.select('id')
		.single()

	if (error) throw new Error(error.message)

	// Match the ingredient by name, or add it to the catalogue.
	let ingredientId: string | null = null
	const { data: ingredient } = await admin
		.from('ingredients')
		.select('id')
		.eq('tenant_id', input.tenantId)
		.ilike('name', input.itemName)
		.maybeSingle()

	if (ingredient) {
		ingredientId = ingredient.id as string
	} else {
		const { data: created } = await admin
			.from('ingredients')
			.insert({ tenant_id: input.tenantId, name: input.itemName, unit: input.unit })
			.select('id')
			.maybeSingle()
		ingredientId = (created?.id as string) ?? null
	}

	if (ingredientId) {
		await admin.from('purchase_items').insert({
			purchase_id: purchase.id,
			ingredient_id: ingredientId,
			quantity: input.quantity ?? 0,
			unit_price:
				input.amount && input.quantity ? input.amount / input.quantity : input.amount ?? 0,
			total_price: input.amount ?? 0
		})
	}

	return purchase.id as string
}

/** Removes a purchase created above, for undoing an auto-approval. */
export async function unmaterialisePurchase(
	admin: SupabaseClient,
	purchaseId: string
): Promise<void> {
	// purchase_items cascades on the purchase's delete.
	await admin.from('purchases').delete().eq('id', purchaseId)
}
