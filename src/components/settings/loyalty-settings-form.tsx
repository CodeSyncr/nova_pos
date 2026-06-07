'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateLoyaltySettings } from '@/app/actions/settings'

type LoyaltySettings = {
	tenant_id: string
	enabled: boolean
	earn_rate: number
	redeem_rate: number
	min_redeem_points: number
	expiry_days: number | null
	auto_enroll: boolean
}

type LoyaltySettingsFormProps = {
	settings: LoyaltySettings
	onClose: () => void
	onSuccess: () => void
}

export function LoyaltySettingsForm({
	settings,
	onClose,
	onSuccess
}: LoyaltySettingsFormProps) {
	const [formData, setFormData] = useState({
		enabled: settings.enabled,
		earn_rate: settings.earn_rate,
		redeem_rate: settings.redeem_rate,
		min_redeem_points: settings.min_redeem_points,
		expiry_days: settings.expiry_days || '',
		auto_enroll: settings.auto_enroll
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
			await updateLoyaltySettings(settings.tenant_id, {
				...formData,
				expiry_days: formData.expiry_days ? Number(formData.expiry_days) : null
			})
			onSuccess()
		} catch (error) {
			console.error('Error updating settings:', error)
			alert('Failed to update settings')
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
				className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 shadow-[0_40px_120px_rgba(3,5,18,0.85)]"
			>
				<div className="flex items-center justify-between mb-6">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-white/50">
							Loyalty program
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							Edit Loyalty Settings
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
					Edit Loyalty Settings
				</h2>

				<form onSubmit={handleSubmit} className="space-y-6 pb-6">
					<div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
						<div>
							<label className="text-sm font-medium text-white">
								Enable Loyalty Program
							</label>
							<p className="text-xs text-white/60">
								Allow customers to earn and redeem points
							</p>
						</div>
						<label className="relative inline-flex cursor-pointer items-center">
							<input
								type="checkbox"
								checked={formData.enabled}
								onChange={(e) =>
									setFormData({ ...formData, enabled: e.target.checked })
								}
								className="peer sr-only"
							/>
							<div className="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-white/20 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none"></div>
						</label>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Earn Rate
							</label>
							<input
								type="number"
								step="0.01"
								min="0"
								value={formData.earn_rate}
								onChange={(e) =>
									setFormData({
										...formData,
										earn_rate: Number(e.target.value)
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="1.0"
							/>
							<p className="mt-1 text-xs text-white/60">
								Points earned per currency unit spent
							</p>
						</div>

						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Redeem Rate
							</label>
							<input
								type="number"
								step="0.01"
								min="0"
								value={formData.redeem_rate}
								onChange={(e) =>
									setFormData({
										...formData,
										redeem_rate: Number(e.target.value)
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="1.0"
							/>
							<p className="mt-1 text-xs text-white/60">
								Currency value per point redeemed
							</p>
						</div>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-white">
							Minimum Redeem Points
						</label>
						<input
							type="number"
							min="0"
							value={formData.min_redeem_points}
							onChange={(e) =>
								setFormData({
									...formData,
									min_redeem_points: Number(e.target.value)
								})
							}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="100"
						/>
						<p className="mt-1 text-xs text-white/60">
							Minimum points required to redeem
						</p>
					</div>

					<div>
						<label className="mb-2 block text-sm font-medium text-white">
							Points Expiry (days)
						</label>
						<input
							type="number"
							min="0"
							value={formData.expiry_days}
							onChange={(e) =>
								setFormData({
									...formData,
									expiry_days: e.target.value ? Number(e.target.value) : ''
								})
							}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="Leave empty for no expiry"
						/>
						<p className="mt-1 text-xs text-white/60">
							Number of days before points expire (leave empty for no expiry)
						</p>
					</div>

					<div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
						<div>
							<label className="text-sm font-medium text-white">
								Auto-enroll Customers
							</label>
							<p className="text-xs text-white/60">
								Automatically enroll customers in loyalty program
							</p>
						</div>
						<label className="relative inline-flex cursor-pointer items-center">
							<input
								type="checkbox"
								checked={formData.auto_enroll}
								onChange={(e) =>
									setFormData({ ...formData, auto_enroll: e.target.checked })
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
							{saving ? 'Saving...' : 'Save Changes'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)

	return createPortal(modalContent, document.body)
}
