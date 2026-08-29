'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
	CreditCard,
	RefreshCw,
	Loader2,
	CheckCircle2,
	XCircle,
	Link2,
	Unlink,
	AlertTriangle,
	Smartphone,
	KeyRound,
	IndianRupee
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import {
	syncPosTransactions,
	getPosTransactions,
	getPosPaymentSummary,
	getPosCredentialStatus,
	savePosCredentials,
	getMatchCandidates,
	linkPosTransaction,
	unlinkPosTransaction,
	type PosTransaction,
	type PosPaymentSummary,
	type PosCredentialStatus
} from '@/app/actions/pos-payments'

type RangeKey = 'today' | '7d' | '30d'

const RANGES: { key: RangeKey; label: string; days: number }[] = [
	{ key: 'today', label: 'Today', days: 1 },
	{ key: '7d', label: 'Last 7 days', days: 7 },
	{ key: '30d', label: 'Last 30 days', days: 30 }
]

const SUCCESS_STATUSES = new Set(['SETTLED', 'SETTLEMENT_PENDING', 'AUTHORIZED', 'CAPTURED'])

function isSuccessful(status: string | null) {
	return SUCCESS_STATUSES.has(String(status ?? '').toUpperCase())
}

/** Turns SETTLEMENT_PENDING into "Settlement pending". */
function humanStatus(status: string | null) {
	if (!status) return 'Unknown'
	const lower = status.replace(/_/g, ' ').toLowerCase()
	return lower.charAt(0).toUpperCase() + lower.slice(1)
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

export default function PosPaymentsPage() {
	const router = useRouter()
	const { success, error: showError } = useToast()

	const [tenantId, setTenantId] = useState('')
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	const [loading, setLoading] = useState(true)
	const [dataLoading, setDataLoading] = useState(false)
	const [syncing, setSyncing] = useState(false)

	const [range, setRange] = useState<RangeKey>('7d')
	const [transactions, setTransactions] = useState<PosTransaction[]>([])
	const [summary, setSummary] = useState<PosPaymentSummary | null>(null)
	const [credentials, setCredentials] = useState<PosCredentialStatus | null>(null)

	// Credential form
	const [showCredForm, setShowCredForm] = useState(false)
	const [portalUsername, setPortalUsername] = useState('')
	const [portalPassword, setPortalPassword] = useState('')
	const [savingCreds, setSavingCreds] = useState(false)

	// Manual matching
	const [matchingTxn, setMatchingTxn] = useState<PosTransaction | null>(null)
	const [candidates, setCandidates] = useState<
		{ id: string; tableNumber: string | null; total: number; completedAt: string }[]
	>([])
	const [candidatesLoading, setCandidatesLoading] = useState(false)

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

			// The embedded tenant comes back as an array from PostgREST.
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

			const [txns, sum, creds] = await Promise.all([
				getPosTransactions(tenantId, startDate, endDate),
				getPosPaymentSummary(tenantId, startDate, endDate),
				getPosCredentialStatus(tenantId)
			])

			setTransactions(txns)
			setSummary(sum)
			setCredentials(creds)
			if (!creds.configured) setShowCredForm(true)
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to load POS payments')
		} finally {
			setDataLoading(false)
		}
	}, [tenantId, range, showError])

	useEffect(() => {
		loadData()
	}, [loadData])

	const handleSync = async () => {
		if (!tenantId) return
		setSyncing(true)
		try {
			const days = RANGES.find((r) => r.key === range)?.days ?? 7
			const result = await syncPosTransactions(tenantId, days)
			success(
				`Synced ${result.fetched} transaction${result.fetched === 1 ? '' : 's'} — ` +
					`${result.inserted} new, ${result.autoMatched} auto-matched`
			)
			await loadData()
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Sync failed')
		} finally {
			setSyncing(false)
		}
	}

	const handleSaveCredentials = async () => {
		if (!tenantId) return
		setSavingCreds(true)
		try {
			await savePosCredentials(tenantId, portalUsername, portalPassword)
			success('Ezetap portal connected')
			setPortalPassword('')
			setShowCredForm(false)
			await loadData()
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Could not save credentials')
		} finally {
			setSavingCreds(false)
		}
	}

	const openMatcher = async (txn: PosTransaction) => {
		setMatchingTxn(txn)
		setCandidatesLoading(true)
		try {
			setCandidates(await getMatchCandidates(tenantId, txn.id))
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Could not load orders')
		} finally {
			setCandidatesLoading(false)
		}
	}

	const handleLink = async (orderId: string) => {
		if (!matchingTxn) return
		try {
			await linkPosTransaction(tenantId, matchingTxn.id, orderId)
			success('Payment linked to order')
			setMatchingTxn(null)
			await loadData()
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Could not link payment')
		}
	}

	const handleUnlink = async (txn: PosTransaction) => {
		try {
			await unlinkPosTransaction(tenantId, txn.id)
			success('Payment unlinked')
			await loadData()
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Could not unlink payment')
		}
	}

	if (loading) {
		return (
			<div className="flex h-[60vh] items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--accent))]" />
			</div>
		)
	}

	return (
		<div className="space-y-6 pb-16">
			{/* Header */}
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="flex items-center gap-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
						<CreditCard className="h-6 w-6 text-[hsl(var(--accent))]" />
						POS Payments
					</h1>
					<p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
						Card and UPI payments received on your Razorpay POS (DigiPOS) terminal.
					</p>
				</div>

				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setShowCredForm((v) => !v)}
						title="Ezetap portal credentials"
					>
						<KeyRound className="mr-2 h-4 w-4" />
						{credentials?.configured ? 'Connected' : 'Connect'}
					</Button>
					<Button size="sm" onClick={handleSync} disabled={syncing || !credentials?.configured}>
						{syncing ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<RefreshCw className="mr-2 h-4 w-4" />
						)}
						{syncing ? 'Syncing' : 'Sync now'}
					</Button>
				</div>
			</div>

			{/* Last sync status */}
			{credentials?.configured && credentials.lastSyncAt && (
				<p className="text-xs text-[hsl(var(--muted-foreground))]">
					Last synced {formatDateTime(credentials.lastSyncAt)}
					{credentials.lastSyncStatus === 'error' && credentials.lastSyncError && (
						<span className="ml-2 text-[hsl(var(--accent))]">
							— last attempt failed: {credentials.lastSyncError}
						</span>
					)}
				</p>
			)}

			{/* Credentials form */}
			{showCredForm && (
				<motion.div
					initial={{ opacity: 0, y: -8 }}
					animate={{ opacity: 1, y: 0 }}
					className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
				>
					<h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
						Ezetap portal credentials
					</h2>
					<p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
						The same login you use at ezetap.com/portal. Stored server-side and never sent to
						the browser. Credentials are verified against the portal before saving.
					</p>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						<input
							type="text"
							value={portalUsername}
							onChange={(e) => setPortalUsername(e.target.value)}
							placeholder="Portal username"
							autoComplete="off"
							className="h-11 rounded-[calc(var(--radius)*0.9)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]/40"
						/>
						<input
							type="password"
							value={portalPassword}
							onChange={(e) => setPortalPassword(e.target.value)}
							placeholder="Portal password"
							autoComplete="new-password"
							className="h-11 rounded-[calc(var(--radius)*0.9)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]/40"
						/>
					</div>
					<div className="mt-4 flex gap-2">
						<Button
							size="sm"
							onClick={handleSaveCredentials}
							disabled={savingCreds || !portalUsername || !portalPassword}
						>
							{savingCreds && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{savingCreds ? 'Verifying' : 'Save & verify'}
						</Button>
						{credentials?.configured && (
							<Button variant="ghost" size="sm" onClick={() => setShowCredForm(false)}>
								Cancel
							</Button>
						)}
					</div>
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

			{/* Summary cards */}
			{summary && (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<SummaryCard
						icon={<IndianRupee className="h-4 w-4" />}
						label="Collected on terminal"
						value={`${currencySymbol}${summary.collected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
						sub={`${summary.successCount} successful`}
					/>
					<SummaryCard
						icon={<XCircle className="h-4 w-4" />}
						label="Failed / expired"
						value={String(summary.failedCount)}
						sub="Not counted as revenue"
					/>
					<SummaryCard
						icon={<Link2 className="h-4 w-4" />}
						label="Matched to orders"
						value={`${summary.matchedCount} / ${summary.matchedCount + summary.unmatchedCount}`}
						sub={`${summary.unmatchedCount} awaiting match`}
					/>
					<SummaryCard
						icon={<AlertTriangle className="h-4 w-4" />}
						label="Orders without payment"
						value={String(summary.ordersWithoutPayment)}
						sub="Non-cash orders, no terminal txn"
						highlight={summary.ordersWithoutPayment > 0}
					/>
				</div>
			)}

			{/* Mode split */}
			{summary && summary.byMode.length > 0 && (
				<div className="flex flex-wrap gap-3">
					{summary.byMode.map((m) => (
						<div
							key={m.mode}
							className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] px-4 py-1.5 text-xs"
						>
							<Smartphone className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
							<span className="font-medium">{m.mode}</span>
							<span className="text-[hsl(var(--muted-foreground))]">
								{m.count} · {currencySymbol}
								{m.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
							</span>
						</div>
					))}
				</div>
			)}

			{/* Transactions */}
			<div className="overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
				{dataLoading ? (
					<div className="flex h-40 items-center justify-center">
						<Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--accent))]" />
					</div>
				) : transactions.length === 0 ? (
					<div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
						<CreditCard className="h-8 w-8 text-[hsl(var(--muted-foreground))]/50" />
						<p className="text-sm text-[hsl(var(--muted-foreground))]">
							{credentials?.configured
								? 'No terminal transactions in this period. Hit “Sync now” to pull the latest.'
								: 'Connect your Ezetap portal login to start pulling terminal payments.'}
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-[hsl(var(--border))] text-left text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
									<th className="px-4 py-3 font-medium">Time</th>
									<th className="px-4 py-3 font-medium">Amount</th>
									<th className="px-4 py-3 font-medium">Mode</th>
									<th className="px-4 py-3 font-medium">Status</th>
									<th className="px-4 py-3 font-medium">Reference</th>
									<th className="px-4 py-3 font-medium">Order</th>
									<th className="px-4 py-3 font-medium"></th>
								</tr>
							</thead>
							<tbody>
								{transactions.map((txn) => (
									<tr
										key={txn.id}
										className="border-b border-[hsl(var(--border))]/50 last:border-0 hover:bg-[hsl(var(--muted))]/30"
									>
										<td className="whitespace-nowrap px-4 py-3 text-[hsl(var(--muted-foreground))]">
											{formatDateTime(txn.txnAt)}
										</td>
										<td className="whitespace-nowrap px-4 py-3 font-medium">
											{currencySymbol}
											{txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
										</td>
										<td className="whitespace-nowrap px-4 py-3">
											<span className="text-[hsl(var(--foreground))]">{txn.mode ?? '—'}</span>
											{txn.cardBrand && (
												<span className="ml-1 text-xs text-[hsl(var(--muted-foreground))]">
													{txn.cardBrand}
													{txn.cardType ? ` ${txn.cardType.toLowerCase()}` : ''}
												</span>
											)}
										</td>
										<td className="whitespace-nowrap px-4 py-3">
											<span
												className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
													isSuccessful(txn.status)
														? 'bg-emerald-500/10 text-emerald-500'
														: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
												}`}
											>
												{isSuccessful(txn.status) ? (
													<CheckCircle2 className="h-3 w-3" />
												) : (
													<XCircle className="h-3 w-3" />
												)}
												{humanStatus(txn.status)}
											</span>
										</td>
										<td className="whitespace-nowrap px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
											{txn.rrn ? `RRN ${txn.rrn}` : txn.authCode ? `Auth ${txn.authCode}` : '—'}
										</td>
										<td className="whitespace-nowrap px-4 py-3">
											{txn.orderId ? (
												<span className="inline-flex items-center gap-1.5 text-xs">
													<Link2 className="h-3 w-3 text-emerald-500" />
													{txn.orderNumber ? `Table ${txn.orderNumber}` : 'Linked'}
													<span className="text-[hsl(var(--muted-foreground))]">
														({txn.matchType})
													</span>
												</span>
											) : (
												<span className="text-xs text-[hsl(var(--muted-foreground))]">
													Unmatched
												</span>
											)}
										</td>
										<td className="whitespace-nowrap px-4 py-3 text-right">
											{txn.orderId ? (
												<button
													onClick={() => handleUnlink(txn)}
													className="inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--accent))]"
												>
													<Unlink className="h-3 w-3" />
													Unlink
												</button>
											) : (
												isSuccessful(txn.status) && (
													<button
														onClick={() => openMatcher(txn)}
														className="inline-flex items-center gap-1 text-xs text-[hsl(var(--accent))] hover:underline"
													>
														<Link2 className="h-3 w-3" />
														Match
													</button>
												)
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* Manual match modal */}
			{matchingTxn && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
					onClick={() => setMatchingTxn(null)}
				>
					<motion.div
						initial={{ opacity: 0, scale: 0.97 }}
						animate={{ opacity: 1, scale: 1 }}
						onClick={(e) => e.stopPropagation()}
						className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
					>
						<div className="border-b border-[hsl(var(--border))] p-5">
							<h2 className="text-base font-semibold">Match payment to order</h2>
							<p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
								{currencySymbol}
								{matchingTxn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ·{' '}
								{matchingTxn.mode} · {formatDateTime(matchingTxn.txnAt)}
							</p>
						</div>

						<div className="max-h-[50vh] overflow-y-auto">
							{candidatesLoading ? (
								<div className="flex h-32 items-center justify-center">
									<Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--accent))]" />
								</div>
							) : candidates.length === 0 ? (
								<p className="p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
									No completed orders within 2 hours of this payment.
								</p>
							) : (
								candidates.map((order) => {
									const exact = Math.abs(order.total - matchingTxn.amount) < 0.01
									return (
										<button
											key={order.id}
											onClick={() => handleLink(order.id)}
											className="flex w-full items-center justify-between border-b border-[hsl(var(--border))]/50 px-5 py-3 text-left last:border-0 hover:bg-[hsl(var(--muted))]/40"
										>
											<div>
												<p className="text-sm font-medium">
													{order.tableNumber ? `Table ${order.tableNumber}` : 'Order'}
													{exact && (
														<span className="ml-2 text-xs text-emerald-500">exact amount</span>
													)}
												</p>
												<p className="text-xs text-[hsl(var(--muted-foreground))]">
													{formatDateTime(order.completedAt)}
												</p>
											</div>
											<span className="text-sm font-medium">
												{currencySymbol}
												{order.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
											</span>
										</button>
									)
								})
							)}
						</div>
					</motion.div>
				</div>
			)}
		</div>
	)
}

function SummaryCard({
	icon,
	label,
	value,
	sub,
	highlight
}: {
	icon: React.ReactNode
	label: string
	value: string
	sub: string
	highlight?: boolean
}) {
	return (
		<div
			className={`rounded-[var(--radius)] border p-4 ${
				highlight
					? 'border-[hsl(var(--accent))]/40 bg-[hsl(var(--accent))]/5'
					: 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'
			}`}
		>
			<div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
				{icon}
				<span className="text-xs font-medium uppercase tracking-wide">{label}</span>
			</div>
			<p className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">{value}</p>
			<p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>
		</div>
	)
}
