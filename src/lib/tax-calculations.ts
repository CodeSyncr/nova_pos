export type MonthlySalesRow = {
	month: string // e.g. "2026-04"
	total: number
	orderCount: number
}

export type AdvanceTaxScheduleItem = {
	installment: string
	dueDate: string
	percentage: number
	minAmountDue: number
	paidAmount?: number
}

export type TaxRegimeComparison = {
	taxableIncome: number
	oldRegime: {
		grossTax: number
		rebate87A: number
		cess: number
		netTax: number
		effectiveRate: number
		slabBreakdown: Array<{ slab: string; tax: number }>
	}
	newRegime: {
		standardDeduction: number
		netTaxableIncome: number
		grossTax: number
		rebate87A: number
		cess: number
		netTax: number
		effectiveRate: number
		slabBreakdown: Array<{ slab: string; tax: number }>
	}
	recommendedRegime: 'NEW' | 'OLD'
	potentialSavings: number
}

// ── Tax Calculation Utilities for Indian Individuals / Proprietorships ──────────

export function calculateNewRegimeTax(income: number): TaxRegimeComparison['newRegime'] {
	const netTaxableIncome = Math.max(0, income)
	let grossTax = 0
	const slabBreakdown: Array<{ slab: string; tax: number }> = []

	if (netTaxableIncome > 1500000) {
		const t = (netTaxableIncome - 1500000) * 0.3
		grossTax += t
		slabBreakdown.push({ slab: '> ₹15,00,000 (30%)', tax: t })
	}
	if (netTaxableIncome > 1200000) {
		const taxable = Math.min(netTaxableIncome - 1200000, 300000)
		const t = taxable * 0.2
		grossTax += t
		slabBreakdown.push({ slab: '₹12,00,001 - ₹15,00,000 (20%)', tax: t })
	}
	if (netTaxableIncome > 900000) {
		const taxable = Math.min(netTaxableIncome - 900000, 300000)
		const t = taxable * 0.15
		grossTax += t
		slabBreakdown.push({ slab: '₹9,00,001 - ₹12,00,000 (15%)', tax: t })
	}
	if (netTaxableIncome > 600000) {
		const taxable = Math.min(netTaxableIncome - 600000, 300000)
		const t = taxable * 0.1
		grossTax += t
		slabBreakdown.push({ slab: '₹6,00,001 - ₹9,00,000 (10%)', tax: t })
	}
	if (netTaxableIncome > 300000) {
		const taxable = Math.min(netTaxableIncome - 300000, 300000)
		const t = taxable * 0.05
		grossTax += t
		slabBreakdown.push({ slab: '₹3,00,001 - ₹6,00,000 (5%)', tax: t })
	}
	if (netTaxableIncome <= 300000) {
		slabBreakdown.push({ slab: 'Up to ₹3,00,000 (Nil)', tax: 0 })
	}

	// Sec 87A Rebate under New Regime: Available up to ₹7,00,000 income (Max rebate ₹25,000)
	let rebate87A = 0
	if (netTaxableIncome <= 700000) {
		rebate87A = Math.min(grossTax, 25000)
	}

	const taxAfterRebate = Math.max(0, grossTax - rebate87A)
	const cess = Math.round(taxAfterRebate * 0.04)
	const netTax = taxAfterRebate + cess
	const effectiveRate = netTaxableIncome > 0 ? (netTax / netTaxableIncome) * 100 : 0

	return {
		standardDeduction: 0,
		netTaxableIncome,
		grossTax: Math.round(grossTax),
		rebate87A: Math.round(rebate87A),
		cess,
		netTax: Math.round(netTax),
		effectiveRate: Number(effectiveRate.toFixed(2)),
		slabBreakdown
	}
}

export function calculateOldRegimeTax(
	grossIncome: number,
	deductions: { sec80C?: number; sec80D?: number; sec80TTA?: number; otherDeductions?: number } = {}
): TaxRegimeComparison['oldRegime'] {
	const totalDeductions = Math.min(
		grossIncome,
		(Math.min(150000, deductions.sec80C || 0)) +
		(Math.min(50000, deductions.sec80D || 0)) +
		(Math.min(10000, deductions.sec80TTA || 0)) +
		(deductions.otherDeductions || 0)
	)

	const netTaxableIncome = Math.max(0, grossIncome - totalDeductions)
	let grossTax = 0
	const slabBreakdown: Array<{ slab: string; tax: number }> = []

	if (netTaxableIncome > 1000000) {
		const t = (netTaxableIncome - 1000000) * 0.3
		grossTax += t
		slabBreakdown.push({ slab: '> ₹10,00,000 (30%)', tax: t })
	}
	if (netTaxableIncome > 500000) {
		const taxable = Math.min(netTaxableIncome - 500000, 500000)
		const t = taxable * 0.2
		grossTax += t
		slabBreakdown.push({ slab: '₹5,00,001 - ₹10,00,000 (20%)', tax: t })
	}
	if (netTaxableIncome > 250000) {
		const taxable = Math.min(netTaxableIncome - 250000, 250000)
		const t = taxable * 0.05
		grossTax += t
		slabBreakdown.push({ slab: '₹2,50,001 - ₹5,00,000 (5%)', tax: t })
	}
	if (netTaxableIncome <= 250000) {
		slabBreakdown.push({ slab: 'Up to ₹2,50,000 (Nil)', tax: 0 })
	}

	// Sec 87A Rebate under Old Regime: Available up to ₹5,00,000 income (Max rebate ₹12,500)
	let rebate87A = 0
	if (netTaxableIncome <= 500000) {
		rebate87A = Math.min(grossTax, 12500)
	}

	const taxAfterRebate = Math.max(0, grossTax - rebate87A)
	const cess = Math.round(taxAfterRebate * 0.04)
	const netTax = taxAfterRebate + cess
	const effectiveRate = grossIncome > 0 ? (netTax / grossIncome) * 100 : 0

	return {
		grossTax: Math.round(grossTax),
		rebate87A: Math.round(rebate87A),
		cess,
		netTax: Math.round(netTax),
		effectiveRate: Number(effectiveRate.toFixed(2)),
		slabBreakdown
	}
}

export function compareTaxRegimes(
	grossIncome: number,
	deductions: { sec80C?: number; sec80D?: number; sec80TTA?: number; otherDeductions?: number } = {}
): TaxRegimeComparison {
	const oldRegime = calculateOldRegimeTax(grossIncome, deductions)
	const newRegime = calculateNewRegimeTax(grossIncome)

	const recommendedRegime = newRegime.netTax <= oldRegime.netTax ? 'NEW' : 'OLD'
	const potentialSavings = Math.abs(oldRegime.netTax - newRegime.netTax)

	return {
		taxableIncome: grossIncome,
		oldRegime,
		newRegime,
		recommendedRegime,
		potentialSavings
	}
}
