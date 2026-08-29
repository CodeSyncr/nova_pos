'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
	Bike,
	RefreshCw,
	Loader2,
	Link2,
	Unlink,
	AlertTriangle,
	ShoppingBag,
	IndianRupee,
	TrendingUp,
	Clock,
	Smartphone,
	KeyRound,
	ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import {
	getZomatoStatus,
	getZomatoOrders,
	getZomatoSummary,
	connectZomato,
	disconnectZomato,
	syncZomatoOrders,
	sendZomatoOtp,
	verifyZomatoOtp,
	type ZomatoOrderRow,
	type ZomatoSummary,
	type ZomatoConnectionStatus
} from '@/app/actions/zomato'

type RangeKey = 'today' | '7d' | '30d'

const RANGES: { key: RangeKey; label: string; days: number }[] = [
	{ key: 'today', label: 'Today', days: 1 },
	{ key: '7d', label: 'Last 7 days', days: 7 },
	{ key: '30d', label: 'Last 30 days', days: 30 }
]

const STATUS_STYLES: Record<string, string> = {
	DELIVERED: 'bg-emerald-500/10 text-emerald-500',
	PREPARING: 'bg-amber-500/10 text-amber-500',
	READY: 'bg-sky-500/10 text-sky-500',
	DISPATCHED: 'bg-sky-500/10 text-sky-500',
	CANCELLED: 'bg-red-500/10 text-red-500',
	TIMEOUT: 'bg-red-500/10 text-red-500'
}

function statusStyle(status: string | null) {
	return STATUS_STYLES[String(status ?? '').toUpperCase()] ?? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
}

function formatDateTime(iso: string) {
	return new Date(iso).toLocaleString('en-IN', {
		day: '2-digit',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hour12: true
	})
}

function rangeBounds(days: number) {
	const end = new Date()
	const start = new Date(end)
	start.setDate(start.getDate() - (days - 1))
	start.setHours(0, 0, 0, 0)
	return { startDate: start.toISOString(), endDate: end.toISOString() }
}

