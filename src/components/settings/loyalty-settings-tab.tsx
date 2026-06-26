'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit2, Trash2, Gift, TrendingUp, Users, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { LoyaltySettingsForm } from './loyalty-settings-form'
import { LoyaltyTierForm } from './loyalty-tier-form'
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

type LoyaltySettings = {
	tenant_id: string
	enabled: boolean
	earn_rate: number
	redeem_rate: number
	min_redeem_points: number
	expiry_days: number | null
	auto_enroll: boolean
	rules: string[]
}

type LoyaltyTier = {
	id: string
	name: string
	min_points: number
	benefits: Record<string, unknown>
}

type LoyaltySettingsTabProps = {
	tenantId: string
	onRefresh: () => void
}

function renderBenefitsSummary(benefits: any) {
	if (!benefits || Object.keys(benefits).length === 0) {
		return <p className="mt-1 text-xs text-white/40 italic">No custom benefits</p>
	}

	const parts: string[] = []

	if (benefits.points_multiplier && benefits.points_multiplier !== 1) {
		parts.push(`⚡ ${benefits.points_multiplier}x Points Booster`)
	}

	if (benefits.earn_rate_override) {
		parts.push(`🪙 Earn: ${benefits.earn_rate_override} pts/₹`)
	}

	if (benefits.redeem_rate_override) {
		parts.push(`💵 Redeem: ₹${benefits.redeem_rate_override}/pt`)
	}

	if (benefits.baseline_discount_pct) {
		parts.push(`🏷️ ${benefits.baseline_discount_pct}% Off Baseline`)
	}

	if (Array.isArray(benefits.amount_discounts) && benefits.amount_discounts.length > 0) {
		const rulesStr = benefits.amount_discounts
			.map((r: any) => `₹${r.min_amount}➔${r.discount_pct}%`)
			.join(', ')
		parts.push(`📈 Amount: [${rulesStr}]`)
	}

	if (parts.length === 0) {
		return <p className="mt-1 text-xs text-white/40 italic">No custom benefits configured</p>
	}

	return (
		<div className="mt-2 flex flex-wrap gap-1.5">
			{parts.map((p, idx) => (
				<Badge key={idx} className="border border-white/10 bg-white/5 text-[11px] px-2 py-0.5 text-white/70">
					{p}
				</Badge>
			))}
		</div>
	)
}

