'use client'

import { useEffect, useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import {
	ShoppingCart,
	Plus,
	Calendar,
	Trash2,
	RefreshCw,
	Loader2
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getPurchases, deletePurchase } from '@/app/actions/purchases'
import { PurchaseForm } from '@/components/purchases/purchase-form'

type Purchase = {
	id: string
	purchase_date: string
	invoice_number: string | null
	total_amount: number
	status: string
	notes: string | null
	created_at: string
	supplier_id: string | null
	supplier: { id: string; name: string } | { id: string; name: string }[] | null
	created_by_profile: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null
}

export default function PurchasesPage() {
	const [purchases, setPurchases] = useState<Purchase[]>([])
	const [loading, setLoading] = useState(true)
	const [isRefreshing, startTransition] = useTransition()
	const [showPurchaseForm, setShowPurchaseForm] = useState(false)
	const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null)
	const [tenantId, setTenantId] = useState<string | null>(null)
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	const [deletingId, setDeletingId] = useState<string | null>(null)

	useEffect(() => {
		const loadData = async () => {
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

				const purchasesData = await getPurchases(tid)
				setPurchases((purchasesData as Purchase[]) || [])
			} catch (error) {
				console.error('Error loading purchases:', error)
			} finally {
				setLoading(false)
			}
		}
		loadData()
	}, [])

	const handleRefresh = () => {
		if (!tenantId) return
		startTransition(async () => {
			const purchasesData = await getPurchases(tenantId)
			setPurchases((purchasesData as Purchase[]) || [])
		})
	}

	const handleDelete = async (purchaseId: string) => {
		if (!confirm('Delete this spending entry?')) return
		setDeletingId(purchaseId)
		try {
			await deletePurchase(purchaseId)
			handleRefresh()
		} catch (error) {
			alert(error instanceof Error ? error.message : 'Failed to delete')
		} finally {
			setDeletingId(null)
		}
	}

	const fmt = (n: number) => `${currencySymbol}${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`

	const getSupplierName = (purchase: Purchase): string | null => {
		if (!purchase.supplier) return null
		if (Array.isArray(purchase.supplier)) return purchase.supplier[0]?.name || null
		return (purchase.supplier as { name: string }).name || null
	}

	const getCreatedBy = (purchase: Purchase): string | null => {
		if (!purchase.created_by_profile) return null
		if (Array.isArray(purchase.created_by_profile)) return purchase.created_by_profile[0]?.full_name || null
		return (purchase.created_by_profile as { full_name: string | null }).full_name || null
	}

	// Group purchases by date
	const groupedByDate = purchases.reduce<Record<string, Purchase[]>>((groups, purchase) => {
		const date = purchase.purchase_date
		if (!groups[date]) groups[date] = []
		groups[date].push(purchase)
		return groups
	}, {})

	const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a))
	const totalSpending = purchases.reduce((sum, p) => sum + p.total_amount, 0)

	if (loading) {
		return (
			<div className="flex h-[calc(100vh-120px)] items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-white/40" />
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-6 py-6">
			{/* Header */}
			<header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<Badge className="border-white/20 bg-white/10 text-white/80 mb-2">
						<ShoppingCart className="mr-2 h-4 w-4" /> Spendings
					</Badge>
					<h1 className="text-3xl font-semibold text-white">Purchases & Expenses</h1>
					<p className="text-white/60 text-sm mt-1">Track daily spendings, supplier purchases, and expenses</p>
				</div>
				<div className="flex gap-2">
					<Button onClick={handleRefresh} disabled={isRefreshing} variant="ghost" size="sm" className="border border-white/10">
						<RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
						Refresh
					</Button>
					<Button onClick={() => setShowPurchaseForm(true)} size="sm">
						<Plus className="mr-2 h-4 w-4" />
						Add Spending
					</Button>
				</div>
			</header>

			{/* Summary */}
			{purchases.length > 0 && (
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
					<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
						<p className="text-xs text-white/50">Total Spendings</p>
						<p className="text-2xl font-semibold text-white mt-1">{fmt(totalSpending)}</p>
					</div>
					<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
						<p className="text-xs text-white/50">Entries</p>
						<p className="text-2xl font-semibold text-white mt-1">{purchases.length}</p>
					</div>
					<div className="rounded-2xl border border-white/10 bg-white/5 p-4 hidden sm:block">
						<p className="text-xs text-white/50">Days</p>
						<p className="text-2xl font-semibold text-white mt-1">{sortedDates.length}</p>
					</div>
				</div>
			)}

			{/* Date-wise List */}
			{purchases.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
					<ShoppingCart className="mx-auto h-12 w-12 text-white/20 mb-4" />
					<h3 className="text-lg font-semibold text-white mb-1">No spendings recorded</h3>
					<p className="text-sm text-white/50 mb-4">Add your first expense or purchase to start tracking</p>
					<Button onClick={() => setShowPurchaseForm(true)} size="sm">
						<Plus className="mr-2 h-4 w-4" /> Add Spending
					</Button>
				</div>
			) : (
				<div className="space-y-6">
					{sortedDates.map((date) => {
						const dayPurchases = groupedByDate[date]!
						const dayTotal = dayPurchases.reduce((sum, p) => sum + p.total_amount, 0)
						const formattedDate = new Date(date).toLocaleDateString('en-IN', {
							weekday: 'short',
							day: '2-digit',
							month: 'short',
							year: 'numeric'
						})

						return (
							<div key={date}>
								<div className="flex items-center justify-between mb-3">
									<div className="flex items-center gap-2">
										<Calendar className="h-4 w-4 text-white/40" />
										<h3 className="text-sm font-medium text-white/70">{formattedDate}</h3>
									</div>
									<span className="text-sm font-semibold text-white">{fmt(dayTotal)}</span>
								</div>

								<div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden divide-y divide-white/5">
									{dayPurchases.map((purchase) => {
										const supplierName = getSupplierName(purchase)
										const createdBy = getCreatedBy(purchase)

										return (
											<div key={purchase.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
												<div className="flex-1 min-w-0">
													<p className="text-sm font-medium text-white truncate">
														{purchase.notes || purchase.invoice_number || 'Untitled Expense'}
													</p>
													<div className="flex items-center gap-2 mt-1 flex-wrap">
														{supplierName && (
															<span className="text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">
																{supplierName}
															</span>
														)}
														{createdBy && (
															<span className="text-xs text-white/40">by {createdBy}</span>
														)}
													</div>
												</div>
												<div className="flex items-center gap-2 ml-4">
													<p className="text-sm font-semibold text-white whitespace-nowrap">
														{fmt(purchase.total_amount)}
													</p>
													<button
														onClick={() => {
															setEditingPurchase(purchase)
															setShowPurchaseForm(true)
														}}
														className="text-white/30 hover:text-white transition-colors p-1"
														title="Edit"
													>
														<svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
													</button>
													<button
														onClick={() => handleDelete(purchase.id)}
														disabled={deletingId === purchase.id}
														className="text-white/30 hover:text-red-400 transition-colors p-1"
														title="Delete"
													>
														{deletingId === purchase.id
															? <Loader2 className="h-3.5 w-3.5 animate-spin" />
															: <Trash2 className="h-3.5 w-3.5" />
														}
													</button>
												</div>
											</div>
										)
									})}
								</div>
							</div>
						)
					})}
				</div>
			)}

			{/* Purchase Form */}
			{showPurchaseForm && tenantId && (
				<PurchaseForm
					tenantId={tenantId}
					purchase={editingPurchase}
					onClose={() => {
						setShowPurchaseForm(false)
						setEditingPurchase(null)
					}}
					onSuccess={() => {
						setShowPurchaseForm(false)
						setEditingPurchase(null)
						handleRefresh()
					}}
				/>
			)}
		</div>
	)
}
