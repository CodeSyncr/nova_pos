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
	supplier: {
		id: string
		name: string
	}[] | null
	created_by_profile: {
		id: string
		full_name: string | null
	}[] | null
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
			try {
				const purchasesData = await getPurchases(tenantId)
				setPurchases((purchasesData as Purchase[]) || [])
			} catch (error) {
				console.error('Error refreshing purchases:', error)
			}
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

	// Group purchases by date
	const groupedByDate = purchases.reduce<Record<string, Purchase[]>>((groups, purchase) => {
		const date = purchase.purchase_date
		if (!groups[date]) groups[date] = []
		groups[date].push(purchase)
		return groups
	}, {})

	const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a))

	// Totals
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

			{/* Purchases List - Story-like Cards */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 backdrop-blur-2xl shadow-[0_30px_80px_rgba(4,5,16,0.65)]"
			>
				<div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent" />
				<div className="relative z-10">
					<div className="mb-6 flex items-center gap-4">
						<div className="rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 p-4">
							<ShoppingCart className="h-6 w-6 text-purple-300" />
						</div>
						<div>
							<h2 className="text-2xl font-semibold text-white">
								Purchase History
							</h2>
							<p className="text-sm text-white/60">
								All your stock purchases and receipts
							</p>
						</div>
					</div>
				</div>
			)}

					{purchases.length === 0 ? (
						<div className="text-center py-16">
							<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20">
								<ShoppingCart className="h-10 w-10 text-white/40" />
							</div>
							<h3 className="text-xl font-semibold text-white mb-2">
								No purchases yet
							</h3>
							<p className="text-white/60 max-w-md mx-auto mb-6">
								Create your first purchase to add stock to inventory. Purchases
								automatically update your stock levels.
							</p>
							<Button
								onClick={() => setShowPurchaseForm(true)}
								variant="ghost"
								className="border-white/20"
							>
								<Plus className="mr-2 h-4 w-4" />
								Create Purchase
							</Button>
						</div>
					) : (
						<div className="grid gap-4">
							{purchases.map((purchase) => (
								<motion.div
									key={purchase.id}
									whileHover={{ scale: 1.01 }}
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									className="rounded-xl border border-white/10 bg-gradient-to-br from-black/40 to-black/20 p-6 backdrop-blur-sm hover:border-white/20 transition"
								>
									<div className="flex items-start justify-between">
										<div className="flex-1">
											<div className="flex items-center gap-4 mb-4">
												<div className="rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 p-3">
													<FileText className="h-5 w-5 text-purple-300" />
												</div>
												<div className="flex-1">
													<div className="flex items-center gap-3 mb-2">
														<h3 className="text-xl font-semibold text-white">
															{purchase.invoice_number || 'Purchase'}
														</h3>
														<Badge
															className={`${
																purchase.status === 'completed'
																	? 'border-emerald-400/50 text-emerald-400 bg-emerald-400/10'
																	: purchase.status === 'pending'
																		? 'border-amber-400/50 text-amber-400 bg-amber-400/10'
																		: 'border-red-400/50 text-red-400 bg-red-400/10'
															}`}
														>
															{purchase.status}
														</Badge>
													</div>
													<div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
														<div className="flex items-center gap-2">
															<Calendar className="h-4 w-4" />
															{new Date(
																purchase.purchase_date
															).toLocaleDateString('en-US', {
																year: 'numeric',
																month: 'long',
																day: 'numeric'
															})}
														</div>
														{purchase.supplier?.[0] ? (
															<div className="flex items-center gap-2">
																<Building2 className="h-4 w-4" />
																<span className="text-white/80">
																	{purchase.supplier[0].name}
																</span>
															)
														})()}
														{purchase.created_by_profile && (() => {
															const prof = purchase.created_by_profile
															const name = Array.isArray(prof) ? prof[0]?.full_name : (prof as any)?.full_name
															if (!name) return null
															return (
																<span className="text-xs text-white/40">by {name}</span>
															)
														})()}
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
