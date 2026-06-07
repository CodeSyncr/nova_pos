'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createOrUpdateLoyaltyTier } from '@/app/actions/settings'

type LoyaltyTier = {
	id: string
	name: string
	min_points: number
	benefits: Record<string, unknown>
}

type LoyaltyTierFormProps = {
	tenantId: string
	tier: LoyaltyTier | null
	onClose: () => void
	onSuccess: () => void
}

export function LoyaltyTierForm({
	tenantId,
	tier,
	onClose,
	onSuccess
}: LoyaltyTierFormProps) {
	const [formData, setFormData] = useState({
		name: tier?.name || '',
		min_points: tier?.min_points || 0,
		benefits: tier?.benefits || {}
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
			await createOrUpdateLoyaltyTier(tenantId, tier?.id || null, formData)
			onSuccess()
		} catch (error) {
			console.error('Error saving tier:', error)
			alert('Failed to save tier')
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
				className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 shadow-[0_40px_120px_rgba(3,5,18,0.85)]"
			>
				<div className="flex items-center justify-between mb-6">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-white/50">
							Loyalty tiers
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							{tier ? 'Edit Loyalty Tier' : 'New Loyalty Tier'}
						</h2>
					</div>
					<button
						onClick={onClose}
						className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-6 pb-6">
					<div>
						<label className="mb-2 block text-sm font-medium text-white">
							Tier Name
						</label>
						<input
							type="text"
							value={formData.name}
							onChange={(e) =>
								setFormData({ ...formData, name: e.target.value })
							}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="e.g., Gold, Platinum, VIP"
							required
						/>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-white">
							Minimum Points
						</label>
						<input
							type="number"
							min="0"
							value={formData.min_points}
							onChange={(e) =>
								setFormData({
									...formData,
									min_points: Number(e.target.value)
								})
							}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="0"
							required
						/>
						<p className="mt-1 text-xs text-white/60">
							Points required to reach this tier
						</p>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-white">
							Benefits (JSON)
						</label>
						<textarea
							value={JSON.stringify(formData.benefits, null, 2)}
							onChange={(e) => {
								try {
									const parsed = JSON.parse(e.target.value)
									setFormData({ ...formData, benefits: parsed })
								} catch {
									// Invalid JSON, ignore
								}
							}}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 font-mono text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							rows={4}
							placeholder='{"discount": 0.05, "free_delivery": true}'
						/>
						<p className="mt-1 text-xs text-white/60">
							JSON object describing tier benefits
						</p>
					</div>

					<div className="flex justify-end gap-3">
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? 'Saving...' : tier ? 'Update Tier' : 'Create Tier'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)

	return createPortal(modalContent, document.body)
}