export default function ZomatoPage() {
	const router = useRouter()
	const { success, error: showError } = useToast()

	const [tenantId, setTenantId] = useState('')
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	const [loading, setLoading] = useState(true)
	const [dataLoading, setDataLoading] = useState(false)
	const [syncing, setSyncing] = useState(false)

	const [range, setRange] = useState<RangeKey>('7d')
	const [orders, setOrders] = useState<ZomatoOrderRow[]>([])
	const [summary, setSummary] = useState<ZomatoSummary | null>(null)
	const [status, setStatus] = useState<ZomatoConnectionStatus | null>(null)

	const [showConnect, setShowConnect] = useState(false)
	const [curlText, setCurlText] = useState('')
	const [connecting, setConnecting] = useState(false)

	// OTP login
	const [authTab, setAuthTab] = useState<'otp' | 'paste'>('otp')
	const [phone, setPhone] = useState('')
	const [otp, setOtp] = useState('')
	const [otpSent, setOtpSent] = useState(false)
	const [sendingOtp, setSendingOtp] = useState(false)
	const [verifyingOtp, setVerifyingOtp] = useState(false)
	// Set when Zomato blocks the automated login, to point at the paste tab.
	const [otpBlocked, setOtpBlocked] = useState<string | null>(null)

	useEffect(() => {
		const load = async () => {
			const supabase = createSupabaseBrowserClient()
			const {
				data: { user }
			} = await supabase.auth.getUser()
			if (!user) {
				router.push('/login')
				return
			}

			const { data: pts } = await supabase
				.from('profile_tenants')
				.select('tenant:tenants(id, settings)')
				.eq('profile_id', user.id)
				.limit(1)

			type EmbeddedTenant = { id: string; settings: Record<string, unknown> | null }
			const pt = pts && pts.length > 0 ? pts[0] : null
			const embedded = pt?.tenant as unknown as EmbeddedTenant | EmbeddedTenant[] | null | undefined
			const tenant = Array.isArray(embedded) ? embedded[0] : embedded
			if (!tenant) {
				router.push('/dashboard')
				return
			}

			setTenantId(tenant.id)
			const settings = tenant.settings as Record<string, unknown> | null
			if (settings?.currencySymbol) setCurrencySymbol(settings.currencySymbol as string)
			setLoading(false)
		}
		load()
	}, [router])

	const loadData = useCallback(async () => {
		if (!tenantId) return
		setDataLoading(true)
		try {
			const days = RANGES.find((r) => r.key === range)?.days ?? 7
			const { startDate, endDate } = rangeBounds(days)

			const [rows, sum, st] = await Promise.all([
				getZomatoOrders(tenantId, startDate, endDate),
				getZomatoSummary(tenantId, startDate, endDate),
				getZomatoStatus(tenantId)
			])

			setOrders(rows)
			setSummary(sum)
			setStatus(st)
			if (!st.connected) setShowConnect(true)
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to load Zomato orders')
		} finally {
			setDataLoading(false)
		}
	}, [tenantId, range, showError])

	useEffect(() => {
		loadData()
	}, [loadData])

	const handleConnect = async () => {
		if (!tenantId) return
		setConnecting(true)
		try {
			const result = await connectZomato(tenantId, curlText)
			success(`Zomato connected — outlet ${result.resId}`)
			setCurlText('')
			setShowConnect(false)
			await loadData()
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Could not connect Zomato')
		} finally {
			setConnecting(false)
		}
	}

	const handleSendOtp = async () => {
		if (!tenantId) return
		setSendingOtp(true)
		setOtpBlocked(null)
		try {
			const result = await sendZomatoOtp(tenantId, phone)
			setOtpSent(true)
			success(`OTP sent to ${result.phone}`)
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Could not send OTP')
		} finally {
			setSendingOtp(false)
		}
	}

	const handleVerifyOtp = async () => {
		if (!tenantId) return
		setVerifyingOtp(true)
		try {
			const result = await verifyZomatoOtp(tenantId, otp)
			success(`Zomato connected — outlet ${result.resId}`)
			setOtp('')
			setOtpSent(false)
			setShowConnect(false)
			await loadData()
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Could not verify OTP'
			// A block reads as a wrong code unless we say otherwise. An exhausted
			// quota is the user's to wait out, so it stays an ordinary error.
			if (/browser session paste|blocked|did not complete|authorization code/i.test(message)) {
				setOtpBlocked(message)
			}
			showError(message)
		} finally {
			setVerifyingOtp(false)
		}
	}

	const handleSync = async () => {
		if (!tenantId) return
		setSyncing(true)
		try {
			const days = RANGES.find((r) => r.key === range)?.days ?? 7
			const result = await syncZomatoOrders(tenantId, days)
			success(`Synced ${result.fetched} order${result.fetched === 1 ? '' : 's'} — ${result.inserted} new`)
			await loadData()
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Sync failed')
		} finally {
			setSyncing(false)
		}
	}

	const handleDisconnect = async () => {
		if (!tenantId) return
		try {
			await disconnectZomato(tenantId)
			success('Zomato disconnected')
			await loadData()
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Could not disconnect')
		}
	}

	if (loading) {
		return (
			<div className="flex h-[60vh] items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--accent))]" />
			</div>
		)
	}

	const needsReconnect =
		status?.connected && (status.expired || status.lastSyncStatus === 'reconnect_required')

	return (
		<div className="space-y-6 pb-16">
			{/* Header */}
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="flex items-center gap-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
						<Bike className="h-6 w-6 text-[hsl(var(--accent))]" />
						Zomato Orders
					</h1>
					<p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
						Delivery orders from your Zomato partner dashboard
						{status?.resId && <span className="ml-1">· outlet {status.resId}</span>}
					</p>
				</div>

				<div className="flex items-center gap-2">
					<Button variant="ghost" size="sm" onClick={() => setShowConnect((v) => !v)}>
						<Link2 className="mr-2 h-4 w-4" />
						{status?.connected ? 'Reconnect' : 'Connect'}
					</Button>
					<Button size="sm" onClick={handleSync} disabled={syncing || !status?.connected}>
						{syncing ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<RefreshCw className="mr-2 h-4 w-4" />
						)}
						{syncing ? 'Syncing' : 'Sync now'}
					</Button>
				</div>
			</div>

			{/* Session banner — the defining constraint of this integration */}
			{needsReconnect && (
				<div className="flex items-start gap-3 rounded-[var(--radius)] border border-[hsl(var(--accent))]/40 bg-[hsl(var(--accent))]/5 p-4">
					<AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[hsl(var(--accent))]" />
					<div className="text-sm">
						<p className="font-medium text-[hsl(var(--foreground))]">
							Zomato session expired — reconnect to resume syncing
						</p>
						<p className="mt-1 text-[hsl(var(--muted-foreground))]">
							Zomato sessions last about 24 hours and their login cannot be automated, so
							this needs a fresh copy from your browser. Click Reconnect for the steps.
						</p>
					</div>
				</div>
			)}

			{status?.connected && status.sessionExpiresAt && !needsReconnect && (
				<p className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
					<Clock className="h-3.5 w-3.5" />
					Session valid until {formatDateTime(status.sessionExpiresAt)}
					{status.lastSyncAt && <span>· last synced {formatDateTime(status.lastSyncAt)}</span>}
				</p>
			)}

			{/* Connect panel */}
			{showConnect && (
				<motion.div
					initial={{ opacity: 0, y: -8 }}
					animate={{ opacity: 1, y: 0 }}
					className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
				>
					<h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
						Connect your Zomato partner account
					</h2>

					{/* Tabs */}
					<div className="mt-4 flex gap-2">
						<button
							onClick={() => setAuthTab('otp')}
							className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
								authTab === 'otp'
									? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
									: 'border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/50'
							}`}
						>
							<Smartphone className="h-3.5 w-3.5" />
							Mobile + OTP
						</button>
						<button
							onClick={() => setAuthTab('paste')}
							className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
								authTab === 'paste'
									? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
									: 'border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/50'
							}`}
						>
							<KeyRound className="h-3.5 w-3.5" />
							Browser session
						</button>
					</div>

					{authTab === 'otp' ? (
						<div className="mt-4">
							<p className="text-xs text-[hsl(var(--muted-foreground))]">
								Sign in with the mobile number registered on your Zomato partner account.
							</p>

							<div className="mt-3 flex flex-wrap gap-2">
								<div className="flex items-center rounded-[calc(var(--radius)*0.9)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3">
									<span className="text-sm text-[hsl(var(--muted-foreground))]">+91</span>
									<input
										type="tel"
										value={phone}
										onChange={(e) => setPhone(e.target.value)}
										placeholder="Mobile number"
										disabled={otpSent}
										autoComplete="tel"
										className="h-11 w-44 bg-transparent px-2 text-sm outline-none disabled:opacity-60"
									/>
								</div>
								<Button
									size="sm"
									variant={otpSent ? 'ghost' : 'default'}
									onClick={handleSendOtp}
									disabled={sendingOtp || phone.replace(/\D/g, '').length < 10}
								>
									{sendingOtp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
									{otpSent ? 'Resend OTP' : sendingOtp ? 'Sending' : 'Send OTP'}
								</Button>
							</div>

							{otpSent && (
								<div className="mt-3 flex flex-wrap gap-2">
									<input
										type="text"
										inputMode="numeric"
										value={otp}
										onChange={(e) => setOtp(e.target.value)}
										placeholder="Enter OTP"
										autoComplete="one-time-code"
										className="h-11 w-44 rounded-[calc(var(--radius)*0.9)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm tracking-widest outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]/40"
									/>
									<Button
										size="sm"
										onClick={handleVerifyOtp}
										disabled={verifyingOtp || otp.replace(/\D/g, '').length < 4}
									>
										{verifyingOtp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
										{verifyingOtp ? 'Verifying' : 'Verify & connect'}
									</Button>
								</div>
							)}

							{/* Zomato blocks non-browser logins; say so plainly rather than
							    letting it look like the user mistyped the code. */}
							{otpBlocked && (
								<div className="mt-4 flex items-start gap-3 rounded-[var(--radius)] border border-[hsl(var(--accent))]/40 bg-[hsl(var(--accent))]/5 p-3">
									<AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--accent))]" />
									<div className="text-xs">
										<p className="font-medium text-[hsl(var(--foreground))]">
											Zomato blocked this login — your OTP was almost certainly correct
										</p>
										<p className="mt-1 text-[hsl(var(--muted-foreground))]">
											Zomato requires the login to come from a real browser. Use the browser
											session method instead — it takes about 30 seconds.
										</p>
										<button
											onClick={() => setAuthTab('paste')}
											className="mt-2 inline-flex items-center gap-1 font-medium text-[hsl(var(--accent))] hover:underline"
										>
											Switch to browser session
											<ChevronRight className="h-3 w-3" />
										</button>
									</div>
								</div>
							)}
						</div>
					) : (
						<div className="mt-4">
							<p className="text-xs text-[hsl(var(--muted-foreground))]">
								Paste a signed-in request from your browser and we&apos;ll reuse that session.
								This always works, because the session is minted by a real browser.
							</p>
							<ol className="mt-3 space-y-1 text-xs text-[hsl(var(--muted-foreground))]">
								<li>1. Sign in at zomato.com/partners and open Order History</li>
								<li>2. Open DevTools (⌥⌘I) → Network tab</li>
								<li>
									3. Reload, find a request named{' '}
									<code className="text-[hsl(var(--foreground))]">get-all-v2</code>
								</li>
								<li>4. Right-click → Copy → Copy as cURL, then paste it below</li>
							</ol>
							<textarea
								value={curlText}
								onChange={(e) => setCurlText(e.target.value)}
								placeholder="curl --url 'https://api.zomato.com/merchant-gw/web/order/history/get-all-v2' ..."
								rows={5}
								className="mt-4 w-full rounded-[calc(var(--radius)*0.9)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]/40"
							/>
							<Button
								size="sm"
								className="mt-3"
								onClick={handleConnect}
								disabled={connecting || !curlText.trim()}
							>
								{connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								{connecting ? 'Verifying' : 'Connect'}
							</Button>
						</div>
					)}

					{status?.connected && (
						<div className="mt-4 flex gap-2 border-t border-[hsl(var(--border))] pt-4">
							<Button variant="ghost" size="sm" onClick={() => setShowConnect(false)}>
								Cancel
							</Button>
							<Button variant="ghost" size="sm" onClick={handleDisconnect}>
								<Unlink className="mr-2 h-4 w-4" />
								Disconnect
							</Button>
						</div>
					)}
				</motion.div>
			)}

			{/* Range picker */}
			<div className="flex gap-2">
				{RANGES.map((r) => (
					<button
						key={r.key}
						onClick={() => setRange(r.key)}
						className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
							range === r.key
								? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
								: 'border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/50'
						}`}
					>
						{r.label}
					</button>
				))}
			</div>

			{/* Summary */}
			{summary && (
				<div className="grid gap-4 sm:grid-cols-3">
					<SummaryCard
						icon={<ShoppingBag className="h-4 w-4" />}
						label="Orders"
						value={String(summary.orderCount)}
						sub="In this period"
					/>
					<SummaryCard
						icon={<IndianRupee className="h-4 w-4" />}
						label="Revenue"
						value={`${currencySymbol}${summary.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
						sub="Delivered orders only"
					/>
					<SummaryCard
						icon={<TrendingUp className="h-4 w-4" />}
						label="Average order"
						value={`${currencySymbol}${summary.averageOrderValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
						sub="Per delivered order"
					/>
				</div>
			)}

			{summary && summary.byStatus.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{summary.byStatus.map((s) => (
						<span
							key={s.status}
							className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle(s.status)}`}
						>
							{s.status} · {s.count}
						</span>
					))}
				</div>
			)}

			{/* Orders */}
			<div className="overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
				{dataLoading ? (
					<div className="flex h-40 items-center justify-center">
						<Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--accent))]" />
					</div>
				) : orders.length === 0 ? (
					<div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
						<Bike className="h-8 w-8 text-[hsl(var(--muted-foreground))]/50" />
						<p className="text-sm text-[hsl(var(--muted-foreground))]">
							{status?.connected
								? 'No Zomato orders in this period. Hit “Sync now” to pull the latest.'
								: 'Connect your Zomato partner account to see delivery orders here.'}
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-[hsl(var(--border))] text-left text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
									<th className="px-4 py-3 font-medium">Time</th>
									<th className="px-4 py-3 font-medium">Order</th>
									<th className="px-4 py-3 font-medium">Customer</th>
									<th className="px-4 py-3 font-medium">Items</th>
									<th className="px-4 py-3 font-medium">Status</th>
									<th className="px-4 py-3 text-right font-medium">Amount</th>
								</tr>
							</thead>
							<tbody>
								{orders.map((order) => (
									<tr
										key={order.id}
										className="border-b border-[hsl(var(--border))]/50 last:border-0 hover:bg-[hsl(var(--muted))]/30"
									>
										<td className="whitespace-nowrap px-4 py-3 text-[hsl(var(--muted-foreground))]">
											{formatDateTime(order.orderedAt)}
										</td>
										<td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
											{order.externalId}
										</td>
										<td className="whitespace-nowrap px-4 py-3">
											{order.customerName ?? '—'}
										</td>
										<td className="max-w-md px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
											{order.itemsSummary ?? '—'}
										</td>
										<td className="whitespace-nowrap px-4 py-3">
											<span
												className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle(order.status)}`}
											>
												{order.status ?? 'Unknown'}
											</span>
										</td>
										<td className="whitespace-nowrap px-4 py-3 text-right font-medium">
											{order.amount == null
												? '—'
												: `${currencySymbol}${order.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	)
}

function SummaryCard({
	icon,
	label,
	value,
	sub
}: {
	icon: React.ReactNode
	label: string
	value: string
	sub: string
}) {
	return (
		<div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
			<div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
				{icon}
				<span className="text-xs font-medium uppercase tracking-wide">{label}</span>
			</div>
			<p className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{value}</p>
			<p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>
		</div>
	)
}
