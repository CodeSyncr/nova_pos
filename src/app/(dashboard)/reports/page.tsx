'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
	FileBarChart,
	Download,
	Calendar,
	TrendingUp,
	ShoppingBag,
	Users,
	CreditCard,
	Package,
	Receipt,
	Loader2,
	LayoutGrid,
	FileText
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { calculateDateRange, type DateRange } from '@/lib/date-utils'
import {
	getSalesReport,
	getItemSalesReport,
	getCategorySalesReport,
	getCustomerReport,
	getPaymentMethodReport,
	getPurchaseReport,
	getInventoryReport,
	getTaxReport,
	type SalesReportRow,
	type ItemSalesReportRow,
	type CategorySalesReportRow,
	type CustomerReportRow,
	type PaymentMethodReportRow,
	type PurchaseReportRow,
	type InventoryReportRow,
	type TaxReportRow
} from '@/app/actions/reports'
import { useToast } from '@/components/ui/toast'

type ReportType =
	| 'sales'
	| 'items'
	| 'categories'
	| 'customers'
	| 'payments'
	| 'purchases'
	| 'inventory'
	| 'tax'

const reportTypes: Array<{
	id: ReportType
	label: string
	icon: typeof TrendingUp
	description: string
	color: string
}> = [
	{ id: 'sales', label: 'Sales', icon: TrendingUp, description: 'Daily sales breakdown', color: 'from-[#E0342A]/20 to-[#E0342A]/5' },
	{ id: 'items', label: 'Item Sales', icon: ShoppingBag, description: 'Revenue by menu item', color: 'from-[#E0342A]/20 to-[#E0342A]/5' },
	{ id: 'categories', label: 'Categories', icon: LayoutGrid, description: 'Sales by category', color: 'from-[#E0342A]/20 to-[#E0342A]/5' },
	{ id: 'customers', label: 'Customers', icon: Users, description: 'Top customers by spend', color: 'from-[#E0342A]/20 to-[#E0342A]/5' },
	{ id: 'payments', label: 'Payments', icon: CreditCard, description: 'Payment method breakdown', color: 'from-[#E0342A]/20 to-[#E0342A]/5' },
	{ id: 'purchases', label: 'Purchases', icon: Receipt, description: 'Expense & purchase log', color: 'from-[#E0342A]/20 to-[#E0342A]/5' },
	{ id: 'inventory', label: 'Inventory', icon: Package, description: 'Current stock levels', color: 'from-[#E0342A]/20 to-[#E0342A]/5' },
	{ id: 'tax', label: 'Tax', icon: FileBarChart, description: 'Tax collected summary', color: 'from-[#E0342A]/20 to-[#E0342A]/5' }
]

type Period = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'

