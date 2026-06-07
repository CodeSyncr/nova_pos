'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit2, Trash2, Copy, Calendar, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { CouponForm } from './coupon-form'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle
} from '@/components/ui/alert-dialog'

type Coupon = {
	id: string
	code: string
	name: string
	description: string | null
	discount_type: 'percent' | 'fixed'
	discount_value: number
	min_order_amount: number
	max_discount_amount: number | null
	valid_from: string
	valid_until: string
	usage_limit: number | null
	usage_count: number
	per_customer_limit: number
	applicable_to: string[]
	excluded_categories: string[]
	excluded_items: string[]
	is_active: boolean
}

type CouponsTabProps = {
	tenantId: string
	onRefresh: () => void
}

export function CouponsTab({ tenantId, onRefresh }: CouponsTabProps) {
	const [coupons, setCoupons] = useState<Coupon[]>([])
	const [loading, setLoading] = useState(true)
	const [showForm, setShowForm] = useState(false)
	const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
	const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null)

	const loadCoupons = async () => {
		try {
			const supabase = createSupabaseBrowserClient()
			const { data } = await supabase
				.from('coupons')
				.select('*')
				.eq('tenant_id', tenantId)
				.order('created_at', { ascending: false })

			setCoupons((data as Coupon[]) || [])
		} catch (error) {
			console.error('Error loading coupons:', error)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		loadCoupons()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tenantId])

	const handleCopyCode = (code: string) => {
		navigator.clipboard.writeText(code)
		// You could add a toast notification here
	}

	const handleDelete = async () => {
		if (!deletingCoupon) return

		try {
			const supabase = createSupabaseBrowserClient()
			const { error } = await supabase
				.from('coupons')
				.delete()
				.eq('id', deletingCoupon.id)

			if (error) throw error

			setDeletingCoupon(null)
			await loadCoupons()
			onRefresh()
		} catch (error) {
			console.error('Error deleting coupon:', error)
			alert('Failed to delete coupon')
		}
	}

	if (loading) {
		return <p className="text-white/60">Loading coupons...</p>
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold text-white">Discount Coupons</h2>
					<p className="text-sm text-white/60">
						Create and manage discount codes for your customers
					</p>
				</div>
				<Button
					size="sm"
					onClick={() => {
						setEditingCoupon(null)
						setShowForm(true)
					}}
				>
					<Plus className="mr-2 h-4 w-4" />
					New Coupon
				</Button>
			</div>

			{coupons.length === 0 ? (
				<div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
					<p className="text-white/60">No coupons created yet</p>
					<p className="mt-2 text-sm text-white/40">
						Create your first discount coupon to attract customers
					</p>
				</div>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					{coupons.map((coupon) => {
						const isExpired = new Date(coupon.valid_until) < new Date()
						const isActive = coupon.is_active && !isExpired
						const usagePercentage =
							coupon.usage_limit && coupon.usage_limit > 0
								? (coupon.usage_count / coupon.usage_limit) * 100
								: 0

						return (
							<motion.div
								key={coupon.id}
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								className="rounded-xl border border-white/10 bg-black/20 p-6"
							>
								<div className="mb-4 flex items-start justify-between">
									<div className="flex-1">
										<div className="mb-2 flex items-center gap-2">
											<h3 className="text-lg font-semibold text-white">
												{coupon.name}
											</h3>
											<Badge
												className={
													isActive
														? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
														: 'border-red-400/30 bg-red-400/10 text-red-200'
												}
											>
												{isActive ? 'Active' : 'Inactive'}
											</Badge>
										</div>
										<div className="mb-3 flex items-center gap-2">
											<code className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm font-mono text-white">
												{coupon.code}
											</code>
											<Button
												size="icon"
												variant="ghost"
												onClick={() => handleCopyCode(coupon.code)}
												className="h-7 w-7"
											>
												<Copy className="h-3 w-3" />
											</Button>
										</div>
										{coupon.description && (
											<p className="mb-3 text-sm text-white/60">
												{coupon.description}
											</p>
										)}
									</div>
									<div className="flex gap-2">
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setEditingCoupon(coupon)
												setShowForm(true)
											}}
											className="border border-white/15 bg-white/5 text-white/70"
										>
											<Edit2 className="h-4 w-4" />
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setDeletingCoupon(coupon)}
											className="border border-white/15 bg-white/5 text-white/70"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</div>

								<div className="space-y-2">
									<div className="flex items-center gap-2 text-sm">
										<DollarSign className="h-4 w-4 text-emerald-400" />
										<span className="text-white/70">Discount:</span>
										<span className="font-semibold text-white">
											{coupon.discount_type === 'percent'
												? `${coupon.discount_value}%`
												: `₹${coupon.discount_value.toFixed(2)}`}
										</span>
									</div>

									<div className="flex items-center gap-2 text-sm">
										<Calendar className="h-4 w-4 text-blue-400" />
										<span className="text-white/70">Valid:</span>
										<span className="text-white">
											{new Date(coupon.valid_from).toLocaleDateString()} -{' '}
											{new Date(coupon.valid_until).toLocaleDateString()}
										</span>
									</div>

									<div className="text-sm text-white/70">
										Usage: {coupon.usage_count} / {coupon.usage_limit || '∞'}
										{coupon.usage_limit && (
											<div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
												<div
													className="h-full bg-emerald-400 transition-all"
													style={{
														width: `${Math.min(usagePercentage, 100)}%`
													}}
												/>
											</div>
										)}
									</div>
								</div>
							</motion.div>
						)
					})}
				</div>
			)}

			{showForm && (
				<CouponForm
					tenantId={tenantId}
					coupon={editingCoupon}
					onClose={() => {
						setShowForm(false)
						setEditingCoupon(null)
					}}
					onSuccess={() => {
						setShowForm(false)
						setEditingCoupon(null)
						loadCoupons()
						onRefresh()
					}}
				/>
			)}

			{deletingCoupon && (
				<AlertDialog open={!!deletingCoupon}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete Coupon</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to delete "{deletingCoupon.name}"? This
								action cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel onClick={() => setDeletingCoupon(null)}>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction onClick={handleDelete}>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	)
}
