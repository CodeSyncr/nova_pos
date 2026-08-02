'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
	Plus,
	Edit2,
	Trash2,
	Calendar,
	Clock,
	Percent,
	Layers,
	Ticket,
	Zap,
	Hand
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { DiscountForm } from './discount-form'
import { deleteDiscount, setDiscountActive } from '@/app/actions/discounts'
import {
	WEEKDAY_OPTIONS,
	describeRule,
	type DiscountRecord
} from '@/lib/discount-engine'
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

type DiscountsTabProps = {
	tenantId: string
	currencySymbol?: string
	onRefresh?: () => void
}

const dateTimeFormat: Intl.DateTimeFormatOptions = {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
}

function formatWindow(discount: DiscountRecord): string {
	const from = new Date(discount.valid_from).toLocaleString(
		undefined,
		dateTimeFormat
	)
	if (!discount.valid_until) return `${from} onwards`
	const until = new Date(discount.valid_until).toLocaleString(
		undefined,
		dateTimeFormat
	)
	return `${from} → ${until}`
}

function formatRecurrence(discount: DiscountRecord): string | null {
	const days = discount.active_days ?? []
	const dayLabel =
		days.length === 0
			? null
			: WEEKDAY_OPTIONS.filter((d) => days.includes(d.value))
					.map((d) => d.label)
					.join(', ')

	const start = discount.start_time?.slice(0, 5)
	const end = discount.end_time?.slice(0, 5)
	const timeLabel =
		start && end
			? `${start}–${end}`
			: start
				? `from ${start}`
				: end
					? `until ${end}`
					: null

	if (!dayLabel && !timeLabel) return null
	return [dayLabel, timeLabel].filter(Boolean).join(' · ')
}

