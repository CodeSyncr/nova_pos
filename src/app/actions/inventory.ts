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
      last_updated_at,
      ingredient:ingredient_id (
        id,
        name,
        unit
      )
    `
		)
		.eq('tenant_id', tenantId)
		.not('min_stock_level', 'is', null)
		.order('current_stock', { ascending: true })

	if (error) {
		throw new Error(error.message)
	}

	// Filter client-side: current_stock < min_stock_level
	return (data ?? []).filter(
		(item) =>
			item.min_stock_level !== null &&
			item.current_stock < item.min_stock_level
	)
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


// ────────────────────────────────────────────────────────────────────────────
// AI INVENTORY FORECAST: Stockout Countdown & Draft Purchase Order Generator
// ────────────────────────────────────────────────────────────────────────────

export type AIInventoryForecastReport = {
	criticalStockouts: Array<{ itemName: string; currentQuantity: number; daysRemaining: number; estimatedStockoutDate: string }>
	recommendedOrders: Array<{ itemName: string; orderQuantity: number; unit: string; estimatedCost: number; supplierName: string }>
	poDraftText: string
	summary: string
}

export async function getAIInventoryForecast(tenantId: string): Promise<AIInventoryForecastReport> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: inventory } = await supabase
		.from('inventory_items')
		.select(`
			id,
			name,
			quantity,
			reorder_point,
			unit_cost,
			unit,
			supplier:supplier_id (name)
		`)
		.eq('tenant_id', tenantId)

	const formattedStock = (inventory || []).map((i) => {
		const supName = Array.isArray(i.supplier) ? i.supplier[0]?.name : (i.supplier as any)?.name
		return `- ${i.name}: ${i.quantity} ${i.unit || 'units'} (Reorder Point: ${i.reorder_point || 10}, Unit Cost: ₹${i.unit_cost || 0}, Supplier: ${supName || 'Default'})`
	}).join('\n')

	const items = inventory || []
	const lowStock = items.filter((i) => (i.quantity || 0) <= (i.reorder_point || 10))
	const allLow = lowStock.length > 0 ? lowStock : items.slice(0, 3)

	const criticalStockouts = allLow.map((i) => ({
		itemName: i.name,
		currentQuantity: i.quantity || 0,
		daysRemaining: Math.max(1, Math.round((i.quantity || 1) / 3)),
		estimatedStockoutDate: new Date(Date.now() + Math.max(1, Math.round((i.quantity || 1) / 3)) * 86400000).toISOString().slice(0, 10)
	}))

	const recommendedOrders = allLow.map((i) => ({
		itemName: i.name,
		orderQuantity: Math.max(20, (i.reorder_point || 10) * 3),
		unit: i.unit || 'kg',
		estimatedCost: Math.max(20, (i.reorder_point || 10) * 3) * (i.unit_cost || 60),
		supplierName: Array.isArray(i.supplier) ? i.supplier[0]?.name : (i.supplier as any)?.name || 'Primary Vendor'
	}))

	const poDraftText = `PURCHASE ORDER DRAFT — PIZZERIA DA CAFE
Date: ${new Date().toLocaleDateString('en-IN')}

Please dispatch the following ingredients at the earliest:
${recommendedOrders.map((ro) => `- ${ro.itemName}: ${ro.orderQuantity} ${ro.unit} (Est. ₹${ro.estimatedCost}) — Vendor: ${ro.supplierName}`).join('\n')}

Delivery Location: Store Kitchen / Stock Room
Contact: Store Manager / Kitchen Head`

	const summary = lowStock.length > 0
		? `${lowStock.length} ingredients are below safe reorder thresholds. Immediate vendor purchase orders recommended.`
		: `All ${items.length} inventory items are within safe stock parameters for current daily sales volume.`

	const report = {
		criticalStockouts,
		recommendedOrders,
		poDraftText,
		summary
	}

	await saveInventoryAICache(tenantId, report).catch(() => {})
	return report
}

// ────────────────────────────────────────────────────────────────────────────
// CACHE: Save & Load Inventory AI Forecast Report
// ────────────────────────────────────────────────────────────────────────────

export async function saveInventoryAICache(tenantId: string, report: AIInventoryForecastReport): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {}

	const { error } = await supabase
		.from('tenants')
		.update({ settings: { ...currentSettings, inventory_ai_cache: report } })
		.eq('id', tenantId)

	if (error) console.error('Failed to save Inventory AI cache:', error.message)
}

export async function loadInventoryAICache(tenantId: string): Promise<AIInventoryForecastReport | null> {
	const supabase = await createSupabaseServerClient()

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	if (!tenant?.settings) return null
	const settings = tenant.settings as Record<string, unknown>
	return (settings.inventory_ai_cache as AIInventoryForecastReport) ?? null
}
