'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { DateRange } from '@/lib/date-utils'

export type SalesReportRow = {
	date: string
	orderCount: number
	subtotal: number
	tax: number
	discounts: number
	total: number
}

export type ItemSalesReportRow = {
	name: string
	quantity: number
	revenue: number
	averagePrice: number
}

export type CategorySalesReportRow = {
	category: string
	itemCount: number
	quantity: number
	revenue: number
}

export type CustomerReportRow = {
	id: string
	name: string
	phone: string | null
	email: string | null
	orderCount: number
	totalSpent: number
	lastOrderDate: string | null
}

export type PaymentMethodReportRow = {
	method: string
	orderCount: number
	total: number
}

export type PurchaseReportRow = {
	date: string
	description: string
	amount: number
}

export type InventoryReportRow = {
	name: string
	currentStock: number
	unit: string
	minStockLevel: number
	status: 'ok' | 'low' | 'critical'
}

export type TaxReportRow = {
	date: string
	taxableAmount: number
	taxCollected: number
	orderCount: number
}

// ─── Sales Report ───────────────────────────────────────────────────────────────

export async function getSalesReport(
	tenantId: string,
	dateRange: DateRange
): Promise<SalesReportRow[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: orders, error } = await supabase
		.from('orders')
		.select('completed_at, subtotal, tax, discount_amount, total')
		.eq('tenant_id', tenantId)
		.eq('status', 'completed')
		.gte('completed_at', dateRange.startDate)
		.lte('completed_at', dateRange.endDate)
		.order('completed_at', { ascending: true })

	if (error) throw new Error(error.message)

	// Group by date
	const dailyMap = new Map<string, SalesReportRow>()

	orders?.forEach((order) => {
		if (!order.completed_at) return
		const date = new Date(order.completed_at).toISOString().split('T')[0]!
		const existing = dailyMap.get(date) || {
			date,
			orderCount: 0,
			subtotal: 0,
			tax: 0,
			discounts: 0,
			total: 0
		}
		dailyMap.set(date, {
			date,
			orderCount: existing.orderCount + 1,
			subtotal: existing.subtotal + (order.subtotal || 0),
			tax: existing.tax + (order.tax || 0),
			discounts: existing.discounts + (order.discount_amount || 0),
			total: existing.total + (order.total || 0)
		})
	})

	return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Item Sales Report ──────────────────────────────────────────────────────────

export async function getItemSalesReport(
	tenantId: string,
	dateRange: DateRange
): Promise<ItemSalesReportRow[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: orders, error } = await supabase
		.from('orders')
		.select('order_items(name, quantity, unit_price, total_price)')
		.eq('tenant_id', tenantId)
		.eq('status', 'completed')
		.gte('completed_at', dateRange.startDate)
		.lte('completed_at', dateRange.endDate)

	if (error) throw new Error(error.message)

	const itemMap = new Map<string, { quantity: number; revenue: number }>()

	orders?.forEach((order) => {
		const items = (order.order_items as Array<{
			name: string
			quantity: number
			unit_price: number
			total_price: number
		}>) || []
		items.forEach((item) => {
			const existing = itemMap.get(item.name) || { quantity: 0, revenue: 0 }
			itemMap.set(item.name, {
				quantity: existing.quantity + item.quantity,
				revenue: existing.revenue + (item.total_price || item.unit_price * item.quantity)
			})
		})
	})

	return Array.from(itemMap.entries())
		.map(([name, data]) => ({
			name,
			quantity: data.quantity,
			revenue: data.revenue,
			averagePrice: data.quantity > 0 ? data.revenue / data.quantity : 0
		}))
		.sort((a, b) => b.revenue - a.revenue)
}

// ─── Category Sales Report ──────────────────────────────────────────────────────

export async function getCategorySalesReport(
	tenantId: string,
	dateRange: DateRange
): Promise<CategorySalesReportRow[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	// Get menu items with categories
	const { data: menuItems } = await supabase
		.from('menu_items')
		.select('id, name, category:category_id(name)')
		.eq('tenant_id', tenantId)

	const itemCategoryMap = new Map<string, string>()
	menuItems?.forEach((item) => {
		const cat = item.category as unknown
		const categoryName = Array.isArray(cat) ? cat[0]?.name : (cat as { name: string } | null)?.name
		const category = categoryName || 'Uncategorized'
		itemCategoryMap.set(item.name, category)
	})

	// Get orders with items
	const { data: orders, error } = await supabase
		.from('orders')
		.select('order_items(name, quantity, total_price)')
		.eq('tenant_id', tenantId)
		.eq('status', 'completed')
		.gte('completed_at', dateRange.startDate)
		.lte('completed_at', dateRange.endDate)

	if (error) throw new Error(error.message)

	const categoryMap = new Map<string, { itemNames: Set<string>; quantity: number; revenue: number }>()

	orders?.forEach((order) => {
		const items = (order.order_items as Array<{
			name: string
			quantity: number
			total_price: number
		}>) || []
		items.forEach((item) => {
			const category = itemCategoryMap.get(item.name) || 'Uncategorized'
			const existing = categoryMap.get(category) || { itemNames: new Set(), quantity: 0, revenue: 0 }
			existing.itemNames.add(item.name)
			existing.quantity += item.quantity
			existing.revenue += item.total_price || 0
			categoryMap.set(category, existing)
		})
	})

	return Array.from(categoryMap.entries())
		.map(([category, data]) => ({
			category,
			itemCount: data.itemNames.size,
			quantity: data.quantity,
			revenue: data.revenue
		}))
		.sort((a, b) => b.revenue - a.revenue)
}

