'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Plus, Trash2, Shield, Settings, Info } from 'lucide-react'
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
	const [name, setName] = useState(tier?.name || '')
	const [minPoints, setMinPoints] = useState(tier?.min_points || 0)

	const benefits = tier?.benefits || {}

	// Visual benefits states
	const [pointsMultiplier, setPointsMultiplier] = useState<number>(
		typeof benefits.points_multiplier === 'number' ? benefits.points_multiplier : 1.0
	)
	const [hasEarnOverride, setHasEarnOverride] = useState<boolean>(
		typeof benefits.earn_rate_override === 'number'
	)
	const [earnRateOverride, setEarnRateOverride] = useState<string>(
		typeof benefits.earn_rate_override === 'number' ? benefits.earn_rate_override.toString() : ''
	)
	const [hasRedeemOverride, setHasRedeemOverride] = useState<boolean>(
		typeof benefits.redeem_rate_override === 'number'
	)
	const [redeemRateOverride, setRedeemRateOverride] = useState<string>(
		typeof benefits.redeem_rate_override === 'number' ? benefits.redeem_rate_override.toString() : ''
	)
	const [baselineDiscountPct, setBaselineDiscountPct] = useState<string>(
		typeof benefits.baseline_discount_pct === 'number' ? benefits.baseline_discount_pct.toString() : ''
	)
	const [amountDiscounts, setAmountDiscounts] = useState<Array<{ min_amount: number; discount_pct: number }>>(
		Array.isArray(benefits.amount_discounts) ? benefits.amount_discounts : []
	)

	// Editor tab selection
	const [isAdvanced, setIsAdvanced] = useState<boolean>(false)
	const [rawJson, setRawJson] = useState<string>(JSON.stringify(benefits, null, 2))

	const [saving, setSaving] = useState(false)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	const handleAddAmountDiscount = () => {
		setAmountDiscounts([...amountDiscounts, { min_amount: 1000, discount_pct: 5 }])
	}

	const handleRemoveAmountDiscount = (idx: number) => {
		setAmountDiscounts(amountDiscounts.filter((_, i) => i !== idx))
	}

	const handleAmountDiscountChange = (idx: number, field: 'min_amount' | 'discount_pct', val: number) => {
		const newRules = [...amountDiscounts]
		newRules[idx] = {
			...newRules[idx]!,
			[field]: val
		}
		setAmountDiscounts(newRules)
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		let finalBenefits: Record<string, unknown> = {}

		if (isAdvanced) {
			try {
				finalBenefits = JSON.parse(rawJson)
			} catch {
				alert('Invalid JSON in Advanced Mode. Please fix it or switch back to the Visual Designer.')
				setSaving(false)
				return
			}
		} else {
			finalBenefits.points_multiplier = Number(pointsMultiplier)
			if (hasEarnOverride && earnRateOverride) {
				finalBenefits.earn_rate_override = parseFloat(earnRateOverride)
			}
			if (hasRedeemOverride && redeemRateOverride) {
				finalBenefits.redeem_rate_override = parseFloat(redeemRateOverride)
			}
			if (baselineDiscountPct && parseFloat(baselineDiscountPct) > 0) {
				finalBenefits.baseline_discount_pct = parseFloat(baselineDiscountPct)
			}
			if (amountDiscounts.length > 0) {
				finalBenefits.amount_discounts = amountDiscounts
					.filter((r) => r.min_amount > 0 && r.discount_pct > 0)
					.map((r) => ({
						min_amount: Number(r.min_amount),
						discount_pct: Number(r.discount_pct)
					}))
			}
		}

		try {
			await createOrUpdateLoyaltyTier(tenantId, tier?.id || null, {
				name,
				min_points: minPoints,
				benefits: finalBenefits
			})
			onSuccess()
		} catch (error) {
			console.error('Error saving tier:', error)
			alert('Failed to save tier')
		} finally {
			setSaving(false)
		}
	}

	// Keep advanced text sync'd when switching
	const toggleAdvanced = (advanced: boolean) => {
		if (advanced) {
			const finalBenefits: Record<string, unknown> = {
				points_multiplier: Number(pointsMultiplier)
			}
			if (hasEarnOverride && earnRateOverride) {
				finalBenefits.earn_rate_override = parseFloat(earnRateOverride)
			}
			if (hasRedeemOverride && redeemRateOverride) {
				finalBenefits.redeem_rate_override = parseFloat(redeemRateOverride)
			}
			if (baselineDiscountPct && parseFloat(baselineDiscountPct) > 0) {
				finalBenefits.baseline_discount_pct = parseFloat(baselineDiscountPct)
			}
			if (amountDiscounts.length > 0) {
				finalBenefits.amount_discounts = amountDiscounts.filter(
					(r) => r.min_amount > 0 && r.discount_pct > 0
				)
			}
			setRawJson(JSON.stringify(finalBenefits, null, 2))
		} else {
			try {
				const parsed = JSON.parse(rawJson)
				setPointsMultiplier(
					typeof parsed.points_multiplier === 'number' ? parsed.points_multiplier : 1.0
				)
				setHasEarnOverride(typeof parsed.earn_rate_override === 'number')
				setEarnRateOverride(
					typeof parsed.earn_rate_override === 'number'
						? parsed.earn_rate_override.toString()
						: ''
				)
				setHasRedeemOverride(typeof parsed.redeem_rate_override === 'number')
				setRedeemRateOverride(
					typeof parsed.redeem_rate_override === 'number'
						? parsed.redeem_rate_override.toString()
						: ''
				)
				setBaselineDiscountPct(
					typeof parsed.baseline_discount_pct === 'number'
						? parsed.baseline_discount_pct.toString()
						: ''
				)
				setAmountDiscounts(Array.isArray(parsed.amount_discounts) ? parsed.amount_discounts : [])
			} catch {
				// switch back default
			}
		}
		setIsAdvanced(advanced)
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
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Tier Name
							</label>
							<input
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
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
								value={minPoints}
								onChange={(e) => setMinPoints(Number(e.target.value))}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="0"
								required
							/>
							<p className="mt-1 text-xs text-white/60">
								Points required to reach this tier
							</p>
						</div>
					</div>

					{/* Designer Selector Tabs */}
					<div className="flex border-b border-white/10 pb-px">
						<button
							type="button"
							onClick={() => toggleAdvanced(false)}
							className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
								!isAdvanced
									? 'border-[#E0342A] text-white'
									: 'border-transparent text-white/50 hover:text-white/80'
							}`}
						>
							Visual Designer
						</button>
						<button
							type="button"
							onClick={() => toggleAdvanced(true)}
							className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
								isAdvanced
									? 'border-[#E0342A] text-white'
									: 'border-transparent text-white/50 hover:text-white/80'
							}`}
						>
							Advanced (JSON)
						</button>
					</div>

					{!isAdvanced ? (
						<div className="space-y-6">
							{/* Section 1: Points System Rule Overrides */}
							<div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
								<h3 className="text-sm font-semibold uppercase tracking-wider text-white/70 flex items-center gap-2">
									<Shield className="h-4 w-4 text-[#E0342A]" />
									Points & Reward System Rules
								</h3>

								{/* Points Multiplier */}
								<div>
									<label className="mb-1.5 block text-sm font-medium text-white/95">
										Points Multiplier (Booster)
									</label>
									<div className="flex items-center gap-3">
										<input
											type="number"
											step="0.1"
											min="1"
											value={pointsMultiplier}
											onChange={(e) => setPointsMultiplier(Number(e.target.value))}
											className="w-32 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
											placeholder="1.0"
										/>
										<span className="text-sm text-white/60">
											e.g. 1.2 means member gets 20% bonus points on order completion.
										</span>
									</div>
								</div>

								{/* Earn Rate Override */}
								<div className="border-t border-white/5 pt-3 space-y-2">
									<div className="flex items-center justify-between">
										<div>
											<span className="text-sm font-medium text-white/95">
												Override Earning Rate
											</span>
											<p className="text-xs text-white/60">
												Give this tier a different points earning rule
											</p>
										</div>
										<label className="relative inline-flex cursor-pointer items-center">
											<input
												type="checkbox"
												checked={hasEarnOverride}
												onChange={(e) => setHasEarnOverride(e.target.checked)}
												className="peer sr-only"
											/>
											<div className="peer h-5 w-9 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-white/20 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#E0342A] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none"></div>
										</label>
									</div>

									{hasEarnOverride && (
										<div className="flex items-center gap-2 mt-2">
											<input
												type="number"
												step="0.01"
												min="0"
												value={earnRateOverride}
												onChange={(e) => setEarnRateOverride(e.target.value)}
												className="w-32 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white focus:border-white/30 focus:outline-none"
												placeholder="e.g., 2.0"
												required
											/>
											<span className="text-xs text-white/60">
												points per currency unit spent (e.g. ₹1)
											</span>
										</div>
									)}
								</div>

								{/* Redeem Rate Override */}
								<div className="border-t border-white/5 pt-3 space-y-2">
									<div className="flex items-center justify-between">
										<div>
											<span className="text-sm font-medium text-white/95">
												Override Redemption Value
											</span>
											<p className="text-xs text-white/60">
												Change the monetary value per point for this tier
											</p>
										</div>
										<label className="relative inline-flex cursor-pointer items-center">
											<input
												type="checkbox"
												checked={hasRedeemOverride}
												onChange={(e) => setHasRedeemOverride(e.target.checked)}
												className="peer sr-only"
											/>
											<div className="peer h-5 w-9 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-white/20 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#E0342A] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none"></div>
										</label>
									</div>

									{hasRedeemOverride && (
										<div className="flex items-center gap-2 mt-2">
											<input
												type="number"
												step="0.01"
												min="0"
												value={redeemRateOverride}
												onChange={(e) => setRedeemRateOverride(e.target.value)}
												className="w-32 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white focus:border-white/30 focus:outline-none"
												placeholder="e.g., 1.5"
												required
											/>
											<span className="text-xs text-white/60">
												currency value in rupees per point redeemed
											</span>
										</div>
									)}
								</div>
							</div>

							{/* Section 2: Membership Discounts Designer */}
							<div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
								<h3 className="text-sm font-semibold uppercase tracking-wider text-white/70 flex items-center gap-2">
									<Settings className="h-4 w-4 text-[#E0342A]" />
									Membership Discount Rules
								</h3>

								{/* Baseline Discount */}
								<div>
									<label className="mb-1 block text-sm font-medium text-white/95">
										Baseline Order Discount (%)
									</label>
									<div className="flex items-center gap-2">
										<input
											type="number"
											step="0.1"
											min="0"
											max="100"
											value={baselineDiscountPct}
											onChange={(e) => setBaselineDiscountPct(e.target.value)}
											className="w-32 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white focus:border-white/30 focus:outline-none"
											placeholder="e.g., 2"
										/>
										<span className="text-xs text-white/60">
											% discount applied to all orders automatically.
										</span>
									</div>
								</div>

								{/* Amount-Based Discounts */}
								<div className="border-t border-white/5 pt-4">
									<div className="flex items-center justify-between mb-3">
										<div>
											<span className="text-sm font-medium text-white/95">
												Purchase Amount Discounts
											</span>
											<p className="text-xs text-white/60">
												Apply higher discounts when orders exceed specific totals
											</p>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="border border-white/15 hover:bg-white/10 text-xs text-white/80"
											onClick={handleAddAmountDiscount}
										>
											<Plus className="mr-1 h-3.5 w-3.5" />
											Add Rule
										</Button>
									</div>

									<div className="space-y-3">
										{amountDiscounts.map((rule, idx) => (
											<div key={idx} className="flex items-center gap-3">
												<div className="flex-1 flex items-center gap-2">
													<span className="text-xs text-white/50">For orders above</span>
													<div className="relative flex-1">
														<span className="absolute left-3 top-2 text-sm text-white/30">₹</span>
														<input
															type="number"
															min="1"
															value={rule.min_amount}
															onChange={(e) =>
																handleAmountDiscountChange(
																	idx,
																	'min_amount',
																	Number(e.target.value)
																)
															}
															className="w-full rounded-xl border border-white/10 bg-black/30 pl-7 pr-3 py-1.5 text-sm text-white focus:border-white/30 focus:outline-none"
															placeholder="e.g., 1000"
															required
														/>
													</div>
												</div>

												<div className="w-36 flex items-center gap-2">
													<span className="text-xs text-white/50">Discount</span>
													<div className="relative flex-1">
														<input
															type="number"
															step="0.1"
															min="0"
															max="100"
															value={rule.discount_pct}
															onChange={(e) =>
																handleAmountDiscountChange(
																	idx,
																	'discount_pct',
																	Number(e.target.value)
																)
															}
															className="w-full rounded-xl border border-white/10 bg-black/30 pl-3 pr-7 py-1.5 text-sm text-white focus:border-white/30 focus:outline-none"
															placeholder="5"
															required
														/>
														<span className="absolute right-3 top-2 text-sm text-white/30">%</span>
													</div>
												</div>

												<button
													type="button"
													onClick={() => handleRemoveAmountDiscount(idx)}
													className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-[#E0342A]/20 hover:text-[#E0342A] transition"
												>
													<Trash2 className="h-4 w-4" />
												</button>
											</div>
										))}

										{amountDiscounts.length === 0 && (
											<div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-4 text-center">
												<p className="text-xs text-white/40 italic">
													No amount-based rules configured. (e.g. add one for above ₹1000 ➔ 5% off).
												</p>
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					) : (
						<div className="space-y-2">
							<label className="mb-2 block text-sm font-medium text-white">
								Benefits (JSON)
							</label>
							<textarea
								value={rawJson}
								onChange={(e) => setRawJson(e.target.value)}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-white focus:border-white/30 focus:outline-none"
								rows={12}
								placeholder='{"points_multiplier": 1.2, "baseline_discount_pct": 2}'
							/>
							<div className="flex items-start gap-2 text-xs text-white/50 mt-1">
								<Info className="h-4 w-4 text-amber-500/80 flex-shrink-0 mt-0.5" />
								<p>
									Directly modify the JSON configuration. Switch back to the Visual Designer tab to parse and edit visually.
								</p>
							</div>
						</div>
					)}

					<div className="flex justify-end gap-3 border-t border-white/10 pt-4">
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
