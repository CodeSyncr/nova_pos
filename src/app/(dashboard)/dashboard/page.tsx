import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createSupabaseServerComponentClient } from '@/lib/supabase/server'
import {
	ArrowUpRight,
	Clock,
	IndianRupee,
	Receipt,
	Users,
	Banknote,
	CalendarCheck,
	TrendingUp,
	TrendingDown
} from 'lucide-react'

type TenantRecord = {
	id: string
	name: string
	settings: Record<string, unknown> | null
}

/** Time-of-day greeting based on the tenant's timezone. */
function getGreeting(timezone: string): string {
	const hour =
		Number(
			new Intl.DateTimeFormat('en-US', {
				timeZone: timezone,
				hour: 'numeric',
				hour12: false
			}).format(new Date())
		) % 24
	if (hour < 12) return 'Good morning'
	if (hour < 17) return 'Good afternoon'
	return 'Good evening'
}

/** Banner header: storefront image with a greeting + the signed-in user's name. */
function DashboardBanner({
	greeting,
	name
}: {
	greeting: string
	name: string
}) {
	return (
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
				<p className="text-xs text-white/70 sm:text-sm md:text-base">{greeting},</p>
				<h1 className="mt-1 text-2xl font-semibold capitalize text-white sm:text-3xl md:text-4xl">
					{name}
				</h1>
			</div>
		</section>
	)
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

	// ── Owner/admin (full access) vs restricted staff ──────────────────────────
	// The owner also has a role (the OWNER role with ["*"] permissions), so simply
	// having a role_id does NOT mean staff — only a RESTRICTED role does.
	const { data: profileTenant } = await supabase
		.from('profile_tenants')
		.select('role_id')
		.eq('profile_id', user.id)
		.eq('tenant_id', tenant.id)
		.single()

	let isStaff = false
	if (profileTenant?.role_id) {
		const { data: role } = await supabase
			.from('roles')
			.select('code, permissions')
			.eq('id', profileTenant.role_id)
			.single()
		const perms = role?.permissions as unknown
		const isFullAccess =
			role?.code === 'OWNER' ||
			perms == null ||
			(Array.isArray(perms) && (perms.includes('*') || perms.includes('all')))
		isStaff = !isFullAccess
	}

	// If staff member, show their personal dashboard
	if (isStaff) {
		return <StaffDashboard userId={user.id} tenantId={tenant.id} currencySymbol={currencySymbol} timezone={timezone} />
	}

	// Owner's display name + time-based greeting
	const { data: ownerProfile } = await supabase
		.from('profiles')
		.select('full_name')
		.eq('id', user.id)
		.single()
	const ownerName = ownerProfile?.full_name || user.email?.split('@')[0] || 'there'
	const greeting = getGreeting(timezone)

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
		.select('id, total, subtotal, tax, discount_amount, status, created_at, completed_at, customer_name, customer_phone, order_type, order_items(name, quantity, total_price)')
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

	// ── Compute stats ──────────────────────────────────────────────────────────

	const allOrders = todayOrders || []
	const completedToday = allOrders.filter((o) => o.status === 'completed')
	const todayRevenue = completedToday.reduce((sum, o) => sum + (o.total || 0), 0)
	const todayOrderCount = allOrders.length

	// Customers served today, split into new vs returning (against all prior history)
	const todayCustomerMap = new Map<string, { phone: string; name: string }>()
	for (const o of allOrders) {
		const phone = ((o.customer_phone || '') as string).trim()
		const name = ((o.customer_name || '') as string).trim()
		const key = (phone || name).toLowerCase()
		if (key && !todayCustomerMap.has(key)) {
			todayCustomerMap.set(key, { phone, name })
		}
	}
	const todayCustomers = todayCustomerMap.size

	const todayPhones = [...todayCustomerMap.values()].map((c) => c.phone).filter(Boolean)
	const todayNames = [...todayCustomerMap.values()].map((c) => c.name).filter(Boolean)

	// Which of today's customers were seen in orders BEFORE today?
	const seenPhones = new Set<string>()
	const seenNames = new Set<string>()
	if (todayPhones.length > 0) {
		const { data } = await supabase
			.from('orders')
			.select('customer_phone')
			.eq('tenant_id', tenant.id)
			.lt('created_at', todayStart)
			.in('customer_phone', todayPhones)
		data?.forEach((r) => {
			const p = ((r.customer_phone || '') as string).trim().toLowerCase()
			if (p) seenPhones.add(p)
		})
	}
	if (todayNames.length > 0) {
		const { data } = await supabase
			.from('orders')
			.select('customer_name')
			.eq('tenant_id', tenant.id)
			.lt('created_at', todayStart)
			.in('customer_name', todayNames)
		data?.forEach((r) => {
			const n = ((r.customer_name || '') as string).trim().toLowerCase()
			if (n) seenNames.add(n)
		})
	}

	let returningCustomers = 0
	for (const c of todayCustomerMap.values()) {
		const seen =
			(c.phone && seenPhones.has(c.phone.trim().toLowerCase())) ||
			(c.name && seenNames.has(c.name.trim().toLowerCase()))
		if (seen) returningCustomers++
	}
	const newCustomers = todayCustomers - returningCustomers
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

	// Max qty for the top-items popularity bars
	const maxTopQty = topItems.length ? Math.max(...topItems.map((i) => i.qty)) : 1

	const fmtCurrency = (n: number) => `${currencySymbol}${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
	const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: timezone })

	return (
		<div className="flex flex-col gap-5 py-4 sm:gap-8 sm:py-6">
			{/* Hero Header */}
			<DashboardBanner greeting={greeting} name={ownerName} />

			{/* Editorial metrics band — hero figure + hairline mini-stats */}
			<section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent sm:rounded-[28px]">
				<div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-[#E0342A]/10 blur-[90px]" />
				<div className="relative grid lg:grid-cols-[1.55fr_1fr]">
					<div className="p-6 sm:p-8 lg:p-10">
						<div className="flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.25em] text-white/40 sm:text-[11px] sm:tracking-[0.35em]">
							<span className="h-1.5 w-1.5 rounded-full bg-[#E0342A]" />
							Today&apos;s revenue
						</div>
						<div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2 sm:mt-6 sm:gap-x-4 sm:gap-y-3">
							<span className="text-[2.75rem] font-semibold leading-[0.9] tracking-tight text-white sm:text-6xl lg:text-[5.5rem]">
								{fmtCurrency(todayRevenue)}
							</span>
							{revenueChange !== 0 && (
								<span
									className={`mb-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
										revenueChange > 0
											? 'bg-white/10 text-white'
											: 'bg-[#E0342A]/15 text-[#E0342A]'
									}`}
								>
									{revenueChange > 0 ? (
										<TrendingUp className="h-3.5 w-3.5" />
									) : (
										<TrendingDown className="h-3.5 w-3.5" />
									)}
									{Math.abs(revenueChange)}%
								</span>
							)}
						</div>
						<p className="mt-5 text-sm text-white/40">
							{completedToday.length} order{completedToday.length !== 1 ? 's' : ''} completed
							<span className="mx-2 text-white/20">•</span>
							{fmtCurrency(avgOrderValue)} avg ticket
						</p>
					</div>
					<div className="grid grid-rows-3 divide-y divide-white/[0.06] border-t border-white/[0.06] lg:border-l lg:border-t-0">
						<MiniStat icon={<Receipt />} label="Orders today" value={todayOrderCount.toString()} />
						<MiniStat icon={<Clock />} label="Pending" value={pendingCount.toString()} accent={pendingCount > 0} />
						<div className="flex items-center justify-between gap-4 px-6 py-4 sm:px-8 sm:py-5 lg:px-9">
							<span className="flex items-center gap-2.5 text-white/40">
								<Users className="h-4 w-4" />
								<span className="text-[11px] font-medium uppercase tracking-[0.18em]">Customers</span>
							</span>
							<span className="flex items-baseline gap-2.5">
								<span className="flex items-baseline gap-1">
									<span className="text-2xl font-semibold tabular-nums text-[#E0342A]">{newCustomers}</span>
									<span className="text-[10px] uppercase tracking-wider text-white/35">new</span>
								</span>
								<span className="text-white/15">·</span>
								<span className="flex items-baseline gap-1">
									<span className="text-2xl font-semibold tabular-nums text-white">{returningCustomers}</span>
									<span className="text-[10px] uppercase tracking-wider text-white/35">return</span>
								</span>
							</span>
						</div>
					</div>
				</div>
			</section>

			{/* Active orders + Top sellers */}
			<div className="grid gap-6 md:grid-cols-2">
				<Panel
					eyebrow="Live"
					title="Active orders"
					action={<span className="text-sm font-semibold tabular-nums text-[#E0342A]">{pendingCount}</span>}
				>
					{(pendingOrders || []).length === 0 ? (
						<EmptyLine>Floor is quiet — no active orders</EmptyLine>
					) : (
						<div className="divide-y divide-white/[0.06]">
							{(pendingOrders || []).slice(0, 5).map((order) => (
								<div key={order.id} className="flex items-center justify-between gap-3 py-3.5 first:pt-1">
									<div className="min-w-0">
										<p className="truncate text-sm font-medium text-white">
											{order.customer_name || order.order_type || 'Walk-in'}
											{order.table_number && (
												<span className="ml-1.5 text-white/35">· T{order.table_number}</span>
											)}
										</p>
										<p className="mt-0.5 text-xs text-white/35">
											{fmtTime(order.created_at)} <span className="text-white/20">·</span>{' '}
											<span className="capitalize text-[#E0342A]/90">{order.status}</span>
										</p>
									</div>
									<p className="shrink-0 text-sm font-semibold tabular-nums text-white">
										{fmtCurrency(order.total || 0)}
									</p>
								</div>
							))}
						</div>
					)}
				</Panel>

				<Panel eyebrow="Today" title="Top sellers">
					{topItems.length === 0 ? (
						<EmptyLine>No sales yet today</EmptyLine>
					) : (
						<div className="space-y-1">
							{topItems.map((item, idx) => (
								<div key={item.name} className="relative overflow-hidden rounded-lg py-2.5">
									<div
										className="absolute inset-y-1 left-0 rounded-lg bg-[#E0342A]/[0.12]"
										style={{ width: `${Math.max(8, Math.round((item.qty / maxTopQty) * 100))}%` }}
									/>
									<div className="relative flex items-center justify-between gap-3 px-2">
										<span className="flex min-w-0 items-center gap-2.5">
											<span className="text-xs font-bold tabular-nums text-[#E0342A]">{idx + 1}</span>
											<span className="truncate text-sm text-white">{item.name}</span>
										</span>
										<span className="shrink-0 text-xs tabular-nums text-white/50">{item.qty}×</span>
									</div>
								</div>
							))}
						</div>
					)}
				</Panel>
			</div>

			{/* Recent orders + Low stock */}
			<div className="grid gap-6 md:grid-cols-[1.3fr_0.7fr]">
				<Panel
					eyebrow="Timeline"
					title="Recent orders"
					action={
						<a href="/orders" className="flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-[#E0342A]">
							View all <ArrowUpRight className="h-3.5 w-3.5" />
						</a>
					}
				>
					{recentOrders.length === 0 ? (
						<EmptyLine>No orders today</EmptyLine>
					) : (
						<div className="grid gap-x-10 sm:grid-cols-2">
							{recentOrders.map((order) => (
								<div key={order.id} className="flex items-center justify-between gap-3 border-b border-white/[0.05] py-3">
									<span className="flex min-w-0 items-center gap-3">
										<StatusDot status={order.status} />
										<span className="min-w-0">
											<span className="block truncate text-sm text-white">
												{order.customer_name || order.order_type || 'Order'}
											</span>
											<span className="block text-xs text-white/35">{fmtTime(order.created_at)}</span>
										</span>
									</span>
									<span className="shrink-0 text-sm font-medium tabular-nums text-white">
										{fmtCurrency(order.total || 0)}
									</span>
								</div>
							))}
						</div>
					)}
				</Panel>

				<Panel
					eyebrow="Alerts"
					title="Low stock"
					action={<a href="/inventory" className="text-xs text-white/40 transition-colors hover:text-[#E0342A]">Manage</a>}
				>
					{lowStock.length === 0 ? (
						<EmptyLine>All stock levels healthy</EmptyLine>
					) : (
						<div className="divide-y divide-white/[0.06]">
							{lowStock.map((item) => (
								<div key={item.name} className="flex items-center justify-between gap-3 py-3.5 first:pt-1">
									<span className="flex min-w-0 items-center gap-2.5">
										<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#E0342A]" />
										<span className="truncate text-sm text-white">{item.name}</span>
									</span>
									<span className="shrink-0 text-sm font-semibold tabular-nums text-[#E0342A]">
										{item.stock}
										<span className="ml-1 text-xs font-normal text-white/40">{item.unit}</span>
									</span>
								</div>
							))}
						</div>
					)}
				</Panel>
			</div>

		</div>
	)
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function MiniStat({
	icon,
	label,
	value,
	accent = false
}: {
	icon: React.ReactNode
	label: string
	value: string
	accent?: boolean
}) {
	return (
		<div className="flex items-center justify-between gap-4 px-6 py-4 sm:px-8 sm:py-5 lg:px-9">
			<span className="flex items-center gap-2.5 text-white/40 [&>svg]:h-4 [&>svg]:w-4">
				{icon}
				<span className="text-[11px] font-medium uppercase tracking-[0.18em]">{label}</span>
			</span>
			<span
				className={`text-2xl font-semibold tabular-nums ${
					accent ? 'text-[#E0342A]' : 'text-white'
				}`}
			>
				{value}
			</span>
		</div>
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
					<h2 className="mt-1.5 text-base font-semibold text-white">{title}</h2>
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

function StatusDot({ status }: { status: string }) {
	const colors: Record<string, string> = {
		pending: 'bg-[#E0342A]',
		confirmed: 'bg-[#E0342A]',
		preparing: 'bg-[#E0342A]',
		ready: 'bg-white',
		completed: 'bg-white/40',
		cancelled: 'bg-[#E0342A]/40'
	}
	return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] || colors.pending}`} />
}

