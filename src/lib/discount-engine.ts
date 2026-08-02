/**
 * Rule-based discount engine.
 *
 * Deliberately free of React, Next and Supabase imports so the exact same code
 * runs in two places:
 *   1. the POS cart, for an instant "auto-applied" preview, and
 *   2. the server action that writes the order, which recomputes from scratch
 *      and is the only number we trust.
 *
 * Money convention used throughout: the discount is taken off the *subtotal*,
 * and tax is charged on the discounted (net) base. The pre-discount subtotal is
 * what gets stored on the order, which keeps the existing
 * `subtotal + tax - discount_amount + space_rental` reporting formula correct.
 */

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export type DiscountRuleField =
	| 'order_total'
	| 'item_count'
	| 'order_type'
	| 'contains_category'
	| 'contains_item'
	| 'customer_type'

export type DiscountRuleOperator =
	| 'gte'
	| 'gt'
	| 'lte'
	| 'lt'
	| 'eq'
	| 'neq'
	| 'in'
	| 'not_in'

export type DiscountRuleValue = number | string | Array<number | string>

export type DiscountRule = {
	field: DiscountRuleField
	operator: DiscountRuleOperator
	value: DiscountRuleValue
}

export type RuleMatch = 'all' | 'any'

export const DISCOUNT_RULE_FIELDS: ReadonlyArray<{
	value: DiscountRuleField
	label: string
	kind: 'numeric' | 'set'
	hint: string
}> = [
	{
		value: 'order_total',
		label: 'Order subtotal',
		kind: 'numeric',
		hint: 'Cart value before tax and other discounts'
	},
	{
		value: 'item_count',
		label: 'Total item quantity',
		kind: 'numeric',
		hint: 'Sum of quantities across all cart lines'
	},
	{
		value: 'order_type',
		label: 'Order type',
		kind: 'set',
		hint: 'Dine in, takeaway or delivery'
	},
	{
		value: 'contains_category',
		label: 'Cart contains category',
		kind: 'set',
		hint: 'At least one line item from these categories'
	},
	{
		value: 'contains_item',
		label: 'Cart contains item',
		kind: 'set',
		hint: 'At least one of these menu items'
	},
	{
		value: 'customer_type',
		label: 'Customer type',
		kind: 'set',
		hint: 'First-time or returning customer'
	}
]

export const NUMERIC_OPERATORS: ReadonlyArray<{
	value: DiscountRuleOperator
	label: string
}> = [
	{ value: 'gte', label: 'is at least (>=)' },
	{ value: 'gt', label: 'is more than (>)' },
	{ value: 'lte', label: 'is at most (<=)' },
	{ value: 'lt', label: 'is less than (<)' },
	{ value: 'eq', label: 'equals (=)' },
	{ value: 'neq', label: 'does not equal' }
]

export const SET_OPERATORS: ReadonlyArray<{
	value: DiscountRuleOperator
	label: string
}> = [
	{ value: 'in', label: 'is any of' },
	{ value: 'not_in', label: 'is none of' }
]

// ---------------------------------------------------------------------------
// Records & context
// ---------------------------------------------------------------------------

/** Mirrors a row of `public.discounts` (snake_case, straight from Supabase). */
export type DiscountRecord = {
	id: string
	name: string
	description?: string | null
	discount_type: 'percent' | 'fixed'
	discount_value: number
	max_discount_amount?: number | null
	rules?: DiscountRule[] | null
	rule_match?: RuleMatch | null
	auto_apply?: boolean | null
	priority?: number | null
	is_stackable?: boolean | null
	stackable_with_coupons?: boolean | null
	valid_from: string
	valid_until?: string | null
	active_days?: number[] | null
	start_time?: string | null
	end_time?: string | null
	usage_limit?: number | null
	usage_count?: number | null
	per_customer_limit?: number | null
	is_active?: boolean | null
}