export function DiscountsTab({
	tenantId,
	currencySymbol = '₹',
	onRefresh
}: DiscountsTabProps) {
	const [discounts, setDiscounts] = useState<DiscountRecord[]>([])
	const [categoryNames, setCategoryNames] = useState<Record<string, string>>({})
	const [itemNames, setItemNames] = useState<Record<string, string>>({})
	const [loading, setLoading] = useState(true)
	const [showForm, setShowForm] = useState(false)
	const [editing, setEditing] = useState<DiscountRecord | null>(null)
	const [deleting, setDeleting] = useState<DiscountRecord | null>(null)
	const [busyId, setBusyId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const loadDiscounts = useCallback(async () => {
		try {
			const supabase = createSupabaseBrowserClient()
			const [discountResult, categoryResult, itemResult] = await Promise.all([
				supabase
					.from('discounts')
					.select('*')
					.eq('tenant_id', tenantId)
					.order('priority', { ascending: false })
					.order('created_at', { ascending: false }),
				supabase.from('menu_categories').select('id, name').eq('tenant_id', tenantId),
				supabase.from('menu_items').select('id, name').eq('tenant_id', tenantId)
			])

			setDiscounts((discountResult.data as unknown as DiscountRecord[]) ?? [])

			setCategoryNames(
				Object.fromEntries(
					(categoryResult.data ?? []).map((c) => [c.id as string, c.name as string])
				)
			)
			setItemNames(
				Object.fromEntries(
					(itemResult.data ?? []).map((i) => [i.id as string, i.name as string])
				)
			)
		} catch (loadError) {
			console.error('Error loading discounts:', loadError)
			setError('Could not load discounts.')
		} finally {
			setLoading(false)
		}
	}, [tenantId])

	useEffect(() => {
		loadDiscounts()
	}, [loadDiscounts])

	const lookup = useMemo(
		() => ({ categoryNames, itemNames, currencySymbol }),
		[categoryNames, itemNames, currencySymbol]
	)

	const handleDelete = async () => {
		if (!deleting) return
		setError(null)
		try {
			await deleteDiscount(tenantId, deleting.id)
			setDeleting(null)
			await loadDiscounts()
			onRefresh?.()
		} catch (deleteError) {
			console.error('Error deleting discount:', deleteError)
			setError(
				deleteError instanceof Error
					? deleteError.message
					: 'Failed to delete discount.'
			)
		}
	}

	const handleToggleActive = async (discount: DiscountRecord) => {
		setBusyId(discount.id)
		setError(null)
		try {
			await setDiscountActive(tenantId, discount.id, !discount.is_active)
			await loadDiscounts()
			onRefresh?.()
		} catch (toggleError) {
			console.error('Error updating discount:', toggleError)
			setError(
				toggleError instanceof Error
					? toggleError.message
					: 'Failed to update discount.'
			)
		} finally {
			setBusyId(null)
		}
	}

	if (loading) {
		return <p className="text-white/60">Loading discounts…</p>
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold text-white">
						Automatic Discounts
					</h2>
					<p className="text-sm text-white/60">
						Rule-based offers that apply themselves at the till
					</p>
				</div>
				<Button
					size="sm"
					onClick={() => {
						setEditing(null)
						setShowForm(true)
					}}
				>
					<Plus className="mr-2 h-4 w-4" />
					New Discount
				</Button>
			</div>

			{error && (
				<p
					role="alert"
					className="rounded-xl border border-[#E0342A]/30 bg-[#E0342A]/10 px-4 py-3 text-sm text-[#E0342A]"
				>
					{error}
				</p>
			)}

			{discounts.length === 0 ? (
				<div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
					<p className="text-white/60">No discounts created yet</p>
					<p className="mt-2 text-sm text-white/40">
						Try one like “order subtotal is at least {currencySymbol}1200 → 10%
						off”
					</p>
				</div>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					{discounts.map((discount) => {
						const expired = discount.valid_until
							? new Date(discount.valid_until) < new Date()
							: false
						const notStarted = new Date(discount.valid_from) > new Date()
						const exhausted =
							typeof discount.usage_limit === 'number' &&
							discount.usage_limit > 0 &&
							(discount.usage_count ?? 0) >= discount.usage_limit

						const live =
							discount.is_active !== false &&
							!expired &&
							!notStarted &&
							!exhausted

						const statusLabel = !discount.is_active
							? 'Paused'
							: expired
								? 'Expired'
								: notStarted
									? 'Scheduled'
									: exhausted
										? 'Limit reached'
										: 'Live'

						const recurrence = formatRecurrence(discount)
						const rules = Array.isArray(discount.rules) ? discount.rules : []

						return (
							<motion.div
								key={discount.id}
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								className="flex flex-col rounded-xl border border-white/10 bg-black/20 p-6"
							>
								<div className="mb-4 flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<div className="mb-2 flex flex-wrap items-center gap-2">
											<h3 className="text-lg font-semibold text-white">
												{discount.name}
											</h3>
											<Badge
												className={
													live
														? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
														: 'border-[#E0342A]/30 bg-[#E0342A]/10 text-[#E0342A]'
												}
											>
												{statusLabel}
											</Badge>
										</div>

										<div className="flex flex-wrap items-center gap-2 text-xs">
											<span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/70">
												{discount.auto_apply === false ? (
													<>
														<Hand className="h-3 w-3" />
														Manual
													</>
												) : (
													<>
														<Zap className="h-3 w-3 text-emerald-400" />
														Auto-apply
													</>
												)}
											</span>
											<span
												className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/70"
												title={
													discount.is_stackable
														? 'Can be combined with other stackable discounts'
														: 'Exclusive — never combined with another discount'
												}
											>
												<Layers className="h-3 w-3" />
												{discount.is_stackable ? 'Clubbable' : 'Exclusive'}
											</span>
											<span
												className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/70"
												title={
													discount.stackable_with_coupons
														? 'Can be combined with a coupon code'
														: 'Skipped when a coupon is applied'
												}
											>
												<Ticket className="h-3 w-3" />
												{discount.stackable_with_coupons
													? 'Coupons OK'
													: 'No coupons'}
											</span>
											{(discount.priority ?? 0) !== 0 && (
												<span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/70">
													Priority {discount.priority}
												</span>
											)}
										</div>

										{discount.description && (
											<p className="mt-3 text-sm text-white/60">
												{discount.description}
											</p>
										)}
									</div>

									<div className="flex shrink-0 gap-2">
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setEditing(discount)
												setShowForm(true)
											}}
											aria-label={`Edit ${discount.name}`}
											className="border border-white/15 bg-white/5 text-white/70"
										>
											<Edit2 className="h-4 w-4" />
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setDeleting(discount)}
											aria-label={`Delete ${discount.name}`}
											className="border border-white/15 bg-white/5 text-white/70"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</div>

								<div className="space-y-2.5 text-sm">
									<div className="flex items-center gap-2">
										<Percent className="h-4 w-4 shrink-0 text-[#E0342A]" />
										<span className="text-white/70">Gives</span>
										<span className="font-semibold text-white">
											{discount.discount_type === 'percent'
												? `${discount.discount_value}% off`
												: `${currencySymbol}${Number(discount.discount_value).toFixed(2)} off`}
										</span>
										{discount.discount_type === 'percent' &&
											discount.max_discount_amount && (
												<span className="text-white/50">
													(max {currencySymbol}
													{Number(discount.max_discount_amount).toFixed(2)})
												</span>
											)}
									</div>

									<div className="flex items-start gap-2">
										<Calendar className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
										<span className="text-white/70">
											{formatWindow(discount)}
										</span>
									</div>

									{recurrence && (
										<div className="flex items-start gap-2">
											<Clock className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
											<span className="text-white/70">{recurrence}</span>
										</div>
									)}

									<div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
										<p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">
											{rules.length === 0
												? 'Applies to'
												: `Conditions (match ${discount.rule_match ?? 'all'})`}
										</p>
										{rules.length === 0 ? (
											<p className="text-xs text-white/60">
												Every order in the schedule
											</p>
										) : (
											<ul className="space-y-1">
												{rules.map((rule, index) => (
													<li
														key={index}
														className="text-xs text-white/70 before:mr-1.5 before:text-white/30 before:content-['•']"
													>
														{describeRule(rule, lookup)}
													</li>
												))}
											</ul>
										)}
									</div>

									<div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-white/60">
										<span>
											Used {discount.usage_count ?? 0}
											{discount.usage_limit ? ` / ${discount.usage_limit}` : ''}
											{discount.per_customer_limit
												? ` · max ${discount.per_customer_limit} per customer`
												: ''}
										</span>
										<button
											type="button"
											onClick={() => handleToggleActive(discount)}
											disabled={busyId === discount.id}
											className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
										>
											{busyId === discount.id
												? 'Saving…'
												: discount.is_active
													? 'Pause'
													: 'Resume'}
										</button>
									</div>
								</div>
							</motion.div>
						)
					})}
				</div>
			)}

			{showForm && (
				<DiscountForm
					tenantId={tenantId}
					discount={editing}
					currencySymbol={currencySymbol}
					onClose={() => {
						setShowForm(false)
						setEditing(null)
					}}
					onSuccess={() => {
						setShowForm(false)
						setEditing(null)
						loadDiscounts()
						onRefresh?.()
					}}
				/>
			)}

			{deleting && (
				<AlertDialog open={!!deleting}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete Discount</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to delete &ldquo;{deleting.name}&rdquo;?
								Orders that already used it keep their discount. This cannot be
								undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel onClick={() => setDeleting(null)}>
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
