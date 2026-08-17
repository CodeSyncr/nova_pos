'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Plus, Trash2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CustomSelect } from '@/components/ui/select'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { createOrUpdateDiscount } from '@/app/actions/discounts'
import {
	DISCOUNT_RULE_FIELDS,
	NUMERIC_OPERATORS,
	SET_OPERATORS,
	WEEKDAY_OPTIONS,
	type DiscountRecord,
	type DiscountRule,
	type DiscountRuleField,
	type DiscountRuleOperator
} from '@/lib/discount-engine'

type DiscountFormProps = {
	tenantId: string
	discount: DiscountRecord | null
	currencySymbol?: string
	onClose: () => void
	onSuccess: () => void
}

type EditableRule = {
	field: DiscountRuleField
	operator: DiscountRuleOperator
	/** Numeric fields use `numberValue`; set fields use `listValue`. */
	numberValue: string
	listValue: string[]
}

const ORDER_TYPE_OPTIONS = [
	{ value: 'dine_in', label: 'Dine in' },
	{ value: 'takeaway', label: 'Takeaway' },
	{ value: 'delivery', label: 'Delivery' }
]

const CUSTOMER_TYPE_OPTIONS = [
	{ value: 'new', label: 'First-time customer' },
	{ value: 'returning', label: 'Returning customer' }
]

const NUMERIC_FIELDS = new Set(
	DISCOUNT_RULE_FIELDS.filter((f) => f.kind === 'numeric').map((f) => f.value)
)

const isNumericField = (field: DiscountRuleField) => NUMERIC_FIELDS.has(field)

/** Formats an instant for `<input type="datetime-local">` in local time. */
function toDateTimeLocal(value: string | null | undefined, fallback: Date): string {
	const date = value ? new Date(value) : fallback
	const safe = Number.isNaN(date.getTime()) ? fallback : date
	const pad = (n: number) => String(n).padStart(2, '0')
	return (
		`${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())}` +
		`T${pad(safe.getHours())}:${pad(safe.getMinutes())}`
	)
}

function toRuleState(rules: DiscountRule[] | null | undefined): EditableRule[] {
	if (!Array.isArray(rules)) return []

	return rules.map((rule) => {
		const numeric = isNumericField(rule.field)
		return {
			field: rule.field,
			operator: rule.operator,
			numberValue: numeric ? String(rule.value ?? '') : '',
			listValue: numeric
				? []
				: (Array.isArray(rule.value) ? rule.value : [rule.value])
						.filter((v) => v !== null && v !== undefined)
						.map((v) => String(v))
		}
	})
}

function Toggle({
	label,
	description,
	checked,
	onChange
}: {
	label: string
	description: string
	checked: boolean
	onChange: (checked: boolean) => void
}) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
			<div className="min-w-0">
				<p className="text-sm font-medium text-white">{label}</p>
				<p className="mt-0.5 text-xs text-white/60">{description}</p>
			</div>
			<label className="relative inline-flex shrink-0 cursor-pointer items-center">
				<input
					type="checkbox"
					checked={checked}
					onChange={(e) => onChange(e.target.checked)}
					className="peer sr-only"
				/>
				<span className="sr-only">{label}</span>
				<div className="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-white/20 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#E0342A] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
			</label>
		</div>
	)
}

const labelClass = 'mb-2 block text-sm font-medium text-white'
const inputClass =
	'w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none'
const sectionClass = 'space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5'
const sectionTitleClass =
	'text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40'

