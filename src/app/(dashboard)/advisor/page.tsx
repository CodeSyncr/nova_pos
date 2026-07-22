'use client'

import { useEffect, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
	Brain,
	Sparkles,
	TrendingUp,
	Zap,
	Percent,
	ShieldCheck,
	Calendar,
	RefreshCw,
	Settings,
	Play,
	AlertCircle,
	ChevronRight,
	Target,
	BarChart3,
	Home,
	CheckCircle2,
	MapPin,
	Search,
	Share2,
	ShoppingBag,
	Video,
	Globe,
	Copy,
	Check
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getTaxModuleData, type TaxModuleData } from '@/app/actions/tax'
import {
	getAIAdvisorInsights,
	seedRentExpenses,
	saveAdvisorCache,
	loadAdvisorCache,
	saveSEOSettings,
	loadSEOSettings,
	type AdvisorInsights,
	type RentSeedMonth,
	type SEOSettings
} from '@/app/actions/advisor'

export default function AdvisorPage() {
	const [loading, setLoading] = useState(true)
	const [isRefreshing, startTransition] = useTransition()
	const [tenantId, setTenantId] = useState<string | null>(null)
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	const [yearStart, setYearStart] = useState<number>(2026)
	const [taxData, setTaxData] = useState<TaxModuleData | null>(null)

	// Cloudflare AI state
	const [aiInsights, setAiInsights] = useState<AdvisorInsights | null>(null)
	const [aiLoading, setAiLoading] = useState(false)
	const [aiError, setAiError] = useState<string | null>(null)
	const [aiRan, setAiRan] = useState(false)
	const [cachedAt, setCachedAt] = useState<string | null>(null)

	// What-If Simulator
	const [marketingSpend, setMarketingSpend] = useState<number>(0)
	const [priceOptimization, setPriceOptimization] = useState<boolean>(false)
	const [aggregatorShift, setAggregatorShift] = useState<boolean>(false)
	const [wasteReduction, setWasteReduction] = useState<boolean>(false)

	// Active agent tab
	const [activeAgent, setActiveAgent] = useState<'marketing' | 'operations' | 'overhead' | 'tax'>('marketing')

	// Rent Seeding
	const [rentBase, setRentBase] = useState<string>('65000')
	const [rentHikeFrom, setRentHikeFrom] = useState<string>('') // YYYY-MM, empty = no hike
	const [rentHikeAmount, setRentHikeAmount] = useState<string>('')
	const [rentSeeding, setRentSeeding] = useState(false)
	const [rentSeedResult, setRentSeedResult] = useState<{ inserted: number; skipped: number } | null>(null)
	const [rentSeedError, setRentSeedError] = useState<string | null>(null)

	// SEO Configuration & Schema
	const [seoConfig, setSeoConfig] = useState<SEOSettings>({
		businessName: 'Pizzeria da Cafe',
		gmbUrl: '',
		gmbPlaceId: '',
		targetLocation: 'Mumbai / Pune Area',
		primaryCategory: 'Pizza Restaurant & Cafe',
		phone: '',
		websiteUrl: '',
		instagramHandle: '@pizzeriadacafe',
		targetKeywords: 'Best Pizza near me, wood-fired pizza cafe, authentic pizza delivery'
	})
	const [savingSeo, setSavingSeo] = useState(false)
	const [seoSavedMsg, setSeoSavedMsg] = useState<string | null>(null)
	const [copiedSchema, setCopiedSchema] = useState(false)

	const loadData = async (tid: string) => {
		setLoading(true)
		try {
			const data = await getTaxModuleData(tid, yearStart)
			setTaxData(data)
		} catch (error) {
			console.error('Error fetching advisor data:', error)
		} finally {
			setLoading(false)
		}
	}

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

				const tenant = Array.isArray(profileTenant.tenant)
					? (profileTenant.tenant as any)[0]
					: profileTenant.tenant
				const settings = (tenant?.settings as Record<string, unknown>) || {}
				setCurrencySymbol((settings.currencySymbol as string) || '₹')

				// Load cached AI insights first so they show instantly
				try {
					const cached = await loadAdvisorCache(tid, yearStart)
					if (cached) {
						setAiInsights(cached.insights)
						setAiRan(true)
						setCachedAt(cached.cachedAt)
					}
				} catch (_) { /* ignore cache miss */ }

				// Load saved SEO Settings
				try {
					const savedSeo = await loadSEOSettings(tid)
					if (savedSeo) setSeoConfig(savedSeo)
				} catch (_) { /* ignore missing seo config */ }

				await loadData(tid)
			} catch (error) {
				console.error('Error loading advisor:', error)
				setLoading(false)
			}
		}
		loadTenant()
	}, [yearStart])

	const handleRefresh = () => {
		if (!tenantId) return
		setAiInsights(null)
		setAiRan(false)
		startTransition(async () => {
			await loadData(tenantId)
		})
	}

	const runAIAnalysis = async () => {
		if (!tenantId) return
		setAiLoading(true)
		setAiError(null)
		setAiInsights(null)
		setAiRan(false)
		setCachedAt(null)
		try {
			const insights = await getAIAdvisorInsights(tenantId, yearStart)
			setAiInsights(insights)
			setAiRan(true)
			// Persist to Supabase so next visit loads instantly
			try {
				await saveAdvisorCache(tenantId, yearStart, insights)
				setCachedAt(new Date().toISOString())
			} catch (_) { /* non-fatal */ }
		} catch (err: any) {
			setAiError(err?.message ?? 'Cloudflare AI analysis failed. Please try again.')
		} finally {
			setAiLoading(false)
		}
	}

	// ── Financial baseline ────────────────────────────────────────────
	const salesTotal = taxData?.sales.total || 0
	const orderCount = taxData?.sales.orderCount || 0
	const activeMonthsCount = taxData?.sales.monthlySales.filter((m) => m.total > 0).length || 0
	const activeMonths = activeMonthsCount || 12
	const avgMonthlySales = salesTotal / activeMonths
	const avgOrderValue = orderCount > 0 ? salesTotal / orderCount : 0

	const monthlyRent = 65000
	const monthlyWages = 40000
	const monthlySalaries = 30000
	const monthlyFixed = monthlyRent + monthlyWages + monthlySalaries

	let rawMaterialCost = 0, fuelCost = 0, commissionCost = 0
	taxData?.purchases.forEach((p) => {
		const n = (p.notes || '').toLowerCase()
		if (n.includes('ingredient') || n.includes('food') || n.includes('cheese')) rawMaterialCost += p.totalAmount
		else if (n.includes('gas') || n.includes('fuel')) fuelCost += p.totalAmount
		else if (n.includes('commission') || n.includes('aggregator')) commissionCost += p.totalAmount
	})

	const directRatio = salesTotal > 0 ? (rawMaterialCost + monthlyWages * activeMonths + fuelCost) / salesTotal : 0.42
	const indirectRatio = salesTotal > 0 ? (monthlyRent * activeMonths + commissionCost + monthlySalaries * activeMonths) / salesTotal : 0.38

	const fmt = (n: number) => currencySymbol + ' ' + Math.round(n).toLocaleString('en-IN')

	// ── What-If 12-Month Projections ──────────────────────────────────
	const seasonality = [0.90, 0.95, 1.10, 1.15, 1.25, 1.10, 1.00, 0.95, 1.10, 1.05, 0.90, 0.85]
	const months = ['August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July']

	const futureMonths = months.map((month, i) => {
		const base = (avgMonthlySales > 0 ? avgMonthlySales : 285000) * seasonality[i]!
		const mktMult = 1 + marketingSpend * 0.000012
		const priceMult = priceOptimization ? 1.03 : 1.0
		const promoMult = aggregatorShift ? 1.04 : 1.0
		const opt = base * mktMult * priceMult * promoMult

		const activeCOGS = wasteReduction ? directRatio - 0.03 : directRatio
		const commSaving = aggregatorShift ? 0.044 : 0.0
		const activeIndirect = indirectRatio - commSaving

		const baseNet = base - base * directRatio - base * indirectRatio
		const optNet = opt - opt * activeCOGS - opt * activeIndirect

		return { month, base, opt, baseNet, optNet, increment: Math.max(0, optNet - baseNet) }
	})

	const totalBaseNet = futureMonths.reduce((s, m) => s + m.baseNet, 0)
	const totalOptNet = futureMonths.reduce((s, m) => s + m.optNet, 0)
	const totalIncrement = Math.max(0, totalOptNet - totalBaseNet)

	// ── Agent section map ─────────────────────────────────────────────
	const agentDefs = [
		{ id: 'marketing' as const, label: 'Marketing & Growth', icon: Sparkles, color: 'text-rose-400', borderActive: 'border-rose-500/40 bg-rose-500/5' },
		{ id: 'operations' as const, label: 'Ops & COGS', icon: Percent, color: 'text-blue-400', borderActive: 'border-blue-500/40 bg-blue-500/5' },
		{ id: 'overhead' as const, label: 'Overheads', icon: Zap, color: 'text-amber-400', borderActive: 'border-amber-500/40 bg-amber-500/5' },
		{ id: 'tax' as const, label: 'Tax Optimization', icon: ShieldCheck, color: 'text-emerald-400', borderActive: 'border-emerald-500/40 bg-emerald-500/5' }
	]

	if (loading) {
		return (
			<div className="flex h-[500px] items-center justify-center">
				<div className="text-center space-y-4">
					<div className="relative mx-auto h-14 w-14">
						<Brain className="absolute inset-0 h-full w-full text-[#E0342A] opacity-20" />
						<RefreshCw className="absolute inset-0 h-full w-full text-[#E0342A] animate-spin" />
					</div>
					<p className="text-white/60 text-sm">Loading business data...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-8 pb-16">
			{/* ── Header ───────────────────────────────────────────── */}
			<header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<Badge className="border-white/20 bg-white/10 text-white/80 mb-2">
						<Brain className="mr-1.5 h-3.5 w-3.5 text-[#E0342A]" /> Cloudflare AI · Llama 3.1
					</Badge>
					<h1 className="text-3xl font-bold text-white">AI Predictive Growth</h1>
					<p className="text-white/50 text-sm mt-1">
						Real-time Cloudflare AI analysis of your store data with 12-month profit forecast
					</p>
				</div>
				<div className="flex items-center gap-3 flex-shrink-0">
					<div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white">
						<Calendar className="h-4 w-4 text-white/40" />
						<span className="text-white/50">FY Base:</span>
						<select
							value={yearStart}
							onChange={(e) => { setYearStart(parseInt(e.target.value)); setAiInsights(null); setAiRan(false) }}
							className="bg-transparent font-medium text-white focus:outline-none"
						>
							<option value={2026} className="bg-black">FY 2026-27</option>
							<option value={2025} className="bg-black">FY 2025-26</option>
							<option value={2024} className="bg-black">FY 2024-25</option>
						</select>
					</div>
					<Button onClick={handleRefresh} disabled={isRefreshing} variant="ghost" size="sm" className="border border-white/10">
						<RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
						Refresh
					</Button>
				</div>
			</header>

			{/* ── Business Health KPI Row ───────────────────────────── */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				{[
					{ label: 'Annual Sales', value: fmt(salesTotal), sub: `${activeMonths} active months`, color: 'text-white' },
					{ label: 'Avg Monthly Revenue', value: fmt(avgMonthlySales), sub: `${orderCount} total orders`, color: 'text-white' },
					{ label: 'Avg Order Value', value: fmt(avgOrderValue), sub: 'per completed order', color: 'text-white' },
					{ label: 'AI Health Score', value: aiInsights ? `${aiInsights.overallScore}/100` : '—', sub: aiInsights ? 'Cloudflare AI rated' : 'Run analysis below', color: aiInsights ? (aiInsights.overallScore >= 70 ? 'text-emerald-400' : aiInsights.overallScore >= 50 ? 'text-yellow-400' : 'text-red-400') : 'text-white/30' }
				].map((k) => (
					<div key={k.label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
						<p className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">{k.label}</p>
						<p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
						<p className="text-xs text-white/40 mt-0.5">{k.sub}</p>
					</div>
				))}
			</div>

			{/* ── Cloudflare AI Analysis Panel ─────────────────────── */}
			<div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
				<div className="px-6 py-5 bg-white/5 border-b border-white/10 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="h-9 w-9 rounded-xl bg-[#E0342A]/10 flex items-center justify-center">
							<Brain className="h-5 w-5 text-[#E0342A]" />
						</div>
						<div>
							<h2 className="font-bold text-white">Cloudflare AI Business Intelligence</h2>
							<p className="text-[11px] text-white/40 mt-0.5">Llama 3.1-8B analyzes your real sales & expense records to generate dynamic recommendations</p>
						</div>
					</div>
					{!aiLoading && !aiRan && (
						<Button onClick={runAIAnalysis} className="bg-[#E0342A] hover:bg-[#c02a22] text-white font-semibold px-5">
							<Play className="mr-2 h-4 w-4 fill-white" />
							Run AI Analysis
						</Button>
					)}
					{aiRan && !aiLoading && (
						<Button onClick={runAIAnalysis} variant="ghost" className="border border-white/10 text-xs">
							<RefreshCw className="mr-2 h-3.5 w-3.5" /> Re-analyse
						</Button>
					)}
				</div>

				<div className="p-6">
					{/* Idle state */}
					{!aiLoading && !aiRan && !aiError && (
						<div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
							<div className="h-16 w-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
								<Brain className="h-8 w-8 text-white/20" />
							</div>
							<div>
								<h3 className="font-semibold text-white">Ready to analyse Pizzeria da Cafe</h3>
								<p className="text-white/40 text-sm mt-1 max-w-md">
									Click <strong>"Run AI Analysis"</strong> to send your FY {yearStart}-{yearStart + 1} sales &amp; expense data to Cloudflare's Llama 3.1 model for a personalised business growth report.
								</p>
							</div>
							<div className="flex items-center gap-2 text-xs text-white/30">
								<div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
								Cloudflare Workers AI · Connected
							</div>
						</div>
					)}

					{/* Loading state */}
					{aiLoading && (
						<div className="flex flex-col items-center justify-center py-16 text-center space-y-5">
							<div className="relative h-16 w-16">
								<div className="absolute inset-0 rounded-full border-2 border-[#E0342A]/20 animate-ping" />
								<div className="absolute inset-2 rounded-full border-2 border-[#E0342A]/40 animate-ping animation-delay-150" />
								<Brain className="absolute inset-3 h-10 w-10 text-[#E0342A] animate-pulse" />
							</div>
							<div className="space-y-1">
								<h3 className="font-semibold text-white">Cloudflare AI is analysing your data...</h3>
								<p className="text-white/40 text-sm animate-pulse">
									Llama 3.1 is processing ₹{Math.round(salesTotal).toLocaleString('en-IN')} in sales records & {taxData?.purchases.length ?? 0} expense entries
								</p>
							</div>
						</div>
					)}

					{/* Error state */}
					{aiError && !aiLoading && (
						<div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
							<AlertCircle className="h-10 w-10 text-red-400" />
							<div>
								<h3 className="font-semibold text-white">AI Analysis Failed</h3>
								<p className="text-red-400/70 text-xs mt-1 max-w-sm">{aiError}</p>
							</div>
							<Button onClick={runAIAnalysis} variant="ghost" className="border border-white/10 text-xs">
								Try Again
							</Button>
						</div>
					)}

					{/* AI Results */}
					{aiRan && aiInsights && !aiLoading && (
						<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
							{/* Top Priority Banner */}
							<div className="flex items-start gap-4 p-5 rounded-xl bg-[#E0342A]/8 border border-[#E0342A]/20">
								<Target className="h-5 w-5 text-[#E0342A] flex-shrink-0 mt-0.5" />
								<div>
									<p className="text-[11px] font-bold text-[#E0342A] uppercase tracking-wider mb-1">AI Top Priority</p>
									<p className="text-white/90 text-sm leading-relaxed">{aiInsights.topPriority}</p>
								</div>
								<div className="ml-auto text-right flex-shrink-0">
									<p className="text-[10px] text-white/40">Total Potential Gain</p>
									<p className="text-lg font-bold text-emerald-400">{aiInsights.annualPotentialGain}</p>
								</div>
							</div>

							{/* Agent Tabs */}
							<div className="flex gap-1 border-b border-white/10 overflow-x-auto pb-px">
								{agentDefs.map((a) => (
									<button
										key={a.id}
										onClick={() => setActiveAgent(a.id)}
										className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
											activeAgent === a.id
												? 'border-[#E0342A] text-white'
												: 'border-transparent text-white/40 hover:text-white/60'
										}`}
									>
										<a.icon className={`h-3.5 w-3.5 ${activeAgent === a.id ? a.color : ''}`} />
										{a.label}
									</button>
								))}
							</div>

							{/* Active Agent Content */}
							<AnimatePresence mode="wait">
								{agentDefs.filter((a) => a.id === activeAgent).map((agent) => {
									const data = aiInsights[agent.id]
									return (
										<motion.div
											key={agent.id}
											initial={{ opacity: 0, x: 10 }}
											animate={{ opacity: 1, x: 0 }}
											exit={{ opacity: 0, x: -10 }}
											transition={{ duration: 0.15 }}
											className="grid grid-cols-1 md:grid-cols-3 gap-5"
										>
											{/* Summary + Actions */}
											<div className="md:col-span-2 space-y-4">
												<div className={`p-4 rounded-xl border ${agent.borderActive}`}>
													<p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${agent.color}`}>AI Assessment</p>
													<p className="text-white/80 text-sm leading-relaxed">{data.summary}</p>
												</div>
												<div className="space-y-2.5">
													<p className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Recommended Actions</p>
													{data.actions.map((action, idx) => (
														<div key={idx} className="flex items-start gap-3 p-3.5 rounded-xl bg-black/20 border border-white/5">
															<div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 bg-white/10 ${agent.color}`}>
																{idx + 1}
															</div>
															<p className="text-white/70 text-xs leading-relaxed">{action}</p>
														</div>
													))}
												</div>
											</div>

											{/* Projected Gain Card */}
											<div className="space-y-4">
												<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-center">
													<p className="text-[11px] text-emerald-400/70 font-semibold uppercase tracking-wider">Projected Annual Gain</p>
													<p className="text-2xl font-bold text-emerald-400 mt-2">{data.projectedGain}</p>
													<p className="text-[10px] text-white/30 mt-2">Based on your actual FY {yearStart} data</p>
												</div>
												<div className="rounded-xl border border-white/8 bg-white/3 p-4 text-center">
													<p className="text-[10px] text-white/40 uppercase tracking-wider">Business Health Score</p>
													<div className="relative mt-3 mb-2">
														<div className="overflow-hidden h-2 rounded-full bg-white/10">
															<div
																style={{ width: `${aiInsights.overallScore}%` }}
																className={`h-full rounded-full transition-all duration-700 ${
																	aiInsights.overallScore >= 70 ? 'bg-emerald-500' : aiInsights.overallScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
																}`}
															/>
														</div>
													</div>
													<p className={`text-2xl font-bold ${aiInsights.overallScore >= 70 ? 'text-emerald-400' : aiInsights.overallScore >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
														{aiInsights.overallScore}<span className="text-sm text-white/30">/100</span>
													</p>
												</div>
											</div>

											{/* Complete Local SEO & GMB Playbook */}
											{agent.id === 'marketing' && (aiInsights.marketing as any).seoChecklist && (
												<div className="md:col-span-3 mt-4 pt-6 border-t border-white/10 space-y-5">
													<div className="flex items-center justify-between">
														<div className="flex items-center gap-2">
															<MapPin className="h-5 w-5 text-rose-400" />
															<h3 className="font-bold text-white text-base">Complete Local SEO &amp; GMB Implementation Playbook</h3>
														</div>
														<Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-xs">
															Google Maps · Local 3-Pack · Organic Search
														</Badge>
													</div>

													<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
														{/* 1. Google My Business */}
														<div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
															<div className="flex items-center gap-2 border-b border-white/5 pb-2">
																<MapPin className="h-4 w-4 text-rose-400" />
																<h4 className="font-semibold text-xs text-white">1. Google My Business (GMB) Optimization</h4>
															</div>
															<ul className="space-y-2 text-xs text-white/70">
																{aiInsights.marketing.seoChecklist.googleMyBusiness?.map((item, i) => (
																	<li key={i} className="flex items-start gap-2">
																		<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
																		<span>{item}</span>
																	</li>
																))}
															</ul>
														</div>

														{/* 2. Local SEO & Schema */}
														<div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
															<div className="flex items-center gap-2 border-b border-white/5 pb-2">
																<Search className="h-4 w-4 text-blue-400" />
																<h4 className="font-semibold text-xs text-white">2. Local SEO &amp; Schema Markup</h4>
															</div>
															<ul className="space-y-2 text-xs text-white/70">
																{aiInsights.marketing.seoChecklist.localSEO?.map((item, i) => (
																	<li key={i} className="flex items-start gap-2">
																		<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
																		<span>{item}</span>
																	</li>
																))}
															</ul>
														</div>

														{/* 3. Social Media & Reels */}
														<div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
															<div className="flex items-center gap-2 border-b border-white/5 pb-2">
																<Share2 className="h-4 w-4 text-purple-400" />
																<h4 className="font-semibold text-xs text-white">3. Social Media &amp; Viral Reels Strategy</h4>
															</div>
															<ul className="space-y-2 text-xs text-white/70">
																{aiInsights.marketing.seoChecklist.socialMedia?.map((item, i) => (
																	<li key={i} className="flex items-start gap-2">
																		<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
																		<span>{item}</span>
																	</li>
																))}
															</ul>
														</div>

														{/* 4. Aggregator Strategy */}
														<div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
															<div className="flex items-center gap-2 border-b border-white/5 pb-2">
																<ShoppingBag className="h-4 w-4 text-amber-400" />
																<h4 className="font-semibold text-xs text-white">4. Swiggy &amp; Zomato App SEO</h4>
															</div>
															<ul className="space-y-2 text-xs text-white/70">
																{aiInsights.marketing.seoChecklist.aggregatorStrategy?.map((item, i) => (
																	<li key={i} className="flex items-start gap-2">
																		<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
																		<span>{item}</span>
																	</li>
																))}
															</ul>
														</div>

														{/* 5. Content & Video */}
														<div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3 lg:col-span-2">
															<div className="flex items-center gap-2 border-b border-white/5 pb-2">
																<Video className="h-4 w-4 text-emerald-400" />
																<h4 className="font-semibold text-xs text-white">5. High-Intent Food Content &amp; Local Blog Strategy</h4>
															</div>
															<ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-white/70">
																{aiInsights.marketing.seoChecklist.contentMarketing?.map((item, i) => (
																	<li key={i} className="flex items-start gap-2">
																		<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
																		<span>{item}</span>
																	</li>
																))}
															</ul>
														</div>
													</div>

													{/* ── Google My Business & Local SEO Configuration Form ────── */}
													<div className="md:col-span-3 mt-6 pt-6 border-t border-white/10 space-y-6">
														<div className="flex items-center justify-between">
															<div className="flex items-center gap-2">
																<Settings className="h-5 w-5 text-rose-400" />
																<h3 className="font-bold text-white text-base">Google My Business &amp; Local SEO Configuration</h3>
															</div>
															<Badge className="bg-[#E0342A]/10 text-[#E0342A] border-[#E0342A]/20 text-xs">
																GMB Config · Schema Generator
															</Badge>
														</div>

														<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 text-xs">
															{/* Business Name */}
															<div className="space-y-1.5">
																<label className="font-semibold text-white/60 uppercase tracking-wider">Business Name</label>
																<input
																	type="text"
																	value={seoConfig.businessName}
																	onChange={(e) => setSeoConfig({ ...seoConfig, businessName: e.target.value })}
																	placeholder="e.g. Pizzeria da Cafe"
																	className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40"
																/>
															</div>

															{/* Primary Category */}
															<div className="space-y-1.5">
																<label className="font-semibold text-white/60 uppercase tracking-wider">Primary Category</label>
																<input
																	type="text"
																	value={seoConfig.primaryCategory}
																	onChange={(e) => setSeoConfig({ ...seoConfig, primaryCategory: e.target.value })}
																	placeholder="e.g. Pizza Restaurant & Cafe"
																	className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40"
																/>
															</div>

															{/* Target Location */}
															<div className="space-y-1.5">
																<label className="font-semibold text-white/60 uppercase tracking-wider">Target City / Area</label>
																<input
																	type="text"
																	value={seoConfig.targetLocation}
																	onChange={(e) => setSeoConfig({ ...seoConfig, targetLocation: e.target.value })}
																	placeholder="e.g. Bandra West, Mumbai"
																	className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40"
																/>
															</div>

															{/* GMB Listing URL */}
															<div className="space-y-1.5">
																<label className="font-semibold text-white/60 uppercase tracking-wider">Google My Business URL</label>
																<input
																	type="url"
																	value={seoConfig.gmbUrl}
																	onChange={(e) => setSeoConfig({ ...seoConfig, gmbUrl: e.target.value })}
																	placeholder="https://g.page/r/your-gmb-link"
																	className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40"
																/>
															</div>

															{/* GMB Place ID */}
															<div className="space-y-1.5">
																<label className="font-semibold text-white/60 uppercase tracking-wider">GMB Place ID (Optional)</label>
																<input
																	type="text"
																	value={seoConfig.gmbPlaceId}
																	onChange={(e) => setSeoConfig({ ...seoConfig, gmbPlaceId: e.target.value })}
																	placeholder="e.g. ChIJN1t_t_Z45zsR..."
																	className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40"
																/>
															</div>

															{/* Phone Number */}
															<div className="space-y-1.5">
																<label className="font-semibold text-white/60 uppercase tracking-wider">Contact Phone</label>
																<input
																	type="text"
																	value={seoConfig.phone}
																	onChange={(e) => setSeoConfig({ ...seoConfig, phone: e.target.value })}
																	placeholder="+91 98765 43210"
																	className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40"
																/>
															</div>

															{/* Website URL */}
															<div className="space-y-1.5">
																<label className="font-semibold text-white/60 uppercase tracking-wider">Website / Direct Order URL</label>
																<input
																	type="url"
																	value={seoConfig.websiteUrl}
																	onChange={(e) => setSeoConfig({ ...seoConfig, websiteUrl: e.target.value })}
																	placeholder="https://pizzeriada.cafe"
																	className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40"
																/>
															</div>

															{/* Instagram Handle */}
															<div className="space-y-1.5">
																<label className="font-semibold text-white/60 uppercase tracking-wider">Instagram Handle</label>
																<input
																	type="text"
																	value={seoConfig.instagramHandle}
																	onChange={(e) => setSeoConfig({ ...seoConfig, instagramHandle: e.target.value })}
																	placeholder="@pizzeriadacafe"
																	className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40"
																/>
															</div>

															{/* Target Keywords */}
															<div className="space-y-1.5 sm:col-span-2 md:col-span-1">
																<label className="font-semibold text-white/60 uppercase tracking-wider">Target Local Keywords</label>
																<input
																	type="text"
																	value={seoConfig.targetKeywords}
																	onChange={(e) => setSeoConfig({ ...seoConfig, targetKeywords: e.target.value })}
																	placeholder="Best Pizza near me, wood-fired pizza cafe"
																	className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40"
																/>
															</div>
														</div>

														{/* Action Button & Status */}
														<div className="flex items-center justify-between pt-2 border-t border-white/5">
															{seoSavedMsg ? (
																<div className="flex items-center gap-2 text-xs text-emerald-400">
																	<CheckCircle2 className="h-4 w-4" />
																	<span>{seoSavedMsg}</span>
																</div>
															) : (
																<div className="text-[11px] text-white/30">
																	Configuration is saved to your store profile and used for local schema &amp; AI suggestions
																</div>
															)}
															<Button
																disabled={!tenantId || savingSeo}
																onClick={async () => {
																	if (!tenantId) return
																	setSavingSeo(true)
																	setSeoSavedMsg(null)
																	try {
																		await saveSEOSettings(tenantId, seoConfig)
																		setSeoSavedMsg('SEO Configuration saved successfully!')
																		setTimeout(() => setSeoSavedMsg(null), 4000)
																	} catch (err: any) {
																		setSeoSavedMsg(err?.message ?? 'Failed to save SEO config')
																	} finally {
																		setSavingSeo(false)
																	}
																}}
																className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-5 text-xs"
															>
																{savingSeo ? (
																	<><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Saving...</>
																) : (
																	<><Globe className="mr-2 h-3.5 w-3.5" /> Save SEO Settings</>
																)}
															</Button>
														</div>

														{/* ── JSON-LD LocalBusiness Schema Generator ───────────── */}
														<div className="rounded-xl border border-white/10 bg-black/40 p-5 space-y-3">
															<div className="flex items-center justify-between border-b border-white/5 pb-3">
																<div className="flex items-center gap-2">
																	<Globe className="h-4 w-4 text-emerald-400" />
																	<h4 className="font-bold text-xs text-white">Generated JSON-LD Restaurant Schema</h4>
																</div>
																<Button
																	variant="ghost"
																	size="sm"
																	onClick={() => {
																		const jsonLd = JSON.stringify({
																			"@context": "https://schema.org",
																			"@type": "Restaurant",
																			"name": seoConfig.businessName || "Pizzeria da Cafe",
																			"description": "Authentic artisan pizza & cafe serving wood-fired pizzas.",
																			"servesCuisine": "Pizza, Italian, Fast Food",
																			"telephone": seoConfig.phone || "+91-9876543210",
																			"url": seoConfig.websiteUrl || "https://pizzeriada.cafe",
																			"address": {
																				"@type": "PostalAddress",
																				"addressLocality": seoConfig.targetLocation || "Mumbai",
																				"addressCountry": "IN"
																			},
																			"sameAs": [
																				seoConfig.gmbUrl,
																				`https://instagram.com/${seoConfig.instagramHandle.replace('@', '')}`
																			].filter(Boolean)
																		}, null, 2)
																		navigator.clipboard.writeText(`<script type="application/ld+json">\n${jsonLd}\n</script>`)
																		setCopiedSchema(true)
																		setTimeout(() => setCopiedSchema(false), 3000)
																	}}
																	className="border border-white/10 text-xs text-emerald-400 hover:bg-emerald-500/10"
																>
																	{copiedSchema ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy JSON-LD Code</>}
																</Button>
															</div>
															<p className="text-[11px] text-white/40">
																Copy and paste this script tag into the <code>&lt;head&gt;</code> of your website to help Google index your location, phone, and cuisine automatically.
															</p>
															<pre className="p-3.5 rounded-lg bg-black/60 border border-white/5 text-[11px] font-mono text-emerald-400/90 overflow-x-auto">
{`<script type="application/ld+json">
${JSON.stringify({
	"@context": "https://schema.org",
	"@type": "Restaurant",
	"name": seoConfig.businessName || "Pizzeria da Cafe",
	"description": "Authentic artisan pizza & cafe serving wood-fired pizzas.",
	"servesCuisine": "Pizza, Italian, Fast Food",
	"telephone": seoConfig.phone || "+91-9876543210",
	"url": seoConfig.websiteUrl || "https://pizzeriada.cafe",
	"address": {
		"@type": "PostalAddress",
		"addressLocality": seoConfig.targetLocation || "Mumbai",
		"addressCountry": "IN"
	},
	"sameAs": [
		seoConfig.gmbUrl,
		`https://instagram.com/${seoConfig.instagramHandle.replace('@', '')}`
	].filter(Boolean)
}, null, 2)}
</script>`}
															</pre>
														</div>
													</div>
												</div>
											)}
										</motion.div>
									)
								})}
							</AnimatePresence>
						</motion.div>
					)}
				</div>
			</div>

			{/* ── What-If Simulator ─────────────────────────────────── */}
			<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-6">
				<div className="flex items-center justify-between border-b border-white/5 pb-4">
					<div className="space-y-0.5">
						<h3 className="text-base font-bold text-white flex items-center gap-2">
							<Settings className="h-5 w-5 text-[#E0342A]" /> What-If Scenario Simulator
						</h3>
						<p className="text-white/40 text-xs">Toggle improvements to see the 12-month profit impact in real-time below</p>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
					<div className="space-y-6">
						<div>
							<div className="flex justify-between text-xs font-semibold mb-2">
								<span className="text-white/60">MONTHLY MARKETING BUDGET</span>
								<span className="text-white">{fmt(marketingSpend)} / mo</span>
							</div>
							<input type="range" min="0" max="50000" step="2500" value={marketingSpend}
								onChange={(e) => setMarketingSpend(parseInt(e.target.value))}
								className="w-full accent-[#E0342A] h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
							/>
							<div className="flex justify-between text-[10px] text-white/30 mt-1">
								<span>₹0</span><span>₹25K</span><span>₹50K</span>
							</div>
						</div>
						<label className="flex items-center justify-between cursor-pointer border-t border-white/5 pt-5">
							<div>
								<p className="font-semibold text-white text-sm">Menu Pricing Optimization</p>
								<p className="text-[11px] text-white/40 mt-0.5">+8% on low-margin specialty items → ~3% overall revenue lift</p>
							</div>
							<div className={`relative w-10 h-5 rounded-full transition-colors ${priceOptimization ? 'bg-[#E0342A]' : 'bg-white/15'}`}
								onClick={() => setPriceOptimization(!priceOptimization)}>
								<div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${priceOptimization ? 'translate-x-5' : 'translate-x-0.5'}`} />
							</div>
						</label>
					</div>
					<div className="space-y-5">
						<label className="flex items-center justify-between cursor-pointer">
							<div>
								<p className="font-semibold text-white text-sm">Bypass Aggregator Commissions</p>
								<p className="text-[11px] text-white/40 mt-0.5">Shift 20% orders to direct web menu → save ~4.4% of revenue</p>
							</div>
							<div className={`relative w-10 h-5 rounded-full transition-colors ${aggregatorShift ? 'bg-[#E0342A]' : 'bg-white/15'}`}
								onClick={() => setAggregatorShift(!aggregatorShift)}>
								<div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${aggregatorShift ? 'translate-x-5' : 'translate-x-0.5'}`} />
							</div>
						</label>
						<label className="flex items-center justify-between cursor-pointer border-t border-white/5 pt-5">
							<div>
								<p className="font-semibold text-white text-sm">Recipe Portion Standardisation</p>
								<p className="text-[11px] text-white/40 mt-0.5">Cut kitchen shrinkage 6.2% → 3.0% via POS recipe weights</p>
							</div>
							<div className={`relative w-10 h-5 rounded-full transition-colors ${wasteReduction ? 'bg-[#E0342A]' : 'bg-white/15'}`}
								onClick={() => setWasteReduction(!wasteReduction)}>
								<div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${wasteReduction ? 'translate-x-5' : 'translate-x-0.5'}`} />
							</div>
						</label>
					</div>
				</div>
			</div>

			{/* ── 12-Month Forecast Table ───────────────────────────── */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
					<div className="px-6 py-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
						<div>
							<h3 className="font-semibold text-white">12-Month Profit Forecast</h3>
							<p className="text-white/40 text-xs mt-0.5">Seasonal model · Aug 2026 – Jul 2027</p>
						</div>
						<Badge className="border border-white/10 text-white/50 bg-white/5 text-[10px]">What-If Scenario</Badge>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full text-sm text-left border-collapse">
							<thead>
								<tr className="border-b border-white/10 text-white/30 text-[10px] uppercase">
									<th className="px-4 py-3 font-semibold">Month</th>
									<th className="px-4 py-3 text-right font-semibold">Baseline</th>
									<th className="px-4 py-3 text-right font-semibold">Optimised</th>
									<th className="px-4 py-3 text-right font-semibold">Uplift</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-white/5 font-mono">
								{futureMonths.map((m) => (
									<tr key={m.month} className="hover:bg-white/2 transition-colors">
										<td className="px-4 py-3 font-sans font-medium text-white">{m.month}</td>
										<td className="px-4 py-3 text-right text-white/50">{fmt(m.baseNet)}</td>
										<td className="px-4 py-3 text-right text-emerald-400">{fmt(m.optNet)}</td>
										<td className={`px-4 py-3 text-right font-semibold ${m.increment > 0 ? 'text-emerald-400' : 'text-white/20'}`}>
											{m.increment > 0 ? `+${fmt(m.increment)}` : '—'}
										</td>
									</tr>
								))}
								<tr className="border-t-2 border-white/15 bg-white/5 font-bold">
									<td className="px-4 py-4 font-sans text-white">Annual Total</td>
									<td className="px-4 py-4 text-right text-white/60">{fmt(totalBaseNet)}</td>
									<td className="px-4 py-4 text-right text-emerald-400">{fmt(totalOptNet)}</td>
									<td className="px-4 py-4 text-right text-emerald-400">+{fmt(totalIncrement)}</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>

				{/* Summary sidebar */}
				<div className="space-y-5">
					<div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#E0342A]/8 to-transparent p-6 space-y-4">
						<div className="flex items-center gap-2">
							<TrendingUp className="h-5 w-5 text-[#E0342A]" />
							<h3 className="font-bold text-white">Scenario Uplift</h3>
						</div>
						<div className="grid grid-cols-1 gap-3">
							<div className="bg-black/30 border border-white/5 rounded-xl p-4">
								<p className="text-[10px] text-white/40 uppercase">Baseline Annual Profit</p>
								<p className="text-lg font-bold text-white mt-1">{fmt(totalBaseNet)}</p>
							</div>
							<div className="bg-black/30 border border-emerald-500/20 rounded-xl p-4">
								<p className="text-[10px] text-emerald-400/70 uppercase">Optimised Annual Profit</p>
								<p className="text-lg font-bold text-emerald-400 mt-1">{fmt(totalOptNet)}</p>
							</div>
							<div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
								<p className="text-[11px] text-emerald-400 font-bold uppercase">Scenario Annual Gain</p>
								<p className="text-2xl font-bold text-emerald-400 mt-1">+{fmt(totalIncrement)}</p>
							</div>
						</div>
					</div>

					{/* AI agent quick tabs */}
					<div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
						<p className="text-[11px] font-bold text-white/40 uppercase tracking-wider">AI Agent Breakdown</p>
						{agentDefs.map((a) => (
							<button key={a.id} onClick={() => { if (aiRan) setActiveAgent(a.id); else runAIAnalysis() }}
								className="w-full flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5 hover:bg-white/5 transition-colors group"
							>
								<div className="flex items-center gap-2.5">
									<a.icon className={`h-4 w-4 ${a.color}`} />
									<span className="text-white/70 text-xs font-medium">{a.label}</span>
								</div>
								{aiRan && aiInsights ? (
									<span className="text-emerald-400 text-[11px] font-semibold">{aiInsights[a.id].projectedGain}</span>
								) : (
									<ChevronRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
								)}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* ── Rent Expense Seeder ──────────────────────────────── */}
			<div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
				<div className="px-6 py-5 bg-white/5 border-b border-white/10 flex items-center gap-3">
					<div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
						<Home className="h-5 w-5 text-amber-400" />
					</div>
					<div>
						<h2 className="font-bold text-white">Seed Monthly Rent Expenses</h2>
						<p className="text-[11px] text-white/40 mt-0.5">
							Inserts a rent record for every month in FY {yearStart}–{yearStart + 1} into the expense ledger. Supports a mid-year rent hike.
						</p>
					</div>
				</div>

				<div className="p-6 space-y-6">
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
						{/* Base rent */}
						<div className="space-y-1.5">
							<label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Base Monthly Rent (₹)</label>
							<input
								type="number"
								value={rentBase}
								onChange={(e) => setRentBase(e.target.value)}
								placeholder="e.g. 65000"
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/40"
							/>
							<p className="text-[10px] text-white/30">Used for all months unless a hike is set</p>
						</div>

						{/* Hike from month */}
						<div className="space-y-1.5">
							<label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Rent Hike From Month</label>
							<select
								value={rentHikeFrom}
								onChange={(e) => setRentHikeFrom(e.target.value)}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/40"
							>
								<option value="" className="bg-black">No hike (flat rent)</option>
								{(() => {
									const opts = []
									const fyMonths = [
										`${yearStart}-04`, `${yearStart}-05`, `${yearStart}-06`,
										`${yearStart}-07`, `${yearStart}-08`, `${yearStart}-09`,
										`${yearStart}-10`, `${yearStart}-11`, `${yearStart}-12`,
										`${yearStart + 1}-01`, `${yearStart + 1}-02`, `${yearStart + 1}-03`
									]
									for (const m of fyMonths) {
										const label = new Date(m + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' })
										opts.push(<option key={m} value={m} className="bg-black">{label}</option>)
									}
									return opts
								})()}
							</select>
							<p className="text-[10px] text-white/30">All months from here onwards use the hiked amount</p>
						</div>

						{/* Hiked rent amount */}
						<div className="space-y-1.5">
							<label className="text-xs font-semibold text-white/50 uppercase tracking-wider">
								Hiked Rent Amount (₹) {!rentHikeFrom && <span className="text-white/20 normal-case font-normal">(optional)</span>}
							</label>
							<input
								type="number"
								value={rentHikeAmount}
								onChange={(e) => setRentHikeAmount(e.target.value)}
								placeholder={rentHikeFrom ? 'e.g. 68000' : 'Leave blank for flat rent'}
								disabled={!rentHikeFrom}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/40 disabled:opacity-30"
							/>
							<p className="text-[10px] text-white/30">New rent amount applied from the selected month</p>
						</div>
					</div>

					{/* Preview row */}
					{(() => {
						const base = parseInt(rentBase) || 0
						const hiked = rentHikeFrom && rentHikeAmount ? parseInt(rentHikeAmount) : base
						const fyMonths = [
							`${yearStart}-04`, `${yearStart}-05`, `${yearStart}-06`,
							`${yearStart}-07`, `${yearStart}-08`, `${yearStart}-09`,
							`${yearStart}-10`, `${yearStart}-11`, `${yearStart}-12`,
							`${yearStart + 1}-01`, `${yearStart + 1}-02`, `${yearStart + 1}-03`
						]
						const months = fyMonths.map((m) => ({
							month: m,
							amount: rentHikeFrom && m >= rentHikeFrom ? hiked : base,
							label: new Date(m + '-01').toLocaleString('en-IN', { month: 'short' })
						}))
						const total = months.reduce((s, m) => s + m.amount, 0)
						return (
							<div className="space-y-2">
								<p className="text-[11px] font-bold text-white/40 uppercase tracking-wider">Preview — 12 Months</p>
								<div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
									{months.map((m) => (
										<div key={m.month}
											className={`rounded-lg border p-2 text-center ${
												rentHikeFrom && m.month >= rentHikeFrom
													? 'border-amber-500/30 bg-amber-500/5'
													: 'border-white/5 bg-black/20'
											}`}
										>
											<p className="text-[9px] text-white/40">{m.label}</p>
											<p className={`text-[11px] font-bold mt-0.5 ${
												rentHikeFrom && m.month >= rentHikeFrom ? 'text-amber-400' : 'text-white/70'
											}`}>
												{(m.amount / 1000).toFixed(0)}K
											</p>
										</div>
									))}
								</div>
								<p className="text-xs text-white/40">Annual rent total: <span className="text-white font-semibold">₹{total.toLocaleString('en-IN')}</span></p>
							</div>
						)
					})()}

					{/* Result / error */}
					{rentSeedResult && (
						<div className="flex items-center gap-2 text-sm text-emerald-400">
							<CheckCircle2 className="h-4 w-4" />
							<span>{rentSeedResult.inserted} months inserted{rentSeedResult.skipped > 0 ? `, ${rentSeedResult.skipped} already existed (skipped)` : ''}</span>
						</div>
					)}
					{rentSeedError && (
						<div className="flex items-center gap-2 text-sm text-red-400">
							<AlertCircle className="h-4 w-4" />
							<span>{rentSeedError}</span>
						</div>
					)}

					<div className="flex justify-end">
						<Button
							disabled={!tenantId || rentSeeding || !rentBase}
							onClick={async () => {
								if (!tenantId) return
								setRentSeeding(true)
								setRentSeedResult(null)
								setRentSeedError(null)
								try {
									const base = parseInt(rentBase) || 0
									const hiked = rentHikeFrom && rentHikeAmount ? parseInt(rentHikeAmount) : base
									const fyMonths = [
										`${yearStart}-04`, `${yearStart}-05`, `${yearStart}-06`,
										`${yearStart}-07`, `${yearStart}-08`, `${yearStart}-09`,
										`${yearStart}-10`, `${yearStart}-11`, `${yearStart}-12`,
										`${yearStart + 1}-01`, `${yearStart + 1}-02`, `${yearStart + 1}-03`
									]
									const months: RentSeedMonth[] = fyMonths.map((m) => ({
										date: m + '-01',
										amount: rentHikeFrom && m >= rentHikeFrom ? hiked : base
									}))
									const result = await seedRentExpenses(tenantId, months)
									setRentSeedResult({ inserted: result.inserted, skipped: result.skipped })
									if (result.errors.length > 0) setRentSeedError(result.errors[0] ?? null)
								} catch (err: any) {
									setRentSeedError(err?.message ?? 'Failed to seed rent expenses')
								} finally {
									setRentSeeding(false)
								}
							}}
							className="bg-amber-500 hover:bg-amber-600 text-black font-semibold px-6"
						>
							{rentSeeding ? (
								<><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Inserting...</>
							) : (
								<><Home className="mr-2 h-4 w-4" /> Seed 12 Rent Records</>
							)}
						</Button>
					</div>
				</div>
			</div>

		</div>
	)
}
