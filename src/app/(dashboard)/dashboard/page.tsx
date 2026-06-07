import { redirect } from 'next/navigation'
import { createSupabaseServerComponentClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { MenuAssistant } from '@/components/dashboard/menu-assistant'
import { Button } from '@/components/ui/button'
import {
	Activity,
	ArrowUpRight,
	Brain,
	Clock,
	Flame,
	IndianRupee,
	Leaf,
	Package,
	Receipt,
	ShoppingBag,
	Sparkles,
	TrendingUp,
	Users,
	AlertTriangle
} from 'lucide-react'

type TenantRecord = {
	id: string
	name: string
	settings: Record<string, unknown> | null
}

export default async function DashboardPage() {
	const supabase = await createSupabaseServerComponentClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		redirect('/login')
	}

	const { data, error } = await supabase
		.from('profile_tenants')
		.select(
			`
        tenant_id,
        tenant:tenant_id (
          id,
          name,
          slug,
          settings
        )
      `
		)
		.eq('profile_id', user.id)
		.single()

	const tenantData = Array.isArray(data?.tenant) ? data.tenant[0] : data?.tenant
	const tenant = tenantData as unknown as (TenantRecord & { slug?: string | null }) | null

	if (error || !tenant) {
		redirect('/tenant')
	}

	const settings = tenant.settings || {}
	const currencySymbol = (settings.currencySymbol as string) || '₹'
	const timezone = (settings.timezone as string) || 'Asia/Kolkata'

	// ── Fetch today's data ─────────────────────────────────────────────────────

	const now = new Date()
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString()
	const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString()

	// Yesterday for comparison
	const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0).toISOString()
	const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).toISOString()

	// Today's orders
	const { data: todayOrders } = await supabase
		.from('orders')
		.select('id, total, subtotal, tax, discount_amount, status, created_at, completed_at, customer_name, order_type, order_items(name, quantity, total_price)')
		.eq('tenant_id', tenant.id)
		.gte('created_at', todayStart)
		.lte('created_at', todayEnd)
		.order('created_at', { ascending: false })

	// Yesterday's completed orders for comparison
	const { data: yesterdayOrders } = await supabase
		.from('orders')
		.select('id, total')
		.eq('tenant_id', tenant.id)
		.eq('status', 'completed')
		.gte('completed_at', yesterdayStart)
		.lte('completed_at', yesterdayEnd)

	// Pending orders (not completed/cancelled)
	const { data: pendingOrders } = await supabase
		.from('orders')
		.select('id, status, created_at, customer_name, total, order_type, table_number')
		.eq('tenant_id', tenant.id)
		.in('status', ['pending', 'confirmed', 'preparing', 'ready'])
		.order('created_at', { ascending: false })
		.limit(10)

	// Low stock items
	const { data: lowStockItems } = await supabase
		.from('inventory')
		.select('id, current_stock, unit, min_stock_level, ingredient:ingredient_id(name)')
		.eq('tenant_id', tenant.id)
		.limit(50)

	// Customer count
	const { count: customerCount } = await supabase
		.from('customers')
		.select('id', { count: 'exact', head: true })
		.eq('tenant_id', tenant.id)

	// ── Compute stats ──────────────────────────────────────────────────────────

	const allOrders = todayOrders || []
	const completedToday = allOrders.filter((o) => o.status === 'completed')
	const todayRevenue = completedToday.reduce((sum, o) => sum + (o.total || 0), 0)
	const todayOrderCount = allOrders.length
	const yesterdayRevenue = (yesterdayOrders || []).reduce((sum, o) => sum + (o.total || 0), 0)
	const revenueChange = yesterdayRevenue > 0
		? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
		: todayRevenue > 0 ? 100 : 0

	const pendingCount = (pendingOrders || []).length
	const avgOrderValue = completedToday.length > 0 ? todayRevenue / completedToday.length : 0

	// Top selling items today
	const itemMap = new Map<string, { name: string; qty: number; revenue: number }>()
	allOrders.forEach((order) => {
		const items = (order.order_items as Array<{ name: string; quantity: number; total_price: number }>) || []
		items.forEach((item) => {
			const existing = itemMap.get(item.name) || { name: item.name, qty: 0, revenue: 0 }
			existing.qty += item.quantity
			existing.revenue += item.total_price || 0
			itemMap.set(item.name, existing)
		})
	})
	const topItems = Array.from(itemMap.values())
		.sort((a, b) => b.qty - a.qty)
		.slice(0, 5)

	// Low stock alerts
	const lowStock = (lowStockItems || [])
		.filter((item) => {
			const stock = item.current_stock || 0
			const min = item.min_stock_level || 0
			return stock <= min
		})
		.map((item) => {
			const ing = item.ingredient as unknown
			const name = Array.isArray(ing) ? (ing as any)[0]?.name : (ing as any)?.name
			return {
				name: name || 'Unknown',
				stock: item.current_stock || 0,
				unit: item.unit || 'units',
				min: item.min_stock_level || 0
			}
		})
		.slice(0, 5)

	// Recent completed orders
	const recentOrders = allOrders.slice(0, 6)

	const fmtCurrency = (n: number) => `${currencySymbol}${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
	const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: timezone })

	return (
		<div className="flex flex-col gap-8 py-6">
			{/* Hero Header */}
			<section className="relative overflow-hidden rounded-[40px] border border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 text-white shadow-[0_50px_140px_rgba(3,5,18,0.75)]">
				<div className="pointer-events-none absolute inset-0">
					<div className="glow -top-32 left-1/2 h-96 w-96 -translate-x-1/2 bg-[#7C74FF]/30" />
					<div className="glow bottom-0 right-1/4 h-80 w-80 bg-[#4DD4FF]/20" />
				</div>
				<div className="relative z-10 space-y-4">
					<Badge className="border-white/20 bg-white/10 text-white/80">
						<Activity className="mr-2 h-3.5 w-3.5" /> Live Dashboard
					</Badge>
					<h1 className="text-4xl font-semibold md:text-5xl">
						Welcome back, {tenant.name}
					</h1>
					<p className="text-white/70 md:max-w-xl">
						Here&apos;s how your business is performing today.
					</p>
				</div>
			</section>

			{/* Key Metrics */}
			<div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
				<StatCard
					label="Today's Revenue"
					value={fmtCurrency(todayRevenue)}
					trend={revenueChange !== 0 ? `${revenueChange > 0 ? '+' : ''}${revenueChange}% vs yesterday` : undefined}
					trendUp={revenueChange > 0}
					icon={<IndianRupee className="h-5 w-5" />}
					color="from-emerald-500/20 to-green-500/20"
				/>
				<StatCard
					label="Orders Today"
					value={todayOrderCount.toString()}
					trend={`${completedToday.length} completed`}
					icon={<Receipt className="h-5 w-5" />}
					color="from-blue-500/20 to-cyan-500/20"
				/>
				<StatCard
					label="Pending Orders"
					value={pendingCount.toString()}
					trend={pendingCount > 0 ? 'Needs attention' : 'All clear'}
					trendUp={pendingCount === 0}
					icon={<Clock className="h-5 w-5" />}
					color="from-amber-500/20 to-orange-500/20"
				/>
				<StatCard
					label="Avg Order Value"
					value={fmtCurrency(avgOrderValue)}
					trend={`${customerCount || 0} total customers`}
					icon={<Users className="h-5 w-5" />}
					color="from-purple-500/20 to-pink-500/20"
				/>
			</div>

			{/* Middle Row: Pending Orders + Top Items */}
			<div className="grid gap-6 md:grid-cols-2">
				{/* Pending Orders */}
				<section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
					<div className="flex items-center justify-between mb-5">
						<div>
							<p className="text-xs uppercase tracking-[0.3em] text-white/50">Live</p>
							<h2 className="text-xl font-semibold text-white">Active Orders</h2>
						</div>
						<Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">
							{pendingCount} active
						</Badge>
					</div>
					{(pendingOrders || []).length === 0 ? (
						<p className="text-sm text-white/50 py-8 text-center">No active orders right now</p>
					) : (
						<div className="space-y-3">
							{(pendingOrders || []).slice(0, 5).map((order) => (
								<div key={order.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
									<div>
										<p className="text-sm font-medium text-white">
											{order.customer_name || order.order_type || 'Walk-in'}
											{order.table_number && <span className="ml-2 text-white/50">T{order.table_number}</span>}
										</p>
										<p className="text-xs text-white/50">{fmtTime(order.created_at)}</p>
									</div>
									<div className="text-right">
										<p className="text-sm font-semibold text-white">{fmtCurrency(order.total || 0)}</p>
										<StatusBadge status={order.status} />
									</div>
								</div>
							))}
						</div>
					)}
				</section>

				{/* Top Selling Items Today */}
				<section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
					<div className="flex items-center justify-between mb-5">
						<div>
							<p className="text-xs uppercase tracking-[0.3em] text-white/50">Today</p>
							<h2 className="text-xl font-semibold text-white">Top Selling Items</h2>
						</div>
						<ShoppingBag className="h-5 w-5 text-white/40" />
					</div>
					{topItems.length === 0 ? (
						<p className="text-sm text-white/50 py-8 text-center">No orders yet today</p>
					) : (
						<div className="space-y-3">
							{topItems.map((item, idx) => (
								<div key={item.name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
									<div className="flex items-center gap-3">
										<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-white/70">
											{idx + 1}
										</span>
										<p className="text-sm font-medium text-white">{item.name}</p>
									</div>
									<div className="text-right">
										<p className="text-sm font-semibold text-white">{item.qty} sold</p>
										<p className="text-xs text-white/50">{fmtCurrency(item.revenue)}</p>
									</div>
								</div>
							))}
						</div>
					)}
				</section>
			</div>

			{/* Bottom Row: Recent Orders + Low Stock */}
			<div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
				{/* Recent Orders */}
				<section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
					<div className="flex items-center justify-between mb-5">
						<div>
							<p className="text-xs uppercase tracking-[0.3em] text-white/50">Timeline</p>
							<h2 className="text-xl font-semibold text-white">Recent Orders</h2>
						</div>
						<a href="/orders" className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors">
							View all <ArrowUpRight className="h-3.5 w-3.5" />
						</a>
					</div>
					{recentOrders.length === 0 ? (
						<p className="text-sm text-white/50 py-8 text-center">No orders today</p>
					) : (
						<div className="space-y-2">
							{recentOrders.map((order) => (
								<div key={order.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5">
									<div className="flex items-center gap-3">
										<StatusDot status={order.status} />
										<div>
											<p className="text-sm text-white">
												{order.customer_name || order.order_type || 'Order'}
											</p>
											<p className="text-xs text-white/40">{fmtTime(order.created_at)}</p>
										</div>
									</div>
									<p className="text-sm font-medium text-white">{fmtCurrency(order.total || 0)}</p>
								</div>
							))}
						</div>
					)}
				</section>

				{/* Low Stock Alerts */}
				<section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
					<div className="flex items-center justify-between mb-5">
						<div>
							<p className="text-xs uppercase tracking-[0.3em] text-white/50">Alerts</p>
							<h2 className="text-xl font-semibold text-white">Low Stock</h2>
						</div>
						<a href="/inventory" className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors">
							Inventory <ArrowUpRight className="h-3.5 w-3.5" />
						</a>
					</div>
					{lowStock.length === 0 ? (
						<div className="flex flex-col items-center py-8 text-center">
							<Package className="h-8 w-8 text-emerald-400/60 mb-2" />
							<p className="text-sm text-white/50">All stock levels healthy</p>
						</div>
					) : (
						<div className="space-y-3">
							{lowStock.map((item) => (
								<div key={item.name} className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3">
									<div className="flex items-center gap-3">
										<AlertTriangle className="h-4 w-4 text-amber-400" />
										<p className="text-sm font-medium text-white">{item.name}</p>
									</div>
									<div className="text-right">
										<p className="text-sm font-semibold text-red-300">
											{item.stock} {item.unit}
										</p>
										<p className="text-xs text-white/40">min: {item.min}</p>
									</div>
								</div>
							))}
						</div>
					)}
				</section>
			</div>

			{/* AI Insights — data-driven recommendations */}
			<section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
				<div className="flex items-center gap-3 mb-5">
					<div className="rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 p-2.5">
						<Brain className="h-5 w-5 text-purple-300" />
					</div>
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-white/50">AI Powered</p>
						<h2 className="text-xl font-semibold text-white">Smart Insights</h2>
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-3">
					<AIInsightCard insights={generateInsights({ todayRevenue, yesterdayRevenue, revenueChange, todayOrderCount, completedCount: completedToday.length, pendingCount, avgOrderValue, topItems, lowStock, currencySymbol })} />
				</div>
			</section>

			{/* AI Menu Co-pilot */}
			<MenuAssistant />
		</div>
	)
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
	label,
	value,
	trend,
	trendUp,
	icon,
	color
}: {
	label: string
	value: string
	trend?: string
	trendUp?: boolean
	icon: React.ReactNode
	color: string
}) {
	return (
		<div className={`rounded-[24px] border border-white/10 bg-gradient-to-br ${color} p-5 backdrop-blur-xl`}>
			<div className="flex items-center justify-between mb-3">
				<div className="rounded-xl bg-white/10 p-2.5 text-white/70">{icon}</div>
				{trend && (
					<span className={`text-xs ${trendUp === true ? 'text-emerald-400' : trendUp === false ? 'text-red-400' : 'text-white/50'}`}>
						{trend}
					</span>
				)}
			</div>
			<p className="text-2xl font-semibold text-white">{value}</p>
			<p className="text-xs text-white/50 mt-1">{label}</p>
		</div>
	)
}

function StatusBadge({ status }: { status: string }) {
	const styles: Record<string, string> = {
		pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
		confirmed: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
		preparing: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
		ready: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
		completed: 'bg-green-500/20 text-green-300 border-green-500/30',
		cancelled: 'bg-red-500/20 text-red-300 border-red-500/30'
	}
	return (
		<span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[status] || styles.pending}`}>
			{status}
		</span>
	)
}

