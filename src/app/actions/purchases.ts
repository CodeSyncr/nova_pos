'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type PurchaseItem = {
	ingredientId: string
	quantity: number
	unit: string
	unitPrice?: number
	totalPrice?: number
	expiryDate?: string
	batchNumber?: string
}

export async function createPurchase(
	tenantId: string,
	data: {
		supplierId?: string | null
		purchaseDate: string
		invoiceNumber?: string
		notes?: string
		items: PurchaseItem[]
		totalAmount?: number
	}
) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to create a purchase.')
	}

	// Calculate total amount
	const totalAmount = data.totalAmount !== undefined
		? data.totalAmount
		: data.items.reduce((sum, item) => {
			const itemTotal = item.totalPrice || (item.unitPrice || 0) * item.quantity
			return sum + itemTotal
		}, 0)

	// Create purchase
	const { data: purchase, error: purchaseError } = await supabase
		.from('purchases')
		.insert({
			tenant_id: tenantId,
			supplier_id: data.supplierId || null,
			purchase_date: data.purchaseDate,
			invoice_number: data.invoiceNumber || null,
			total_amount: totalAmount,
			notes: data.notes || null,
			status: 'completed',
			created_by: user.id
		})
		.select()
		.single()

	if (purchaseError) {
		throw new Error(purchaseError.message)
	}

	// Create purchase items only if items are provided
	if (data.items && data.items.length > 0) {
		const purchaseItems = data.items.map((item) => ({
			purchase_id: purchase.id,
			ingredient_id: item.ingredientId,
			quantity: item.quantity,
			unit: item.unit,
			unit_price: item.unitPrice || null,
			total_price: item.totalPrice || (item.unitPrice || 0) * item.quantity,
			expiry_date: item.expiryDate || null,
			batch_number: item.batchNumber || null
		}))

		const { error: itemsError } = await supabase
			.from('purchase_items')
			.insert(purchaseItems)

		if (itemsError) {
			// Rollback purchase if items fail
			await supabase.from('purchases').delete().eq('id', purchase.id)
			throw new Error(itemsError.message)
		}

		// Add stock from purchase using database function (only for item-based purchases)
		const { error: stockError } = await supabase.rpc('add_stock_from_purchase', {
			p_purchase_id: purchase.id
		})

		if (stockError) {
			console.error('Error adding stock from purchase:', stockError)
			// Continue even if stock addition fails - can be fixed manually
		}
	}

	revalidatePath('/purchases')
	revalidatePath('/inventory')

	return { purchaseId: purchase.id, success: true }
}

export async function getPurchases(tenantId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to view purchases.')
	}

	const { data, error } = await supabase
		.from('purchases')
		.select(
			`
      id,
      purchase_date,
      invoice_number,
      total_amount,
      status,
      notes,
      created_at,
      supplier:supplier_id (
        id,
        name
      ),
      created_by_profile:created_by (
        id,
        full_name
      )
    `
		)
		.eq('tenant_id', tenantId)
		.order('purchase_date', { ascending: false })

	if (error) {
		throw new Error(error.message)
	}

	return data
}

export async function getPurchaseDetails(purchaseId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to view purchase details.')
	}

	const { data: purchase, error: purchaseError } = await supabase
		.from('purchases')
		.select(
			`
      *,
      supplier:supplier_id (
        id,
        name,
        contact_person,
        email,
        phone
      ),
      purchase_items (
        id,
        quantity,
        unit,
        unit_price,
        total_price,
        expiry_date,
        batch_number,
        ingredient:ingredient_id (
          id,
          name,
          unit
        )
      )
    `
		)
		.eq('id', purchaseId)
		.single()

	if (purchaseError) {
		throw new Error(purchaseError.message)
	}

	return purchase
}

export async function deletePurchase(purchaseId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to delete a purchase.')
	}

	// Note: This will cascade delete purchase_items
	// But we should reverse the inventory transactions manually if needed
	const { error } = await supabase.from('purchases').delete().eq('id', purchaseId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/purchases')
	revalidatePath('/inventory')

	return { success: true }
}

