'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Deduct inventory for an order
 */
export async function deductInventoryForOrder(orderId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to deduct inventory.')
	}

	// Call the database function
	const { error } = await supabase.rpc('deduct_inventory_for_order', {
		p_order_id: orderId
	})

	if (error) {
		throw new Error(error.message)
	}

	return { success: true }
}

/**
 * Refund inventory for a cancelled/deleted order
 */
export async function refundInventoryForOrder(orderId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to refund inventory.')
	}

	// Call the database function
	const { error } = await supabase.rpc('refund_inventory_for_order', {
		p_order_id: orderId
	})

	if (error) {
		throw new Error(error.message)
	}

	return { success: true }
}

/**
 * Get inventory for a tenant
 */
export async function getInventory(tenantId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to view inventory.')
	}

	const { data, error } = await supabase
		.from('inventory')
		.select(
			`
      id,
      current_stock,
      unit,
      min_stock_level,
      max_stock_level,
      location,
      last_updated_at,
      ingredient:ingredient_id (
        id,
        name,
        unit
      )
    `
		)
		.eq('tenant_id', tenantId)
		.order('last_updated_at', { ascending: false })

	if (error) {
		throw new Error(error.message)
	}

	return data
}

/**
 * Get low stock items (below min_stock_level)
 */
export async function getLowStockItems(tenantId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to view low stock items.')
	}

	const { data, error } = await supabase
		.from('inventory')
		.select(
			`
      id,
      current_stock,
      unit,
      min_stock_level,
      ingredient:ingredient_id (
        id,
        name,
        unit
      )
    `
		)
		.eq('tenant_id', tenantId)
		.lt('current_stock', supabase.raw('min_stock_level'))
		.order('current_stock', { ascending: true })

	if (error) {
		throw new Error(error.message)
	}

	return data
}

/**
 * Adjust inventory manually (for corrections, waste, etc.)
 */
export async function adjustInventory(
	tenantId: string,
	ingredientId: string,
	quantity: number,
	unit: string,
	transactionType: 'adjustment' | 'waste',
	notes?: string
) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to adjust inventory.')
	}

	// Get or create inventory record
	const { data: existingInventory } = await supabase
		.from('inventory')
		.select('id, current_stock')
		.eq('tenant_id', tenantId)
		.eq('ingredient_id', ingredientId)
		.single()

	if (!existingInventory) {
		// Create inventory record
		const { error: createError } = await supabase.from('inventory').insert({
			tenant_id: tenantId,
			ingredient_id: ingredientId,
			current_stock: quantity,
			unit
		})

		if (createError) {
			throw new Error(createError.message)
		}
	} else {
		// Update inventory
		const { error: updateError } = await supabase
			.from('inventory')
			.update({
				current_stock: existingInventory.current_stock + quantity,
				last_updated_at: new Date().toISOString()
			})
			.eq('id', existingInventory.id)

		if (updateError) {
			throw new Error(updateError.message)
		}
	}

	// Create transaction record
	const { error: transactionError } = await supabase
		.from('inventory_transactions')
		.insert({
			tenant_id: tenantId,
			ingredient_id: ingredientId,
			transaction_type: transactionType,
			quantity,
			unit,
			reference_type: 'adjustment',
			notes,
			created_by: user.id
		})

	if (transactionError) {
		throw new Error(transactionError.message)
	}

	return { success: true }
}

/**
 * Update inventory min/max stock levels
 */
export async function updateInventoryLevels(
	inventoryId: string,
	minStockLevel?: number,
	maxStockLevel?: number,
	location?: string
) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to update inventory levels.')
	}

	const updates: Record<string, unknown> = {}

	if (minStockLevel !== undefined) {
		updates.min_stock_level = minStockLevel
	}

	if (maxStockLevel !== undefined) {
		updates.max_stock_level = maxStockLevel
	}

	if (location !== undefined) {
		updates.location = location
	}

	const { error } = await supabase
		.from('inventory')
		.update(updates)
		.eq('id', inventoryId)

	if (error) {
		throw new Error(error.message)
	}

	return { success: true }
}

/**
 * Get inventory transactions for an ingredient
 */
export async function getInventoryTransactions(
	tenantId: string,
	ingredientId?: string,
	limit = 50
) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to view transactions.')
	}

	let query = supabase
		.from('inventory_transactions')
		.select(
			`
      id,
      transaction_type,
      quantity,
      unit,
      reference_type,
      reference_id,
      notes,
      created_at,
      ingredient:ingredient_id (
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
		.order('created_at', { ascending: false })
		.limit(limit)

	if (ingredientId) {
		query = query.eq('ingredient_id', ingredientId)
	}

	const { data, error } = await query

	if (error) {
		throw new Error(error.message)
	}

	return data
}