export type OrderContext = {
	/** Cart value before tax and before any discount. */
	subtotal: number
	/** Sum of line quantities. */
	itemCount: number
	orderType: string
	/** Category ids present in the cart. */
	categoryIds?: string[]
	/** Menu item ids present in the cart. */
	menuItemIds?: string[]
	/** Drives the `customer_type` rule. */
	isReturningCustomer?: boolean
	/** Phone used to enforce per-customer limits. */
	customerPhone?: string | null
	/** True when a coupon code is already on the order. */
	couponApplied?: boolean
	/** Evaluation instant. Defaults to now. */
	now?: Date
	/** IANA zone used for the day/time-of-day windows. Defaults to system zone. */
	timeZone?: string | null
	/** discountId -> times this customer has already redeemed it. */
	customerUsageByDiscountId?: Record<string, number>
	/**
	 * Ids the cashier explicitly turned off for this order. Lets staff drop an
	 * auto discount without deactivating the whole rule.
	 */
	excludedDiscountIds?: string[]
}

export type DiscountSkipReason =
	| 'inactive'
	| 'not_started'
	| 'expired'
	| 'outside_day_window'
	| 'outside_time_window'
	| 'usage_limit_reached'
	| 'customer_limit_reached'
	| 'rules_not_met'
	| 'coupon_conflict'
	| 'not_stackable'
	| 'blocked_by_exclusive'
	| 'manual_only'
	| 'excluded_by_staff'
	| 'no_value'

export const DISCOUNT_SKIP_REASON_LABELS: Record<DiscountSkipReason, string> = {
	inactive: 'Turned off',
	not_started: 'Not started yet',
	expired: 'Validity period ended',
	outside_day_window: 'Not valid on this day',
	outside_time_window: 'Outside the active hours',
	usage_limit_reached: 'Usage limit reached',
	customer_limit_reached: 'Customer already used this',
	rules_not_met: 'Order does not meet the rules',
	coupon_conflict: 'Cannot be clubbed with a coupon',
	not_stackable: 'Cannot be clubbed with another discount',
	blocked_by_exclusive: 'Another exclusive discount is applied',
	manual_only: 'Needs to be applied manually',
	excluded_by_staff: 'Removed for this order',
	no_value: 'Works out to zero'
}

export type AppliedDiscount = {
	id: string
	name: string
	discountType: 'percent' | 'fixed'
	discountValue: number
	/** Currency amount taken off this order. */
	amount: number
	isStackable: boolean
	stackableWithCoupons: boolean
}

export type SkippedDiscount = {
	id: string
	name: string
	reason: DiscountSkipReason
}

export type DiscountEvaluation = {
	applied: AppliedDiscount[]
	skipped: SkippedDiscount[]
	/** Sum of `applied[].amount`, never more than the subtotal. */
	totalDiscount: number
	/** False when an applied discount forbids being clubbed with a coupon. */
	couponAllowed: boolean
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

export function round2(value: number): number {
	if (!Number.isFinite(value)) return 0
	// Nudge away from binary-float ties (e.g. 1.005) before rounding.
	return Math.round((value + Number.EPSILON) * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min
	return Math.min(Math.max(value, min), max)
}

function toNumber(raw: unknown): number | null {
	if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
	if (typeof raw === 'string' && raw.trim() !== '') {
		const parsed = Number(raw)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
}

function toStringArray(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw
			.filter((v) => v !== null && v !== undefined)
			.map((v) => String(v).trim())
			.filter((v) => v !== '')
	}
	if (typeof raw === 'string' && raw.trim() !== '') return [raw.trim()]
	if (typeof raw === 'number') return [String(raw)]
	return []
}

// ---------------------------------------------------------------------------
// Day / time-of-day windows
// ---------------------------------------------------------------------------

const WEEKDAY_INDEX: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6
}

export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
	{ value: 0, label: 'Sun' },
	{ value: 1, label: 'Mon' },
	{ value: 2, label: 'Tue' },
	{ value: 3, label: 'Wed' },
	{ value: 4, label: 'Thu' },
	{ value: 5, label: 'Fri' },
	{ value: 6, label: 'Sat' }
]

/**
 * Resolves weekday and minutes-since-midnight for `date` in `timeZone`.
 * Falls back to the host zone when `timeZone` is missing or invalid, so the POS
 * still behaves sensibly on a till with no tenant timezone configured.
 */
