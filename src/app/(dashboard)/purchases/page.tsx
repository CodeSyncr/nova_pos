'use client'

import { useEffect, useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import {
	ShoppingCart,
	Plus,
	Calendar,
	FileText,
	Building2,
	Trash2,
	RefreshCw
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

	useEffect(() => {
		const loadData = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const {
					data: { user }
				} = await supabase.auth.getUser()

				if (!user) return

				const { data: profileTenant } = await supabase
					.from('profile_tenants')
					.select('tenant_id')
					.eq('profile_id', user.id)
					.single()

				if (!profileTenant) return

				const tid = profileTenant.tenant_id
				setTenantId(tid)

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
		if (!confirm('Are you sure you want to delete this purchase?')) return

		try {
			await deletePurchase(purchaseId)
			handleRefresh()
		} catch (error) {
			console.error('Error deleting purchase:', error)
			alert(
				error instanceof Error ? error.message : 'Failed to delete purchase'
			)
		}
	}

	if (loading) {
		return (
			<div className="flex h-[calc(100vh-120px)] items-center justify-center">
				<div className="text-center">
					<div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white/60 mx-auto" />
					<p className="text-white/60">Loading purchases...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-8 py-6">
			{/* Hero Header */}
			<motion.header
				initial={{ opacity: 0, y: -20 }}
				animate={{ opacity: 1, y: 0 }}
				className="space-y-4"
			>
				<Badge className="border-white/20 bg-white/10 text-white/80">
					<ShoppingCart className="mr-2 h-4 w-4" /> Purchase Hub
				</Badge>
				<h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
					Restock your universe
				</h1>
				<p className="max-w-2xl text-lg text-white/70">
					Create purchases to add stock, track suppliers, and maintain your
					inventory levels. Every purchase automatically updates your stock.
				</p>
				<div className="flex gap-3">
					<Button
						onClick={handleRefresh}
						disabled={isRefreshing}
						variant="ghost"
						className="border border-white/20"
					>
						<RefreshCw
							className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
						/>
						Refresh
					</Button>
					<Button onClick={() => setShowPurchaseForm(true)}>
						<Plus className="mr-2 h-4 w-4" />
						New Purchase
					</Button>
				</div>
			</motion.header>

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
															</div>
														) : (
															<span className="text-white/40">
																Local Purchase
															</span>
														)}
														<span className="text-white/40">
															by{' '}
															{purchase.created_by_profile?.[0]?.full_name ||
																'System'}
														</span>
													</div>
													{purchase.notes && (
														<p className="text-sm text-white/60 mt-3 pl-2 border-l-2 border-white/10">
															{purchase.notes}
														</p>
													)}
												</div>
											</div>
										</div>
										<div className="flex flex-col items-end gap-3 ml-6">
											<div className="text-right">
												<p className="text-3xl font-bold text-white">
													₹{purchase.total_amount.toFixed(2)}
												</p>
												<p className="text-xs text-white/50 mt-1">
													Total Amount
												</p>
											</div>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => handleDelete(purchase.id)}
												className="border border-red-400/20 bg-red-400/10 text-red-300 hover:bg-red-400/20"
											>
												<Trash2 className="h-3 w-3 mr-1" />
												Delete
											</Button>
										</div>
									</div>
								</motion.div>
							))}
						</div>
					)}
				</div>
			</motion.div>

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