export function LoyaltySettingsTab({
	tenantId,
	onRefresh
}: LoyaltySettingsTabProps) {
	const [settings, setSettings] = useState<LoyaltySettings | null>(null)
	const [tiers, setTiers] = useState<LoyaltyTier[]>([])
	const [loading, setLoading] = useState(true)
	const [showSettingsForm, setShowSettingsForm] = useState(false)
	const [showTierForm, setShowTierForm] = useState(false)
	const [editingTier, setEditingTier] = useState<LoyaltyTier | null>(null)
	const [deletingTier, setDeletingTier] = useState<LoyaltyTier | null>(null)

	const loadData = async () => {
		try {
			const supabase = createSupabaseBrowserClient()

			// Load settings
			const { data: settingsData } = await supabase
				.from('tenant_loyalty_settings')
				.select('*')
				.eq('tenant_id', tenantId)
				.single()

			if (settingsData) {
				setSettings({
					...(settingsData as LoyaltySettings),
					rules: (settingsData as any).rules || []
				})
			} else {
				// Create default settings
				const { data: newSettings } = await supabase
					.from('tenant_loyalty_settings')
					.insert({
						tenant_id: tenantId,
						enabled: true,
						earn_rate: 1.0,
						redeem_rate: 1.0,
						min_redeem_points: 100,
						auto_enroll: true,
						rules: []
					})
					.select()
					.single()

				if (newSettings) {
					setSettings({
						...(newSettings as LoyaltySettings),
						rules: (newSettings as any).rules || []
					})
				}
			}

			// Load tiers
			const { data: tiersData } = await supabase
				.from('loyalty_tiers')
				.select('*')
				.eq('tenant_id', tenantId)
				.order('min_points', { ascending: true })

			setTiers((tiersData as LoyaltyTier[]) || [])
		} catch (error) {
			console.error('Error loading loyalty data:', error)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		loadData()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tenantId])

	const handleDeleteTier = async () => {
		if (!deletingTier) return

		try {
			const supabase = createSupabaseBrowserClient()
			const { error } = await supabase
				.from('loyalty_tiers')
				.delete()
				.eq('id', deletingTier.id)

			if (error) throw error

			setDeletingTier(null)
			loadData()
			onRefresh()
		} catch (error) {
			console.error('Error deleting tier:', error)
			alert('Failed to delete tier')
		}
	}

	if (loading) {
		return <p className="text-white/60">Loading loyalty settings...</p>
	}

	return (
		<div className="space-y-6">
			{/* Settings Section */}
			<div className="rounded-2xl border border-white/10 bg-white/5 p-6">
				<div className="mb-4 flex items-center justify-between">
					<div>
						<h2 className="text-xl font-semibold text-white">
							Loyalty Program Settings
						</h2>
						<p className="text-sm text-white/60">
							Configure how customers earn and redeem points
						</p>
					</div>
					<Button
						size="sm"
						onClick={() => setShowSettingsForm(true)}
						variant="ghost"
					>
						<Edit2 className="mr-2 h-4 w-4" />
						Edit Settings
					</Button>
				</div>

				{settings && (
					<div className="grid gap-4 md:grid-cols-2">
						<div className="rounded-xl border border-white/10 bg-black/20 p-4">
							<div className="mb-2 flex items-center gap-2">
								<Gift className="h-4 w-4 text-[#E0342A]" />
								<span className="text-sm font-medium text-white/70">
									Program Status
								</span>
							</div>
							<Badge
								className={
									settings.enabled
										? 'border-white/20 bg-white/10 text-white'
										: 'border-[#E0342A]/30 bg-[#E0342A]/10 text-[#E0342A]'
								}
							>
								{settings.enabled ? 'Enabled' : 'Disabled'}
							</Badge>
						</div>

						<div className="rounded-xl border border-white/10 bg-black/20 p-4">
							<div className="mb-2 flex items-center gap-2">
								<TrendingUp className="h-4 w-4 text-white/50" />
								<span className="text-sm font-medium text-white/70">
									Earn Rate
								</span>
							</div>
							<p className="text-lg font-semibold text-white">
								{settings.earn_rate} points per currency unit
							</p>
						</div>

						<div className="rounded-xl border border-white/10 bg-black/20 p-4">
							<div className="mb-2 flex items-center gap-2">
								<Gift className="h-4 w-4 text-white/50" />
								<span className="text-sm font-medium text-white/70">
									Redeem Rate
								</span>
							</div>
							<p className="text-lg font-semibold text-white">
								{settings.redeem_rate} currency per point
							</p>
						</div>

						<div className="rounded-xl border border-white/10 bg-black/20 p-4">
							<div className="mb-2 flex items-center gap-2">
								<Users className="h-4 w-4 text-white/50" />
								<span className="text-sm font-medium text-white/70">
									Minimum Redeem
								</span>
							</div>
							<p className="text-lg font-semibold text-white">
								{settings.min_redeem_points} points
							</p>
						</div>

						<div className="md:col-span-2 rounded-xl border border-white/10 bg-black/20 p-4">
							<div className="mb-3 flex items-center gap-2">
								<FileText className="h-4 w-4 text-[#E0342A]" />
								<span className="text-sm font-medium text-white/70">
									Custom Membership Card Rules (T&C)
								</span>
							</div>
							{settings.rules && settings.rules.length > 0 ? (
								<ul className="list-disc pl-5 space-y-1.5 text-sm text-white/80">
									{settings.rules.map((rule, idx) => (
										<li key={idx}>{rule}</li>
									))}
								</ul>
							) : (
								<p className="text-sm text-white/40 italic">
									No custom rules added. Default earning/redemption rules will be displayed on the membership card page.
								</p>
							)}
						</div>
					</div>
				)}
			</div>

			{/* Tiers Section */}
			<div className="rounded-2xl border border-white/10 bg-white/5 p-6">
				<div className="mb-4 flex items-center justify-between">
					<div>
						<h2 className="text-xl font-semibold text-white">Loyalty Tiers</h2>
						<p className="text-sm text-white/60">
							Define reward tiers based on point thresholds
						</p>
					</div>
					<Button
						size="sm"
						onClick={() => {
							setEditingTier(null)
							setShowTierForm(true)
						}}
					>
						<Plus className="mr-2 h-4 w-4" />
						New Tier
					</Button>
				</div>

				<div className="space-y-3">
					{tiers.length === 0 ? (
						<div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
							<p className="text-white/60">No loyalty tiers configured</p>
							<p className="mt-2 text-sm text-white/40">
								Create tiers to reward your most loyal customers
							</p>
						</div>
					) : (
						tiers.map((tier) => (
							<motion.div
								key={tier.id}
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-4"
							>
								<div className="flex-1">
									<div className="flex items-center gap-3">
										<h3 className="text-lg font-semibold text-white">
											{tier.name}
										</h3>
										<Badge className="border-white/20 bg-white/10 text-white/80">
											{tier.min_points.toLocaleString()} points
										</Badge>
									</div>
									{renderBenefitsSummary(tier.benefits)}
								</div>
								<div className="flex gap-2">
									<Button
										size="sm"
										variant="ghost"
										onClick={() => {
											setEditingTier(tier)
											setShowTierForm(true)
										}}
										className="border border-white/15 bg-white/5 text-white/70"
									>
										<Edit2 className="h-4 w-4" />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setDeletingTier(tier)}
										className="border border-white/15 bg-white/5 text-white/70"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</motion.div>
						))
					)}
				</div>
			</div>

			{/* Forms */}
			{showSettingsForm && settings && (
				<LoyaltySettingsForm
					settings={settings}
					onClose={() => setShowSettingsForm(false)}
					onSuccess={() => {
						setShowSettingsForm(false)
						loadData()
						onRefresh()
					}}
				/>
			)}

			{showTierForm && (
				<LoyaltyTierForm
					tenantId={tenantId}
					tier={editingTier}
					onClose={() => {
						setShowTierForm(false)
						setEditingTier(null)
					}}
					onSuccess={() => {
						setShowTierForm(false)
						setEditingTier(null)
						loadData()
						onRefresh()
					}}
				/>
			)}

			{deletingTier && (
				<AlertDialog open={!!deletingTier}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete Loyalty Tier</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to delete "{deletingTier.name}"? This
								action cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel onClick={() => setDeletingTier(null)}>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction onClick={handleDeleteTier}>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	)
}
