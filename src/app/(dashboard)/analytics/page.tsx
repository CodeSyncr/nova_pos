'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
	TrendingUp,
	TrendingDown,
	Receipt,
	ShoppingCart,
	Calendar,
	BarChart3,
	CalendarDays,
	IndianRupee,
	Percent,
	Wallet,
	Banknote
} from 'lucide-react'
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

const PERIOD_LABELS: Record<Period, string> = {
	today: 'Today',
	yesterday: 'Yesterday',
	weekly: 'Week',
	monthly: 'Month',
	quarterly: 'Quarter',
	halfyearly: 'Half Year',
	yearly: 'Year',
	custom: 'Custom'
}

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

	const fmt = (amount: number) =>
		`${currencySymbol}${amount.toLocaleString('en-IN', {
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		})}`

	const fmtShortDate = (dateString: string) => {
		const date = new Date(dateString)
		return date.toLocaleDateString('en-IN', {
			day: '2-digit',
			month: 'short'
		})
	}

	const calculateGrowth = (current: number, previous: number): number => {
		if (previous === 0) return current > 0 ? 100 : 0
		return ((current - previous) / previous) * 100
	}

	if (loading && !analytics) {
		return (
			<div className="flex h-[calc(100vh-120px)] items-center justify-center">
				<div className="text-center">
					<div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white/60 mx-auto" />
					<p className="text-white/60">Loading analytics…</p>
				</div>
			</div>
		)
	}

	if (!analytics) return null
	
	const earnings = analytics.earningsIncludingDiscounts
	const earningsGrowth =
		analytics.previousPeriod && period !== 'custom'
			? calculateGrowth(
					analytics.earningsIncludingDiscounts,
					analytics.previousPeriod.earningsIncludingDiscounts
				)
			: null
	const profitGrowth =
		analytics.previousPeriod && period !== 'custom'
			? calculateGrowth(analytics.profit, analytics.previousPeriod.profit)
			: null
	const expenseGrowth =
		analytics.previousPeriod && period !== 'custom'
			? calculateGrowth(analytics.expenses, analytics.previousPeriod.expenses)
			: null
	const aovGrowth =
		analytics.previousPeriod && period !== 'custom'
			? calculateGrowth(
					analytics.averageOrderValue,
					analytics.previousPeriod.averageOrderValue
				)
			: null

	const periodLabel = PERIOD_LABELS[period]
	const rangeLabel =
		dateRange &&
		`${fmtShortDate(dateRange.startDate)} – ${fmtShortDate(dateRange.endDate)}`

	return (
		<div className="flex flex-col gap-5 py-4 sm:gap-8 sm:py-6">
			{/* Hero banner — same shape as the home dashboard */}
			<section className="relative overflow-hidden rounded-3xl border border-white/10 sm:rounded-[32px]">
				<Image
					src="/dashboard_bg.png"
					alt=""
					fill
					priority
					sizes="100vw"
					className="object-cover"
				/>
				<div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/20" />
				<div className="relative z-10 px-6 py-10 sm:px-8 sm:py-14 md:py-20">
					<div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.3em] text-white/55 sm:text-[11px]">
						<BarChart3 className="h-3.5 w-3.5" />
						Business intelligence
					</div>
					<h1 className="mt-3 text-2xl font-semibold capitalize text-white sm:text-3xl md:text-4xl">
						Analytics
					</h1>
					<p className="mt-2 text-sm text-white/60 sm:text-base">
						{periodLabel}
						{rangeLabel && (
							<span className="ml-2 text-white/35">· {rangeLabel}</span>
						)}
					</p>
				</div>
			</section>

			{/* Period pills */}
			<section className="rounded-[28px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-3 sm:p-4">
				<div className="flex flex-wrap items-center gap-2">
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
					).map((p) => {
						const active = period === p
						return (
							<button
								key={p}
								type="button"
								onClick={() => handlePeriodChange(p)}
								className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
									active
										? 'bg-[#E0342A] text-white shadow-[0_4px_18px_rgba(224,52,42,0.35)]'
										: 'border border-white/10 bg-white/[0.04] text-white/65 hover:border-white/20 hover:text-white'
								}`}
							>
								{PERIOD_LABELS[p]}
							</button>
						)
					})}
				</div>
				{period === 'custom' && (
					<div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
						<div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/45">
							<CalendarDays className="h-3.5 w-3.5" /> Range
						</div>
						<label className="flex flex-col gap-1.5">
							<span className="text-[11px] uppercase tracking-wider text-white/45">
								From
							</span>
							<input
								type="date"
								value={customStartDate}
								onChange={(e) => setCustomStartDate(e.target.value)}
								className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
								style={{ colorScheme: 'dark' }}
							/>
						</label>
						<label className="flex flex-col gap-1.5">
							<span className="text-[11px] uppercase tracking-wider text-white/45">
								To
							</span>
							<input
								type="date"
								value={customEndDate}
								min={customStartDate || undefined}
								onChange={(e) => setCustomEndDate(e.target.value)}
								className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
								style={{ colorScheme: 'dark' }}
							/>
						</label>
						<button
							type="button"
							onClick={handleCustomDateApply}
							disabled={!customStartDate || !customEndDate}
							className="ml-auto rounded-xl bg-[#E0342A] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#c92f26] active:scale-95 disabled:opacity-40"
						>
							Apply
						</button>
					</div>
				)}
			</section>

			{/* Editorial metrics band — earnings hero + mini-stats */}
			<section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent sm:rounded-[28px]">
				<div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-[#E0342A]/10 blur-[90px]" />
				<div className="relative grid lg:grid-cols-[1.55fr_1fr]">
					<div className="p-6 sm:p-8 lg:p-10">
						<div className="flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.25em] text-white/40 sm:text-[11px] sm:tracking-[0.35em]">
							<span className="h-1.5 w-1.5 rounded-full bg-[#E0342A]" />
							Earnings · {periodLabel}
						</div>
						<div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2 sm:mt-6 sm:gap-x-4 sm:gap-y-3">
							<span className="text-[2.75rem] font-semibold leading-[0.9] tracking-tight text-white sm:text-6xl lg:text-[5.5rem]">
								{fmt(earnings)}
							</span>
							{earningsGrowth !== null && earningsGrowth !== 0 && (
								<TrendChip value={earningsGrowth} />
							)}
						</div>
						<p className="mt-5 text-sm text-white/40">
							{analytics.orderCount} order
							{analytics.orderCount !== 1 ? 's' : ''}
							<span className="mx-2 text-white/20">•</span>
							{fmt(analytics.averageOrderValue)} avg ticket
							{analytics.totalDiscounts > 0 && (
								<>
									<span className="mx-2 text-white/20">•</span>
									{fmt(analytics.totalDiscounts)} discounts
								</>
							)}
						</p>
					</div>
					<div className="grid grid-rows-3 divide-y divide-white/[0.06] border-t border-white/[0.06] lg:border-l lg:border-t-0">
						<MiniStat
							icon={<TrendingUp />}
							label="Profit"
							value={fmt(analytics.profit)}
							trend={profitGrowth}
						/>
						<MiniStat
							icon={<Wallet />}
							label="Expenses"
							value={fmt(analytics.expenses)}
							trend={expenseGrowth}
							invertTrend
						/>
						<MiniStat
							icon={<Receipt />}
							label="Avg ticket"
							value={fmt(analytics.averageOrderValue)}
							trend={aovGrowth}
						/>
					</div>
				</div>
			</section>

			{/* Secondary metrics row */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					icon={<IndianRupee />}
					label="Earnings (excl. discounts)"
					value={fmt(analytics.earningsExcludingDiscounts)}
					sub={
						analytics.totalDiscounts > 0
							? `${fmt(analytics.totalDiscounts)} given as discount`
							: 'No discounts applied'
					}
				/>
				<StatCard
					icon={<Percent />}
					label="Discount share"
					value={
						analytics.earningsExcludingDiscounts > 0
							? `${(
									(analytics.totalDiscounts /
										analytics.earningsExcludingDiscounts) *
									100
								).toFixed(1)}%`
							: '0.0%'
					}
					sub={`${fmt(analytics.totalDiscounts)} total`}
				/>
				<StatCard
					icon={<ShoppingCart />}
					label="Purchases logged"
					value={analytics.purchaseCount.toString()}
					sub={`${fmt(analytics.expenses)} spent`}
				/>
				<StatCard
					icon={<Banknote />}
					label="Net change"
					value={
						analytics.previousPeriod
							? fmt(analytics.profit - analytics.previousPeriod.profit)
							: '—'
					}
					sub={
						analytics.previousPeriod
							? 'vs previous period'
							: 'No comparison data'
					}
					accent={
						analytics.previousPeriod
							? analytics.profit - analytics.previousPeriod.profit < 0
							: false
					}
				/>
			</div>

			{/* Daily breakdown + Top sellers */}
			<div className="grid gap-6 md:grid-cols-[1.3fr_0.7fr]">
				<Panel
					eyebrow="Timeline"
					title="Daily breakdown"
					action={
						<span className="text-[11px] uppercase tracking-[0.25em] text-white/35">
							Earnings vs spendings
						</span>
					}
				>
					{analytics.dailyBreakdown.length === 0 ? (
						<EmptyLine>No activity in this period</EmptyLine>
					) : (
						<DailyBreakdownChart
							data={analytics.dailyBreakdown}
							currencySymbol={currencySymbol}
						/>
					)}
				</Panel>

				<Panel
					eyebrow={periodLabel}
					title="Top sellers"
					action={
						<span className="text-xs tabular-nums text-[#E0342A]">
							{analytics.topSellingItems.length} items
						</span>
					}
				>
					{analytics.topSellingItems.length === 0 ? (
						<EmptyLine>No sales yet</EmptyLine>
					) : (
						<div className="space-y-1">
							{analytics.topSellingItems.slice(0, 6).map((item, idx) => {
								const maxRevenue = analytics.topSellingItems[0]?.revenue || 1
								const pct = Math.max(
									8,
									Math.round((item.revenue / maxRevenue) * 100)
								)
								return (
									<div
										key={item.name}
										className="relative overflow-hidden rounded-lg py-2.5"
									>
										<div
											className="absolute inset-y-1 left-0 rounded-lg bg-[#E0342A]/[0.12]"
											style={{ width: `${pct}%` }}
										/>
										<div className="relative flex items-center justify-between gap-3 px-2">
											<span className="flex min-w-0 items-center gap-2.5">
												<span className="text-xs font-bold tabular-nums text-[#E0342A]">
													{idx + 1}
												</span>
												<span className="truncate text-sm text-white">
													{item.name}
												</span>
											</span>
											<span className="shrink-0 text-right">
												<span className="block text-sm font-semibold tabular-nums text-white">
													{fmt(item.revenue)}
												</span>
												<span className="block text-[10px] uppercase tracking-wider text-white/35">
													{item.quantity}× sold
												</span>
											</span>
										</div>
									</div>
								)
							})}
						</div>
					)}
				</Panel>
			</div>

			{/* Sales by day of week + Spending by category */}
			<div className="grid gap-6 md:grid-cols-2">
				<Panel
					eyebrow="Patterns"
					title="By day of week"
					action={
						<span className="text-[11px] uppercase tracking-[0.25em] text-white/35">
							Aggregated
						</span>
					}
				>
					{!analytics.weeklyBreakdown ||
					analytics.weeklyBreakdown.length === 0 ? (
						<EmptyLine>Need a few more orders to see patterns</EmptyLine>
					) : (
						<DayOfWeekChart
							data={analytics.weeklyBreakdown}
							currencySymbol={currencySymbol}
						/>
					)}
				</Panel>

				<Panel
					eyebrow="Outflow"
					title="Spending by category"
					action={
						<span className="text-[11px] uppercase tracking-[0.25em] text-white/35">
							Where money went
						</span>
					}
				>
					{analytics.spendingByCategory.length === 0 ? (
						<EmptyLine>No purchases logged this period</EmptyLine>
					) : (
						<div className="space-y-3">
							{analytics.spendingByCategory.map((category) => {
								const max =
									analytics.spendingByCategory[0]?.amount || 1
								const pct = Math.max(
									(category.amount / max) * 100,
									4
								)
								return (
									<div key={category.category} className="space-y-1.5">
										<div className="flex items-center justify-between text-sm">
											<span className="truncate text-white">
												{category.category}
											</span>
											<span className="tabular-nums font-semibold text-white">
												{fmt(category.amount)}
											</span>
										</div>
										<div className="relative h-2 overflow-hidden rounded-full bg-white/[0.04]">
											<div
												className="absolute inset-y-0 left-0 rounded-full bg-[#E0342A]/70"
												style={{ width: `${pct}%` }}
											/>
										</div>
									</div>
								)
							})}
						</div>
					)}
				</Panel>
			</div>

			{/* Period vs previous comparison */}
			{analytics.previousPeriod && period !== 'custom' && (
				<Panel
					eyebrow="Comparison"
					title={`${periodLabel} vs previous`}
					action={
						<span className="text-[11px] uppercase tracking-[0.25em] text-white/35">
							Side-by-side
						</span>
					}
				>
					<div className="grid gap-4 sm:grid-cols-3">
						<CompareRow
							label="Earnings"
							current={analytics.earningsIncludingDiscounts}
							previous={
								analytics.previousPeriod.earningsIncludingDiscounts
							}
							fmt={fmt}
						/>
						<CompareRow
							label="Profit"
							current={analytics.profit}
							previous={analytics.previousPeriod.profit}
							fmt={fmt}
						/>
						<CompareRow
							label="Expenses"
							current={analytics.expenses}
							previous={analytics.previousPeriod.expenses}
							fmt={fmt}
							invertTrend
						/>
					</div>
				</Panel>
			)}
		</div>
	)
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

/**
 * Generic earnings-vs-spendings line chart used by both the "Daily
 * breakdown" and "By day of week" panels.
 *
 * Pure SVG with a React-driven hover tooltip — when the cursor enters
 * the chart we snap to the nearest data point and overlay a card
 * showing the exact earnings, spendings, and net profit. On mobile,
 * tapping a point pins the same card.
 */
function LineSeriesChart({
	data,
	currencySymbol,
	axisDensity = 'all'
}: {
	data: Array<{
		key: string
		axisLabel: string
		tooltipTitle: string
		sales: number
		spendings: number
		profit: number
	}>
	currencySymbol: string
	/// `'all'` shows every X label; `'sparse'` is for long timelines and
	/// only labels every Nth point so the axis doesn't get crowded.
	axisDensity?: 'all' | 'sparse'
}) {
	const [hoverIdx, setHoverIdx] = useState<number | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	
	// Design coordinates. SVG is responsive via `viewBox`.
	const W = 560
	const H = 200
	const padX = 24
	const padTop = 18
	const padBottom = 38
	
	const max = Math.max(
		1,
		...data.map((d) => Math.max(d.sales, d.spendings))
	)
	
	const stepX = data.length > 1 ? (W - padX * 2) / (data.length - 1) : 0
	const xAt = (i: number) => padX + stepX * i
	const yAt = (v: number) => padTop + (H - padTop - padBottom) * (1 - v / max)
	
	// Smoothed cubic Bezier line — gives the chart a more refined feel
	// than a piecewise polyline.
	const buildPath = (key: 'sales' | 'spendings') => {
		if (data.length === 0) return ''
		return data
			.map((d, i) => {
				const x = xAt(i)
				const y = yAt(d[key])
				if (i === 0) return `M ${x} ${y}`
				const prev = data[i - 1]!
				const px = xAt(i - 1)
				const py = yAt(prev[key])
				return `C ${px + stepX / 2} ${py}, ${x - stepX / 2} ${y}, ${x} ${y}`
			})
			.join(' ')
	}
	
	const buildArea = (key: 'sales' | 'spendings') => {
		if (data.length === 0) return ''
		const line = buildPath(key)
		const last = data.length - 1
		return `${line} L ${xAt(last)} ${H - padBottom} L ${xAt(0)} ${H - padBottom} Z`
	}
	
	const fmtAxis = (n: number) => {
		if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(1)}Cr`
		if (n >= 1_00_000) return `${(n / 1_00_000).toFixed(1)}L`
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
		return n.toFixed(0)
	}
	
	const fmtMoney = (n: number) =>
		`${currencySymbol}${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
	
	// Map a clientX position to the nearest data index.
	const indexFromX = (clientX: number) => {
		const rect = containerRef.current?.getBoundingClientRect()
		if (!rect || data.length === 0) return null
		const svgX = ((clientX - rect.left) / rect.width) * W
		const ratio = (svgX - padX) / Math.max(stepX, 0.0001)
		const idx = Math.round(ratio)
		return Math.max(0, Math.min(data.length - 1, idx))
	}
	
	const handlePointerMove = (e: React.PointerEvent) => {
		const idx = indexFromX(e.clientX)
		if (idx !== null) setHoverIdx(idx)
	}
	const handlePointerLeave = () => setHoverIdx(null)
	
	const hovered = hoverIdx !== null ? data[hoverIdx] : null
	const tooltipLeftPct = hovered ? (xAt(hoverIdx!) / W) * 100 : 0
	const flipLeft = tooltipLeftPct > 70
	
	// For longer ranges, only label every Nth point to keep the axis
	// readable. Always label the first and last.
	const axisStep = axisDensity === 'sparse'
		? Math.max(1, Math.ceil(data.length / 8))
		: 1
	
	return (
		<div className="space-y-4">
			{/* Legend + max */}
			<div className="flex items-center justify-between text-[11px] text-white/60">
				<div className="flex items-center gap-4">
					<span className="inline-flex items-center gap-2">
						<span className="inline-block h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.15)]" />
						<span className="font-semibold text-white/80">Earnings</span>
					</span>
					<span className="inline-flex items-center gap-2">
						<span className="inline-block h-2.5 w-2.5 rounded-full bg-[#E0342A] shadow-[0_0_0_2px_rgba(224,52,42,0.25)]" />
						<span className="font-semibold text-white/80">Spendings</span>
					</span>
				</div>
				<span className="uppercase tracking-[0.2em] text-white/35">
					Peak {currencySymbol}{fmtAxis(max)}
				</span>
			</div>
			
			<div
				ref={containerRef}
				className="relative touch-none"
				onPointerMove={handlePointerMove}
				onPointerLeave={handlePointerLeave}
				onPointerCancel={handlePointerLeave}
			>
				<svg
					viewBox={`0 0 ${W} ${H}`}
					className="block h-[220px] w-full select-none"
					preserveAspectRatio="none"
					role="img"
					aria-label="Earnings versus spendings"
				>
					<defs>
						<linearGradient id="aoSales" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.35" />
							<stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
						</linearGradient>
						<linearGradient id="aoSpend" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#E0342A" stopOpacity="0.45" />
							<stop offset="100%" stopColor="#E0342A" stopOpacity="0" />
						</linearGradient>
						<linearGradient id="aoLineSales" x1="0" y1="0" x2="1" y2="0">
							<stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
							<stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.95" />
						</linearGradient>
						<linearGradient id="aoLineSpend" x1="0" y1="0" x2="1" y2="0">
							<stop offset="0%" stopColor="#E0342A" stopOpacity="0.7" />
							<stop offset="100%" stopColor="#E0342A" stopOpacity="1" />
						</linearGradient>
					</defs>
					
					{/* horizontal grid lines */}
					{[0.25, 0.5, 0.75].map((t) => {
						const y = padTop + (H - padTop - padBottom) * t
						return (
							<line
								key={t}
								x1={padX}
								x2={W - padX}
								y1={y}
								y2={y}
								stroke="rgba(255,255,255,0.06)"
								strokeDasharray="2 4"
							/>
						)
					})}
					
					{/* fills */}
					<path d={buildArea('sales')} fill="url(#aoSales)" />
					<path d={buildArea('spendings')} fill="url(#aoSpend)" />
					
					{/* lines */}
					<path
						d={buildPath('sales')}
						fill="none"
						stroke="url(#aoLineSales)"
						strokeWidth={2.5}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
					<path
						d={buildPath('spendings')}
						fill="none"
						stroke="url(#aoLineSpend)"
						strokeWidth={2.5}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
					
					{/* default data points */}
					{data.map((d, i) => (
						<g key={d.key}>
							<circle
								cx={xAt(i)}
								cy={yAt(d.sales)}
								r={3.5}
								fill="#0A0A0A"
								stroke="#FFFFFF"
								strokeWidth={1.5}
							/>
							<circle
								cx={xAt(i)}
								cy={yAt(d.spendings)}
								r={3.5}
								fill="#0A0A0A"
								stroke="#E0342A"
								strokeWidth={1.5}
							/>
						</g>
					))}
					
					{/* hover indicator */}
					{hoverIdx !== null && (
						<g>
							<line
								x1={xAt(hoverIdx)}
								x2={xAt(hoverIdx)}
								y1={padTop}
								y2={H - padBottom}
								stroke="rgba(255,255,255,0.18)"
								strokeWidth={1}
								strokeDasharray="3 3"
							/>
							<circle
								cx={xAt(hoverIdx)}
								cy={yAt(data[hoverIdx]!.sales)}
								r={5}
								fill="#FFFFFF"
								stroke="#0A0A0A"
								strokeWidth={2}
							/>
							<circle
								cx={xAt(hoverIdx)}
								cy={yAt(data[hoverIdx]!.spendings)}
								r={5}
								fill="#E0342A"
								stroke="#0A0A0A"
								strokeWidth={2}
							/>
						</g>
					)}
					
					{/* x-axis labels */}
					{data.map((d, i) => {
						const isEdge = i === 0 || i === data.length - 1
						const isHover = i === hoverIdx
						const showLabel = isEdge || isHover || i % axisStep === 0
						if (!showLabel) return null
						return (
							<text
								key={`l-${d.key}`}
								x={xAt(i)}
								y={H - 14}
								textAnchor="middle"
								fontSize={11}
								fontWeight={isHover ? 700 : 500}
								fill={isHover ? '#FFFFFF' : 'rgba(255,255,255,0.45)'}
							>
								{d.axisLabel}
							</text>
						)
					})}
				</svg>
				
				{/* Floating tooltip card. Positioned at the active data point
				    and flipped to the left edge when the cursor is on the
				    right third of the chart so it never gets clipped. */}
				{hovered && (
					<div
						className="pointer-events-none absolute top-0 z-10 -translate-y-1 rounded-xl border border-white/10 bg-[#0a0a0a]/95 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur-md min-w-[180px]"
						style={{
							left: `${tooltipLeftPct}%`,
							transform: flipLeft
								? 'translate(-100%, -4px)'
								: 'translate(8px, -4px)'
						}}
					>
						<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
							{hovered.tooltipTitle}
						</p>
						<div className="mt-2 space-y-1.5">
							<div className="flex items-center justify-between gap-4">
								<span className="flex items-center gap-2 text-[11px] text-white/65">
									<span className="inline-block h-2 w-2 rounded-full bg-white" />
									Earnings
								</span>
								<span className="text-sm font-semibold tabular-nums text-white">
									{fmtMoney(hovered.sales)}
								</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<span className="flex items-center gap-2 text-[11px] text-white/65">
									<span className="inline-block h-2 w-2 rounded-full bg-[#E0342A]" />
									Spendings
								</span>
								<span className="text-sm font-semibold tabular-nums text-[#E0342A]">
									{fmtMoney(hovered.spendings)}
								</span>
							</div>
							<div className="mt-1.5 flex items-center justify-between gap-4 border-t border-white/[0.08] pt-1.5">
								<span className="text-[10px] uppercase tracking-wider text-white/40">
									Net
								</span>
								<span
									className={`text-sm font-bold tabular-nums ${
										hovered.profit >= 0 ? 'text-emerald-300' : 'text-[#E0342A]'
									}`}
								>
									{hovered.profit >= 0 ? '+' : '−'}
									{fmtMoney(Math.abs(hovered.profit))}
								</span>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

/** Weekly aggregation panel — uses Mon/Tue/… as the X axis. */
function DayOfWeekChart({
	data,
	currencySymbol
}: {
	data: Array<{ day: string; dayName: string; sales: number; spendings: number; profit: number }>
	currencySymbol: string
}) {
	const points = data.map((d) => ({
		key: d.day,
		axisLabel: d.dayName.slice(0, 3),
		tooltipTitle: d.dayName,
		sales: d.sales,
		spendings: d.spendings,
		profit: d.profit
	}))
	return <LineSeriesChart data={points} currencySymbol={currencySymbol} axisDensity="all" />
}

/** Per-day timeline panel — uses calendar dates as the X axis. Labels
 *  thin out automatically for long ranges. */
function DailyBreakdownChart({
	data,
	currencySymbol
}: {
	data: Array<{ date: string; sales: number; spendings: number; profit: number }>
	currencySymbol: string
}) {
	const fmtShort = (iso: string) => {
		const d = new Date(iso)
		return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
	}
	const fmtFull = (iso: string) => {
		const d = new Date(iso)
		return d.toLocaleDateString('en-IN', {
			weekday: 'short',
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		})
	}
	const points = data.map((d) => ({
		key: d.date,
		axisLabel: fmtShort(d.date),
		tooltipTitle: fmtFull(d.date),
		sales: d.sales,
		spendings: d.spendings,
		profit: d.profit
	}))
	return (
		<LineSeriesChart
			data={points}
			currencySymbol={currencySymbol}
			axisDensity={data.length > 8 ? 'sparse' : 'all'}
		/>
	)
}

function TrendChip({ value, invert = false }: { value: number; invert?: boolean }) {
	if (!isFinite(value) || isNaN(value)) return null
	const positiveIsGood = !invert
	const isUp = value >= 0
	const goodOutcome = positiveIsGood ? isUp : !isUp
	return (
		<span
			className={`mb-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
				goodOutcome ? 'bg-white/10 text-white' : 'bg-[#E0342A]/15 text-[#E0342A]'
			}`}
		>
			{isUp ? (
				<TrendingUp className="h-3.5 w-3.5" />
			) : (
				<TrendingDown className="h-3.5 w-3.5" />
			)}
			{Math.abs(value).toFixed(1)}%
		</span>
	)
}

function MiniStat({
	icon,
	label,
	value,
	trend,
	invertTrend
}: {
	icon: React.ReactNode
	label: string
	value: string
	trend?: number | null
	invertTrend?: boolean
}) {
	const showTrend = trend !== null && trend !== undefined && trend !== 0
	const positiveIsGood = !invertTrend
	const isUp = (trend ?? 0) >= 0
	const goodOutcome = showTrend ? (positiveIsGood ? isUp : !isUp) : true
	return (
		<div className="flex items-center justify-between gap-4 px-6 py-4 sm:px-8 sm:py-5 lg:px-9">
			<span className="flex items-center gap-2.5 text-white/40 [&>svg]:h-4 [&>svg]:w-4">
				{icon}
				<span className="text-[11px] font-medium uppercase tracking-[0.18em]">
					{label}
				</span>
			</span>
			<span className="flex items-baseline gap-2">
				<span className="text-2xl font-semibold tabular-nums text-white">
					{value}
				</span>
				{showTrend && (
					<span
						className={`text-[11px] font-semibold tabular-nums ${
							goodOutcome ? 'text-white/55' : 'text-[#E0342A]'
						}`}
					>
						{isUp ? '↑' : '↓'} {Math.abs(trend ?? 0).toFixed(1)}%
					</span>
				)}
			</span>
		</div>
	)
}

function StatCard({
	icon,
	label,
	value,
	sub,
	accent = false
}: {
	icon: React.ReactNode
	label: string
	value: string
	sub?: string
	accent?: boolean
}) {
	return (
		<section className="rounded-[24px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-5">
			<div className="mb-3 flex items-center gap-2 text-[#E0342A] [&>svg]:h-4 [&>svg]:w-4">
				{icon}
				<span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">
					{label}
				</span>
			</div>
			<p
				className={`text-2xl font-semibold tabular-nums ${
					accent ? 'text-[#E0342A]' : 'text-white'
				}`}
			>
				{value}
			</p>
			{sub && <p className="mt-1 text-xs text-white/40">{sub}</p>}
		</section>
	)
}

function Panel({
	eyebrow,
	title,
	action,
	children
}: {
	eyebrow: string
	title: string
	action?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<section className="rounded-[28px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-6 lg:p-7">
			<div className="mb-4 flex items-start justify-between gap-3">
				<div>
					<p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#E0342A]/80">
						{eyebrow}
					</p>
					<h2 className="mt-1.5 text-base font-semibold text-white">
						{title}
					</h2>
				</div>
				{action}
			</div>
			{children}
		</section>
	)
}

function EmptyLine({ children }: { children: React.ReactNode }) {
	return <p className="py-8 text-center text-sm text-white/30">{children}</p>
}

function CompareRow({
	label,
	current,
	previous,
	fmt,
	invertTrend = false
}: {
	label: string
	current: number
	previous: number
	fmt: (n: number) => string
	invertTrend?: boolean
}) {
	const delta = current - previous
	const growth = previous === 0 ? (current > 0 ? 100 : 0) : (delta / previous) * 100
	const isUp = delta >= 0
	const goodOutcome = invertTrend ? !isUp : isUp
	return (
		<div className="rounded-2xl border border-white/[0.06] bg-black/15 px-4 py-3.5">
			<p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">
				{label}
			</p>
			<div className="mt-2 flex items-baseline gap-2.5">
				<span className="text-xl font-semibold tabular-nums text-white">
					{fmt(current)}
				</span>
				<span
					className={`text-[11px] font-semibold tabular-nums ${
						goodOutcome ? 'text-white/55' : 'text-[#E0342A]'
					}`}
				>
					{isUp ? '↑' : '↓'} {Math.abs(growth).toFixed(1)}%
				</span>
			</div>
			<p className="mt-1 text-xs text-white/35">
				Previously {fmt(previous)}
			</p>
		</div>
	)
}
