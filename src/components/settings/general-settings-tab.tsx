'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, Globe, Percent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { updateTenantSettings } from '@/app/actions/settings'

type Tenant = {
	id: string
	name: string
	settings: Record<string, unknown> | null
}

type GeneralSettingsTabProps = {
	tenant: Tenant
	onRefresh: () => void
}

export function GeneralSettingsTab({
	tenant,
	onRefresh
}: GeneralSettingsTabProps) {
	const settings = tenant.settings || {}
	const [formData, setFormData] = useState({
		currency: (settings.currency as string) || 'INR',
		currencySymbol: (settings.currencySymbol as string) || '₹',
		locale: (settings.locale as string) || 'en-IN',
		timezone: (settings.timezone as string) || 'Asia/Kolkata',
		taxRate: (settings.taxRate as number) || 0
	})
	const [saving, setSaving] = useState(false)
	const { success, error: showError } = useToast()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		try {
			await updateTenantSettings(tenant.id, formData)
			success('Settings saved successfully!')
			onRefresh()
		} catch (error) {
			console.error('Error updating settings:', error)
			showError('Failed to update settings')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-xl font-semibold text-white">General Settings</h2>
				<p className="text-sm text-white/60">
					Configure core business settings for your restaurant
				</p>
			</div>

			<form onSubmit={handleSubmit} className="space-y-6">
				<div className="grid gap-6 md:grid-cols-2">
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						className="rounded-xl border border-white/10 bg-black/20 p-6"
					>
						<div className="mb-4 flex items-center gap-3">
							<Globe className="h-5 w-5 text-blue-400" />
							<h3 className="text-lg font-semibold text-white">Locale</h3>
						</div>
						<div className="space-y-4">
							<div>
								<label className="mb-2 block text-sm font-medium text-white">
									Language & Region
								</label>
								<input
									type="text"
									value={formData.locale}
									onChange={(e) =>
										setFormData({ ...formData, locale: e.target.value })
									}
									className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="en-IN"
								/>
								<p className="mt-1 text-xs text-white/60">
									Locale code (e.g., en-IN, en-US)
								</p>
							</div>
							<div>
								<label className="mb-2 block text-sm font-medium text-white">
									Timezone
								</label>
								<input
									type="text"
									value={formData.timezone}
									onChange={(e) =>
										setFormData({ ...formData, timezone: e.target.value })
									}
									className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="Asia/Kolkata"
								/>
								<p className="mt-1 text-xs text-white/60">
									IANA timezone identifier
								</p>
							</div>
						</div>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						className="rounded-xl border border-white/10 bg-black/20 p-6"
					>
						<div className="mb-4 flex items-center gap-3">
							<Percent className="h-5 w-5 text-purple-400" />
							<h3 className="text-lg font-semibold text-white">Tax</h3>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Tax Rate (%)
							</label>
							<input
								type="number"
								step="0.01"
								min="0"
								max="100"
								value={formData.taxRate}
								onChange={(e) =>
									setFormData({ ...formData, taxRate: Number(e.target.value) })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="5"
							/>
							<p className="mt-1 text-xs text-white/60">
								Default tax rate applied to orders
							</p>
						</div>
					</motion.div>

				</div>

				<div className="flex justify-end">
					<Button type="submit" disabled={saving} size="lg">
						<Save className="mr-2 h-4 w-4" />
						{saving ? 'Saving...' : 'Save Settings'}
					</Button>
				</div>
			</form>
		</div>
	)
}
