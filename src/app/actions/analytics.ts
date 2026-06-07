'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { DateRange } from '@/lib/date-utils'

type AnalyticsData = {
	sales: number
	spendings: number
	profit: number
	loss: number
	orderCount: number
	purchaseCount: number
	averageOrderValue: number
	earningsIncludingDiscounts: number
	earningsExcludingDiscounts: number
	totalDiscounts: number
	expenses: number
	topSellingItems: Array<{
		name: string
		quantity: number
		revenue: number
	}>
	spendingByCategory: Array<{
		category: string
		amount: number
	}>
	dailyBreakdown: Array<{
		date: string
		sales: number
		spendings: number
		profit: number
	}>
	weeklyBreakdown?: Array<{
		day: string
		dayName: string
		sales: number
		spendings: number
		profit: number
	}>
}

export async function getAnalytics(
	tenantId: string,
	dateRange: DateRange,
	previousDateRange?: DateRange
): Promise<AnalyticsData & { previousPeriod?: AnalyticsData }> {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to view analytics.')
	}

	// Extract date-only strings from the date range
	// Parse the ISO strings and get the local date to avoid timezone conversion issues
	// This ensures we get the correct date (e.g., Jan 5) even if ISO shows Jan 4 due to timezone
	const startDateLocal = new Date(dateRange.startDate)
	const endDateLocal = new Date(dateRange.endDate)

	// Format as YYYY-MM-DD using local date components
	const formatLocalDate = (date: Date): string => {
		const year = date.getFullYear()
		const month = String(date.getMonth() + 1).padStart(2, '0')
		const day = String(date.getDate()).padStart(2, '0')
		return `${year}-${month}-${day}`
	}

	const startDateOnly = formatLocalDate(startDateLocal)
	const endDateOnly = formatLocalDate(endDateLocal)

	// Get completed orders (sales) within date range
	const { data: orders, error: ordersError } = await supabase
		.from('orders')
		.select(
			'id, total, subtotal, tax, discount_amount, created_at, completed_at, order_items(name, quantity, unit_price, total_price)'
		)
		.eq('tenant_id', tenantId)
		.eq('status', 'completed')
		.gte('completed_at', dateRange.startDate)
		.lte('completed_at', dateRange.endDate)
		.order('completed_at', { ascending: true })

	if (ordersError) {
		throw new Error(`Error fetching orders: ${ordersError.message}`)
	}

	// Get purchases (spendings) within date range
	// Use date-only strings to avoid timezone issues
	const { data: purchases, error: purchasesError } = await supabase
		.from('purchases')
		.select('id, total_amount, purchase_date, notes')
		.eq('tenant_id', tenantId)
		.gte('purchase_date', startDateOnly)
		.lte('purchase_date', endDateOnly)
		.order('purchase_date', { ascending: true })

	if (purchasesError) {
		throw new Error(`Error fetching purchases: ${purchasesError.message}`)
	}

	// Calculate earnings including discounts (total after discounts)
	// Recalculate total to ensure accuracy: subtotal + tax - discount_amount
	const earningsIncludingDiscounts =
		orders?.reduce((sum, order) => {
			const subtotal = order.subtotal || 0
			const tax = order.tax || 0
			const discountAmount = order.discount_amount || 0
			// Recalculate total instead of using stored value
			const calculatedTotal = subtotal + tax - discountAmount
			return sum + calculatedTotal
		}, 0) || 0

	// Calculate earnings excluding discounts (subtotal + tax before discounts)
	const earningsExcludingDiscounts =
		orders?.reduce((sum, order) => {
			const subtotal = order.subtotal || 0
			const tax = order.tax || 0
			return sum + subtotal + tax
		}, 0) || 0

	// Calculate total discounts
	const totalDiscounts =
		orders?.reduce((sum, order) => sum + (order.discount_amount || 0), 0) || 0

	// Calculate expenses (spendings)
	const expenses =
		purchases?.reduce(
			(sum, purchase) => sum + (purchase.total_amount || 0),
			0
		) || 0

	// Calculate profit/loss
	const profit =
		earningsIncludingDiscounts > expenses
			? earningsIncludingDiscounts - expenses
			: 0
	const loss =
		expenses > earningsIncludingDiscounts
			? expenses - earningsIncludingDiscounts
			: 0

	// Keep sales for backward compatibility (same as earnings including discounts)
	const sales = earningsIncludingDiscounts
	const spendings = expenses

	// Calculate order count
	const orderCount = orders?.length || 0

	// Calculate purchase count
	const purchaseCount = purchases?.length || 0

	// Calculate average order value
	const averageOrderValue = orderCount > 0 ? sales / orderCount : 0

	// Get top selling items
	const itemMap = new Map<
		string,
		{ name: string; quantity: number; revenue: number }
	>()

	orders?.forEach((order) => {
		const items =
			(order.order_items as Array<{
				name: string
				quantity: number
				unit_price: number
				total_price: number
			}>) || []

		items.forEach((item) => {
			const existing = itemMap.get(item.name) || {
				name: item.name,
				quantity: 0,
				revenue: 0
			}
			itemMap.set(item.name, {
				name: item.name,
				quantity: existing.quantity + item.quantity,
				revenue:
					existing.revenue +
					(item.total_price || item.unit_price * item.quantity)
			})
		})
	})

	const topSellingItems = Array.from(itemMap.values())
		.sort((a, b) => b.revenue - a.revenue)
		.slice(0, 10)

	// Categorize spendings by notes (purpose)
	// Filter purchases to only include those within the date range (using local dates)
	const spendingByCategoryMap = new Map<string, number>()

	purchases?.forEach((purchase) => {
		if (!purchase.purchase_date) return
		const purchaseDate = purchase.purchase_date
		// Only include purchases within the date range
		if (purchaseDate >= startDateOnly && purchaseDate <= endDateOnly) {
			const category = purchase.notes || 'Uncategorized'
			const existing = spendingByCategoryMap.get(category) || 0
			spendingByCategoryMap.set(
				category,
				existing + (purchase.total_amount || 0)
			)
		}
	})

	const spendingByCategory = Array.from(spendingByCategoryMap.entries())
		.map(([category, amount]) => ({ category, amount }))
		.sort((a, b) => b.amount - a.amount)
		.slice(0, 10)

	// Daily breakdown - only include dates strictly within the date range
	// Use strict date string comparison to avoid timezone issues
	const dailyMap = new Map<string, { sales: number; spendings: number }>()

	orders?.forEach((order) => {
		if (!order.completed_at) return
		// Get date string in YYYY-MM-DD format using local date (same as startDateOnly)
		const orderDateLocal = new Date(order.completed_at)
		const orderDate = formatLocalDate(orderDateLocal)
		// Strict comparison: only include dates >= startDateOnly and <= endDateOnly
		// This ensures Jan 4th is excluded when start date is Jan 5th
		if (orderDate >= startDateOnly && orderDate <= endDateOnly) {
			const existing = dailyMap.get(orderDate) || { sales: 0, spendings: 0 }
			// Recalculate total to ensure accuracy
			const subtotal = order.subtotal || 0
			const tax = order.tax || 0
			const discountAmount = order.discount_amount || 0
			const calculatedTotal = subtotal + tax - discountAmount
			dailyMap.set(orderDate, {
				...existing,
				sales: existing.sales + calculatedTotal
			})
		}
	})

	purchases?.forEach((purchase) => {
		if (!purchase.purchase_date) return
		const purchaseDate = purchase.purchase_date
		// Strict comparison: only include dates >= startDateOnly and <= endDateOnly
		if (purchaseDate >= startDateOnly && purchaseDate <= endDateOnly) {
			const existing = dailyMap.get(purchaseDate) || { sales: 0, spendings: 0 }
			dailyMap.set(purchaseDate, {
				...existing,
				spendings: existing.spendings + (purchase.total_amount || 0)
			})
		}
	})

	const dailyBreakdown = Array.from(dailyMap.entries())
		.map(([date, data]) => ({
			date,
			sales: data.sales,
			spendings: data.spendings,
			profit: data.sales - data.spendings
		}))
		.sort((a, b) => a.date.localeCompare(b.date))

	// Calculate weekly breakdown (Sunday to Saturday) - aggregates all days in period by day of week
	const weeklyBreakdownMap = new Map<
		string,
		{ sales: number; spendings: number }
	>()
	const dayNames = [
		'Sunday',
		'Monday',
		'Tuesday',
		'Wednesday',
		'Thursday',
		'Friday',
		'Saturday'
	]

	dailyBreakdown.forEach((day) => {
		const date = new Date(day.date)
		const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
		const dayName = dayNames[dayOfWeek]

		// Use dayOfWeek directly for sorting (Sunday = 0, Monday = 1, ..., Saturday = 6)
		const dayKey = `${dayOfWeek}-${dayName}`

		const existing = weeklyBreakdownMap.get(dayKey) || {
			sales: 0,
			spendings: 0
		}
		weeklyBreakdownMap.set(dayKey, {
			sales: existing.sales + day.sales,
			spendings: existing.spendings + day.spendings
		})
	})

	// Create weekly breakdown array (Sunday to Saturday)
	// Initialize with all 7 days to ensure all days are shown even if no data
	const weeklyBreakdown = dayNames.map((dayName, dayIndex) => {
		const dayKey = `${dayIndex}-${dayName}`
		const data = weeklyBreakdownMap.get(dayKey) || { sales: 0, spendings: 0 }
		return {
			day: dayKey,
			dayName,
			sales: data.sales,
			spendings: data.spendings,
			profit: data.sales - data.spendings
		}
	})

	const result: AnalyticsData & {
		previousPeriod?: AnalyticsData
		weeklyBreakdown?: typeof weeklyBreakdown
	} = {
		sales,
		spendings,
		profit,
		loss,
		orderCount,
		purchaseCount,
		averageOrderValue,
		topSellingItems,
		spendingByCategory,
		dailyBreakdown,
		weeklyBreakdown: weeklyBreakdown.length > 0 ? weeklyBreakdown : undefined,
		earningsIncludingDiscounts,
		earningsExcludingDiscounts,
		totalDiscounts,
		expenses
	}

	// If previous period range is provided, fetch and include it
	if (previousDateRange) {
		// Fetch previous period data without recursion
		const prevSupabase = await createSupabaseServerClient()
		const { data: prevOrders } = await prevSupabase
			.from('orders')
			.select(
				'id, total, subtotal, tax, discount_amount, completed_at, order_items(name, quantity, unit_price, total_price)'
			)
			.eq('tenant_id', tenantId)
			.eq('status', 'completed')
			.gte('completed_at', previousDateRange.startDate)
			.lte('completed_at', previousDateRange.endDate)

		// Extract date-only strings for previous period using local dates
		const prevStartDateLocal = new Date(previousDateRange.startDate)
		const prevEndDateLocal = new Date(previousDateRange.endDate)
		const prevStartDateOnly = formatLocalDate(prevStartDateLocal)
		const prevEndDateOnly = formatLocalDate(prevEndDateLocal)

		const { data: prevPurchases } = await prevSupabase
			.from('purchases')
			.select('id, total_amount, purchase_date, notes')
			.eq('tenant_id', tenantId)
			.gte('purchase_date', prevStartDateOnly)
			.lte('purchase_date', prevEndDateOnly)

		// Recalculate previous period earnings including discounts
		const prevEarningsIncludingDiscounts =
			prevOrders?.reduce((sum, order) => {
				const subtotal = order.subtotal || 0
				const tax = order.tax || 0
				const discountAmount = order.discount_amount || 0
				// Recalculate total instead of using stored value
				const calculatedTotal = subtotal + tax - discountAmount
				return sum + calculatedTotal
			}, 0) || 0
		const prevEarningsExcludingDiscounts =
			prevOrders?.reduce((sum, order) => {
				const subtotal = order.subtotal || 0
				const tax = order.tax || 0
				return sum + subtotal + tax
			}, 0) || 0
		const prevTotalDiscounts =
			prevOrders?.reduce(
				(sum, order) => sum + (order.discount_amount || 0),
				0
			) || 0
		const prevExpenses =
			prevPurchases?.reduce(
				(sum, purchase) => sum + (purchase.total_amount || 0),
				0
			) || 0
		const prevProfit =
			prevEarningsIncludingDiscounts > prevExpenses
				? prevEarningsIncludingDiscounts - prevExpenses
				: 0
		const prevLoss =
			prevExpenses > prevEarningsIncludingDiscounts
				? prevExpenses - prevEarningsIncludingDiscounts
				: 0

		result.previousPeriod = {
			sales: prevEarningsIncludingDiscounts,
			spendings: prevExpenses,
			profit: prevProfit,
			loss: prevLoss,
			orderCount: prevOrders?.length || 0,
			purchaseCount: prevPurchases?.length || 0,
			averageOrderValue:
				(prevOrders?.length || 0) > 0
					? prevEarningsIncludingDiscounts / (prevOrders?.length || 1)
					: 0,
			earningsIncludingDiscounts: prevEarningsIncludingDiscounts,
			earningsExcludingDiscounts: prevEarningsExcludingDiscounts,
			totalDiscounts: prevTotalDiscounts,
			expenses: prevExpenses,
			topSellingItems: [],
			spendingByCategory: [],
			dailyBreakdown: []
		}
	}

	return result
}