function getZonedParts(
	date: Date,
	timeZone?: string | null
): { dayOfWeek: number; minutesOfDay: number } {
	const fallback = {
		dayOfWeek: date.getDay(),
		minutesOfDay: date.getHours() * 60 + date.getMinutes()
	}

	if (!timeZone) return fallback

	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone,
			weekday: 'short',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).formatToParts(date)

		let dayOfWeek: number | undefined
		let hour: number | undefined
		let minute: number | undefined

		for (const part of parts) {
			if (part.type === 'weekday') dayOfWeek = WEEKDAY_INDEX[part.value]
			else if (part.type === 'hour') hour = Number(part.value)
			else if (part.type === 'minute') minute = Number(part.value)
		}

		if (
			dayOfWeek === undefined ||
			hour === undefined ||
			minute === undefined ||
			!Number.isFinite(hour) ||
			!Number.isFinite(minute)
		) {
			return fallback
		}

		// h23 still yields 24 for midnight in some ICU builds.
		return { dayOfWeek, minutesOfDay: (hour % 24) * 60 + minute }
	} catch {
		return fallback
	}
}

/** Parses a Postgres `time` value ('HH:MM' or 'HH:MM:SS') to minutes. */
function parseTimeToMinutes(value?: string | null): number | null {
	if (!value) return null
	const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
	if (!match) return null
	const hours = Number(match[1])
	const minutes = Number(match[2])
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
	return hours * 60 + minutes
}