// ─── Staff Dashboard (shown to users with roles) ────────────────────────────────

async function StaffDashboard({
	userId,
	tenantId,
	currencySymbol,
	timezone
}: {
	userId: string
	tenantId: string
	currencySymbol: string
	timezone: string
}) {
	const supabase = await createSupabaseServerComponentClient()

	const now = new Date()
	const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
	const today = now.toISOString().split('T')[0]!
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

	// Get salary
	const { data: salaryData } = await supabase
		.from('staff_salaries')
		.select('monthly_salary')
		.eq('tenant_id', tenantId)
		.eq('profile_id', userId)
		.single()

	const monthlySalary = salaryData?.monthly_salary || 0

	// Get advances this month
	const { data: advances } = await supabase
		.from('staff_advances')
		.select('id, amount, reason, advance_date')
		.eq('tenant_id', tenantId)
		.eq('profile_id', userId)
		.gte('advance_date', `${currentMonth}-01`)
		.lte('advance_date', `${currentMonth}-${lastDay}`)
		.order('advance_date', { ascending: false })

	const totalAdvances = (advances || []).reduce((sum, a) => sum + (a.amount || 0), 0)
	const netSalary = monthlySalary - totalAdvances

	// Get attendance this month
	const { data: attendanceRecords } = await supabase
		.from('staff_attendance')
		.select('date, status, check_in, check_out')
		.eq('tenant_id', tenantId)
		.eq('profile_id', userId)
		.gte('date', `${currentMonth}-01`)
		.lte('date', `${currentMonth}-${lastDay}`)
		.order('date', { ascending: false })

	const presentDays = (attendanceRecords || []).filter((r) => r.status === 'present').length
	const halfDays = (attendanceRecords || []).filter((r) => r.status === 'half_day').length
	const absentDays = (attendanceRecords || []).filter((r) => r.status === 'absent').length
	const leaveDays = (attendanceRecords || []).filter((r) => r.status === 'leave').length

	// Today's attendance
	const todayAttendance = (attendanceRecords || []).find((r) => r.date === today)

	// Get profile name
	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name')
		.eq('id', userId)
		.single()

	const fmtCurrency = (n: number) => `${currencySymbol}${n.toLocaleString('en-IN')}`
	const monthName = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
	const greeting = getGreeting(timezone)

	return (
		<div className="flex flex-col gap-8 py-6">
			{/* Header */}
			<DashboardBanner greeting={greeting} name={profile?.full_name || 'Team Member'} />

			{/* Today's Status */}
			<div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
				<div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
					<CalendarCheck className="h-5 w-5 text-[#E0342A] mb-2" />
					<p className="text-2xl font-semibold text-white">
						{todayAttendance ? todayAttendance.status.replace('_', ' ') : 'Not marked'}
					</p>
					<p className="text-xs text-white/50 mt-1">Today&apos;s Status</p>
				</div>
				<div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
					<IndianRupee className="h-5 w-5 text-[#E0342A] mb-2" />
					<p className="text-2xl font-semibold text-white">{fmtCurrency(monthlySalary)}</p>
					<p className="text-xs text-white/50 mt-1">Monthly Salary</p>
				</div>
				<div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
					<Banknote className="h-5 w-5 text-[#E0342A] mb-2" />
					<p className="text-2xl font-semibold text-[#E0342A]">{fmtCurrency(totalAdvances)}</p>
					<p className="text-xs text-white/50 mt-1">Advances This Month</p>
				</div>
				<div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
					<IndianRupee className="h-5 w-5 text-[#E0342A] mb-2" />
					<p className="text-2xl font-semibold text-white">{fmtCurrency(Math.max(0, netSalary))}</p>
					<p className="text-xs text-white/50 mt-1">Net Payable</p>
				</div>
			</div>

			{/* Attendance & Advances */}
			<div className="grid gap-6 md:grid-cols-2">
				{/* Attendance Summary */}
				<section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
					<div className="flex items-center gap-3 mb-5">
						<CalendarCheck className="h-5 w-5 text-[#E0342A]" />
						<h2 className="text-xl font-semibold text-white">Attendance - {monthName}</h2>
					</div>
					<div className="grid grid-cols-2 gap-3 mb-5">
						<div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
							<p className="text-2xl font-bold text-white">{presentDays}</p>
							<p className="text-xs text-white/50">Present</p>
						</div>
						<div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
							<p className="text-2xl font-bold text-white">{halfDays}</p>
							<p className="text-xs text-white/50">Half Days</p>
						</div>
						<div className="rounded-xl bg-[#E0342A]/10 border border-[#E0342A]/20 p-3 text-center">
							<p className="text-2xl font-bold text-[#E0342A]">{absentDays}</p>
							<p className="text-xs text-white/50">Absent</p>
						</div>
						<div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
							<p className="text-2xl font-bold text-white">{leaveDays}</p>
							<p className="text-xs text-white/50">Leave</p>
						</div>
					</div>

					{/* Recent attendance */}
					<div className="space-y-2">
						{(attendanceRecords || []).slice(0, 7).map((record) => (
							<div key={record.date} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2">
								<div className="flex items-center gap-3">
									<StaffAttendanceDot status={record.status} />
									<span className="text-sm text-white/70">
										{new Date(record.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' })}
									</span>
								</div>
								<span className="text-xs text-white/50">
									{record.check_in ? new Date(record.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: timezone }) : '—'}
								</span>
							</div>
						))}
					</div>
				</section>

				{/* Advances */}
				<section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
					<div className="flex items-center gap-3 mb-5">
						<Banknote className="h-5 w-5 text-[#E0342A]" />
						<h2 className="text-xl font-semibold text-white">Advances - {monthName}</h2>
					</div>

					{(!advances || advances.length === 0) ? (
						<div className="text-center py-8">
							<Banknote className="h-8 w-8 text-white/20 mx-auto mb-2" />
							<p className="text-sm text-white/50">No advances this month</p>
						</div>
					) : (
						<div className="space-y-3">
							{advances.map((adv) => (
								<div key={adv.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
									<div>
										<p className="text-sm font-medium text-white">{fmtCurrency(adv.amount)}</p>
										<p className="text-xs text-white/50">{adv.reason || 'No reason'}</p>
									</div>
									<span className="text-xs text-white/40">
										{new Date(adv.advance_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
									</span>
								</div>
							))}

							{/* Total */}
							<div className="rounded-xl bg-[#E0342A]/10 border border-[#E0342A]/20 px-4 py-3 mt-2">
								<div className="flex justify-between items-center">
									<span className="text-xs text-[#E0342A]/70">Total Advances</span>
									<span className="text-lg font-semibold text-[#E0342A]">{fmtCurrency(totalAdvances)}</span>
								</div>
							</div>
						</div>
					)}
				</section>
			</div>
		</div>
	)
}

function StaffAttendanceDot({ status }: { status: string }) {
	const colors: Record<string, string> = {
		present: 'bg-white',
		half_day: 'bg-white/50',
		absent: 'bg-[#E0342A]',
		leave: 'bg-white/30'
	}
	return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] || colors.absent}`} />
}