// ─── Customer Report ────────────────────────────────────────────────────────────

export async function getCustomerReport(
	tenantId: string,
	dateRange: DateRange
): Promise<CustomerReportRow[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: orders, error } = await supabase
		.from('orders')
		.select('customer_name, customer_phone, customer_email, total, completed_at')
		.eq('tenant_id', tenantId)
		.eq('status', 'completed')
		.gte('completed_at', dateRange.startDate)
		.lte('completed_at', dateRange.endDate)
		.not('customer_phone', 'is', null)

	if (error) throw new Error(error.message)

	const customerMap = new Map<string, CustomerReportRow>()

	orders?.forEach((order) => {
		const key = order.customer_phone || order.customer_name || 'Unknown'
		const existing = customerMap.get(key) || {
			id: key,
			name: order.customer_name || 'Unknown',
			phone: order.customer_phone,
			email: order.customer_email,
			orderCount: 0,
			totalSpent: 0,
			lastOrderDate: null
		}
		existing.orderCount += 1
		existing.totalSpent += order.total || 0
		if (!existing.lastOrderDate || (order.completed_at && order.completed_at > existing.lastOrderDate)) {
			existing.lastOrderDate = order.completed_at
		}
		customerMap.set(key, existing)
	})

	return Array.from(customerMap.values()).sort((a, b) => b.totalSpent - a.totalSpent)
}

// ─── Payment Methods Report ─────────────────────────────────────────────────────

export async function getPaymentMethodReport(
	tenantId: string,
	dateRange: DateRange
): Promise<PaymentMethodReportRow[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: orders, error } = await supabase
		.from('orders')
		.select('payment_method, total')
		.eq('tenant_id', tenantId)
		.eq('status', 'completed')
		.gte('completed_at', dateRange.startDate)
		.lte('completed_at', dateRange.endDate)

	if (error) throw new Error(error.message)

	const methodMap = new Map<string, { orderCount: number; total: number }>()

	orders?.forEach((order) => {
		const method = order.payment_method || 'Not specified'
		const existing = methodMap.get(method) || { orderCount: 0, total: 0 }
		existing.orderCount += 1
		existing.total += order.total || 0
		methodMap.set(method, existing)
	})

	return Array.from(methodMap.entries())
		.map(([method, data]) => ({ method, ...data }))
		.sort((a, b) => b.total - a.total)
}

// ─── Purchase/Expense Report ────────────────────────────────────────────────────

export async function getPurchaseReport(
	tenantId: string,
	dateRange: DateRange
): Promise<PurchaseReportRow[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const startDate = new Date(dateRange.startDate).toISOString().split('T')[0]!
	const endDate = new Date(dateRange.endDate).toISOString().split('T')[0]!

	const { data: purchases, error } = await supabase
		.from('purchases')
		.select('purchase_date, notes, total_amount')
		.eq('tenant_id', tenantId)
		.gte('purchase_date', startDate)
		.lte('purchase_date', endDate)
		.order('purchase_date', { ascending: true })

	if (error) throw new Error(error.message)

	return (purchases || []).map((p) => ({
		date: p.purchase_date,
		description: p.notes || 'No description',
		amount: p.total_amount || 0
	}))
}

// ─── Inventory Report ───────────────────────────────────────────────────────────

export async function getInventoryReport(
	tenantId: string
): Promise<InventoryReportRow[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: inventory, error } = await supabase
		.from('inventory')
		.select('current_stock, unit, min_stock_level, ingredient:ingredient_id(name)')
		.eq('tenant_id', tenantId)
		.order('current_stock', { ascending: true })

	if (error) throw new Error(error.message)

	return (inventory || []).map((item) => {
		const ing = item.ingredient as unknown
		const ingredientName = Array.isArray(ing) ? ing[0]?.name : (ing as { name: string } | null)?.name
		const name = ingredientName || 'Unknown'
		const currentStock = item.current_stock || 0
		const minStock = item.min_stock_level || 0
		let status: 'ok' | 'low' | 'critical' = 'ok'
		if (currentStock <= 0) status = 'critical'
		else if (currentStock <= minStock) status = 'low'

		return {
			name,
			currentStock,
			unit: item.unit || 'units',
			minStockLevel: minStock,
			status
		}
	})
}

// ─── Tax Report ─────────────────────────────────────────────────────────────────

export async function getTaxReport(
	tenantId: string,
	dateRange: DateRange
): Promise<TaxReportRow[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: orders, error } = await supabase
		.from('orders')
		.select('completed_at, subtotal, tax')
		.eq('tenant_id', tenantId)
		.eq('status', 'completed')
		.gte('completed_at', dateRange.startDate)
		.lte('completed_at', dateRange.endDate)
		.order('completed_at', { ascending: true })

	if (error) throw new Error(error.message)

	const dailyMap = new Map<string, TaxReportRow>()

	orders?.forEach((order) => {
		if (!order.completed_at) return
		const date = new Date(order.completed_at).toISOString().split('T')[0]!
		const existing = dailyMap.get(date) || {
			date,
			taxableAmount: 0,
			taxCollected: 0,
			orderCount: 0
		}
		dailyMap.set(date, {
			date,
			taxableAmount: existing.taxableAmount + (order.subtotal || 0),
			taxCollected: existing.taxCollected + (order.tax || 0),
			orderCount: existing.orderCount + 1
		})
	})

	return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}
