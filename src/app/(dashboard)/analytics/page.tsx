'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
	TrendingUp,
	DollarSign,
	ShoppingCart,
	Calendar,
	BarChart3,
	CalendarDays
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getAnalytics } from '@/app/actions/analytics'
import { calculateDateRange } from '@/lib/date-utils'

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
	previousPeriod?: AnalyticsData
}

type Period =
	| 'today'
	| 'yesterday'
	| 'weekly'
	| 'monthly'
	| 'quarterly'
	| 'halfyearly'
	| 'yearly'
	| 'custom'

export default function AnalyticsPage() {
	const router = useRouter()
	const [tenantId, setTenantId] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
	const [period, setPeriod] = useState<Period>('today')
	const [customStartDate, setCustomStartDate] = useState('')
	const [customEndDate, setCustomEndDate] = useState('')
	const [monthStartDay, setMonthStartDay] = useState(1)
	const [monthEndDay, setMonthEndDay] = useState(0)
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	const { error: showError, warning } = useToast()
	const [dateRange, setDateRange] = useState<{
		startDate: string
		endDate: string
	} | null>(null)

	useEffect(() => {
		const loadTenant = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const {
					data: { user }
				} = await supabase.auth.getUser()

				if (!user) {
					router.push('/login')
					return
				}

				const { data: profileTenant } = await supabase
					.from('profile_tenants')
					.select('tenant:tenants(id, settings)')
					.eq('profile_id', user.id)
					.single()

				if (!profileTenant?.tenant) {
					router.push('/onboarding')
					return
				}

				const tenant = Array.isArray(profileTenant.tenant)
					? profileTenant.tenant[0]
					: profileTenant.tenant

				setTenantId(tenant.id)

				// Get month start/end day and currency from settings
				const settings = (tenant.settings as Record<string, unknown>) || {}
				const startDay = (settings.monthStartDay as number) || 1
				const endDay = (settings.monthEndDay as number) || 0
				const currency = (settings.currencySymbol as string) || '₹'
				setMonthStartDay(startDay)
				setMonthEndDay(endDay)
				setCurrencySymbol(currency)

				// Calculate initial date range (today by default)
				const now = new Date()
				const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
				const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
				setDateRange({ startDate: todayStart.toISOString(), endDate: todayEnd.toISOString() })
			} catch (error) {
				console.error('Error loading tenant:', error)
			} finally {
				setLoading(false)
			}
		}

		loadTenant()
	}, [router])

	useEffect(() => {
		if (!tenantId || !dateRange) return

		const loadAnalytics = async () => {
			setLoading(true)
			try {
				// Calculate previous period for comparison (only for non-custom periods)
				// Calculate by going back one period from the current start date
				let previousRange: { startDate: string; endDate: string } | undefined
				if (period !== 'custom') {
					// Parse the current period start date to get the actual date components
					const currentStartDate = new Date(dateRange.startDate)
					// Extract the day from current start date (this is the monthStartDay)
					const startDay = currentStartDate.getDate()

					// Calculate previous period start by going back one period
					let previousStartDate: Date
					let previousEndDate: Date

					if (period === 'today') {
						// Previous day: yesterday
						previousStartDate = new Date(currentStartDate)
						previousStartDate.setDate(previousStartDate.getDate() - 1)
						previousEndDate = new Date(previousStartDate)
						previousEndDate.setHours(23, 59, 59, 999)
					} else if (period === 'yesterday') {
						// Previous of yesterday: the day before yesterday
						previousStartDate = new Date(currentStartDate)
						previousStartDate.setDate(previousStartDate.getDate() - 1)
						previousEndDate = new Date(previousStartDate)
						previousEndDate.setHours(23, 59, 59, 999)
					} else if (period === 'weekly') {
						// Previous week: go back 7 days from current week start
						previousStartDate = new Date(currentStartDate)
						previousStartDate.setDate(previousStartDate.getDate() - 7)
						previousEndDate = new Date(previousStartDate)
						previousEndDate.setDate(previousEndDate.getDate() + 6)
						previousEndDate.setHours(23, 59, 59, 999)
					} else if (period === 'monthly') {
						previousStartDate = new Date(currentStartDate)
						previousStartDate.setMonth(previousStartDate.getMonth() - 1)
						// Calculate previous period end using the same logic as current period
						if (monthEndDay > 0) {
							previousEndDate = new Date(previousStartDate)
							previousEndDate.setMonth(previousEndDate.getMonth() + 1)
							previousEndDate.setDate(monthEndDay)
						} else {
							const nextPeriodStart = new Date(previousStartDate)
							nextPeriodStart.setMonth(nextPeriodStart.getMonth() + 1)
							nextPeriodStart.setDate(startDay)
							nextPeriodStart.setDate(nextPeriodStart.getDate() - 1)
							previousEndDate = nextPeriodStart
						}
						previousEndDate.setHours(23, 59, 59, 999)
					} else if (period === 'quarterly') {
						previousStartDate = new Date(currentStartDate)
						previousStartDate.setMonth(previousStartDate.getMonth() - 3)
						previousEndDate = new Date(previousStartDate)
						previousEndDate.setMonth(previousEndDate.getMonth() + 3)
						if (monthEndDay > 0) {
							previousEndDate.setDate(monthEndDay)
						} else {
							const nextPeriodStart = new Date(previousEndDate)
							nextPeriodStart.setDate(startDay)
							nextPeriodStart.setDate(nextPeriodStart.getDate() - 1)
							previousEndDate = nextPeriodStart
						}
						previousEndDate.setHours(23, 59, 59, 999)
					} else if (period === 'halfyearly') {
						previousStartDate = new Date(currentStartDate)
						previousStartDate.setMonth(previousStartDate.getMonth() - 6)
						previousEndDate = new Date(previousStartDate)
						previousEndDate.setMonth(previousEndDate.getMonth() + 6)
						if (monthEndDay > 0) {
							previousEndDate.setDate(monthEndDay)
						} else {
							const nextPeriodStart = new Date(previousEndDate)
							nextPeriodStart.setDate(startDay)
							nextPeriodStart.setDate(nextPeriodStart.getDate() - 1)
							previousEndDate = nextPeriodStart
						}
						previousEndDate.setHours(23, 59, 59, 999)
					} else if (period === 'yearly') {
						previousStartDate = new Date(currentStartDate)
						previousStartDate.setFullYear(previousStartDate.getFullYear() - 1)
						previousEndDate = new Date(previousStartDate)
						previousEndDate.setFullYear(previousEndDate.getFullYear() + 1)
						if (monthEndDay > 0) {
							previousEndDate.setDate(monthEndDay)
						} else {
							const nextPeriodStart = new Date(previousEndDate)
							nextPeriodStart.setDate(startDay)
							nextPeriodStart.setDate(nextPeriodStart.getDate() - 1)
							previousEndDate = nextPeriodStart
						}
						previousEndDate.setHours(23, 59, 59, 999)
					} else {
						// Default to monthly
						previousStartDate = new Date(currentStartDate)
						previousStartDate.setMonth(previousStartDate.getMonth() - 1)
						if (monthEndDay > 0) {
							previousEndDate = new Date(previousStartDate)
							previousEndDate.setMonth(previousEndDate.getMonth() + 1)
							previousEndDate.setDate(monthEndDay)
						} else {
							const nextPeriodStart = new Date(previousStartDate)
							nextPeriodStart.setMonth(nextPeriodStart.getMonth() + 1)
							nextPeriodStart.setDate(startDay)
							nextPeriodStart.setDate(nextPeriodStart.getDate() - 1)
							previousEndDate = nextPeriodStart
						}
						previousEndDate.setHours(23, 59, 59, 999)
					}

					previousRange = {
						startDate: previousStartDate.toISOString(),
						endDate: previousEndDate.toISOString()
					}
				}

				const data = await getAnalytics(tenantId, dateRange, previousRange)
				setAnalytics(data)
			} catch (error) {
				console.error('Error loading analytics:', error)
				showError('Failed to load analytics data')
			} finally {
				setLoading(false)
			}
		}

		loadAnalytics()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tenantId, dateRange, period])

	const handlePeriodChange = (newPeriod: Period) => {
		setPeriod(newPeriod)
		if (newPeriod === 'custom') {
			// Don't update date range yet, wait for user to select dates
			return
		}
		if (newPeriod === 'today') {
			const now = new Date()
			const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
			const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
			setDateRange({ startDate: start.toISOString(), endDate: end.toISOString() })
			return
		}
		if (newPeriod === 'yesterday') {
			const now = new Date()
			const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
			const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
			setDateRange({ startDate: start.toISOString(), endDate: end.toISOString() })
			return
		}
		const range = calculateDateRange(
			newPeriod,
			undefined,
			undefined,
			monthStartDay,
			monthEndDay
		)
		setDateRange(range)
	}

	const handleCustomDateApply = () => {
		if (!customStartDate || !customEndDate) {
			warning('Please select both start and end dates')
			return
		}
		const range = calculateDateRange(
			'custom',
			customStartDate,
			customEndDate,
			monthStartDay,
			monthEndDay
		)
		setDateRange(range)
	}

	const formatCurrency = (amount: number) => {
		return `${currencySymbol}${amount.toLocaleString('en-IN', {
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		})}`
	}

	const formatDate = (dateString: string) => {
		const date = new Date(dateString)
		const dayName = date.toLocaleDateString('en-IN', { weekday: 'long' })
		const datePart = date.toLocaleDateString('en-IN', {
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		})
		return `${datePart}, ${dayName}`
	}

	const calculateGrowth = (current: number, previous: number): number => {
		if (previous === 0) return current > 0 ? 100 : 0
		return ((current - previous) / previous) * 100
	}

	const formatGrowth = (current: number, previous: number): string => {
		const growth = calculateGrowth(current, previous)
		if (isNaN(growth) || !isFinite(growth)) return 'N/A'
		const sign = growth >= 0 ? '+' : ''
		return `${sign}${growth.toFixed(1)}%`
	}

	if (loading && !analytics) {
		return (
			<div className="flex h-[calc(100vh-120px)] items-center justify-center">
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					className="text-center"
				>
					<div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white/60 mx-auto" />
					<p className="text-white/60">Loading analytics...</p>
				</motion.div>
			</div>
		)
	}

	if (!analytics) {
		return null
	}

	const maxDailyValue = Math.max(
		...analytics.dailyBreakdown.map((d) => Math.max(d.sales, d.spendings)),
		1
	)
	const maxWeeklyValue =
		analytics.weeklyBreakdown && analytics.weeklyBreakdown.length > 0
			? Math.max(
					...analytics.weeklyBreakdown.map((d) =>
						Math.max(d.sales, d.spendings)
					),
					1
				)
			: 1

	return (
		<div className="flex flex-col gap-8 py-6">
			{/* Header */}
			<motion.header
				initial={{ opacity: 0, y: -20 }}
				animate={{ opacity: 1, y: 0 }}
				className="space-y-4"
			>
				<Badge className="border-white/20 bg-white/10 text-white/80">
					<BarChart3 className="mr-2 h-4 w-4" /> Business Intelligence
				</Badge>
				<h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
					Analytics Dashboard
				</h1>
				<p className="max-w-2xl text-lg text-white/70">
					Track your sales, spendings, profit, and loss to make data-driven
					decisions for your restaurant.
				</p>
			</motion.header>

			{/* Date Range Selector */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl"
			>
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-4">
						<div className="flex items-center gap-2">
							<Calendar className="h-5 w-5 text-white/60" />
							<span className="text-sm font-medium text-white">Period:</span>
						</div>
						<div className="flex flex-wrap gap-2">
							{(
								[
									'today',
									'yesterday',
									'weekly',
									'monthly',
									'quarterly',
									'halfyearly',
									'yearly',
									'custom'
								] as Period[]
							).map((p) => (
								<Button
									key={p}
									type="button"
									variant={period === p ? 'default' : 'ghost'}
									size="sm"
									onClick={() => handlePeriodChange(p)}
									className="capitalize"
								>
									{p === 'halfyearly' ? 'Half Yearly' : p}
								</Button>
							))}
						</div>
						{dateRange && period !== 'custom' && (
							<div className="ml-auto text-sm text-white/60">
								{formatDate(dateRange.startDate)} -{' '}
								{formatDate(dateRange.endDate)}
							</div>
						)}
					</div>
					{period === 'custom' && (
						<div className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
							<div className="flex items-center gap-2 w-full sm:w-auto">
								<CalendarDays className="h-4 w-4 text-white/60" />
								<span className="text-sm font-medium text-white">
									Select Date Range:
								</span>
							</div>
							<label className="flex flex-col gap-1.5 flex-1 sm:flex-initial min-w-[140px]">
								<span className="text-xs text-white/60 font-medium">
									Start Date
								</span>
								<div className="relative">
									<input
										type="date"
										value={customStartDate}
										onChange={(e) => setCustomStartDate(e.target.value)}
										className="w-full rounded-lg border-2 border-white/30 bg-white/10 px-4 py-2.5 text-white text-sm font-medium focus:border-white/50 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/30 cursor-pointer appearance-none"
										style={{
											colorScheme: 'dark',
											paddingRight: '2.5rem'
										}}
									/>
									<Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
								</div>
							</label>
							<span className="text-white/60 font-medium pb-2 hidden sm:block">
								to
							</span>
							<label className="flex flex-col gap-1.5 flex-1 sm:flex-initial min-w-[140px]">
								<span className="text-xs text-white/60 font-medium">
									End Date
								</span>
								<div className="relative">
									<input
										type="date"
										value={customEndDate}
										onChange={(e) => setCustomEndDate(e.target.value)}
										min={customStartDate || undefined}
										className="w-full rounded-lg border-2 border-white/30 bg-white/10 px-4 py-2.5 text-white text-sm font-medium focus:border-white/50 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/30 cursor-pointer appearance-none"
										style={{
											colorScheme: 'dark',
											paddingRight: '2.5rem'
										}}
									/>
									<Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
								</div>
							</label>
							<Button
								type="button"
								size="sm"
								onClick={handleCustomDateApply}
								className="w-full sm:w-auto sm:ml-auto"
								disabled={!customStartDate || !customEndDate}
							>
								Apply
							</Button>
						</div>
					)}
				</div>
			</motion.div>

			{/* Key Metrics */}
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{/* Earnings Including Discounts */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.1 }}
					className="rounded-[32px] border border-[#E0342A]/30 bg-gradient-to-br from-[#E0342A]/20 to-[#E0342A]/5 p-6 backdrop-blur-2xl"
				>
					<div className="flex items-center justify-between mb-4">
						<div className="rounded-xl bg-[#E0342A]/15 p-3">
							<TrendingUp className="h-6 w-6 text-[#E0342A]" />
						</div>
						<Badge className="bg-white/20 text-white">
							Earnings (Inc. Discounts)
						</Badge>
					</div>
					<p className="text-3xl font-bold text-white">
						{formatCurrency(analytics.earningsIncludingDiscounts)}
					</p>
					<p className="mt-2 text-sm text-white/70">
						{analytics.orderCount} orders
					</p>
					{analytics.previousPeriod && period !== 'custom' && (
						<p className="mt-1 text-xs text-white/60">
							{formatGrowth(
								analytics.earningsIncludingDiscounts,
								analytics.previousPeriod.earningsIncludingDiscounts
							)}{' '}
							vs previous period
						</p>
					)}
				</motion.div>

				{/* Earnings Excluding Discounts */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.2 }}
					className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl"
				>
					<div className="flex items-center justify-between mb-4">
						<div className="rounded-xl bg-white/10 p-3">
							<DollarSign className="h-6 w-6 text-white/70" />
						</div>
						<Badge className="bg-white/20 text-white">
							Earnings (Excl. Discounts)
						</Badge>
					</div>
					<p className="text-3xl font-bold text-white">
						{formatCurrency(analytics.earningsExcludingDiscounts)}
					</p>
					<p className="mt-2 text-sm text-white/70">Before discounts applied</p>
					{analytics.previousPeriod && period !== 'custom' && (
						<p className="mt-1 text-xs text-white/60">
							{formatGrowth(
								analytics.earningsExcludingDiscounts,
								analytics.previousPeriod.earningsExcludingDiscounts
							)}{' '}
							vs previous period
						</p>
					)}
				</motion.div>

				{/* Total Discounts */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.3 }}
					className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl"
				>
					<div className="flex items-center justify-between mb-4">
						<div className="rounded-xl bg-white/10 p-3">
							<ShoppingCart className="h-6 w-6 text-white/70" />
						</div>
						<Badge className="bg-white/20 text-white">Total Discounts</Badge>
					</div>
					<p className="text-3xl font-bold text-white">
						{formatCurrency(analytics.totalDiscounts)}
					</p>
					<p className="mt-2 text-sm text-white/70">
						{analytics.totalDiscounts > 0
							? `${((analytics.totalDiscounts / analytics.earningsExcludingDiscounts) * 100).toFixed(1)}% of earnings`
							: 'No discounts applied'}
					</p>
				</motion.div>

				{/* Expenses */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.4 }}
					className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl"
				>
					<div className="flex items-center justify-between mb-4">
						<div className="rounded-xl bg-[#E0342A]/15 p-3">
							<ShoppingCart className="h-6 w-6 text-[#E0342A]" />
						</div>
						<Badge className="bg-white/20 text-white">Expenses</Badge>
					</div>
					<p className="text-3xl font-bold text-white">
						{formatCurrency(analytics.expenses)}
					</p>
					<p className="mt-2 text-sm text-white/70">
						{analytics.purchaseCount} purchases
					</p>
					{analytics.previousPeriod && period !== 'custom' && (
						<p className="mt-1 text-xs text-white/60">
							{formatGrowth(
								analytics.expenses,
								analytics.previousPeriod.expenses
							)}{' '}
							vs previous period
						</p>
					)}
				</motion.div>

				{/* Profit */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.5 }}
					className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl"
				>
					<div className="flex items-center justify-between mb-4">
						<div className="rounded-xl bg-white/10 p-3">
							<TrendingUp className="h-6 w-6 text-white/70" />
						</div>
						<Badge className="bg-white/20 text-white">Profit</Badge>
					</div>
					<p className="text-3xl font-bold text-white">
						{formatCurrency(analytics.profit)}
					</p>
					<p className="mt-2 text-sm text-white/70">Earnings - Expenses</p>
					{analytics.previousPeriod && period !== 'custom' && (
						<p className="mt-1 text-xs text-white/60">
							{formatGrowth(analytics.profit, analytics.previousPeriod.profit)}{' '}
							vs previous period
						</p>
					)}
				</motion.div>

				{/* Average Order Value */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.6 }}
					className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl"
				>
					<div className="flex items-center justify-between mb-4">
						<div className="rounded-xl bg-white/10 p-3">
							<BarChart3 className="h-6 w-6 text-white/70" />
						</div>
						<Badge className="bg-white/20 text-white">Avg Order Value</Badge>
					</div>
					<p className="text-3xl font-bold text-white">
						{formatCurrency(analytics.averageOrderValue)}
					</p>
					<p className="mt-2 text-sm text-white/70">Per order average</p>
					{analytics.previousPeriod && period !== 'custom' && (
						<p className="mt-1 text-xs text-white/60">
							{formatGrowth(
								analytics.averageOrderValue,
								analytics.previousPeriod.averageOrderValue
							)}{' '}
							vs previous period
						</p>
					)}
				</motion.div>
			</div>

			{/* Profit and Loss Comparison - Only show for non-custom periods */}
			{period !== 'custom' && analytics.previousPeriod && (
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.7 }}
					className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl"
				>
					<h3 className="mb-6 text-xl font-semibold text-white">
						Profit & Loss Comparison
					</h3>
					<div className="grid gap-6 md:grid-cols-2">
						<div className="rounded-xl border border-white/10 bg-black/20 p-4">
							<div className="mb-2 flex items-center justify-between">
								<p className="text-sm font-medium text-white/70">
									Current Period
								</p>
								<p className="text-sm font-medium text-white/70">
									Previous Period
								</p>
							</div>
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<p className="text-white">Profit</p>
									<div className="flex items-center gap-4">
										<p className="font-semibold text-white">
											{formatCurrency(analytics.profit)}
										</p>
										<p className="text-sm text-white/60">
											{formatCurrency(analytics.previousPeriod.profit)}
										</p>
									</div>
								</div>
								<div className="flex items-center justify-between">
									<p className="text-white">Loss</p>
									<div className="flex items-center gap-4">
										<p className="font-semibold text-[#E0342A]">
											{formatCurrency(analytics.loss)}
										</p>
										<p className="text-sm text-white/60">
											{formatCurrency(analytics.previousPeriod.loss)}
										</p>
									</div>
								</div>
								<div className="mt-4 border-t border-white/10 pt-3">
									<div className="flex items-center justify-between">
										<p className="font-medium text-white">Net Change</p>
										<p
											className={`font-semibold ${
												analytics.profit - analytics.previousPeriod.profit >= 0
													? 'text-white'
													: 'text-[#E0342A]'
											}`}
										>
											{formatCurrency(
												analytics.profit - analytics.previousPeriod.profit
											)}
										</p>
									</div>
									<p className="mt-1 text-xs text-white/60">
										{formatGrowth(
											analytics.profit,
											analytics.previousPeriod.profit
										)}{' '}
										change
									</p>
								</div>
							</div>
						</div>
					</div>
				</motion.div>
			)}

			{/* Weekly Breakdown by Day of Week - Always Visible */}
			{analytics.weeklyBreakdown && analytics.weeklyBreakdown.length > 0 && (
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.4 }}
					className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl"
				>
					<div className="mb-6 flex items-center justify-between">
						<h3 className="text-xl font-semibold text-white">
							Sales by Day of Week
						</h3>
						<Badge className="bg-white/10 text-white/80">
							Aggregated for selected period
						</Badge>
					</div>
					<div className="space-y-4">
						{analytics.weeklyBreakdown.map((day, index) => {
							const salesPercent = (day.sales / maxWeeklyValue) * 100
							const spendingsPercent = (day.spendings / maxWeeklyValue) * 100
							return (
								<div
									key={index}
									className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3"
								>
									{/* Day Header */}
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium text-white">
											{day.dayName}
										</span>
										<div
											className={`text-sm font-semibold ${
												day.profit >= 0 ? 'text-white' : 'text-[#E0342A]'
											}`}
										>
											{day.profit >= 0 ? 'Profit' : 'Loss'}:{' '}
											{formatCurrency(Math.abs(day.profit))}
										</div>
									</div>

									{/* Visual Bar */}
									<div className="relative h-6 w-full overflow-hidden rounded-lg bg-black/30">
										<div
											className="absolute left-0 top-0 h-full bg-white/40"
											style={{ width: `${salesPercent}%` }}
										/>
										<div
											className="absolute right-0 top-0 h-full bg-[#E0342A]/60"
											style={{ width: `${spendingsPercent}%` }}
										/>
									</div>

									{/* Amount Details */}
									<div className="grid grid-cols-3 gap-2 text-xs">
										<div className="rounded-lg bg-white/5 p-2 border border-white/10">
											<p className="text-white/50 mb-1">Earnings</p>
											<p className="font-semibold text-white">
												{formatCurrency(day.sales)}
											</p>
										</div>
										<div className="rounded-lg bg-[#E0342A]/10 p-2 border border-[#E0342A]/20">
											<p className="text-[#E0342A]/70 mb-1">Spendings</p>
											<p className="font-semibold text-[#E0342A]">
												{formatCurrency(day.spendings)}
											</p>
										</div>
										<div
											className={`rounded-lg p-2 border ${
												day.profit >= 0
													? 'bg-white/5 border-white/10'
													: 'bg-[#E0342A]/10 border-[#E0342A]/20'
											}`}
										>
											<p
												className={`mb-1 ${
													day.profit >= 0
														? 'text-white/50'
														: 'text-[#E0342A]/70'
												}`}
											>
												{day.profit >= 0 ? 'Profit' : 'Loss'}
											</p>
											<p
												className={`font-semibold ${
													day.profit >= 0 ? 'text-white' : 'text-[#E0342A]'
												}`}
											>
												{formatCurrency(Math.abs(day.profit))}
											</p>
										</div>
									</div>
								</div>
							)
						})}
					</div>
				</motion.div>
			)}

			{/* Charts Section */}
			<div className="grid gap-6 md:grid-cols-2">
				{/* Daily Breakdown Chart */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.5 }}
					className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl"
				>
					<h3 className="mb-6 text-xl font-semibold text-white">
						{period === 'weekly' ? 'Daily Breakdown' : 'Daily Breakdown'}
					</h3>
					<div className="space-y-4">
						{analytics.dailyBreakdown.map((day, index) => {
							const salesPercent = (day.sales / maxDailyValue) * 100
							const spendingsPercent = (day.spendings / maxDailyValue) * 100
							return (
								<div
									key={index}
									className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3"
								>
									{/* Date Header */}
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium text-white">
											{formatDate(day.date)}
										</span>
										<div
											className={`text-sm font-semibold ${
												day.profit >= 0 ? 'text-white' : 'text-[#E0342A]'
											}`}
										>
											{day.profit >= 0 ? 'Profit' : 'Loss'}:{' '}
											{formatCurrency(Math.abs(day.profit))}
										</div>
									</div>

									{/* Visual Bar */}
									<div className="relative h-6 w-full overflow-hidden rounded-lg bg-black/30">
										<div
											className="absolute left-0 top-0 h-full bg-white/40"
											style={{ width: `${salesPercent}%` }}
										/>
										<div
											className="absolute right-0 top-0 h-full bg-[#E0342A]/60"
											style={{ width: `${spendingsPercent}%` }}
										/>
									</div>

									{/* Amount Details */}
									<div className="grid grid-cols-3 gap-2 text-xs">
										<div className="rounded-lg bg-white/5 p-2 border border-white/10">
											<p className="text-white/50 mb-1">Earnings</p>
											<p className="font-semibold text-white">
												{formatCurrency(day.sales)}
											</p>
										</div>
										<div className="rounded-lg bg-[#E0342A]/10 p-2 border border-[#E0342A]/20">
											<p className="text-[#E0342A]/70 mb-1">Spendings</p>
											<p className="font-semibold text-[#E0342A]">
												{formatCurrency(day.spendings)}
											</p>
										</div>
										<div
											className={`rounded-lg p-2 border ${
												day.profit >= 0
													? 'bg-white/5 border-white/10'
													: 'bg-[#E0342A]/10 border-[#E0342A]/20'
											}`}
										>
											<p
												className={`mb-1 ${
													day.profit >= 0
														? 'text-white/50'
														: 'text-[#E0342A]/70'
												}`}
											>
												Leftover
											</p>
											<p
												className={`font-semibold ${
													day.profit >= 0 ? 'text-white' : 'text-[#E0342A]'
												}`}
											>
												{formatCurrency(Math.abs(day.profit))}
											</p>
										</div>
									</div>
								</div>
							)
						})}
					</div>
				</motion.div>

				{/* Top Selling Items */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.6 }}
					className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl"
				>
					<h3 className="mb-6 text-xl font-semibold text-white">
						Top Selling Items
					</h3>
					<div className="space-y-4">
						{analytics.topSellingItems.length > 0 ? (
							analytics.topSellingItems.map((item, index) => {
								const maxRevenue = analytics.topSellingItems[0]?.revenue || 1
								const percent = (item.revenue / maxRevenue) * 100
								return (
									<div key={index} className="space-y-2">
										<div className="flex items-center justify-between">
											<div>
												<p className="font-medium text-white">{item.name}</p>
												<p className="text-xs text-white/60">
													{item.quantity} sold
												</p>
											</div>
											<p className="font-semibold text-white">
												{formatCurrency(item.revenue)}
											</p>
										</div>
										<div className="h-2 w-full overflow-hidden rounded-full bg-black/30">
											<div
												className="h-full bg-[#E0342A]"
												style={{ width: `${percent}%` }}
											/>
										</div>
									</div>
								)
							})
						) : (
							<p className="text-white/60">No sales data available</p>
						)}
					</div>
				</motion.div>
			</div>

			{/* Spending by Category */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.7 }}
				className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl"
			>
				<h3 className="mb-6 text-xl font-semibold text-white">
					Spending by Category
				</h3>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{analytics.spendingByCategory.length > 0 ? (
						analytics.spendingByCategory.map((category, index) => {
							const maxAmount = analytics.spendingByCategory[0]?.amount || 1
							const percent = (category.amount / maxAmount) * 100
							return (
								<div
									key={index}
									className="rounded-xl border border-white/10 bg-black/20 p-4"
								>
									<div className="mb-2 flex items-center justify-between">
										<p className="font-medium text-white">
											{category.category}
										</p>
										<p className="text-sm font-semibold text-white">
											{formatCurrency(category.amount)}
										</p>
									</div>
									<div className="h-2 w-full overflow-hidden rounded-full bg-black/30">
										<div
											className="h-full bg-[#E0342A]"
											style={{ width: `${percent}%` }}
										/>
									</div>
								</div>
							)
						})
					) : (
						<p className="text-white/60">No spending data available</p>
					)}
				</div>
			</motion.div>
		</div>
	)
}
