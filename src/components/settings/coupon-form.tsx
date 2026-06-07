'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createOrUpdateCoupon } from '@/app/actions/settings'

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
	per_customer_limit: number
	applicable_to: string[]
	excluded_categories: string[]
	excluded_items: string[]
	is_active: boolean
}

type CouponFormProps = {
	tenantId: string
	coupon: Coupon | null
	onClose: () => void
	onSuccess: () => void
}

export function CouponForm({
	tenantId,
	coupon,
	onClose,
	onSuccess
}: CouponFormProps) {
	const [formData, setFormData] = useState({
		code: coupon?.code || '',
		name: coupon?.name || '',
		description: coupon?.description || '',
		discount_type: coupon?.discount_type || ('percent' as 'percent' | 'fixed'),
		discount_value: coupon?.discount_value || 0,
		min_order_amount: coupon?.min_order_amount || 0,
		max_discount_amount: coupon?.max_discount_amount || null,
		valid_from: coupon?.valid_from
			? new Date(coupon.valid_from).toISOString().slice(0, 16)
			: new Date().toISOString().slice(0, 16),
		valid_until: coupon?.valid_until
			? new Date(coupon.valid_until).toISOString().slice(0, 16)
			: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
					.toISOString()
					.slice(0, 16),
		usage_limit: coupon?.usage_limit || null,
		per_customer_limit: coupon?.per_customer_limit || 1,
		applicable_to: coupon?.applicable_to || ['dine_in', 'takeout', 'delivery'],
		excluded_categories: coupon?.excluded_categories || [],
		excluded_items: coupon?.excluded_items || [],
		is_active: coupon?.is_active ?? true
	})
	const [saving, setSaving] = useState(false)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		try {
			await createOrUpdateCoupon(tenantId, coupon?.id || null, {
				...formData,
				valid_from: new Date(formData.valid_from).toISOString(),
				valid_until: new Date(formData.valid_until).toISOString(),
				usage_limit: formData.usage_limit || null,
				max_discount_amount: formData.max_discount_amount || null
			})
			onSuccess()
		} catch (error) {
			console.error('Error saving coupon:', error)
			alert('Failed to save coupon')
		} finally {
			setSaving(false)
		}
	}

	if (!mounted) return null

	const modalContent = (
		<div className="fixed inset-0 z-[9999]">
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>
			<motion.div
				initial={{ opacity: 0, x: 80 }}
				animate={{ opacity: 1, x: 0 }}
				exit={{ opacity: 0, x: 80 }}
				className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 shadow-[0_40px_120px_rgba(3,5,18,0.85)]"
			>
				<div className="flex items-center justify-between mb-6">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-white/50">
							Discount coupons
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							{coupon ? 'Edit Coupon' : 'New Coupon'}
						</h2>
					</div>
					<button
						onClick={onClose}
						className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<h2 className="mb-6 text-2xl font-semibold text-white">
					{coupon ? 'Edit Coupon' : 'New Coupon'}
				</h2>

				<form onSubmit={handleSubmit} className="space-y-6 pb-6">
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Coupon Code *
							</label>
							<input
								type="text"
								value={formData.code}
								onChange={(e) =>
									setFormData({
										...formData,
										code: e.target.value.toUpperCase()
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="SAVE20"
								required
							/>
						</div>

						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Coupon Name *
							</label>
							<input
								type="text"
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="Summer Sale"
								required
							/>
						</div>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-white">
							Description
						</label>
						<textarea
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							rows={2}
							placeholder="Describe this coupon..."
						/>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Discount Type *
							</label>
							<select
								value={formData.discount_type}
								onChange={(e) =>
									setFormData({
										...formData,
										discount_type: e.target.value as 'percent' | 'fixed'
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white focus:border-white/30 focus:outline-none"
							>
								<option value="percent">Percentage</option>
								<option value="fixed">Fixed Amount</option>
							</select>
						</div>

						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Discount Value *
							</label>
							<input
								type="number"
								step="0.01"
								min="0"
								max={formData.discount_type === 'percent' ? 100 : undefined}
								value={formData.discount_value}
								onChange={(e) =>
									setFormData({
										...formData,
										discount_value: Number(e.target.value)
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder={
									formData.discount_type === 'percent' ? '20' : '50.00'
								}
								required
							/>
						</div>
					</div>

					{formData.discount_type === 'percent' && (
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Max Discount Amount (optional)
							</label>
							<input
								type="number"
								step="0.01"
								min="0"
								value={formData.max_discount_amount || ''}
								onChange={(e) =>
									setFormData({
										...formData,
										max_discount_amount: e.target.value
											? Number(e.target.value)
											: null
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="Leave empty for no limit"
							/>
							<p className="mt-1 text-xs text-white/60">
								Maximum discount amount (caps the percentage discount)
							</p>
						</div>
					)}

					<div>
						<label className="mb-2 block text-sm font-medium text-white">
							Minimum Order Amount
						</label>
						<input
							type="number"
							step="0.01"
							min="0"
							value={formData.min_order_amount}
							onChange={(e) =>
								setFormData({
									...formData,
									min_order_amount: Number(e.target.value)
								})
							}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="0"
						/>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Valid From *
							</label>
							<input
								type="datetime-local"
								value={formData.valid_from}
								onChange={(e) =>
									setFormData({ ...formData, valid_from: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white focus:border-white/30 focus:outline-none"
								required
							/>
						</div>

						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Valid Until *
							</label>
							<input
								type="datetime-local"
								value={formData.valid_until}
								onChange={(e) =>
									setFormData({ ...formData, valid_until: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white focus:border-white/30 focus:outline-none"
								required
							/>
						</div>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Usage Limit
							</label>
							<input
								type="number"
								min="0"
								value={formData.usage_limit || ''}
								onChange={(e) =>
									setFormData({
										...formData,
										usage_limit: e.target.value ? Number(e.target.value) : null
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="Leave empty for unlimited"
							/>
						</div>

						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Per Customer Limit
							</label>
							<input
								type="number"
								min="1"
								value={formData.per_customer_limit}
								onChange={(e) =>
									setFormData({
										...formData,
										per_customer_limit: Number(e.target.value)
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="1"
							/>
						</div>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-white">
							Applicable To
						</label>
						<div className="flex flex-wrap gap-2">
							{['dine_in', 'takeout', 'delivery'].map((type) => (
								<label
									key={type}
									className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10"
								>
									<input
										type="checkbox"
										checked={formData.applicable_to.includes(type)}
										onChange={(e) => {
											if (e.target.checked) {
												setFormData({
													...formData,
													applicable_to: [...formData.applicable_to, type]
												})
											} else {
												setFormData({
													...formData,
													applicable_to: formData.applicable_to.filter(
														(t) => t !== type
													)
												})
											}
										}}
										className="rounded border-white/20"
									/>
									<span className="capitalize">{type.replace('_', ' ')}</span>
								</label>
							))}
						</div>
					</div>

					<div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
						<div>
							<label className="text-sm font-medium text-white">
								Active Status
							</label>
							<p className="text-xs text-white/60">
								Enable or disable this coupon
							</p>
						</div>
						<label className="relative inline-flex cursor-pointer items-center">
							<input
								type="checkbox"
								checked={formData.is_active}
								onChange={(e) =>
									setFormData({ ...formData, is_active: e.target.checked })
								}
								className="peer sr-only"
							/>
							<div className="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-white/20 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none"></div>
						</label>
					</div>

					<div className="flex justify-end gap-3">
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving
								? 'Saving...'
								: coupon
									? 'Update Coupon'
									: 'Create Coupon'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)

	return createPortal(modalContent, document.body)
}