function isWithinTimeWindow(
	minutesOfDay: number,
	startRaw?: string | null,
	endRaw?: string | null
): boolean {
	const start = parseTimeToMinutes(startRaw)
	const end = parseTimeToMinutes(endRaw)

	if (start === null && end === null) return true
	if (start !== null && end === null) return minutesOfDay >= start
	if (start === null && end !== null) return minutesOfDay <= end

	// Both set. start > end means the window runs past midnight (22:00 -> 02:00).
	if (start! <= end!) return minutesOfDay >= start! && minutesOfDay <= end!
	return minutesOfDay >= start! || minutesOfDay <= end!
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

function compareNumeric(
	actual: number,
	operator: DiscountRuleOperator,
	raw: DiscountRuleValue
): boolean {
	if (operator === 'in' || operator === 'not_in') {
		const options = toStringArray(raw)
			.map((v) => Number(v))
			.filter((v) => Number.isFinite(v))
		if (options.length === 0) return false
		const hit = options.some((v) => v === actual)
		return operator === 'in' ? hit : !hit
	}

	const expected = toNumber(raw)
	if (expected === null) return false

	switch (operator) {
		case 'gte':
			return actual >= expected
		case 'gt':
			return actual > expected
		case 'lte':
			return actual <= expected
		case 'lt':
			return actual < expected
		case 'eq':
			return actual === expected
		case 'neq':
			return actual !== expected
		default:
			return false
	}
}

function compareSet(
	actual: string[],
	operator: DiscountRuleOperator,
	raw: DiscountRuleValue
): boolean {
	const expected = toStringArray(raw)
	if (expected.length === 0) return false

	const expectedSet = new Set(expected)
	const hit = actual.some((value) => expectedSet.has(value))

	switch (operator) {
		case 'in':
		case 'eq':
			return hit
		case 'not_in':
		case 'neq':
			return !hit
		default:
			return false
	}
}

/** Evaluates a single rule. Unknown fields fail closed. */
export function evaluateRule(rule: DiscountRule, ctx: OrderContext): boolean {
	if (!rule || typeof rule !== 'object') return false

	switch (rule.field) {
		case 'order_total':
			return compareNumeric(ctx.subtotal, rule.operator, rule.value)
		case 'item_count':
			return compareNumeric(ctx.itemCount, rule.operator, rule.value)
		case 'order_type':
			return compareSet([ctx.orderType], rule.operator, rule.value)
		case 'contains_category':
			return compareSet(ctx.categoryIds ?? [], rule.operator, rule.value)
		case 'contains_item':
			return compareSet(ctx.menuItemIds ?? [], rule.operator, rule.value)
		case 'customer_type':
			return compareSet(
				[ctx.isReturningCustomer ? 'returning' : 'new'],
				rule.operator,
				rule.value
			)
		default:
			// Unrecognised field (e.g. written by a newer client): never apply.
			return false
	}
}

function rulesPass(discount: DiscountRecord, ctx: OrderContext): boolean {
	const rules = Array.isArray(discount.rules) ? discount.rules : []
	// No rules means "applies to every order".
	if (rules.length === 0) return true

	return discount.rule_match === 'any'
		? rules.some((rule) => evaluateRule(rule, ctx))
		: rules.every((rule) => evaluateRule(rule, ctx))
}

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------

/**
 * Everything except stacking, which can only be resolved once we know the
 * ranking. Returns null when the discount is a candidate.
 */
function findBlockingReason(
	discount: DiscountRecord,
	ctx: OrderContext,
	options: { autoOnly: boolean }
): DiscountSkipReason | null {
	if (discount.is_active === false) return 'inactive'
	if (options.autoOnly && discount.auto_apply === false) return 'manual_only'

	if (ctx.excludedDiscountIds?.includes(discount.id)) return 'excluded_by_staff'

	const now = ctx.now ?? new Date()

	const validFrom = new Date(discount.valid_from)
	if (!Number.isNaN(validFrom.getTime()) && now < validFrom) return 'not_started'

	if (discount.valid_until) {
		const validUntil = new Date(discount.valid_until)
		if (!Number.isNaN(validUntil.getTime()) && now > validUntil) return 'expired'
	}

	const activeDays = Array.isArray(discount.active_days)
		? discount.active_days
		: []
	const { dayOfWeek, minutesOfDay } = getZonedParts(now, ctx.timeZone)

	if (activeDays.length > 0 && !activeDays.includes(dayOfWeek)) {
		return 'outside_day_window'
	}

	if (!isWithinTimeWindow(minutesOfDay, discount.start_time, discount.end_time)) {
		return 'outside_time_window'
	}

	if (
		typeof discount.usage_limit === 'number' &&
		discount.usage_limit > 0 &&
		(discount.usage_count ?? 0) >= discount.usage_limit
	) {
		return 'usage_limit_reached'
	}

	if (
		typeof discount.per_customer_limit === 'number' &&
		discount.per_customer_limit > 0 &&
		ctx.customerUsageByDiscountId
	) {
		const used = ctx.customerUsageByDiscountId[discount.id] ?? 0
		if (used >= discount.per_customer_limit) return 'customer_limit_reached'
	}

	if (ctx.couponApplied && discount.stackable_with_coupons !== true) {
		return 'coupon_conflict'
	}

	if (!rulesPass(discount, ctx)) return 'rules_not_met'

	return null
}

/**
 * Currency value of `discount` against `base`.
 * Percent discounts honour `max_discount_amount`; nothing can exceed the base.
 */
export function computeDiscountAmount(
	discount: DiscountRecord,
	base: number
): number {
	if (base <= 0) return 0

	const value = Number(discount.discount_value) || 0
	if (value <= 0) return 0

	let amount: number
	if (discount.discount_type === 'percent') {
		amount = (base * Math.min(value, 100)) / 100
		const cap = discount.max_discount_amount
		if (typeof cap === 'number' && cap > 0) amount = Math.min(amount, cap)
	} else {
		amount = value
	}

	return round2(clamp(amount, 0, base))
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Picks the winning discount(s) for an order.
 *
 * Ordering: `priority` desc, then the larger discount, then name — so the
 * outcome is deterministic and independent of the row order from the database.
 *
 * Stacking: the top-ranked candidate always applies. Additional candidates only
 * join it when every discount involved is marked stackable. Amounts are applied
 * sequentially against the shrinking remaining base, which makes it impossible
 * for a stack to exceed the subtotal.
 */
export function evaluateDiscounts(
	discounts: DiscountRecord[],
	ctx: OrderContext,
	options: { autoOnly?: boolean } = {}
): DiscountEvaluation {
	const autoOnly = options.autoOnly ?? true
	const skipped: SkippedDiscount[] = []
	const applied: AppliedDiscount[] = []

	if (!Array.isArray(discounts) || discounts.length === 0 || ctx.subtotal <= 0) {
		return {
			applied,
			skipped,
			totalDiscount: 0,
			couponAllowed: true
		}
	}

	const candidates: DiscountRecord[] = []
	for (const discount of discounts) {
		const reason = findBlockingReason(discount, ctx, { autoOnly })
		if (reason) {
			skipped.push({ id: discount.id, name: discount.name, reason })
		} else {
			candidates.push(discount)
		}
	}

	candidates.sort((a, b) => {
		const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0)
		if (priorityDiff !== 0) return priorityDiff

		const amountDiff =
			computeDiscountAmount(b, ctx.subtotal) -
			computeDiscountAmount(a, ctx.subtotal)
		if (Math.abs(amountDiff) > 0.001) return amountDiff

		return a.name.localeCompare(b.name)
	})

	let remaining = round2(ctx.subtotal)
	let hasExclusiveApplied = false

	for (const discount of candidates) {
		const stackable = discount.is_stackable === true

		if (applied.length > 0) {
			if (hasExclusiveApplied) {
				skipped.push({
					id: discount.id,
					name: discount.name,
					reason: 'blocked_by_exclusive'
				})
				continue
			}
			if (!stackable) {
				skipped.push({
					id: discount.id,
					name: discount.name,
					reason: 'not_stackable'
				})
				continue
			}
		}

		const amount = computeDiscountAmount(discount, remaining)
		if (amount <= 0) {
			skipped.push({ id: discount.id, name: discount.name, reason: 'no_value' })
			continue
		}

		applied.push({
			id: discount.id,
			name: discount.name,
			discountType: discount.discount_type,
			discountValue: Number(discount.discount_value) || 0,
			amount,
			isStackable: stackable,
			stackableWithCoupons: discount.stackable_with_coupons === true
		})

		if (!stackable) hasExclusiveApplied = true
		remaining = round2(remaining - amount)
		if (remaining <= 0) break
	}

	const totalDiscount = round2(
		applied.reduce((sum, entry) => sum + entry.amount, 0)
	)

	return {
		applied,
		skipped,
		totalDiscount: clamp(totalDiscount, 0, round2(ctx.subtotal)),
		couponAllowed: applied.every((entry) => entry.stackableWithCoupons)
	}
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export type OrderTotals = {
	/** Pre-discount cart value; this is what gets stored on the order. */
	subtotal: number
	discount: number
	/** Charged on `subtotal - discount`. */
	tax: number
	spaceRental: number
	total: number
}

/**
 * Single place both the cart and the server compute money, so the figure the
 * cashier sees matches the figure that gets written.
 */
export function computeOrderTotals(input: {
	subtotal: number
	taxRatePercent?: number
	discountAmount?: number
	spaceRentalAmount?: number
}): OrderTotals {
	const subtotal = round2(Math.max(input.subtotal || 0, 0))
	const discount = round2(clamp(input.discountAmount || 0, 0, subtotal))
	const taxableBase = round2(subtotal - discount)
	const tax = round2((taxableBase * (input.taxRatePercent || 0)) / 100)
	const spaceRental = round2(Math.max(input.spaceRentalAmount || 0, 0))
	const total = round2(taxableBase + tax + spaceRental)

	return { subtotal, discount, tax, spaceRental, total }
}

/** Human-readable summary of a rule, used in the management UI. */
export function describeRule(
	rule: DiscountRule,
	lookup?: {
		categoryNames?: Record<string, string>
		itemNames?: Record<string, string>
		currencySymbol?: string
	}
): string {
	const field = DISCOUNT_RULE_FIELDS.find((f) => f.value === rule.field)
	const fieldLabel = field?.label ?? rule.field

	const operatorLabel =
		[...NUMERIC_OPERATORS, ...SET_OPERATORS].find(
			(o) => o.value === rule.operator
		)?.label ?? rule.operator

	const currency = lookup?.currencySymbol ?? ''

	if (field?.kind === 'numeric') {
		const prefix = rule.field === 'order_total' ? currency : ''
		return `${fieldLabel} ${operatorLabel} ${prefix}${rule.value}`
	}

	const values = toStringArray(rule.value).map((value) => {
		if (rule.field === 'contains_category') {
			return lookup?.categoryNames?.[value] ?? value
		}
		if (rule.field === 'contains_item') {
			return lookup?.itemNames?.[value] ?? value
		}
		return value.replace(/_/g, ' ')
	})

	return `${fieldLabel} ${operatorLabel} ${values.join(', ')}`
}