function StatusDot({ status }: { status: string }) {
	const colors: Record<string, string> = {
		pending: 'bg-yellow-400',
		confirmed: 'bg-blue-400',
		preparing: 'bg-purple-400',
		ready: 'bg-emerald-400',
		completed: 'bg-green-400',
		cancelled: 'bg-red-400'
	}
	return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] || colors.pending}`} />
}

// ─── AI Insights (data-driven) ──────────────────────────────────────────────────

type InsightData = {
	todayRevenue: number
	yesterdayRevenue: number
	revenueChange: number
	todayOrderCount: number
	completedCount: number
	pendingCount: number
	avgOrderValue: number
	topItems: Array<{ name: string; qty: number; revenue: number }>
	lowStock: Array<{ name: string; stock: number; unit: string; min: number }>
	currencySymbol: string
}

type Insight = {
	title: string
	body: string
	type: 'growth' | 'alert' | 'tip'
}

function generateInsights(data: InsightData): Insight[] {
	const insights: Insight[] = []
	const fmtC = (n: number) => `${data.currencySymbol}${Math.round(n).toLocaleString('en-IN')}`

	// Revenue insight
	if (data.revenueChange > 15) {
		insights.push({
			title: 'Revenue surge detected',
			body: `Today's revenue is up ${data.revenueChange}% vs yesterday. Your top item "${data.topItems[0]?.name || 'menu item'}" is driving ${Math.round(((data.topItems[0]?.revenue || 0) / (data.todayRevenue || 1)) * 100)}% of sales.`,
			type: 'growth'
		})
	} else if (data.revenueChange < -15 && data.yesterdayRevenue > 0) {
		insights.push({
			title: 'Revenue dip today',
			body: `Sales are down ${Math.abs(data.revenueChange)}% compared to yesterday. Consider running a flash promotion or pushing high-margin items.`,
			type: 'alert'
		})
	} else if (data.todayRevenue > 0) {
		insights.push({
			title: 'Steady performance',
			body: `You've earned ${fmtC(data.todayRevenue)} across ${data.completedCount} orders today with an average of ${fmtC(data.avgOrderValue)} per order.`,
			type: 'growth'
		})
	} else {
		insights.push({
			title: 'Day just started',
			body: 'No completed orders yet. The dashboard will populate insights as orders come in throughout the day.',
			type: 'tip'
		})
	}

	// Stock insight
	if (data.lowStock.length > 0) {
		const critical = data.lowStock.filter((i) => i.stock <= 0)
		if (critical.length > 0) {
			insights.push({
				title: `${critical.length} item${critical.length > 1 ? 's' : ''} out of stock`,
				body: `${critical.map((i) => i.name).join(', ')} ${critical.length > 1 ? 'are' : 'is'} depleted. This may block orders for affected menu items. Restock urgently.`,
				type: 'alert'
			})
		} else {
			insights.push({
				title: `${data.lowStock.length} items running low`,
				body: `${data.lowStock.slice(0, 3).map((i) => i.name).join(', ')} are below minimum levels. Plan a restock to avoid disruptions.`,
				type: 'alert'
			})
		}
	} else {
		insights.push({
			title: 'Inventory looking healthy',
			body: 'All stock levels are above minimum thresholds. No urgent restocking needed today.',
			type: 'growth'
		})
	}

	// Operations insight
	if (data.pendingCount > 5) {
		insights.push({
			title: 'High queue detected',
			body: `You have ${data.pendingCount} orders in progress. Consider alerting kitchen staff to prioritize or batch similar items for faster throughput.`,
			type: 'alert'
		})
	} else if (data.topItems.length >= 2) {
		const topTwo = data.topItems.slice(0, 2)
		const ratio = topTwo[0]!.qty > 0 ? Math.round((topTwo[0]!.qty / (data.topItems.reduce((s, i) => s + i.qty, 0) || 1)) * 100) : 0
		insights.push({
			title: 'Menu concentration',
			body: `"${topTwo[0]!.name}" accounts for ${ratio}% of items sold today. Consider a combo deal pairing it with "${topTwo[1]!.name}" to increase average ticket.`,
			type: 'tip'
		})
	} else {
		insights.push({
			title: 'Optimize your service',
			body: 'As orders flow in, AI will identify patterns in timing, popular combos, and kitchen bottlenecks to help you optimize operations.',
			type: 'tip'
		})
	}

	return insights
}

function AIInsightCard({ insights }: { insights: Insight[] }) {
	const icons = {
		growth: <TrendingUp className="h-4 w-4 text-emerald-400" />,
		alert: <AlertTriangle className="h-4 w-4 text-amber-400" />,
		tip: <Sparkles className="h-4 w-4 text-purple-400" />
	}
	const borders = {
		growth: 'border-emerald-500/20 bg-emerald-500/5',
		alert: 'border-amber-500/20 bg-amber-500/5',
		tip: 'border-purple-500/20 bg-purple-500/5'
	}

	return (
		<>
			{insights.map((insight, idx) => (
				<div
					key={idx}
					className={`rounded-3xl border px-5 py-5 ${borders[insight.type]}`}
				>
					<div className="flex items-center gap-2 mb-2">
						{icons[insight.type]}
						<span className="text-xs uppercase tracking-[0.2em] text-white/50">
							{insight.type === 'growth' ? 'Growth' : insight.type === 'alert' ? 'Alert' : 'AI Tip'}
						</span>
					</div>
					<h3 className="text-lg font-semibold text-white">{insight.title}</h3>
					<p className="mt-1 text-sm text-white/70">{insight.body}</p>
				</div>
			))}
		</>
	)
}
