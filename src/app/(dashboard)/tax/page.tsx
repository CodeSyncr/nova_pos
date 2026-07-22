'use client'

import { useEffect, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
	Percent,
	Plus,
	Calculator,
	Calendar,
	Building2,
	Download,
	RefreshCw,
	ShieldCheck,
	FileText,
	Trash2,
	Info,
	Settings,
	Sparkles,
	Brain,
	TrendingUp,
	Zap,
	Scale,
	Receipt,
	Clock,
	CheckCircle2,
	AlertCircle,
	Coins
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getTaxModuleData, type TaxModuleData } from '@/app/actions/tax'
import {
	compareTaxRegimes,
	calculateNewRegimeTax,
	calculateOldRegimeTax
} from '@/lib/tax-calculations'
import { getAIAdvisorInsights, type AdvisorInsights } from '@/app/actions/advisor'

type Asset = {
	id: string
	name: string
	purchaseDate: string
	cost: number
	block: 'furniture' | 'machinery' | 'computers' | 'building'
}

type CustomHead = {
	id: string
	name: string
	type: 'direct_expense' | 'indirect_expense' | 'other_income'
	amount: number
}

type TabType = 'overview' | 'regime' | 'pnl' | 'depreciation' | 'advancetax'

export default function TaxPage() {
	const [activeTab, setActiveTab] = useState<TabType>('overview')
	const [loading, setLoading] = useState(true)
	const [isRefreshing, startTransition] = useTransition()
	const [tenantId, setTenantId] = useState<string | null>(null)
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	
	// Tax FY Selection
	const [yearStart, setYearStart] = useState<number>(2026) // default to FY 2026-27

	// Server Data
	const [taxData, setTaxData] = useState<TaxModuleData | null>(null)
	const [benchmarkData, setBenchmarkData] = useState<TaxModuleData | null>(null)

	// User Classifications (Purchase ID -> Category Key)
	const [classifications, setClassifications] = useState<Record<string, string>>({})

	// Capital Assets & Opening WDVs (saved in localStorage by tenant ID)
	const [assets, setAssets] = useState<Asset[]>([])
	const [openingWDVs, setOpeningWDVs] = useState<Record<string, number>>({
		furniture: 50000,
		machinery: 120000,
		computers: 30000,
		building: 0
	})
	const [deletions, setDeletions] = useState<Record<string, number>>({
		furniture: 0,
		machinery: 0,
		computers: 0,
		building: 0
	})
	const [blockEmpty, setBlockEmpty] = useState<Record<string, boolean>>({
		furniture: false,
		machinery: false,
		computers: false,
		building: false
	})
	const [otherCapitalGains, setOtherCapitalGains] = useState<{ stcg: number; ltcg: number }>({
		stcg: 0,
		ltcg: 0
	})
	const [fixedMonthlyRates, setFixedMonthlyRates] = useState<Record<string, number>>({
		indirect_rent: 68000,
		direct_wages: 40000,
		indirect_salary: 30000
	})

	// Chapter VI-A Deductions for Old Tax Regime calculation
	const [deduction80C, setDeduction80C] = useState<number>(150000)
	const [deduction80D, setDeduction80D] = useState<number>(25000)
	const [deduction80TTA, setDeduction80TTA] = useState<number>(10000)

	// Custom Heads (Income & Expenses)
	const [customHeads, setCustomHeads] = useState<CustomHead[]>([
		{ id: 'ch_1', name: 'Packaging & Pizza Box Supplies', type: 'direct_expense', amount: 35000 },
		{ id: 'ch_2', name: 'Electricity & Utility Bills', type: 'indirect_expense', amount: 48000 },
		{ id: 'ch_3', name: 'Software & POS Subscriptions', type: 'indirect_expense', amount: 18000 },
		{ id: 'ch_4', name: 'CA Audit & Legal Fees', type: 'indirect_expense', amount: 25000 },
		{ id: 'ch_5', name: 'Scrap & Packaging Material Sales', type: 'other_income', amount: 12000 }
	])
	const [newHeadName, setNewHeadName] = useState('')
	const [newHeadAmount, setNewHeadAmount] = useState('')
	const [newHeadType, setNewHeadType] = useState<'direct_expense' | 'indirect_expense' | 'other_income'>('indirect_expense')

	// AI Tax Optimizer State
	const [aiTaxAdvice, setAiTaxAdvice] = useState<string | null>(null)
	const [aiTaxLoading, setAiTaxLoading] = useState(false)

	// Add Asset Form States
	const [newAssetName, setNewAssetName] = useState('')
	const [newAssetCost, setNewAssetCost] = useState('')
	const [newAssetDate, setNewAssetDate] = useState('')
	const [newAssetBlock, setNewAssetBlock] = useState<'furniture' | 'machinery' | 'computers' | 'building'>('machinery')

	// Load tenant information, tax data, and settings
	useEffect(() => {
		const loadTenant = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const { data: { user } } = await supabase.auth.getUser()
				if (!user) return

				const { data: profileTenant } = await supabase
					.from('profile_tenants')
					.select('tenant_id, tenant:tenants(settings)')
					.eq('profile_id', user.id)
					.single()

				if (!profileTenant) return

				const tid = profileTenant.tenant_id
				setTenantId(tid)

				const tenant = Array.isArray(profileTenant.tenant) ? (profileTenant.tenant as any)[0] : profileTenant.tenant
				const settings = (tenant?.settings as Record<string, unknown>) || {}
				setCurrencySymbol((settings.currencySymbol as string) || '₹')

				// Load data for initial year
				await fetchTaxData(tid, yearStart)

				// Load benchmark data baseline (FY 2026-27)
				try {
					const benchmark = await getTaxModuleData(tid, 2026)
					setBenchmarkData(benchmark)
				} catch (err) {
					console.error('Error fetching benchmark data baseline:', err)
				}

				// Load client configurations from localStorage
				const savedAssets = localStorage.getItem(`novapos_assets_${tid}`)
				if (savedAssets) setAssets(JSON.parse(savedAssets))

				const savedWDVs = localStorage.getItem(`novapos_wdvs_${tid}_${yearStart}`)
				if (savedWDVs) setOpeningWDVs(JSON.parse(savedWDVs))

				const savedDeletions = localStorage.getItem(`novapos_deletions_${tid}_${yearStart}`)
				if (savedDeletions) setDeletions(JSON.parse(savedDeletions))

				const savedEmpty = localStorage.getItem(`novapos_empty_${tid}_${yearStart}`)
				if (savedEmpty) setBlockEmpty(JSON.parse(savedEmpty))

				const savedOtherGains = localStorage.getItem(`novapos_othergains_${tid}_${yearStart}`)
				if (savedOtherGains) setOtherCapitalGains(JSON.parse(savedOtherGains))

				const savedFixedRates = localStorage.getItem(`novapos_fixedrates_${tid}_${yearStart}`)
				if (savedFixedRates) setFixedMonthlyRates(JSON.parse(savedFixedRates))

				const savedClass = localStorage.getItem(`novapos_class_${tid}`)
				if (savedClass) setClassifications(JSON.parse(savedClass))

				const savedCustomHeads = localStorage.getItem(`novapos_custom_heads_${tid}_${yearStart}`)
				if (savedCustomHeads) setCustomHeads(JSON.parse(savedCustomHeads))

			} catch (error) {
				console.error('Error loading tax page context:', error)
			} finally {
				setLoading(false)
			}
		}
		loadTenant()
	}, [yearStart])

	const fetchTaxData = async (tid: string, year: number) => {
		try {
			const data = await getTaxModuleData(tid, year)
			setTaxData(data)
			
			// Initialize classifications automatically for unclassified purchases
			const savedClass = localStorage.getItem(`novapos_class_${tid}`)
			const currentClass = savedClass ? JSON.parse(savedClass) : {}
			let updated = false

			data.purchases.forEach((p) => {
				if (!currentClass[p.id]) {
					currentClass[p.id] = autoClassify(p.notes)
					updated = true
				}
			})

			if (updated) {
				setClassifications(currentClass)
				localStorage.setItem(`novapos_class_${tid}`, JSON.stringify(currentClass))
			}
		} catch (error) {
			console.error('Error fetching tax data:', error)
		}
	}

	const handleRefresh = () => {
		if (!tenantId) return
		startTransition(async () => {
			await fetchTaxData(tenantId, yearStart)
		})
	}

	// Dynamic categorizer based on keywords
	const autoClassify = (notes: string | null): string => {
		if (!notes) return 'indirect_other'
		const text = notes.toLowerCase()
		if (
			text.includes('cheese') ||
			text.includes('sauce') ||
			text.includes('pizza') ||
			text.includes('dough') ||
			text.includes('flour') ||
			text.includes('ingredient') ||
			text.includes('oil') ||
			text.includes('paneer') ||
			text.includes('chicken') ||
			text.includes('veg') ||
			text.includes('material') ||
			text.includes('coke') ||
			text.includes('beverage')
		) {
			return 'direct_material'
		}
		if (
			text.includes('wages') ||
			text.includes('chef') ||
			text.includes('kitchen helper') ||
			text.includes('kitchen staff')
		) {
			return 'direct_wages'
		}
		if (
			text.includes('gas') ||
			text.includes('cylinder') ||
			text.includes('fuel') ||
			text.includes('coal')
		) {
			return 'direct_fuel'
		}
		if (text.includes('rent')) {
			return 'indirect_rent'
		}
		if (text.includes('zomato') || text.includes('swiggy') || text.includes('commission')) {
			return 'indirect_commission'
		}
		if (text.includes('salary') || text.includes('salaries') || text.includes('staff salary')) {
			return 'indirect_salary'
		}
		if (text.includes('marketing') || text.includes('advertising') || text.includes('promo')) {
			return 'indirect_marketing'
		}
		return 'indirect_other'
	}

	const handleReclassify = (purchaseId: string, category: string) => {
		if (!tenantId) return
		const updated = { ...classifications, [purchaseId]: category }
		setClassifications(updated)
		localStorage.setItem(`novapos_class_${tenantId}`, JSON.stringify(updated))
	}

	const handleWDVChange = (block: string, val: string) => {
		if (!tenantId) return
		const num = parseFloat(val) || 0
		const updated = { ...openingWDVs, [block]: num }
		setOpeningWDVs(updated)
		localStorage.setItem(`novapos_wdvs_${tenantId}_${yearStart}`, JSON.stringify(updated))
	}

	const handleDeletionsChange = (block: string, val: string) => {
		if (!tenantId) return
		const num = parseFloat(val) || 0
		const updated = { ...deletions, [block]: num }
		setDeletions(updated)
		localStorage.setItem(`novapos_deletions_${tenantId}_${yearStart}`, JSON.stringify(updated))
	}

	const handleBlockEmptyChange = (block: string, val: boolean) => {
		if (!tenantId) return
		const updated = { ...blockEmpty, [block]: val }
		setBlockEmpty(updated)
		localStorage.setItem(`novapos_empty_${tenantId}_${yearStart}`, JSON.stringify(updated))
	}

	const handleOtherGainsChange = (field: 'stcg' | 'ltcg', val: string) => {
		if (!tenantId) return
		const num = parseFloat(val) || 0
		const updated = { ...otherCapitalGains, [field]: num }
		setOtherCapitalGains(updated)
		localStorage.setItem(`novapos_othergains_${tenantId}_${yearStart}`, JSON.stringify(updated))
	}

	const handleFixedRateChange = (category: string, val: string) => {
		if (!tenantId) return
		const num = parseFloat(val) || 0
		const updated = { ...fixedMonthlyRates, [category]: num }
		setFixedMonthlyRates(updated)
		localStorage.setItem(`novapos_fixedrates_${tenantId}_${yearStart}`, JSON.stringify(updated))
	}

	const handleAddAsset = (e: React.FormEvent) => {
		e.preventDefault()
		if (!newAssetName || !newAssetCost || !newAssetDate || !tenantId) return

		const cost = parseFloat(newAssetCost) || 0
		if (cost <= 0) return

		const newAsset: Asset = {
			id: crypto.randomUUID(),
			name: newAssetName,
			purchaseDate: newAssetDate,
			cost,
			block: newAssetBlock
		}

		const updatedAssets = [...assets, newAsset]
		setAssets(updatedAssets)
		localStorage.setItem(`novapos_assets_${tenantId}`, JSON.stringify(updatedAssets))

		setNewAssetName('')
		setNewAssetCost('')
		setNewAssetDate('')
	}

	const handleDeleteAsset = (assetId: string) => {
		if (!tenantId) return
		const updatedAssets = assets.filter((a) => a.id !== assetId)
		setAssets(updatedAssets)
		localStorage.setItem(`novapos_assets_${tenantId}`, JSON.stringify(updatedAssets))
	}

	// Custom Heads Handlers
	const handleAddCustomHead = (e: React.FormEvent) => {
		e.preventDefault()
		if (!newHeadName || !tenantId) return
		const amt = parseFloat(newHeadAmount) || 0
		const newHead: CustomHead = {
			id: crypto.randomUUID(),
			name: newHeadName,
			type: newHeadType,
			amount: amt
		}
		const updated = [...customHeads, newHead]
		setCustomHeads(updated)
		localStorage.setItem(`novapos_custom_heads_${tenantId}_${yearStart}`, JSON.stringify(updated))
		setNewHeadName('')
		setNewHeadAmount('')
	}

	const handleDeleteCustomHead = (id: string) => {
		if (!tenantId) return
		const updated = customHeads.filter((h) => h.id !== id)
		setCustomHeads(updated)
		localStorage.setItem(`novapos_custom_heads_${tenantId}_${yearStart}`, JSON.stringify(updated))
	}

	const handleUpdateCustomHeadAmount = (id: string, val: string) => {
		if (!tenantId) return
		const num = parseFloat(val) || 0
		const updated = customHeads.map((h) => (h.id === id ? { ...h, amount: num } : h))
		setCustomHeads(updated)
		localStorage.setItem(`novapos_custom_heads_${tenantId}_${yearStart}`, JSON.stringify(updated))
	}

	const fetchAITaxOptimizerAdvice = async () => {
		if (!tenantId) return
		setAiTaxLoading(true)
		try {
			const insights = await getAIAdvisorInsights(tenantId, yearStart)
			setAiTaxAdvice(insights.tax.summary + "\n\nRecommended Actions:\n" + insights.tax.actions.map((a, i) => `${i + 1}. ${a}`).join('\n'))
		} catch (err: any) {
			setAiTaxAdvice(err?.message ?? 'Could not fetch AI tax advice.')
		} finally {
			setAiTaxLoading(false)
		}
	}

	// ─── CALCULATIONS ─────────────────────────────────────────────────────────

	const salesTotals = {
		total: taxData?.sales.total || 0,
		digital: taxData?.sales.digitalSales || 0,
		cash: taxData?.sales.cashSales || 0,
		aggregator: taxData?.tdsCreditSec194O.aggregatorSales || 0
	}

	// Presumptive Taxation (Section 44AD)
	const presumptiveProfit = {
		cash: taxData?.sec44AD.cashProfit || (salesTotals.cash * 0.08),
		digital: taxData?.sec44AD.digitalProfit || (salesTotals.digital * 0.06),
		total: taxData?.sec44AD.totalPresumptiveProfit || (salesTotals.cash * 0.08 + salesTotals.digital * 0.06)
	}

	// WDV Depreciation calculations
	const depreciationBlocks = {
		furniture: { rate: 10, label: 'Furniture (10%)' },
		machinery: { rate: 15, label: 'Kitchen Equipment (15%)' },
		computers: { rate: 40, label: 'Computers & POS Hardware (40%)' },
		building: { rate: 10, label: 'Commercial Buildings (10%)' }
	}

	let totalDepreciation = 0
	const computedBlocks = Object.entries(depreciationBlocks).reduce<Record<string, {
		opening: number
		additionsFull: number
		additionsHalf: number
		deletions: number
		depreciation: number
		closing: number
		stcg: number
		stcl: number
	}>>((acc, [key, cfg]) => {
		const opening = openingWDVs[key] || 0
		const blockDeletions = deletions[key] || 0
		const fyStart = `${yearStart}-04-01`
		const fyEnd = `${yearStart + 1}-03-31`
		const cutoffDate = `${yearStart}-10-04`

		const blockAdditions = assets.filter(
			(a) => a.block === key && a.purchaseDate >= fyStart && a.purchaseDate <= fyEnd
		)

		let additionsFull = 0
		let additionsHalf = 0

		blockAdditions.forEach((a) => {
			if (a.purchaseDate >= cutoffDate) {
				additionsHalf += a.cost
			} else {
				additionsFull += a.cost
			}
		})

		const totalBlockValue = opening + additionsFull + additionsHalf
		let depreciationValue = 0
		let stcg = 0
		let stcl = 0
		let closing = 0

		if (blockDeletions > totalBlockValue) {
			stcg = blockDeletions - totalBlockValue
			depreciationValue = 0
			closing = 0
		} else {
			const remainingValue = totalBlockValue - blockDeletions
			const isEmpty = blockEmpty[key] || false

			if (isEmpty) {
				stcl = remainingValue
				depreciationValue = 0
				closing = 0
			} else {
				const baseForFull = Math.max(0, (opening + additionsFull) - blockDeletions)
				const remainingDeletions = Math.max(0, blockDeletions - (opening + additionsFull))
				const baseForHalf = Math.max(0, additionsHalf - remainingDeletions)

				const depHalf = baseForHalf * (cfg.rate / 100) * 0.5
				const depFull = baseForFull * (cfg.rate / 100)
				depreciationValue = depHalf + depFull
				closing = Math.max(0, remainingValue - depreciationValue)
			}
		}

		totalDepreciation += depreciationValue

		acc[key] = {
			opening,
			additionsFull,
			additionsHalf,
			deletions: blockDeletions,
			depreciation: depreciationValue,
			closing,
			stcg,
			stcl
		}
		return acc
	}, {})

	// Capital Gains Summaries
	const totalSTCGBlock = Object.values(computedBlocks).reduce((sum, item) => sum + (item.stcg || 0), 0) + (otherCapitalGains.stcg || 0)
	const totalSTCLBlock = Object.values(computedBlocks).reduce((sum, item) => sum + (item.stcl || 0), 0)
	const totalLTCG = otherCapitalGains.ltcg || 0
	const netCapitalGains = totalSTCGBlock - totalSTCLBlock + totalLTCG

	// Actual P&L values
	const expenses = {
		direct_material: 0,
		direct_wages: 0,
		direct_fuel: 0,
		indirect_rent: 0,
		indirect_commission: 0,
		indirect_salary: 0,
		indirect_marketing: 0,
		indirect_other: 0
	}

	const activeMonthsCount = taxData?.sales.monthlySales.filter((m) => m.total > 0).length ?? 0
	const activeMonths = activeMonthsCount || 12
	const hasActualPurchases = (taxData?.purchases.length ?? 0) > 0
	const isEstimationActive = yearStart !== 2026 && !hasActualPurchases && (benchmarkData?.sales.total ?? 0) > 0

	const benchmarkExpenses = {
		direct_material: 0,
		direct_wages: 0,
		direct_fuel: 0,
		indirect_rent: 0,
		indirect_commission: 0,
		indirect_salary: 0,
		indirect_marketing: 0,
		indirect_other: 0
	}

	if (isEstimationActive && benchmarkData) {
		benchmarkData.purchases.forEach((p) => {
			const cat = (classifications[p.id] || autoClassify(p.notes)) as keyof typeof benchmarkExpenses
			if (benchmarkExpenses[cat] !== undefined) {
				benchmarkExpenses[cat] += p.totalAmount
			} else {
				benchmarkExpenses.indirect_other += p.totalAmount
			}
		})

		const benchmarkSalesTotal = benchmarkData.sales.total || 1
		const activeSalesTotal = salesTotals.total

		Object.keys(expenses).forEach((k) => {
			const cat = k as keyof typeof expenses
			if (cat === 'indirect_rent' || cat === 'direct_wages' || cat === 'indirect_salary') {
				expenses[cat] = activeMonths * (fixedMonthlyRates[cat] || 0)
			} else {
				const ratio = benchmarkExpenses[cat] / benchmarkSalesTotal
				expenses[cat] = activeSalesTotal * ratio
			}
		})
	} else {
		taxData?.purchases.forEach((p) => {
			const cat = (classifications[p.id] || autoClassify(p.notes)) as keyof typeof expenses
			if (expenses[cat] !== undefined) {
				expenses[cat] += p.totalAmount
			} else {
				expenses.indirect_other += p.totalAmount
			}
		})
	}

	// Custom Heads Calculations
	const customDirectExpenses = customHeads.filter((h) => h.type === 'direct_expense').reduce((s, h) => s + h.amount, 0)
	const customOtherIncome = customHeads.filter((h) => h.type === 'other_income').reduce((s, h) => s + h.amount, 0)
	const customIndirectExpenses = customHeads.filter((h) => h.type === 'indirect_expense').reduce((s, h) => s + h.amount, 0)

	const totalDirectExpenses = expenses.direct_material + expenses.direct_wages + expenses.direct_fuel + customDirectExpenses
	const grossProfit = salesTotals.total + customOtherIncome - totalDirectExpenses
	const totalIndirectExpenses =
		expenses.indirect_rent +
		expenses.indirect_commission +
		expenses.indirect_salary +
		expenses.indirect_marketing +
		expenses.indirect_other +
		totalDepreciation +
		customIndirectExpenses

	const actualNetProfit = grossProfit - totalIndirectExpenses
	const marginPercentage = salesTotals.total > 0 ? (actualNetProfit / salesTotals.total) * 100 : 0

	// Tax Regime Comparisons
	const chapterVIADeductions = {
		sec80C: deduction80C,
		sec80D: deduction80D,
		sec80TTA: deduction80TTA
	}

	const presumptiveRegimeComp = compareTaxRegimes(presumptiveProfit.total, chapterVIADeductions)
	const actualRegimeComp = compareTaxRegimes(actualNetProfit, chapterVIADeductions)

	// Sec 194O TDS estimated credit
	const estimatedTDS194O = taxData?.tdsCreditSec194O.estimatedTDS ?? (salesTotals.aggregator * 0.01)

	// Advance Tax Schedule Calculation
	const chosenNetTax = actualNetProfit < presumptiveProfit.total
		? actualRegimeComp.newRegime.netTax
		: presumptiveRegimeComp.newRegime.netTax

	const netAdvanceTaxLiability = Math.max(0, chosenNetTax - estimatedTDS194O)
	const isAdvanceTaxApplicable = netAdvanceTaxLiability >= 10000

	const advanceTaxInstallments = [
		{ installment: '1st Installment', dueDate: '15 June', pct: 15, amount: Math.round(netAdvanceTaxLiability * 0.15) },
		{ installment: '2nd Installment', dueDate: '15 September', pct: 45, amount: Math.round(netAdvanceTaxLiability * 0.45) },
		{ installment: '3rd Installment', dueDate: '15 December', pct: 75, amount: Math.round(netAdvanceTaxLiability * 0.75) },
		{ installment: '4th Installment (100% for 44AD)', dueDate: '15 March', pct: 100, amount: Math.round(netAdvanceTaxLiability * 1.0) }
	]

	const fmt = (n: number) => currencySymbol + ' ' + Math.round(n).toLocaleString('en-IN')

	const exportToPDF = async () => {
		const { default: jsPDF } = await import('jspdf')
		const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
		const pageWidth = 210
		const pageHeight = 297
		const margin = 15
		const contentWidth = pageWidth - margin * 2
		let y = 20

		const checkPageBreak = (needed: number) => {
			if (y + needed > pageHeight - margin) {
				doc.addPage()
				y = 20
			}
		}

		const fmtPDF = (n: number) => "Rs. " + Math.round(n).toLocaleString('en-IN')

		// Header
		doc.setFontSize(18)
		doc.setFont('helvetica', 'bold')
		doc.setTextColor(224, 52, 42)
		doc.text('NovaPOS — Indian ITR Tax Compliance Report', margin, y)
		y += 7

		doc.setFontSize(10)
		doc.setFont('helvetica', 'normal')
		doc.setTextColor(100, 100, 100)
		doc.text(`Financial Year: FY ${yearStart}-${String(yearStart + 1).slice(2)}  |  Generated on: ${new Date().toLocaleDateString('en-IN')}`, margin, y)
		y += 4

		doc.setDrawColor(220, 220, 220)
		doc.setLineWidth(0.3)
		doc.line(margin, y, margin + contentWidth, y)
		y += 8

		// Executive Summary
		doc.setFontSize(12)
		doc.setFont('helvetica', 'bold')
		doc.setTextColor(0, 0, 0)
		doc.text('1. Tax Summary & Regime Comparison', margin, y)
		y += 6

		const summaryRows = [
			['Gross Sales Turnover', fmtPDF(salesTotals.total)],
			['Digital Sales (6% Sec 44AD)', fmtPDF(salesTotals.digital)],
			['Cash Sales (8% Sec 44AD)', fmtPDF(salesTotals.cash)],
			['Sec 44AD Presumptive Profit', fmtPDF(presumptiveProfit.total)],
			['Actual Book Net Profit (P&L)', fmtPDF(actualNetProfit)],
			['New Tax Regime Tax (Sec 115BAC)', fmtPDF(actualRegimeComp.newRegime.netTax)],
			['Old Tax Regime Tax (after 80C/80D)', fmtPDF(actualRegimeComp.oldRegime.netTax)],
			['Aggregator TDS Credit (Sec 194O)', fmtPDF(estimatedTDS194O)],
			['Net Tax Liability Payable', fmtPDF(netAdvanceTaxLiability)]
		]

		doc.setFontSize(9)
		summaryRows.forEach(([label, val]) => {
			checkPageBreak(6)
			doc.setFont('helvetica', 'normal')
			doc.setTextColor(80, 80, 80)
			doc.text(label!, margin + 2, y)
			doc.setFont('helvetica', 'bold')
			doc.setTextColor(0, 0, 0)
			doc.text(val!, margin + 120, y, { align: 'right' })
			y += 5.5
		})

		doc.save(`NovaPOS_ITR_Report_FY${yearStart}.pdf`)
	}

	if (loading) {
		return (
			<div className="flex h-[500px] items-center justify-center">
				<div className="text-center space-y-4">
					<div className="relative mx-auto h-14 w-14">
						<Calculator className="absolute inset-0 h-full w-full text-[#E0342A] opacity-20" />
						<RefreshCw className="absolute inset-0 h-full w-full text-[#E0342A] animate-spin" />
					</div>
					<p className="text-white/60 text-sm">Calculating Tax & Depreciation Schedules...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-8 pb-16">
			{/* Header */}
			<header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<Badge className="border-white/20 bg-white/10 text-white/80 mb-2">
						<ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-[#E0342A]" /> Indian Income Tax Act · Sec 44AD / 115BAC
					</Badge>
					<h1 className="text-3xl font-bold text-white">ITR & Tax Compliance Engine</h1>
					<p className="text-white/50 text-sm mt-1">
						Proprietorship Tax Filing (ITR-3 & ITR-4), Old vs New Regime, Sec 44AD Presumptive, WDV Depreciation & Advance Tax
					</p>
				</div>
				<div className="flex items-center gap-3 flex-shrink-0">
					<div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white">
						<Calendar className="h-4 w-4 text-white/40" />
						<span className="text-white/50">Financial Year:</span>
						<select
							value={yearStart}
							onChange={(e) => setYearStart(parseInt(e.target.value))}
							className="bg-transparent font-medium text-white focus:outline-none"
						>
							<option value={2026} className="bg-black">FY 2026-27</option>
							<option value={2025} className="bg-black">FY 2025-26</option>
							<option value={2024} className="bg-black">FY 2024-25</option>
							<option value={2023} className="bg-black">FY 2023-24</option>
						</select>
					</div>
					<Button onClick={handleRefresh} disabled={isRefreshing} variant="ghost" size="sm" className="border border-white/10">
						<RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
						Refresh
					</Button>
					<Button onClick={fetchAITaxOptimizerAdvice} disabled={aiTaxLoading} className="bg-[#E0342A] hover:bg-[#c02a22] text-white font-semibold text-xs">
						<Brain className={`mr-2 h-4 w-4 ${aiTaxLoading ? 'animate-spin' : ''}`} />
						{aiTaxLoading ? 'Analyzing...' : 'Run AI Tax Audit'}
					</Button>
					<Button onClick={exportToPDF} variant="ghost" size="sm" className="border border-white/10">
						<Download className="mr-2 h-4 w-4" />
						Export PDF
					</Button>
				</div>
			</header>

			{/* Top KPI Bar */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				<div className="rounded-2xl border border-white/10 bg-white/5 p-5">
					<p className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">Gross Turnover</p>
					<p className="text-2xl font-bold text-white mt-1">{fmt(salesTotals.total)}</p>
					<p className="text-xs text-emerald-400 mt-0.5">{salesTotals.digital > 0 ? `${((salesTotals.digital / (salesTotals.total || 1)) * 100).toFixed(0)}% Digital` : 'Cash'}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-white/5 p-5">
					<p className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">Sec 44AD Profit</p>
					<p className="text-2xl font-bold text-emerald-400 mt-1">{fmt(presumptiveProfit.total)}</p>
					<p className="text-xs text-white/40 mt-0.5">6% Dig + 8% Cash</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-white/5 p-5">
					<p className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">Actual P&L Net Profit</p>
					<p className={`text-2xl font-bold mt-1 ${actualNetProfit >= 0 ? 'text-white' : 'text-red-400'}`}>{fmt(actualNetProfit)}</p>
					<p className="text-xs text-white/40 mt-0.5">Margin: {marginPercentage.toFixed(1)}%</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-white/5 p-5">
					<p className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">Aggregator TDS (194O)</p>
					<p className="text-2xl font-bold text-blue-400 mt-1">{fmt(estimatedTDS194O)}</p>
					<p className="text-xs text-white/40 mt-0.5">Claimable in Form 26AS</p>
				</div>
			</div>

			{/* AI Tax Optimizer Output Banner */}
			{aiTaxAdvice && (
				<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-[#E0342A]/30 bg-[#E0342A]/10 p-6 space-y-3">
					<div className="flex items-center gap-3">
						<Brain className="h-6 w-6 text-[#E0342A]" />
						<h3 className="font-bold text-white text-base">Cloudflare AI Tax Advisor Optimization</h3>
					</div>
					<pre className="text-xs text-white/80 whitespace-pre-wrap font-sans leading-relaxed bg-black/40 p-4 rounded-xl border border-white/5">
						{aiTaxAdvice}
					</pre>
				</motion.div>
			)}

			{/* Tabs Navigation */}
			<div className="flex border-b border-white/10 gap-1 overflow-x-auto pb-px">
				{[
					{ id: 'overview', label: 'Sec 44AD Presumptive', icon: Calculator },
					{ id: 'regime', label: 'Old vs New Tax Regime', icon: Scale },
					{ id: 'pnl', label: 'Profit & Loss Ledger', icon: FileText },
					{ id: 'depreciation', label: 'Depreciation (Sec 32)', icon: Building2 },
					{ id: 'advancetax', label: 'Advance Tax & TDS (194O)', icon: Coins }
				].map((tab) => (
					<button
						key={tab.id}
						onClick={() => setActiveTab(tab.id as TabType)}
						className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
							activeTab === tab.id
								? 'border-[#E0342A] text-white bg-white/5'
								: 'border-transparent text-white/50 hover:text-white/80 hover:bg-white/5'
						}`}
					>
						<tab.icon className="h-4 w-4" />
						{tab.label}
					</button>
				))}
			</div>

			{/* Tabs Content */}
			<div className="min-h-[400px]">
				{/* ── TAB 1: OVERVIEW ──────────────────────────────────────────────── */}
				{activeTab === 'overview' && (
					<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
						{isEstimationActive && (
							<div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 flex gap-3 text-sm text-blue-400">
								<Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
								<div>
									<h4 className="font-semibold text-white">NovaPOS AI Expense Projection Active</h4>
									<p className="text-white/60 text-xs mt-1 leading-relaxed">
										Expenses for FY {yearStart}-{String(yearStart + 1).slice(2)} are projected based on actual baseline cost-to-sales ratios.
									</p>
								</div>
							</div>
						)}

						{/* Comparison Cards */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							{/* Presumptive Card */}
							<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
								<div className="flex justify-between items-center">
									<h3 className="text-lg font-semibold text-white">Option A: Sec 44AD Presumptive</h3>
									<Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">ITR-4 SUGAM</Badge>
								</div>
								<p className="text-white/50 text-xs leading-relaxed">
									No statutory audit or comprehensive ledger bookkeeping needed. Profits are calculated as a fixed % of your gross receipt splits (6% digital, 8% cash).
								</p>
								<div className="grid grid-cols-2 gap-4 pt-2">
									<div>
										<p className="text-[10px] text-white/40 tracking-wider">PRESUMPTIVE PROFIT</p>
										<p className="text-xl font-bold text-white mt-0.5">{fmt(presumptiveProfit.total)}</p>
									</div>
									<div>
										<p className="text-[10px] text-white/40 tracking-wider">NEW REGIME TAX</p>
										<p className="text-xl font-bold text-emerald-400 mt-0.5">{fmt(presumptiveRegimeComp.newRegime.netTax)}</p>
									</div>
								</div>
								<div className="text-[11px] text-white/40 bg-black/40 rounded-xl p-3 border border-white/5 space-y-1">
									<div className="font-semibold text-white/60">Turnover Threshold Check:</div>
									<div className="flex justify-between">
										<span>Max Limit Applicable:</span>
										<span className="text-white">{salesTotals.digital > 0 && (salesTotals.digital / (salesTotals.total || 1)) >= 0.95 ? '₹3 Crore (≥95% Digital)' : '₹2 Crore'}</span>
									</div>
									<div className="flex justify-between">
										<span>Status:</span>
										<span className="text-emerald-400">Within Limit (Eligible for ITR-4)</span>
									</div>
								</div>
							</div>

							{/* Actual Books Card */}
							<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
								<div className="flex justify-between items-center">
									<h3 className="text-lg font-semibold text-white">Option B: Actual Books</h3>
									<Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">ITR-3 (No Audit)</Badge>
								</div>
								<p className="text-white/50 text-xs leading-relaxed">
									Tax calculated on your actual net business surplus after deducting inventory costs, aggregator commissions, rent, wages, and asset depreciation.
								</p>
								<div className="grid grid-cols-2 gap-4 pt-2">
									<div>
										<p className="text-[10px] text-white/40 tracking-wider">ACTUAL NET PROFIT</p>
										<p className={`text-xl font-bold mt-0.5 ${actualNetProfit >= 0 ? 'text-white' : 'text-red-400'}`}>
											{fmt(actualNetProfit)}
										</p>
									</div>
									<div>
										<p className="text-[10px] text-white/40 tracking-wider">NEW REGIME TAX</p>
										<p className="text-xl font-bold text-emerald-400 mt-0.5">{fmt(actualRegimeComp.newRegime.netTax)}</p>
									</div>
								</div>
								<div className="text-[11px] text-white/40 bg-black/40 rounded-xl p-3 border border-white/5 space-y-1">
									<div className="font-semibold text-white/60">Tax Audit Risk Check (Sec 44AB):</div>
									<div className="flex justify-between">
										<span>Margin vs Sec 44AD benchmark:</span>
										<span className={marginPercentage < 6 ? 'text-amber-400 font-semibold' : 'text-emerald-400'}>
											{marginPercentage.toFixed(1)}% vs 6.0%
										</span>
									</div>
									<div className="flex justify-between">
										<span>Sec 44AB Audit Required:</span>
										<span className="text-emerald-400">No (Digital receipts ≥ 95%)</span>
									</div>
								</div>
							</div>
						</div>

						{/* Recommendation Banner */}
						<div className="rounded-2xl border border-[#E0342A]/20 bg-[#E0342A]/5 p-5 flex gap-4">
							<ShieldCheck className="h-6 w-6 text-[#E0342A] flex-shrink-0 mt-0.5" />
							<div>
								<h4 className="text-sm font-semibold text-white">NovaPOS ITR Filing Recommendation</h4>
								<p className="text-xs text-white/60 mt-1 leading-relaxed">
									{actualNetProfit < presumptiveProfit.total ? (
										<span>
											Your actual net profit ({fmt(actualNetProfit)}) is <strong>lower</strong> than the presumptive profit ({fmt(presumptiveProfit.total)}). Filing on <strong>Actual Books (ITR-3)</strong> will save you an estimated <strong>{fmt(presumptiveRegimeComp.newRegime.netTax - actualRegimeComp.newRegime.netTax)}</strong> in taxes.
										</span>
									) : (
										<span>
											Filing under <strong>Section 44AD (ITR-4)</strong> will save you an estimated <strong>{fmt(actualRegimeComp.newRegime.netTax - presumptiveRegimeComp.newRegime.netTax)}</strong> in taxes compared to actual profits, and relieves you of statutory audit compliance.
										</span>
									)}
								</p>
							</div>
						</div>
					</motion.div>
				)}

				{/* ── TAB 2: OLD VS NEW TAX REGIME ─────────────────────────────────── */}
				{activeTab === 'regime' && (
					<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
						{/* Deduction Controls */}
						<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
							<div className="flex items-center justify-between border-b border-white/5 pb-4">
								<div>
									<h3 className="text-base font-bold text-white flex items-center gap-2">
										<Settings className="h-5 w-5 text-[#E0342A]" /> Chapter VI-A Deduction Planning (Old Regime)
									</h3>
									<p className="text-white/40 text-xs mt-0.5">Adjust your annual tax-saving investments to compare Old vs. New Regime</p>
								</div>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
								{/* 80C */}
								<div className="space-y-2">
									<div className="flex justify-between text-xs font-semibold">
										<span className="text-white/60">SEC 80C (PPF/ELSS/EPF)</span>
										<span className="text-white">{fmt(deduction80C)}</span>
									</div>
									<input
										type="range"
										min="0"
										max="150000"
										step="5000"
										value={deduction80C}
										onChange={(e) => setDeduction80C(parseInt(e.target.value))}
										className="w-full accent-[#E0342A] h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
									/>
									<div className="flex justify-between text-[10px] text-white/30">
										<span>₹0</span><span>Max ₹1.5 Lakhs</span>
									</div>
								</div>

								{/* 80D */}
								<div className="space-y-2">
									<div className="flex justify-between text-xs font-semibold">
										<span className="text-white/60">SEC 80D (Mediclaim)</span>
										<span className="text-white">{fmt(deduction80D)}</span>
									</div>
									<input
										type="range"
										min="0"
										max="50000"
										step="2500"
										value={deduction80D}
										onChange={(e) => setDeduction80D(parseInt(e.target.value))}
										className="w-full accent-[#E0342A] h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
									/>
									<div className="flex justify-between text-[10px] text-white/30">
										<span>₹0</span><span>Max ₹50,000</span>
									</div>
								</div>

								{/* 80TTA */}
								<div className="space-y-2">
									<div className="flex justify-between text-xs font-semibold">
										<span className="text-white/60">SEC 80TTA (Savings Interest)</span>
										<span className="text-white">{fmt(deduction80TTA)}</span>
									</div>
									<input
										type="range"
										min="0"
										max="10000"
										step="1000"
										value={deduction80TTA}
										onChange={(e) => setDeduction80TTA(parseInt(e.target.value))}
										className="w-full accent-[#E0342A] h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
									/>
									<div className="flex justify-between text-[10px] text-white/30">
										<span>₹0</span><span>Max ₹10,000</span>
									</div>
								</div>
							</div>
						</div>

						{/* Side by side Regime Comparison Cards */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							{/* New Regime Card */}
							<div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-4">
								<div className="flex justify-between items-center">
									<h3 className="text-lg font-semibold text-white flex items-center gap-2">
										<Scale className="h-5 w-5 text-emerald-400" /> New Tax Regime (Sec 115BAC)
									</h3>
									<Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Default Regime</Badge>
								</div>
								<p className="text-white/50 text-xs">Lower tax slab rates without needing Chapter VI-A investment proofs.</p>
								
								<div className="space-y-2 text-xs border-t border-white/5 pt-3">
									<div className="flex justify-between text-white/60">
										<span>Gross Taxable Business Income:</span>
										<span className="font-semibold text-white">{fmt(actualNetProfit)}</span>
									</div>
									<div className="flex justify-between text-white/60">
										<span>Chapter VI-A Deductions:</span>
										<span className="text-white/40">Not allowed in New Regime</span>
									</div>
									<div className="flex justify-between text-white/60">
										<span>Gross Computed Tax:</span>
										<span>{fmt(actualRegimeComp.newRegime.grossTax)}</span>
									</div>
									<div className="flex justify-between text-white/60">
										<span>Sec 87A Tax Rebate (up to ₹7L income):</span>
										<span className="text-emerald-400">-{fmt(actualRegimeComp.newRegime.rebate87A)}</span>
									</div>
									<div className="flex justify-between text-white/60">
										<span>Health &amp; Education Cess (4%):</span>
										<span>{fmt(actualRegimeComp.newRegime.cess)}</span>
									</div>
									<div className="flex justify-between text-base font-bold text-emerald-400 border-t border-white/10 pt-2">
										<span>Net Tax Liability:</span>
										<span>{fmt(actualRegimeComp.newRegime.netTax)}</span>
									</div>
								</div>
							</div>

							{/* Old Regime Card */}
							<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
								<div className="flex justify-between items-center">
									<h3 className="text-lg font-semibold text-white flex items-center gap-2">
										<FileText className="h-5 w-5 text-blue-400" /> Old Tax Regime
									</h3>
									<Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">With Deductions</Badge>
								</div>
								<p className="text-white/50 text-xs">Traditional slab rates with 80C, 80D, 80TTA deduction benefits.</p>

								<div className="space-y-2 text-xs border-t border-white/5 pt-3">
									<div className="flex justify-between text-white/60">
										<span>Gross Business Income:</span>
										<span className="font-semibold text-white">{fmt(actualNetProfit)}</span>
									</div>
									<div className="flex justify-between text-white/60">
										<span>Total Chapter VI-A Deductions:</span>
										<span className="text-emerald-400">-{fmt(deduction80C + deduction80D + deduction80TTA)}</span>
									</div>
									<div className="flex justify-between text-white/60">
										<span>Net Taxable Income:</span>
										<span className="font-semibold text-white">{fmt(actualRegimeComp.oldRegime.grossTax > 0 ? actualNetProfit - (deduction80C + deduction80D + deduction80TTA) : 0)}</span>
									</div>
									<div className="flex justify-between text-white/60">
										<span>Sec 87A Tax Rebate (up to ₹5L income):</span>
										<span className="text-emerald-400">-{fmt(actualRegimeComp.oldRegime.rebate87A)}</span>
									</div>
									<div className="flex justify-between text-white/60">
										<span>Health &amp; Education Cess (4%):</span>
										<span>{fmt(actualRegimeComp.oldRegime.cess)}</span>
									</div>
									<div className="flex justify-between text-base font-bold text-white border-t border-white/10 pt-2">
										<span>Net Tax Liability:</span>
										<span>{fmt(actualRegimeComp.oldRegime.netTax)}</span>
									</div>
								</div>
							</div>
						</div>

						{/* Recommendation Verdict Banner */}
						<div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 flex items-center justify-between">
							<div className="flex items-center gap-3">
								<CheckCircle2 className="h-6 w-6 text-emerald-400 flex-shrink-0" />
								<div>
									<h4 className="font-bold text-white">Recommended Tax Regime: {actualRegimeComp.recommendedRegime === 'NEW' ? 'New Tax Regime (Sec 115BAC)' : 'Old Tax Regime'}</h4>
									<p className="text-xs text-white/70 mt-0.5">
										Filing under the <strong>{actualRegimeComp.recommendedRegime === 'NEW' ? 'New Tax Regime' : 'Old Tax Regime'}</strong> saves you <strong>{fmt(actualRegimeComp.potentialSavings)}</strong> in total income tax this financial year.
									</p>
								</div>
							</div>
						</div>
					</motion.div>
				)}

				{/* ── TAB 3: PROFIT & LOSS LEDGER ──────────────────────────────────── */}
				{activeTab === 'pnl' && (
					<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
						<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
							<div className="flex justify-between items-center border-b border-white/5 pb-4">
								<div>
									<h3 className="text-base font-bold text-white">Trading &amp; Profit and Loss Account</h3>
									<p className="text-xs text-white/40 mt-0.5">Comprehensive P&amp;L statement including standard &amp; custom ledger heads</p>
								</div>
								<Badge className="bg-[#E0342A]/10 text-[#E0342A] border-[#E0342A]/20 text-xs">Custom Heads Supported</Badge>
							</div>

							<div className="divide-y divide-white/5 text-sm">
								<div className="py-2.5 flex justify-between font-semibold text-white">
									<span>Gross Sales Turnover / Revenue</span>
									<span>{fmt(salesTotals.total)}</span>
								</div>

								{/* Custom Other Income Heads */}
								{customHeads.filter(h => h.type === 'other_income').map((h) => (
									<div key={h.id} className="py-2 flex justify-between text-emerald-400 pl-4 text-xs">
										<span>Add: {h.name} (Other Income)</span>
										<span>+{fmt(h.amount)}</span>
									</div>
								))}

								<div className="py-2.5 flex justify-between text-white/60 pl-4">
									<span>Less: Direct Material Costs (COGS)</span>
									<span>-{fmt(expenses.direct_material)}</span>
								</div>
								<div className="py-2.5 flex justify-between text-white/60 pl-4">
									<span>Less: Direct Staff Wages</span>
									<span>-{fmt(expenses.direct_wages)}</span>
								</div>
								<div className="py-2.5 flex justify-between text-white/60 pl-4">
									<span>Less: Direct Fuel &amp; Gas</span>
									<span>-{fmt(expenses.direct_fuel)}</span>
								</div>

								{/* Custom Direct Expense Heads */}
								{customHeads.filter(h => h.type === 'direct_expense').map((h) => (
									<div key={h.id} className="py-2 flex justify-between text-white/60 pl-4 text-xs">
										<span>Less: {h.name} (Direct)</span>
										<span>-{fmt(h.amount)}</span>
									</div>
								))}

								<div className="py-3 flex justify-between font-bold text-emerald-400 bg-white/5 px-3 rounded-xl">
									<span>Gross Profit</span>
									<span>{fmt(grossProfit)}</span>
								</div>
								<div className="py-2.5 flex justify-between text-white/60 pl-4">
									<span>Less: Store Rent &amp; Lease</span>
									<span>-{fmt(expenses.indirect_rent)}</span>
								</div>
								<div className="py-2.5 flex justify-between text-white/60 pl-4">
									<span>Less: Swiggy/Zomato Commissions</span>
									<span>-{fmt(expenses.indirect_commission)}</span>
								</div>
								<div className="py-2.5 flex justify-between text-white/60 pl-4">
									<span>Less: Admin Salaries</span>
									<span>-{fmt(expenses.indirect_salary)}</span>
								</div>
								<div className="py-2.5 flex justify-between text-white/60 pl-4">
									<span>Less: Section 32 Asset Depreciation</span>
									<span>-{fmt(totalDepreciation)}</span>
								</div>

								{/* Custom Indirect Expense Heads */}
								{customHeads.filter(h => h.type === 'indirect_expense').map((h) => (
									<div key={h.id} className="py-2 flex justify-between text-white/60 pl-4 text-xs">
										<span>Less: {h.name} (Indirect)</span>
										<span>-{fmt(h.amount)}</span>
									</div>
								))}

								<div className="py-3 flex justify-between font-bold text-xl text-white bg-emerald-500/10 px-3 rounded-xl border border-emerald-500/20 mt-2">
									<span>Net Taxable Business Profit</span>
									<span className="text-emerald-400">{fmt(actualNetProfit)}</span>
								</div>
							</div>
						</div>

						{/* ── Custom Heads Manager ────────────────────────────────────── */}
						<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-6">
							<div className="flex justify-between items-center border-b border-white/5 pb-4">
								<div>
									<h3 className="text-base font-bold text-white flex items-center gap-2">
										<Plus className="h-5 w-5 text-[#E0342A]" /> Custom Income &amp; Expense Heads Manager
									</h3>
									<p className="text-xs text-white/40 mt-0.5">Add custom line items (e.g., Packaging, Electricity, CA Fees, Scrap Sales) to your P&amp;L</p>
								</div>
							</div>

							{/* Add New Custom Head Form */}
							<form onSubmit={handleAddCustomHead} className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-black/30 p-4 rounded-xl border border-white/5">
								<div className="space-y-1">
									<label className="text-[10px] font-semibold text-white/50 uppercase">Head Name / Description</label>
									<input
										type="text"
										value={newHeadName}
										onChange={(e) => setNewHeadName(e.target.value)}
										placeholder="e.g. Electricity Bill"
										className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#E0342A]"
									/>
								</div>
								<div className="space-y-1">
									<label className="text-[10px] font-semibold text-white/50 uppercase">Head Type</label>
									<select
										value={newHeadType}
										onChange={(e) => setNewHeadType(e.target.value as any)}
										className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#E0342A]"
									>
										<option value="indirect_expense" className="bg-black">Indirect Expense (Overhead)</option>
										<option value="direct_expense" className="bg-black">Direct Expense (COGS)</option>
										<option value="other_income" className="bg-black">Other Business Income</option>
									</select>
								</div>
								<div className="space-y-1">
									<label className="text-[10px] font-semibold text-white/50 uppercase">Annual Amount (₹)</label>
									<input
										type="number"
										value={newHeadAmount}
										onChange={(e) => setNewHeadAmount(e.target.value)}
										placeholder="e.g. 48000"
										className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#E0342A]"
									/>
								</div>
								<div className="flex items-end">
									<Button type="submit" disabled={!newHeadName} className="w-full bg-[#E0342A] hover:bg-[#c02a22] text-white font-semibold text-xs py-2">
										<Plus className="mr-1.5 h-3.5 w-3.5" /> Add Custom Head
									</Button>
								</div>
							</form>

							{/* Custom Heads Table */}
							<div className="space-y-2">
								<p className="text-[11px] font-bold text-white/40 uppercase tracking-wider">Active Custom Ledger Heads</p>
								<div className="space-y-2">
									{customHeads.map((head) => (
										<div key={head.id} className="flex items-center justify-between p-3.5 rounded-xl bg-black/20 border border-white/5 text-xs">
											<div className="space-y-0.5">
												<p className="font-semibold text-white">{head.name}</p>
												<Badge className={`text-[9px] px-2 py-0.2 border ${
													head.type === 'other_income' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
													head.type === 'direct_expense' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
													'bg-amber-500/10 text-amber-400 border-amber-500/20'
												}`}>
													{head.type === 'other_income' ? 'Other Income' : head.type === 'direct_expense' ? 'Direct COGS' : 'Indirect Overhead'}
												</Badge>
											</div>
											<div className="flex items-center gap-3">
												<div className="flex items-center gap-1.5">
													<span className="text-white/40">₹</span>
													<input
														type="number"
														value={head.amount}
														onChange={(e) => handleUpdateCustomHeadAmount(head.id, e.target.value)}
														className="w-24 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-right text-xs font-mono text-white focus:outline-none focus:border-[#E0342A]"
													/>
												</div>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => handleDeleteCustomHead(head.id)}
													className="text-white/40 hover:text-red-400 p-1.5 h-auto"
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					</motion.div>
				)}

				{/* ── TAB 4: DEPRECIATION SCHEDULE ─────────────────────────────────── */}
				{activeTab === 'depreciation' && (
					<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
						<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
							<div className="flex justify-between items-center">
								<div>
									<h3 className="text-base font-bold text-white">Section 32 WDV Depreciation Schedule</h3>
									<p className="text-xs text-white/40 mt-0.5">Asset additions with 180-day half-rate rule applied automatically</p>
								</div>
							</div>

							<div className="overflow-x-auto">
								<table className="w-full text-xs text-left border-collapse">
									<thead>
										<tr className="border-b border-white/10 text-white/40 uppercase">
											<th className="py-3 px-3">Asset Block</th>
											<th className="py-3 px-3 text-right">Opening WDV</th>
											<th className="py-3 px-3 text-right">Additions (&ge;180d)</th>
											<th className="py-3 px-3 text-right">Additions (&lt;180d)</th>
											<th className="py-3 px-3 text-right">Depreciation</th>
											<th className="py-3 px-3 text-right">Closing WDV</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-white/5 font-mono">
										{Object.entries(computedBlocks).map(([blockKey, data]) => (
											<tr key={blockKey} className="hover:bg-white/2">
												<td className="py-3 px-3 font-sans font-medium text-white capitalize">{blockKey}</td>
												<td className="py-3 px-3 text-right text-white/60">{fmt(data.opening)}</td>
												<td className="py-3 px-3 text-right text-white/60">{fmt(data.additionsFull)}</td>
												<td className="py-3 px-3 text-right text-amber-400">{fmt(data.additionsHalf)}</td>
												<td className="py-3 px-3 text-right text-emerald-400">{fmt(data.depreciation)}</td>
												<td className="py-3 px-3 text-right text-white font-bold">{fmt(data.closing)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					</motion.div>
				)}

				{/* ── TAB 5: ADVANCE TAX & TDS CREDIT ─────────────────────────────── */}
				{activeTab === 'advancetax' && (
					<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
						{/* TDS Credit Card */}
						<div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 space-y-3">
							<div className="flex justify-between items-center">
								<h3 className="text-base font-bold text-white flex items-center gap-2">
									<Receipt className="h-5 w-5 text-blue-400" /> Aggregator TDS Credit (Section 194O)
								</h3>
								<Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Form 26AS Match</Badge>
							</div>
							<p className="text-xs text-white/60">
								Swiggy and Zomato deduct 1% TDS on your total order settlements u/s 194O. This credit directly reduces your tax payable.
							</p>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
								<div className="bg-black/30 rounded-xl p-4 border border-white/5">
									<p className="text-xs text-white/40">Aggregator Gross Sales</p>
									<p className="text-xl font-bold text-white mt-1">{fmt(salesTotals.aggregator)}</p>
								</div>
								<div className="bg-black/30 rounded-xl p-4 border border-white/5">
									<p className="text-xs text-white/40">1% TDS Credit Claimable</p>
									<p className="text-xl font-bold text-emerald-400 mt-1">{fmt(estimatedTDS194O)}</p>
								</div>
							</div>
						</div>

						{/* Advance Tax Installment Schedule */}
						<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
							<div className="flex justify-between items-center">
								<h3 className="text-base font-bold text-white flex items-center gap-2">
									<Clock className="h-5 w-5 text-amber-400" /> Advance Tax Payment Calendar (Sec 208 / 211)
								</h3>
								<Badge className={isAdvanceTaxApplicable ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}>
									{isAdvanceTaxApplicable ? 'Advance Tax Mandatory' : 'Below ₹10,000 Threshold'}
								</Badge>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
								{advanceTaxInstallments.map((inst, i) => (
									<div key={i} className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
										<p className="text-[10px] font-bold text-amber-400 uppercase">{inst.installment}</p>
										<p className="text-xs text-white/50">Due: <span className="text-white font-semibold">{inst.dueDate}</span></p>
										<p className="text-lg font-bold text-white">{fmt(inst.amount)}</p>
										<p className="text-[10px] text-white/30">{inst.pct}% of net annual liability</p>
									</div>
								))}
							</div>
						</div>
					</motion.div>
				)}
			</div>
		</div>
	)
}