export default function ReportsPage() {
	const router = useRouter()
	const { success, error: showError } = useToast()

	const [tenantId, setTenantId] = useState('')
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	const [loading, setLoading] = useState(true)
	const [reportLoading, setReportLoading] = useState(false)

	const [activeReport, setActiveReport] = useState<ReportType>('sales')
	const [period, setPeriod] = useState<Period>('monthly')
	const [customFrom, setCustomFrom] = useState('')
	const [customTo, setCustomTo] = useState('')
	const [monthStartDay, setMonthStartDay] = useState(1)

	// Report data states
	const [salesData, setSalesData] = useState<SalesReportRow[]>([])
	const [itemsData, setItemsData] = useState<ItemSalesReportRow[]>([])
	const [categoriesData, setCategoriesData] = useState<CategorySalesReportRow[]>([])
	const [customersData, setCustomersData] = useState<CustomerReportRow[]>([])
	const [paymentsData, setPaymentsData] = useState<PaymentMethodReportRow[]>([])
	const [purchasesData, setPurchasesData] = useState<PurchaseReportRow[]>([])
	const [inventoryData, setInventoryData] = useState<InventoryReportRow[]>([])
	const [taxData, setTaxData] = useState<TaxReportRow[]>([])

	// Load tenant
	useEffect(() => {
		const load = async () => {
			const supabase = createSupabaseBrowserClient()
			const { data: { user } } = await supabase.auth.getUser()
			if (!user) { router.push('/login'); return }

			const { data: pt } = await supabase
				.from('profile_tenants')
				.select('tenant:tenants(id, settings)')
				.eq('profile_id', user.id)
				.single()

			const tenant = Array.isArray((pt as any)?.tenant) ? (pt as any).tenant[0] : (pt as any)?.tenant
			if (!tenant) { router.push('/onboarding'); return }

			setTenantId(tenant.id)
			const settings = tenant.settings as Record<string, unknown> | null
			if (settings?.currencySymbol) setCurrencySymbol(settings.currencySymbol as string)
			if (settings?.monthStartDay) setMonthStartDay(settings.monthStartDay as number)
			setLoading(false)
		}
		load()
	}, [router])

	const getDateRange = useCallback((): DateRange => {
		if (period === 'custom' && customFrom && customTo) {
			return calculateDateRange('custom', customFrom, customTo)
		}
		return calculateDateRange(period as any, undefined, undefined, monthStartDay)
	}, [period, customFrom, customTo, monthStartDay])

	const fetchReport = useCallback(async () => {
		if (!tenantId) return
		setReportLoading(true)
		try {
			const dateRange = getDateRange()
			switch (activeReport) {
				case 'sales':
					setSalesData(await getSalesReport(tenantId, dateRange))
					break
				case 'items':
					setItemsData(await getItemSalesReport(tenantId, dateRange))
					break
				case 'categories':
					setCategoriesData(await getCategorySalesReport(tenantId, dateRange))
					break
				case 'customers':
					setCustomersData(await getCustomerReport(tenantId, dateRange))
					break
				case 'payments':
					setPaymentsData(await getPaymentMethodReport(tenantId, dateRange))
					break
				case 'purchases':
					setPurchasesData(await getPurchaseReport(tenantId, dateRange))
					break
				case 'inventory':
					setInventoryData(await getInventoryReport(tenantId))
					break
				case 'tax':
					setTaxData(await getTaxReport(tenantId, dateRange))
					break
			}
		} catch (err: any) {
			showError(err.message || 'Failed to load report')
		} finally {
			setReportLoading(false)
		}
	}, [tenantId, activeReport, getDateRange, showError])

	useEffect(() => {
		if (tenantId) fetchReport()
	}, [tenantId, activeReport, period, customFrom, customTo, fetchReport])

	// ─── Server-Side Export ─────────────────────────────────────────────────────
	// Both PDF and Excel are generated by `/api/reports/export` so the heavy
	// jsPDF / ExcelJS code never ships to the browser. The client just hits
	// the URL and the browser triggers the download.

	const downloadFromServer = async (format: 'pdf' | 'xlsx' | 'csv') => {
		if (!tenantId) return
		try {
			const dr = getDateRange()
			const params = new URLSearchParams({
				type: activeReport,
				format,
				tenantId,
				start: dr.startDate,
				end: dr.endDate,
				currency: currencySymbol
			})
			const res = await fetch(`/api/reports/export?${params.toString()}`)
			if (!res.ok) {
				const err = await res.text()
				throw new Error(err || 'Export failed')
			}
			const blob = await res.blob()
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `${activeReport}-report.${format}`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)
			success(`${format.toUpperCase()} exported successfully!`)
		} catch (err: any) {
			showError(err.message || 'Failed to export report')
		}
	}

	// ─── CSV Export (legacy local) ──────────────────────────────────────────────

	const exportCSV = () => {
		let csvContent = ''
		let fileName = `${activeReport}-report.csv`

		switch (activeReport) {
			case 'sales':
				csvContent = 'Date,Orders,Subtotal,Tax,Discounts,Total\n'
				salesData.forEach((r) => {
					csvContent += `${r.date},${r.orderCount},${r.subtotal.toFixed(2)},${r.tax.toFixed(2)},${r.discounts.toFixed(2)},${r.total.toFixed(2)}\n`
				})
				break
			case 'items':
				csvContent = 'Item,Quantity Sold,Revenue,Average Price\n'
				itemsData.forEach((r) => {
					csvContent += `"${r.name}",${r.quantity},${r.revenue.toFixed(2)},${r.averagePrice.toFixed(2)}\n`
				})
				break
			case 'categories':
				csvContent = 'Category,Items,Quantity Sold,Revenue\n'
				categoriesData.forEach((r) => {
					csvContent += `"${r.category}",${r.itemCount},${r.quantity},${r.revenue.toFixed(2)}\n`
				})
				break
			case 'customers':
				csvContent = 'Name,Phone,Email,Orders,Total Spent,Last Order\n'
				customersData.forEach((r) => {
					csvContent += `"${r.name}","${r.phone || ''}","${r.email || ''}",${r.orderCount},${r.totalSpent.toFixed(2)},${r.lastOrderDate || ''}\n`
				})
				break
			case 'payments':
				csvContent = 'Payment Method,Orders,Total\n'
				paymentsData.forEach((r) => {
					csvContent += `"${r.method}",${r.orderCount},${r.total.toFixed(2)}\n`
				})
				break
			case 'purchases':
				csvContent = 'Date,Description,Amount\n'
				purchasesData.forEach((r) => {
					csvContent += `${r.date},"${r.description}",${r.amount.toFixed(2)}\n`
				})
				break
			case 'inventory':
				csvContent = 'Item,Current Stock,Unit,Min Level,Status\n'
				inventoryData.forEach((r) => {
					csvContent += `"${r.name}",${r.currentStock},${r.unit},${r.minStockLevel},${r.status}\n`
				})
				break
			case 'tax':
				csvContent = 'Date,Taxable Amount,Tax Collected,Orders\n'
				taxData.forEach((r) => {
					csvContent += `${r.date},${r.taxableAmount.toFixed(2)},${r.taxCollected.toFixed(2)},${r.orderCount}\n`
				})
				break
		}

		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
		const url = URL.createObjectURL(blob)
		const link = document.createElement('a')
		link.href = url
		link.download = fileName
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
		URL.revokeObjectURL(url)
		success('Report exported successfully!')
	}

	// ─── Format helpers ─────────────────────────────────────────────────────────

	const fmt = (n: number) => `${currencySymbol}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
	const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
	// PDF-safe: jsPDF default fonts (Helvetica) don't support ₹ (U+20B9) or special locale chars
	const fmtPdf = (n: number) => {
		// Format number manually to avoid locale special characters
		const fixed = n.toFixed(2)
		// Add Indian comma grouping manually (e.g. 1,23,456.00)
		const [intPart, decPart] = fixed.split('.')
		let formatted = intPart!
		if (formatted.length > 3) {
			// Last 3 digits
			let result = formatted.slice(-3)
			let remaining = formatted.slice(0, -3)
			// Group by 2 from right
			while (remaining.length > 0) {
				result = remaining.slice(-2) + ',' + result
				remaining = remaining.slice(0, -2)
			}
			formatted = result
		}
		return `Rs. ${formatted}.${decPart}`
	}

	// ─── PDF Export ─────────────────────────────────────────────────────────────

	const exportPDF = async () => {
		const { default: jsPDF } = await import('jspdf')
		const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
		const pageWidth = 210 // A4 mm
		const pageHeight = 297 // A4 mm
		const marginLeft = 14
		const marginRight = 14
		const marginTop = 20
		const marginBottom = 20
		const contentWidth = pageWidth - marginLeft - marginRight
		let y = marginTop

		const reportLabel = reportTypes.find((r) => r.id === activeReport)?.label || activeReport
		const dateRange = getDateRange()
		const periodLabel = period === 'custom'
			? `${fmtDate(new Date(dateRange.startDate).toISOString())} to ${fmtDate(new Date(dateRange.endDate).toISOString())}`
			: period.charAt(0).toUpperCase() + period.slice(1)

		// ── Header ──
		doc.setFontSize(20)
		doc.setFont('helvetica', 'bold')
		doc.text(`${reportLabel} Report`, marginLeft, y)
		y += 8

		doc.setFontSize(10)
		doc.setFont('helvetica', 'normal')
		doc.setTextColor(80, 80, 80)
		doc.text(`Period: ${periodLabel}`, marginLeft, y)
		y += 5
		doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, marginLeft, y)
		y += 3

		// Divider line
		doc.setDrawColor(180, 180, 180)
		doc.setLineWidth(0.3)
		doc.line(marginLeft, y + 2, marginLeft + contentWidth, y + 2)
		y += 8
		doc.setTextColor(0, 0, 0)

		// ── Table helper ──
		const drawTable = (headers: string[], rows: string[][], colWidths?: number[]) => {
			const cols = headers.length
			const widths = colWidths || headers.map(() => contentWidth / cols)
			const cellPad = 2
			const headerH = 8
			const rowH = 7

			// Ensure we start on page with room
			if (y + headerH + 10 > pageHeight - marginBottom) {
				doc.addPage()
				y = marginTop
			}

			// Header row
			doc.setFillColor(45, 55, 72)
			doc.rect(marginLeft, y, contentWidth, headerH, 'F')
			doc.setFontSize(8)
			doc.setFont('helvetica', 'bold')
			doc.setTextColor(255, 255, 255)
			let x = marginLeft
			headers.forEach((h, i) => {
				doc.text(h, x + cellPad, y + 5.5)
				x += widths[i]!
			})
			y += headerH

			// Data rows
			doc.setFont('helvetica', 'normal')
			doc.setFontSize(8)

			rows.forEach((row, rowIdx) => {
				// Page break with header repeat
				if (y + rowH > pageHeight - marginBottom) {
					doc.addPage()
					y = marginTop
					// Re-draw header
					doc.setFillColor(45, 55, 72)
					doc.rect(marginLeft, y, contentWidth, headerH, 'F')
					doc.setFontSize(8)
					doc.setFont('helvetica', 'bold')
					doc.setTextColor(255, 255, 255)
					let hx = marginLeft
					headers.forEach((h, i) => {
						doc.text(h, hx + cellPad, y + 5.5)
						hx += widths[i]!
					})
					y += headerH
					doc.setFont('helvetica', 'normal')
					doc.setFontSize(8)
				}

				// Alternating row bg
				if (rowIdx % 2 === 0) {
					doc.setFillColor(248, 249, 250)
					doc.rect(marginLeft, y, contentWidth, rowH, 'F')
				}

				doc.setTextColor(30, 30, 30)
				x = marginLeft
				row.forEach((cell, i) => {
					const maxChars = Math.floor((widths[i]! - cellPad * 2) / 1.8)
					const text = cell.length > maxChars ? cell.slice(0, maxChars - 1) + '..' : cell
					doc.text(text, x + cellPad, y + 4.8)
					x += widths[i]!
				})

				// Row separator
				doc.setDrawColor(220, 220, 220)
				doc.setLineWidth(0.1)
				doc.line(marginLeft, y + rowH, marginLeft + contentWidth, y + rowH)
				y += rowH
			})

			y += 6
		}

		// ── Summary helper ──
		const drawSummary = (items: Array<{ label: string; value: string }>) => {
			if (y + 18 > pageHeight - marginBottom) { doc.addPage(); y = marginTop }

			doc.setFillColor(240, 245, 255)
			doc.setDrawColor(180, 200, 240)
			doc.setLineWidth(0.3)
			doc.roundedRect(marginLeft, y, contentWidth, 16, 2, 2, 'FD')

			const colW = contentWidth / items.length
			let sx = marginLeft
			items.forEach((item) => {
				doc.setFontSize(7)
				doc.setFont('helvetica', 'normal')
				doc.setTextColor(80, 80, 80)
				doc.text(item.label, sx + 4, y + 5.5)
				doc.setFontSize(10)
				doc.setFont('helvetica', 'bold')
				doc.setTextColor(20, 20, 20)
				doc.text(item.value, sx + 4, y + 11.5)
				sx += colW
			})
			y += 22
		}

		// ── Report content ──
		switch (activeReport) {
			case 'sales': {
				drawTable(
					['Date', 'Orders', 'Subtotal', 'Tax', 'Discounts', 'Total'],
					salesData.map((r) => [fmtDate(r.date), r.orderCount.toString(), fmtPdf(r.subtotal), fmtPdf(r.tax), fmtPdf(r.discounts), fmtPdf(r.total)]),
					[28, 20, 30, 28, 30, 30]
				)
				const totalOrders = salesData.reduce((s, r) => s + r.orderCount, 0)
				const totalRevenue = salesData.reduce((s, r) => s + r.total, 0)
				const totalTax = salesData.reduce((s, r) => s + r.tax, 0)
				const totalDisc = salesData.reduce((s, r) => s + r.discounts, 0)
				drawSummary([
					{ label: 'Total Orders', value: totalOrders.toString() },
					{ label: 'Revenue', value: fmtPdf(totalRevenue) },
					{ label: 'Tax', value: fmtPdf(totalTax) },
					{ label: 'Discounts', value: fmtPdf(totalDisc) }
				])
				break
			}
			case 'items': {
				drawTable(
					['Item', 'Qty Sold', 'Revenue', 'Avg Price'],
					itemsData.map((r) => [r.name, r.quantity.toString(), fmtPdf(r.revenue), fmtPdf(r.averagePrice)]),
					[60, 25, 45, 40]
				)
				const totalQty = itemsData.reduce((s, r) => s + r.quantity, 0)
				const totalRev = itemsData.reduce((s, r) => s + r.revenue, 0)
				drawSummary([
					{ label: 'Unique Items', value: itemsData.length.toString() },
					{ label: 'Total Qty', value: totalQty.toString() },
					{ label: 'Total Revenue', value: fmtPdf(totalRev) }
				])
				break
			}
			case 'categories': {
				drawTable(
					['Category', 'Items', 'Qty Sold', 'Revenue'],
					categoriesData.map((r) => [r.category, r.itemCount.toString(), r.quantity.toString(), fmtPdf(r.revenue)]),
					[60, 25, 35, 45]
				)
				const totalCatRev = categoriesData.reduce((s, r) => s + r.revenue, 0)
				drawSummary([
					{ label: 'Categories', value: categoriesData.length.toString() },
					{ label: 'Total Revenue', value: fmtPdf(totalCatRev) }
				])
				break
			}
			case 'customers': {
				drawTable(
					['Customer', 'Phone', 'Orders', 'Total Spent', 'Last Order'],
					customersData.map((r) => [r.name, r.phone || '-', r.orderCount.toString(), fmtPdf(r.totalSpent), r.lastOrderDate ? fmtDate(r.lastOrderDate) : '-']),
					[42, 32, 20, 38, 35]
				)
				const totalSpent = customersData.reduce((s, r) => s + r.totalSpent, 0)
				drawSummary([
					{ label: 'Customers', value: customersData.length.toString() },
					{ label: 'Total Spent', value: fmtPdf(totalSpent) },
					{ label: 'Avg/Customer', value: customersData.length > 0 ? fmtPdf(totalSpent / customersData.length) : fmtPdf(0) }
				])
				break
			}
			case 'payments': {
				drawTable(
					['Payment Method', 'Orders', 'Total'],
					paymentsData.map((r) => [r.method, r.orderCount.toString(), fmtPdf(r.total)]),
					[70, 40, 55]
				)
				const totalPayments = paymentsData.reduce((s, r) => s + r.total, 0)
				drawSummary([
					{ label: 'Methods', value: paymentsData.length.toString() },
					{ label: 'Total', value: fmtPdf(totalPayments) }
				])
				break
			}
			case 'purchases': {
				drawTable(
					['Date', 'Description', 'Amount'],
					purchasesData.map((r) => [fmtDate(r.date), r.description, fmtPdf(r.amount)]),
					[30, 100, 40]
				)
				const totalPurchases = purchasesData.reduce((s, r) => s + r.amount, 0)
				drawSummary([
					{ label: 'Transactions', value: purchasesData.length.toString() },
					{ label: 'Total Spent', value: fmtPdf(totalPurchases) }
				])
				break
			}
			case 'inventory': {
				drawTable(
					['Item', 'Stock', 'Unit', 'Min Level', 'Status'],
					inventoryData.map((r) => [r.name, r.currentStock.toString(), r.unit, r.minStockLevel.toString(), r.status === 'ok' ? 'In Stock' : r.status === 'low' ? 'Low Stock' : 'Out of Stock']),
					[55, 25, 25, 28, 35]
				)
				const lowCount = inventoryData.filter((r) => r.status === 'low').length
				const criticalCount = inventoryData.filter((r) => r.status === 'critical').length
				drawSummary([
					{ label: 'Total Items', value: inventoryData.length.toString() },
					{ label: 'Low Stock', value: lowCount.toString() },
					{ label: 'Out of Stock', value: criticalCount.toString() }
				])
				break
			}
			case 'tax': {
				drawTable(
					['Date', 'Taxable Amount', 'Tax Collected', 'Orders'],
					taxData.map((r) => [fmtDate(r.date), fmtPdf(r.taxableAmount), fmtPdf(r.taxCollected), r.orderCount.toString()]),
					[35, 45, 45, 30]
				)
				const totalTaxCollected = taxData.reduce((s, r) => s + r.taxCollected, 0)
				const totalTaxable = taxData.reduce((s, r) => s + r.taxableAmount, 0)
				drawSummary([
					{ label: 'Taxable Sales', value: fmtPdf(totalTaxable) },
					{ label: 'Tax Collected', value: fmtPdf(totalTaxCollected) },
					{ label: 'Days', value: taxData.length.toString() }
				])
				break
			}
		}

		// ── Page numbers ──
		const totalPages = doc.getNumberOfPages()
		for (let i = 1; i <= totalPages; i++) {
			doc.setPage(i)
			doc.setFontSize(7)
			doc.setFont('helvetica', 'normal')
			doc.setTextColor(150, 150, 150)
			doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' })
		}

		doc.save(`${activeReport}-report.pdf`)
		success('PDF exported successfully!')
	}

	if (loading) {
		return (
			<div className="flex h-[calc(100vh-120px)] items-center justify-center">
				<div className="text-center">
					<div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white/60 mx-auto" />
					<p className="text-white/60">Loading reports...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-8 py-6">
			{/* Header */}
			<motion.header initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
				<Badge className="border-white/20 bg-white/10 text-white/80">
					<FileBarChart className="mr-2 h-4 w-4" /> Reports
				</Badge>
				<h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
					Business Reports
				</h1>
				<p className="max-w-2xl text-lg text-white/70">
					Generate, view, and export detailed reports across all areas of your business.
				</p>
			</motion.header>

			{/* Filters */}
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				className="flex flex-wrap items-end gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
			>
				<div>
					<label className="mb-1.5 block text-xs font-medium text-white/60">Period</label>
					<select
						value={period}
						onChange={(e) => setPeriod(e.target.value as Period)}
						className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
					>
						<option value="weekly">This Week</option>
						<option value="monthly">This Month</option>
						<option value="quarterly">This Quarter</option>
						<option value="yearly">This Year</option>
						<option value="custom">Custom Range</option>
					</select>
				</div>
				{period === 'custom' && (
					<>
						<div>
							<label className="mb-1.5 block text-xs font-medium text-white/60">From</label>
							<input
								type="date"
								value={customFrom}
								onChange={(e) => setCustomFrom(e.target.value)}
								className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
							/>
						</div>
						<div>
							<label className="mb-1.5 block text-xs font-medium text-white/60">To</label>
							<input
								type="date"
								value={customTo}
								onChange={(e) => setCustomTo(e.target.value)}
								className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
							/>
						</div>
					</>
				)}
				<div className="ml-auto flex items-center gap-2">
					<Button onClick={() => downloadFromServer('pdf')} disabled={reportLoading} variant="ghost">
						<FileText className="mr-2 h-4 w-4" />
						Export PDF
					</Button>
					<Button onClick={() => downloadFromServer('xlsx')} disabled={reportLoading} variant="ghost">
						<LayoutGrid className="mr-2 h-4 w-4" />
						Export Excel
					</Button>
					<Button onClick={() => downloadFromServer('csv')} disabled={reportLoading}>
						<Download className="mr-2 h-4 w-4" />
						Export CSV
					</Button>
				</div>
			</motion.div>

			{/* Report Type Selector */}
			<div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
				{reportTypes.map((rt) => {
					const Icon = rt.icon
					const isActive = activeReport === rt.id
					return (
						<motion.button
							key={rt.id}
							onClick={() => setActiveReport(rt.id)}
							whileHover={{ scale: 1.03 }}
							whileTap={{ scale: 0.97 }}
							className={`relative rounded-2xl border p-3 text-left transition-all ${
								isActive
									? 'border-white/40 bg-gradient-to-br ' + rt.color + ' shadow-lg'
									: 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
							}`}
						>
							<Icon className={`h-5 w-5 mb-2 ${isActive ? 'text-white' : 'text-white/60'}`} />
							<p className={`text-xs font-medium ${isActive ? 'text-white' : 'text-white/70'}`}>{rt.label}</p>
						</motion.button>
					)
				})}
			</div>

			{/* Report Content */}
			<motion.div
				key={activeReport}
				initial={{ opacity: 0, y: 15 }}
				animate={{ opacity: 1, y: 0 }}
				className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_30px_80px_rgba(4,5,16,0.65)] overflow-hidden"
			>
				{reportLoading ? (
					<div className="flex items-center justify-center py-20">
						<Loader2 className="h-8 w-8 animate-spin text-white/40" />
					</div>
				) : (
					<div className="overflow-x-auto">
						{activeReport === 'sales' && (
							<ReportTable
								headers={['Date', 'Orders', 'Subtotal', 'Tax', 'Discounts', 'Total']}
								rows={salesData.map((r) => [fmtDate(r.date), r.orderCount.toString(), fmt(r.subtotal), fmt(r.tax), fmt(r.discounts), fmt(r.total)])}
								emptyMessage="No sales data for this period"
							/>
						)}
						{activeReport === 'items' && (
							<ReportTable
								headers={['Item', 'Qty Sold', 'Revenue', 'Avg Price']}
								rows={itemsData.map((r) => [r.name, r.quantity.toString(), fmt(r.revenue), fmt(r.averagePrice)])}
								emptyMessage="No item sales for this period"
							/>
						)}
						{activeReport === 'categories' && (
							<ReportTable
								headers={['Category', 'Items', 'Qty Sold', 'Revenue']}
								rows={categoriesData.map((r) => [r.category, r.itemCount.toString(), r.quantity.toString(), fmt(r.revenue)])}
								emptyMessage="No category data for this period"
							/>
						)}
						{activeReport === 'customers' && (
							<ReportTable
								headers={['Customer', 'Phone', 'Orders', 'Total Spent', 'Last Order']}
								rows={customersData.map((r) => [r.name, r.phone || '—', r.orderCount.toString(), fmt(r.totalSpent), r.lastOrderDate ? fmtDate(r.lastOrderDate) : '—'])}
								emptyMessage="No customer data for this period"
							/>
						)}
						{activeReport === 'payments' && (
							<ReportTable
								headers={['Payment Method', 'Orders', 'Total']}
								rows={paymentsData.map((r) => [r.method, r.orderCount.toString(), fmt(r.total)])}
								emptyMessage="No payment data for this period"
							/>
						)}
						{activeReport === 'purchases' && (
							<ReportTable
								headers={['Date', 'Description', 'Amount']}
								rows={purchasesData.map((r) => [fmtDate(r.date), r.description, fmt(r.amount)])}
								emptyMessage="No purchases for this period"
							/>
						)}
						{activeReport === 'inventory' && (
							<ReportTable
								headers={['Item', 'Stock', 'Unit', 'Min Level', 'Status']}
								rows={inventoryData.map((r) => [
									r.name,
									r.currentStock.toString(),
									r.unit,
									r.minStockLevel.toString(),
									r.status
								])}
								emptyMessage="No inventory data"
								statusColumn={4}
							/>
						)}
						{activeReport === 'tax' && (
							<ReportTable
								headers={['Date', 'Taxable Amount', 'Tax Collected', 'Orders']}
								rows={taxData.map((r) => [fmtDate(r.date), fmt(r.taxableAmount), fmt(r.taxCollected), r.orderCount.toString()])}
								emptyMessage="No tax data for this period"
							/>
						)}
					</div>
				)}

				{/* Summary Footer */}
				{!reportLoading && <ReportSummary type={activeReport} data={{ salesData, itemsData, categoriesData, customersData, paymentsData, purchasesData, inventoryData, taxData }} fmt={fmt} />}
			</motion.div>
		</div>
	)
}

// ─── Table Component ────────────────────────────────────────────────────────────

function ReportTable({
	headers,
	rows,
	emptyMessage,
	statusColumn
}: {
	headers: string[]
	rows: string[][]
	emptyMessage: string
	statusColumn?: number
}) {
	if (rows.length === 0) {
		return (
			<div className="flex items-center justify-center py-16 text-white/50">
				<p>{emptyMessage}</p>
			</div>
		)
	}

	return (
		<table className="w-full text-sm">
			<thead>
				<tr className="border-b border-white/10 bg-white/5">
					{headers.map((h, i) => (
						<th key={i} className="px-5 py-4 text-left font-medium text-white/70 whitespace-nowrap">
							{h}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map((row, rowIdx) => (
					<tr
						key={rowIdx}
						className="border-b border-white/5 hover:bg-white/5 transition-colors"
					>
						{row.map((cell, cellIdx) => (
							<td key={cellIdx} className="px-5 py-3.5 text-white/80 whitespace-nowrap">
								{statusColumn !== undefined && cellIdx === statusColumn ? (
									<StatusBadge status={cell as 'ok' | 'low' | 'critical'} />
								) : (
									cell
								)}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	)
}

function StatusBadge({ status }: { status: 'ok' | 'low' | 'critical' }) {
	const styles = {
		ok: 'bg-white/10 text-white border-white/20',
		low: 'bg-[#E0342A]/20 text-[#E0342A] border-[#E0342A]/30',
		critical: 'bg-[#E0342A]/20 text-[#E0342A] border-[#E0342A]/30'
	}
	return (
		<span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
			{status === 'ok' ? 'In Stock' : status === 'low' ? 'Low Stock' : 'Out of Stock'}
		</span>
	)
}

// ─── Summary Footer ─────────────────────────────────────────────────────────────

function ReportSummary({
	type,
	data,
	fmt
}: {
	type: ReportType
	data: {
		salesData: SalesReportRow[]
		itemsData: ItemSalesReportRow[]
		categoriesData: CategorySalesReportRow[]
		customersData: CustomerReportRow[]
		paymentsData: PaymentMethodReportRow[]
		purchasesData: PurchaseReportRow[]
		inventoryData: InventoryReportRow[]
		taxData: TaxReportRow[]
	}
	fmt: (n: number) => string
}) {
	let summaryItems: Array<{ label: string; value: string }> = []

	switch (type) {
		case 'sales': {
			const totalOrders = data.salesData.reduce((s, r) => s + r.orderCount, 0)
			const totalRevenue = data.salesData.reduce((s, r) => s + r.total, 0)
			const totalTax = data.salesData.reduce((s, r) => s + r.tax, 0)
			const totalDiscounts = data.salesData.reduce((s, r) => s + r.discounts, 0)
			summaryItems = [
				{ label: 'Total Orders', value: totalOrders.toString() },
				{ label: 'Total Revenue', value: fmt(totalRevenue) },
				{ label: 'Total Tax', value: fmt(totalTax) },
				{ label: 'Total Discounts', value: fmt(totalDiscounts) }
			]
			break
		}
		case 'items': {
			const totalQty = data.itemsData.reduce((s, r) => s + r.quantity, 0)
			const totalRev = data.itemsData.reduce((s, r) => s + r.revenue, 0)
			summaryItems = [
				{ label: 'Unique Items', value: data.itemsData.length.toString() },
				{ label: 'Total Qty Sold', value: totalQty.toString() },
				{ label: 'Total Revenue', value: fmt(totalRev) }
			]
			break
		}
		case 'categories': {
			const totalCatRev = data.categoriesData.reduce((s, r) => s + r.revenue, 0)
			summaryItems = [
				{ label: 'Categories', value: data.categoriesData.length.toString() },
				{ label: 'Total Revenue', value: fmt(totalCatRev) }
			]
			break
		}
		case 'customers': {
			const totalSpent = data.customersData.reduce((s, r) => s + r.totalSpent, 0)
			summaryItems = [
				{ label: 'Customers', value: data.customersData.length.toString() },
				{ label: 'Total Spent', value: fmt(totalSpent) },
				{ label: 'Avg per Customer', value: data.customersData.length > 0 ? fmt(totalSpent / data.customersData.length) : fmt(0) }
			]
			break
		}
		case 'payments': {
			const totalPayments = data.paymentsData.reduce((s, r) => s + r.total, 0)
			summaryItems = [
				{ label: 'Methods Used', value: data.paymentsData.length.toString() },
				{ label: 'Total', value: fmt(totalPayments) }
			]
			break
		}
		case 'purchases': {
			const totalPurchases = data.purchasesData.reduce((s, r) => s + r.amount, 0)
			summaryItems = [
				{ label: 'Transactions', value: data.purchasesData.length.toString() },
				{ label: 'Total Spent', value: fmt(totalPurchases) }
			]
			break
		}
		case 'inventory': {
			const lowCount = data.inventoryData.filter((r) => r.status === 'low').length
			const criticalCount = data.inventoryData.filter((r) => r.status === 'critical').length
			summaryItems = [
				{ label: 'Total Items', value: data.inventoryData.length.toString() },
				{ label: 'Low Stock', value: lowCount.toString() },
				{ label: 'Out of Stock', value: criticalCount.toString() }
			]
			break
		}
		case 'tax': {
			const totalTaxCollected = data.taxData.reduce((s, r) => s + r.taxCollected, 0)
			const totalTaxable = data.taxData.reduce((s, r) => s + r.taxableAmount, 0)
			summaryItems = [
				{ label: 'Taxable Sales', value: fmt(totalTaxable) },
				{ label: 'Tax Collected', value: fmt(totalTaxCollected) },
				{ label: 'Days', value: data.taxData.length.toString() }
			]
			break
		}
	}

	if (summaryItems.length === 0) return null

	return (
		<div className="flex flex-wrap gap-6 border-t border-white/10 bg-white/5 px-6 py-4">
			{summaryItems.map((item, i) => (
				<div key={i} className="text-center">
					<p className="text-xs text-white/50 mb-0.5">{item.label}</p>
					<p className="text-sm font-semibold text-white">{item.value}</p>
				</div>
			))}
		</div>
	)
}
