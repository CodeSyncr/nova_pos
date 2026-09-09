'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
	type MonthlySalesRow,
	type TaxRegimeComparison,
	calculateNewRegimeTax,
	calculateOldRegimeTax,
	compareTaxRegimes
} from '@/lib/tax-calculations'

export type { MonthlySalesRow, TaxRegimeComparison }

// PostgREST returns an embedded to-one relation as an object, but the generated
// types widen it to an array, so both shapes are handled at the call sites.
type PurchaseWithSupplierRow = {
	id: string
	purchase_date: string
	notes: string | null
	total_amount: number | null
	supplier: { name: string } | Array<{ name: string }> | null
}
export { calculateNewRegimeTax, calculateOldRegimeTax, compareTaxRegimes }

export type TaxModuleData = {
	sales: {
		total: number
		subtotal: number
		tax: number
		discounts: number
		orderCount: number
		digitalSales: number
		cashSales: number
		digitalRatio: number // e.g., 85.5
		byPaymentMethod: Array<{ method: string; total: number; count: number }>
		monthlySales: MonthlySalesRow[]
	}
	purchases: Array<{
		id: string
		purchaseDate: string
		notes: string | null
		totalAmount: number
		supplierName: string | null
	}>
	sec44AD: {
		digitalProfit: number // 6% of digital sales
		cashProfit: number // 8% of cash sales
		totalPresumptiveProfit: number
		effectivePresumptiveRate: number
		turnoverLimit: number // 3 Cr if digital >= 95% else 2 Cr
		isEligible: boolean
		digitalRatio: number
		sec44ABAuditRequiredIfBelow: boolean
	}
	tdsCreditSec194O: {
		aggregatorSales: number
		estimatedTDS: number // 1% of aggregator sales
	}
}

// ── Main Server Action ────────────────────────────────────────────────────────

export async function getTaxModuleData(tenantId: string, yearStart: number): Promise<TaxModuleData> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	// Financial year start and end dates (IST timezone friendly bounds)
	const startDate = `${yearStart}-04-01T00:00:00Z`
	const endDate = `${yearStart + 1}-03-31T23:59:59Z`

	// 1. Fetch Orders for the financial year
	const orders = await fetchAllRows<{
		total: number | null
		subtotal: number | null
		tax: number | null
		discount_amount: number | null
		payment_method: string | null
		status: string | null
		created_at: string | null
	}>(() =>
		supabase
			.from('orders')
			.select('total, subtotal, tax, discount_amount, payment_method, status, created_at')
			.eq('tenant_id', tenantId)
			.eq('status', 'completed')
			.gte('created_at', startDate)
			.lte('created_at', endDate)
			.order('created_at', { ascending: true })
			.order('id', { ascending: true })
	)

	// Process Sales Summary
	let totalSales = 0
	let subtotalSales = 0
	let taxCollected = 0
	let discountsGiven = 0
	let digitalSales = 0
	let cashSales = 0
	let aggregatorSales = 0

	const paymentMethodMap = new Map<string, { total: number; count: number }>()
	const monthlySalesMap = new Map<string, { total: number; count: number }>()

	orders?.forEach((order) => {
		const orderTotal = order.total || 0
		totalSales += orderTotal
		subtotalSales += order.subtotal || 0
		taxCollected += order.tax || 0
		discountsGiven += order.discount_amount || 0

		const method = (order.payment_method || 'Other').toLowerCase()
		if (method === 'cash') {
			cashSales += orderTotal
		} else {
			digitalSales += orderTotal
			if (method.includes('swiggy') || method.includes('zomato') || method.includes('aggregator')) {
				aggregatorSales += orderTotal
			}
		}

		const methodKey = order.payment_method || 'Other'
		const existingMethod = paymentMethodMap.get(methodKey) || { total: 0, count: 0 }
		existingMethod.total += orderTotal
		existingMethod.count += 1
		paymentMethodMap.set(methodKey, existingMethod)

		if (order.created_at) {
			const date = new Date(order.created_at)
			const monthStr = date.toISOString().slice(0, 7)
			const existingMonth = monthlySalesMap.get(monthStr) || { total: 0, count: 0 }
			existingMonth.total += orderTotal
			existingMonth.count += 1
			monthlySalesMap.set(monthStr, existingMonth)
		}
	})

	const digitalRatio = totalSales > 0 ? (digitalSales / totalSales) * 100 : 100

	// Sec 44AD Calculations
	const digitalProfit = digitalSales * 0.06
	const cashProfit = cashSales * 0.08
	const totalPresumptiveProfit = digitalProfit + cashProfit
	const effectivePresumptiveRate = totalSales > 0 ? (totalPresumptiveProfit / totalSales) * 100 : 6
	const turnoverLimit = digitalRatio >= 95 ? 30000000 : 20000000 // 3 Cr or 2 Cr limit
	const isEligible = totalSales <= turnoverLimit

	const byPaymentMethod = Array.from(paymentMethodMap.entries()).map(([method, data]) => ({
		method,
		total: data.total,
		count: data.count
	}))

	const monthlySales = Array.from(monthlySalesMap.entries()).map(([month, data]) => ({
		month,
		total: data.total,
		orderCount: data.count
	})).sort((a, b) => a.month.localeCompare(b.month))

	// 2. Fetch Purchases/Expenses for the financial year
	const purchases = await fetchAllRows<PurchaseWithSupplierRow>(() =>
		supabase
			.from('purchases')
			.select(`
				id,
				purchase_date,
				notes,
				total_amount,
				supplier:supplier_id (name)
			`)
			.eq('tenant_id', tenantId)
			.gte('purchase_date', `${yearStart}-04-01`)
			.lte('purchase_date', `${yearStart + 1}-03-31`)
			.order('purchase_date', { ascending: true })
			.order('id', { ascending: true })
	)

	const processedPurchases = purchases.map((p) => {
		const supName = Array.isArray(p.supplier) ? p.supplier[0]?.name : (p.supplier as { name: string } | null)?.name
		return {
			id: p.id,
			purchaseDate: p.purchase_date,
			notes: p.notes,
			totalAmount: p.total_amount ?? 0,
			supplierName: supName || null
		}
	})

	// Estimated 1% TDS deducted u/s 194O by aggregators
	const estimatedTDS = aggregatorSales * 0.01

	return {
		sales: {
			total: totalSales,
			subtotal: subtotalSales,
			tax: taxCollected,
			discounts: discountsGiven,
			orderCount: orders?.length || 0,
			digitalSales,
			cashSales,
			digitalRatio: Number(digitalRatio.toFixed(1)),
			byPaymentMethod,
			monthlySales
		},
		purchases: processedPurchases,
		sec44AD: {
			digitalProfit: Math.round(digitalProfit),
			cashProfit: Math.round(cashProfit),
			totalPresumptiveProfit: Math.round(totalPresumptiveProfit),
			effectivePresumptiveRate: Number(effectivePresumptiveRate.toFixed(2)),
			turnoverLimit,
			isEligible,
			digitalRatio: Number(digitalRatio.toFixed(1)),
			sec44ABAuditRequiredIfBelow: true
		},
		tdsCreditSec194O: {
			aggregatorSales: Math.round(aggregatorSales),
			estimatedTDS: Math.round(estimatedTDS)
		}
	}
}