export function DiscountForm({
	tenantId,
	discount,
	currencySymbol = '₹',
	onClose,
	onSuccess
}: DiscountFormProps) {
	const now = useMemo(() => new Date(), [])
	const monthOut = useMemo(
		() => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
		[]
	)

	const [formData, setFormData] = useState({
		name: discount?.name ?? '',
		description: discount?.description ?? '',
		discount_type: (discount?.discount_type ?? 'percent') as 'percent' | 'fixed',
		discount_value: discount?.discount_value ?? 0,
		max_discount_amount: discount?.max_discount_amount ?? null,
		rule_match: (discount?.rule_match ?? 'all') as 'all' | 'any',
		auto_apply: discount?.auto_apply ?? true,
		priority: discount?.priority ?? 0,
		is_stackable: discount?.is_stackable ?? false,
		stackable_with_coupons: discount?.stackable_with_coupons ?? false,
		valid_from: toDateTimeLocal(discount?.valid_from, now),
		valid_until: discount?.valid_until
			? toDateTimeLocal(discount.valid_until, monthOut)
			: toDateTimeLocal(null, monthOut),
		no_end_date: discount ? !discount.valid_until : false,
		active_days: discount?.active_days ?? [],
		start_time: discount?.start_time ? discount.start_time.slice(0, 5) : '',
		end_time: discount?.end_time ? discount.end_time.slice(0, 5) : '',
		usage_limit: discount?.usage_limit ?? null,
		per_customer_limit: discount?.per_customer_limit ?? null,
		is_active: discount?.is_active ?? true
	})

	const [rules, setRules] = useState<EditableRule[]>(
		toRuleState(discount?.rules)
	)
	const [categories, setCategories] = useState<
		Array<{ value: string; label: string }>
	>([])
	const [menuItems, setMenuItems] = useState<
		Array<{ value: string; label: string }>
	>([])
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	// Only needed to label the category/item pickers in the rule builder.
	useEffect(() => {
		let cancelled = false

		const load = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const [categoryResult, itemResult] = await Promise.all([
					supabase
						.from('menu_categories')
						.select('id, name')
						.eq('tenant_id', tenantId)
						.order('position', { ascending: true }),
					supabase
						.from('menu_items')
						.select('id, name')
						.eq('tenant_id', tenantId)
						.order('name', { ascending: true })
				])

				if (cancelled) return

				setCategories(
					(categoryResult.data ?? []).map((c) => ({
						value: c.id as string,
						label: c.name as string
					}))
				)
				setMenuItems(
					(itemResult.data ?? []).map((i) => ({
						value: i.id as string,
						label: i.name as string
					}))
				)
			} catch (loadError) {
				console.error('Error loading rule options:', loadError)
			}
		}

		load()
		return () => {
			cancelled = true
		}
	}, [tenantId])

	const optionsForField = (field: DiscountRuleField) => {
		switch (field) {
			case 'order_type':
				return ORDER_TYPE_OPTIONS
			case 'customer_type':
				return CUSTOMER_TYPE_OPTIONS
			case 'contains_category':
				return categories
			case 'contains_item':
				return menuItems
			default:
				return []
		}
	}

	const addRule = () => {
		setRules((prev) => [
			...prev,
			{
				field: 'order_total',
				operator: 'gte',
				numberValue: '',
				listValue: []
			}
		])
	}

	const updateRule = (index: number, patch: Partial<EditableRule>) => {
		setRules((prev) =>
			prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule))
		)
	}

	const changeRuleField = (index: number, field: DiscountRuleField) => {
		// Operators and value shape differ per field kind, so reset both.
		updateRule(index, {
			field,
			operator: isNumericField(field) ? 'gte' : 'in',
			numberValue: '',
			listValue: []
		})
	}

	const removeRule = (index: number) => {
		setRules((prev) => prev.filter((_, i) => i !== index))
	}

	const toggleRuleValue = (index: number, value: string) => {
		setRules((prev) =>
			prev.map((rule, i) => {
				if (i !== index) return rule
				return {
					...rule,
					listValue: rule.listValue.includes(value)
						? rule.listValue.filter((v) => v !== value)
						: [...rule.listValue, value]
				}
			})
		)
	}

	const toggleDay = (day: number) => {
		setFormData((prev) => ({
			...prev,
			active_days: prev.active_days.includes(day)
				? prev.active_days.filter((d) => d !== day)
				: [...prev.active_days, day].sort((a, b) => a - b)
		}))
	}

	const buildRulesPayload = (): DiscountRule[] =>
		rules.map((rule, index) => {
			if (isNumericField(rule.field)) {
				const value = Number(rule.numberValue)
				if (rule.numberValue.trim() === '' || !Number.isFinite(value)) {
					throw new Error(`Rule ${index + 1} needs a numeric value.`)
				}
				return { field: rule.field, operator: rule.operator, value }
			}

			if (rule.listValue.length === 0) {
				throw new Error(`Rule ${index + 1} needs at least one value selected.`)
			}
			return {
				field: rule.field,
				operator: rule.operator,
				value: rule.listValue
			}
		})

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)
		setSaving(true)

		try {
			const rulesPayload = buildRulesPayload()

			await createOrUpdateDiscount(tenantId, discount?.id ?? null, {
				name: formData.name,
				description: formData.description || null,
				discount_type: formData.discount_type,
				discount_value: Number(formData.discount_value),
				max_discount_amount:
					formData.discount_type === 'percent' && formData.max_discount_amount
						? Number(formData.max_discount_amount)
						: null,
				rules: rulesPayload,
				rule_match: formData.rule_match,
				auto_apply: formData.auto_apply,
				priority: Number(formData.priority) || 0,
				is_stackable: formData.is_stackable,
				stackable_with_coupons: formData.stackable_with_coupons,
				valid_from: new Date(formData.valid_from).toISOString(),
				valid_until: formData.no_end_date
					? null
					: new Date(formData.valid_until).toISOString(),
				active_days: formData.active_days,
				start_time: formData.start_time || null,
				end_time: formData.end_time || null,
				usage_limit: formData.usage_limit ? Number(formData.usage_limit) : null,
				per_customer_limit: formData.per_customer_limit
					? Number(formData.per_customer_limit)
					: null,
				is_active: formData.is_active
			})

			onSuccess()
		} catch (submitError) {
			console.error('Error saving discount:', submitError)
			setError(
				submitError instanceof Error
					? submitError.message
					: 'Failed to save discount.'
			)
		} finally {
			setSaving(false)
		}
	}

	if (!mounted) return null

	const valuePrefix =
		formData.discount_type === 'percent' ? '%' : currencySymbol

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
				className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-black p-8 shadow-[0_40px_120px_rgba(0,0,0,0.85)]"
			>
				<div className="mb-6 flex items-start justify-between">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-white/50">
							Automatic discounts
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							{discount ? 'Edit Discount' : 'New Discount'}
						</h2>
					</div>
					<button
						onClick={onClose}
						aria-label="Close"
						className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-5 pb-6">
					{/* Basics ------------------------------------------------------- */}
					<div className={sectionClass}>
						<p className={sectionTitleClass}>Details</p>

						<div>
							<label htmlFor="discount-name" className={labelClass}>
								Name *
							</label>
							<input
								id="discount-name"
								type="text"
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								className={inputClass}
								placeholder="Big order 10% off"
								required
							/>
						</div>

						<div>
							<label htmlFor="discount-description" className={labelClass}>
								Description
							</label>
							<textarea
								id="discount-description"
								value={formData.description ?? ''}
								onChange={(e) =>
									setFormData({ ...formData, description: e.target.value })
								}
								rows={2}
								className={inputClass}
								placeholder="Shown to staff on the discount list"
							/>
						</div>
					</div>

					{/* Value -------------------------------------------------------- */}
					<div className={sectionClass}>
						<p className={sectionTitleClass}>Discount value</p>

						<div className="grid gap-4 md:grid-cols-2">
							<div>
								<label className={labelClass}>Type *</label>
								<CustomSelect
									value={formData.discount_type}
									onChange={(value) =>
										setFormData({
											...formData,
											discount_type: value as 'percent' | 'fixed',
											max_discount_amount:
												value === 'percent'
													? formData.max_discount_amount
													: null
										})
									}
									options={[
										{
											value: 'percent',
											label: 'Percentage',
											description: 'A share of the order subtotal'
										},
										{
											value: 'fixed',
											label: 'Fixed amount',
											description: `A flat ${currencySymbol} value off`
										}
									]}
								/>
							</div>

							<div>
								<label htmlFor="discount-value" className={labelClass}>
									Value * ({valuePrefix})
								</label>
								<input
									id="discount-value"
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
									className={inputClass}
									required
								/>
							</div>
						</div>

						{formData.discount_type === 'percent' && (
							<div>
								<label htmlFor="discount-cap" className={labelClass}>
									Maximum discount amount
								</label>
								<input
									id="discount-cap"
									type="number"
									step="0.01"
									min="0"
									value={formData.max_discount_amount ?? ''}
									onChange={(e) =>
										setFormData({
											...formData,
											max_discount_amount: e.target.value
												? Number(e.target.value)
												: null
										})
									}
									className={inputClass}
									placeholder={`No cap — e.g. ${currencySymbol}300 to limit the payout`}
								/>
							</div>
						)}
					</div>

					{/* Rules -------------------------------------------------------- */}
					<div className={sectionClass}>
						<div className="flex items-center justify-between gap-3">
							<p className={sectionTitleClass}>Conditions</p>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={addRule}
								className="border border-white/15 bg-white/5 text-white/80"
							>
								<Plus className="mr-1.5 h-3.5 w-3.5" />
								Add condition
							</Button>
						</div>

						{rules.length === 0 ? (
							<div className="flex items-start gap-2.5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4">
								<Info className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
								<p className="text-xs text-white/60">
									No conditions yet, so this discount applies to every order
									inside its schedule. Add a condition such as{' '}
									<span className="text-white/80">
										order subtotal is at least {currencySymbol}1200
									</span>
									.
								</p>
							</div>
						) : (
							<>
								<div>
									<label className={labelClass}>Match</label>
									<CustomSelect
										value={formData.rule_match}
										onChange={(value) =>
											setFormData({
												...formData,
												rule_match: value as 'all' | 'any'
											})
										}
										options={[
											{
												value: 'all',
												label: 'Match all conditions',
												description: 'Every condition below must pass'
											},
											{
												value: 'any',
												label: 'Match any condition',
												description: 'At least one condition must pass'
											}
										]}
									/>
								</div>

								<div className="space-y-3">
									{rules.map((rule, index) => {
										const numeric = isNumericField(rule.field)
										const fieldMeta = DISCOUNT_RULE_FIELDS.find(
											(f) => f.value === rule.field
										)
										const setOptions = optionsForField(rule.field)

										return (
											<div
												key={index}
												className="rounded-xl border border-white/10 bg-black/30 p-4"
											>
												<div className="mb-3 flex items-center justify-between gap-2">
													<span className="text-[11px] font-semibold uppercase tracking-wider text-white/35">
														Condition {index + 1}
													</span>
													<button
														type="button"
														onClick={() => removeRule(index)}
														aria-label={`Remove condition ${index + 1}`}
														className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/50 transition hover:bg-[#E0342A]/15 hover:text-[#E0342A]"
													>
														<Trash2 className="h-3.5 w-3.5" />
													</button>
												</div>

												<div className="grid gap-3 md:grid-cols-2">
													<CustomSelect
														value={rule.field}
														onChange={(value) =>
															changeRuleField(
																index,
																value as DiscountRuleField
															)
														}
														options={DISCOUNT_RULE_FIELDS.map((f) => ({
															value: f.value,
															label: f.label,
															description: f.hint
														}))}
													/>
													<CustomSelect
														value={rule.operator}
														onChange={(value) =>
															updateRule(index, {
																operator: value as DiscountRuleOperator
															})
														}
														options={(numeric
															? NUMERIC_OPERATORS
															: SET_OPERATORS
														).map((o) => ({
															value: o.value,
															label: o.label
														}))}
													/>
												</div>

												<div className="mt-3">
													{numeric ? (
														<input
															type="number"
															step="0.01"
															value={rule.numberValue}
															onChange={(e) =>
																updateRule(index, {
																	numberValue: e.target.value
																})
															}
															className={inputClass}
															placeholder={
																rule.field === 'order_total'
																	? `Amount in ${currencySymbol}, e.g. 1200`
																	: 'e.g. 3'
															}
															aria-label={`${fieldMeta?.label ?? 'Value'} value`}
														/>
													) : setOptions.length === 0 ? (
														<p className="text-xs text-white/40">
															Nothing available to pick yet.
														</p>
													) : (
														<div className="flex flex-wrap gap-2">
															{setOptions.map((option) => {
																const selected = rule.listValue.includes(
																	option.value
																)
																return (
																	<button
																		key={option.value}
																		type="button"
																		aria-pressed={selected}
																		onClick={() =>
																			toggleRuleValue(index, option.value)
																		}
																		className={
																			selected
																				? 'rounded-full border border-[#E0342A]/40 bg-[#E0342A]/15 px-3 py-1.5 text-xs font-medium text-white transition'
																				: 'rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10 hover:text-white'
																		}
																	>
																		{option.label}
																	</button>
																)
															})}
														</div>
													)}
												</div>
											</div>
										)
									})}
								</div>
							</>
						)}
					</div>

					{/* Schedule ----------------------------------------------------- */}
					<div className={sectionClass}>
						<p className={sectionTitleClass}>Schedule</p>

						<div className="grid gap-4 md:grid-cols-2">
							<div>
								<label htmlFor="discount-from" className={labelClass}>
									Starts *
								</label>
								<input
									id="discount-from"
									type="datetime-local"
									value={formData.valid_from}
									onChange={(e) =>
										setFormData({ ...formData, valid_from: e.target.value })
									}
									className={inputClass}
									required
								/>
							</div>

							<div>
								<label htmlFor="discount-until" className={labelClass}>
									Ends {formData.no_end_date ? '' : '*'}
								</label>
								<input
									id="discount-until"
									type="datetime-local"
									value={formData.valid_until}
									disabled={formData.no_end_date}
									onChange={(e) =>
										setFormData({ ...formData, valid_until: e.target.value })
									}
									className={`${inputClass} disabled:opacity-40`}
									required={!formData.no_end_date}
								/>
								<label className="mt-2 flex items-center gap-2 text-xs text-white/60">
									<input
										type="checkbox"
										checked={formData.no_end_date}
										onChange={(e) =>
											setFormData({
												...formData,
												no_end_date: e.target.checked
											})
										}
										className="rounded border-white/20"
									/>
									No end date
								</label>
							</div>
						</div>

						<div>
							<label className={labelClass}>Days of the week</label>
							<div className="flex flex-wrap gap-2">
								{WEEKDAY_OPTIONS.map((day) => {
									const selected = formData.active_days.includes(day.value)
									return (
										<button
											key={day.value}
											type="button"
											aria-pressed={selected}
											onClick={() => toggleDay(day.value)}
											className={
												selected
													? 'w-14 rounded-xl border border-[#E0342A]/40 bg-[#E0342A]/15 py-2 text-xs font-medium text-white transition'
													: 'w-14 rounded-xl border border-white/10 bg-white/5 py-2 text-xs text-white/60 transition hover:bg-white/10 hover:text-white'
											}
										>
											{day.label}
										</button>
									)
								})}
							</div>
							<p className="mt-2 text-xs text-white/40">
								{formData.active_days.length === 0
									? 'Every day'
									: 'Only on the selected days'}
							</p>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<div>
								<label htmlFor="discount-start-time" className={labelClass}>
									Active from (time of day)
								</label>
								<input
									id="discount-start-time"
									type="time"
									value={formData.start_time}
									onChange={(e) =>
										setFormData({ ...formData, start_time: e.target.value })
									}
									className={inputClass}
								/>
							</div>
							<div>
								<label htmlFor="discount-end-time" className={labelClass}>
									Active until (time of day)
								</label>
								<input
									id="discount-end-time"
									type="time"
									value={formData.end_time}
									onChange={(e) =>
										setFormData({ ...formData, end_time: e.target.value })
									}
									className={inputClass}
								/>
							</div>
						</div>
						<p className="text-xs text-white/40">
							Leave both blank for all day. An end time earlier than the start
							time is treated as an overnight window, e.g. 22:00 to 02:00.
						</p>
					</div>

					{/* Behaviour ---------------------------------------------------- */}
					<div className={sectionClass}>
						<p className={sectionTitleClass}>Behaviour</p>

						<Toggle
							label="Apply automatically"
							description="Add this to the bill as soon as the order matches the conditions"
							checked={formData.auto_apply}
							onChange={(checked) =>
								setFormData({ ...formData, auto_apply: checked })
							}
						/>

						<Toggle
							label="Can be clubbed with other discounts"
							description="Off means this is exclusive — it will never be combined with another discount"
							checked={formData.is_stackable}
							onChange={(checked) =>
								setFormData({ ...formData, is_stackable: checked })
							}
						/>

						<Toggle
							label="Can be clubbed with coupons"
							description="Off means this is skipped whenever a coupon code is on the order"
							checked={formData.stackable_with_coupons}
							onChange={(checked) =>
								setFormData({ ...formData, stackable_with_coupons: checked })
							}
						/>

						<div>
							<label htmlFor="discount-priority" className={labelClass}>
								Priority
							</label>
							<input
								id="discount-priority"
								type="number"
								step="1"
								value={formData.priority}
								onChange={(e) =>
									setFormData({ ...formData, priority: Number(e.target.value) })
								}
								className={inputClass}
							/>
							<p className="mt-2 text-xs text-white/40">
								When several discounts match, the higher priority is considered
								first. Ties are broken by whichever saves the customer more.
							</p>
						</div>
					</div>

					{/* Limits ------------------------------------------------------- */}
					<div className={sectionClass}>
						<p className={sectionTitleClass}>Limits</p>

						<div className="grid gap-4 md:grid-cols-2">
							<div>
								<label htmlFor="discount-usage-limit" className={labelClass}>
									Total usage limit
								</label>
								<input
									id="discount-usage-limit"
									type="number"
									min="1"
									step="1"
									value={formData.usage_limit ?? ''}
									onChange={(e) =>
										setFormData({
											...formData,
											usage_limit: e.target.value
												? Number(e.target.value)
												: null
										})
									}
									className={inputClass}
									placeholder="Unlimited"
								/>
							</div>

							<div>
								<label htmlFor="discount-customer-limit" className={labelClass}>
									Per customer limit
								</label>
								<input
									id="discount-customer-limit"
									type="number"
									min="1"
									step="1"
									value={formData.per_customer_limit ?? ''}
									onChange={(e) =>
										setFormData({
											...formData,
											per_customer_limit: e.target.value
												? Number(e.target.value)
												: null
										})
									}
									className={inputClass}
									placeholder="Unlimited"
								/>
								<p className="mt-2 text-xs text-white/40">
									Counted against the customer phone number on the order.
								</p>
							</div>
						</div>

						<Toggle
							label="Active"
							description="Turn off to pause this discount without deleting it"
							checked={formData.is_active}
							onChange={(checked) =>
								setFormData({ ...formData, is_active: checked })
							}
						/>
					</div>

					{error && (
						<p
							role="alert"
							className="rounded-xl border border-[#E0342A]/30 bg-[#E0342A]/10 px-4 py-3 text-sm text-[#E0342A]"
						>
							{error}
						</p>
					)}

					<div className="flex justify-end gap-3">
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving
								? 'Saving…'
								: discount
									? 'Update discount'
									: 'Create discount'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)

	return createPortal(modalContent, document.body)
}
