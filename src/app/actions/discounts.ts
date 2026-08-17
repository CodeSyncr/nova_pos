'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
	DISCOUNT_RULE_FIELDS,
	NUMERIC_OPERATORS,
	SET_OPERATORS,
	evaluateDiscounts,
	type DiscountEvaluation,
	type DiscountRecord,
	type DiscountRule,
	type DiscountRuleField,
	type DiscountRuleOperator,
	type OrderContext,
	type RuleMatch
} from '@/lib/discount-engine'

const DISCOUNT_COLUMNS = `
	id,
	tenant_id,
	name,
	description,
	discount_type,
	discount_value,
	max_discount_amount,
	rules,
	rule_match,
	auto_apply,
	priority,
	is_stackable,
	stackable_with_coupons,
	valid_from,
	valid_until,
	active_days,
	start_time,
	end_time,
	usage_limit,
	usage_count,
	per_customer_limit,
	is_active,
	created_at,
	updated_at
`

export type DiscountInput = {
	name: string
	description: string | null
	discount_type: 'percent' | 'fixed'
	discount_value: number
	max_discount_amount: number | null
	rules: DiscountRule[]
	rule_match: RuleMatch
	auto_apply: boolean
	priority: number
	is_stackable: boolean
	stackable_with_coupons: boolean
	valid_from: string
	valid_until: string | null
	active_days: number[]
	start_time: string | null
	end_time: string | null
	usage_limit: number | null
	per_customer_limit: number | null
	is_active: boolean
}

/**
 * Confirms the signed-in user belongs to `tenantId`. RLS already enforces this
 * at the row level; failing fast here produces a clearer error than an empty
 * result set.
 */
async function requireTenantAccess(tenantId: string) {
	const supabase = await createSupabaseServerClient()

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to manage discounts.')
	}

	const { data: membership } = await supabase
		.from('profile_tenants')
		.select('tenant_id')
		.eq('profile_id', user.id)
		.eq('tenant_id', tenantId)
		.maybeSingle()

	if (!membership) {
		throw new Error('Unauthorized: you do not have access to this tenant.')
	}

	return { supabase, user }
}

const VALID_FIELDS = new Set<string>(DISCOUNT_RULE_FIELDS.map((f) => f.value))
const NUMERIC_FIELDS = new Set<string>(
	DISCOUNT_RULE_FIELDS.filter((f) => f.kind === 'numeric').map((f) => f.value)
)
const VALID_NUMERIC_OPS = new Set<string>(NUMERIC_OPERATORS.map((o) => o.value))
const VALID_SET_OPS = new Set<string>(SET_OPERATORS.map((o) => o.value))
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

/**
 * Normalises and validates rules coming from the browser. Anything the engine
 * could not interpret is rejected here rather than being silently stored, since
 * an unreadable rule would make the discount never fire.
 */
function sanitizeRules(rules: unknown): DiscountRule[] {
	if (!Array.isArray(rules)) return []

	return rules.map((raw, index) => {
		const position = index + 1

		if (!raw || typeof raw !== 'object') {
			throw new Error(`Rule ${position} is malformed.`)
		}

		const rule = raw as Partial<DiscountRule>
		const field = String(rule.field ?? '')
		const operator = String(rule.operator ?? '')

		if (!VALID_FIELDS.has(field)) {
			throw new Error(`Rule ${position}: "${field}" is not a supported field.`)
		}

		const isNumericField = NUMERIC_FIELDS.has(field)
		const allowedOps = isNumericField ? VALID_NUMERIC_OPS : VALID_SET_OPS

		if (!allowedOps.has(operator)) {
			throw new Error(
				`Rule ${position}: "${operator}" cannot be used with this field.`
			)
		}

		if (isNumericField) {
			const value = Number(rule.value)
			if (!Number.isFinite(value)) {
				throw new Error(`Rule ${position} needs a numeric value.`)
			}
			return {
				field: field as DiscountRuleField,
				operator: operator as DiscountRuleOperator,
				value
			}
		}

		const values = (Array.isArray(rule.value) ? rule.value : [rule.value])
			.filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
			.map((v) => String(v).trim())

		if (values.length === 0) {
			throw new Error(`Rule ${position} needs at least one value.`)
		}

		return {
			field: field as DiscountRuleField,
			operator: operator as DiscountRuleOperator,
			value: values
		}
	})
}

function sanitizeInput(input: DiscountInput) {
	const name = (input.name ?? '').trim()
	if (!name) {
		throw new Error('Discount name is required.')
	}

	if (input.discount_type !== 'percent' && input.discount_type !== 'fixed') {
		throw new Error('Discount type must be percent or fixed.')
	}

	const discountValue = Number(input.discount_value)
	if (!Number.isFinite(discountValue) || discountValue <= 0) {
		throw new Error('Discount value must be greater than zero.')
	}
	if (input.discount_type === 'percent' && discountValue > 100) {
		throw new Error('A percentage discount cannot exceed 100%.')
	}

	const validFrom = new Date(input.valid_from)
	if (Number.isNaN(validFrom.getTime())) {
		throw new Error('Start date and time is invalid.')
	}

	let validUntil: Date | null = null
	if (input.valid_until) {
		validUntil = new Date(input.valid_until)
		if (Number.isNaN(validUntil.getTime())) {
			throw new Error('End date and time is invalid.')
		}
		if (validUntil <= validFrom) {
			throw new Error('End date and time must be after the start.')
		}
	}

	const activeDays = Array.from(
		new Set(
			(Array.isArray(input.active_days) ? input.active_days : [])
				.map((day) => Number(day))
				.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
		)
	).sort()

	const normalizeTime = (value: string | null, label: string) => {
		if (!value) return null
		const trimmed = value.trim()
		if (!trimmed) return null
		if (!TIME_PATTERN.test(trimmed)) {
			throw new Error(`${label} must be a valid time (HH:MM).`)
		}
		return trimmed.length === 5 ? `${trimmed}:00` : trimmed
	}

	const positiveIntOrNull = (value: number | null, label: string) => {
		if (value === null || value === undefined || Number(value) === 0) return null
		const parsed = Number(value)
		if (!Number.isInteger(parsed) || parsed <= 0) {
			throw new Error(`${label} must be a whole number greater than zero.`)
		}
		return parsed
	}

	let maxDiscount: number | null = null
	if (
		input.max_discount_amount !== null &&
		input.max_discount_amount !== undefined &&
		Number(input.max_discount_amount) > 0
	) {
		maxDiscount = Number(input.max_discount_amount)
	}

	return {
		name,
		description: (input.description ?? '')?.trim() || null,
		discount_type: input.discount_type,
		discount_value: discountValue,
		max_discount_amount: maxDiscount,
		rules: sanitizeRules(input.rules),
		rule_match: input.rule_match === 'any' ? 'any' : 'all',
		auto_apply: input.auto_apply !== false,
		priority: Number.isFinite(Number(input.priority))
			? Math.trunc(Number(input.priority))
			: 0,
		is_stackable: input.is_stackable === true,
		stackable_with_coupons: input.stackable_with_coupons === true,
		valid_from: validFrom.toISOString(),
		valid_until: validUntil ? validUntil.toISOString() : null,
		active_days: activeDays,
		start_time: normalizeTime(input.start_time, 'Start time'),
		end_time: normalizeTime(input.end_time, 'End time'),
		usage_limit: positiveIntOrNull(input.usage_limit, 'Usage limit'),
		per_customer_limit: positiveIntOrNull(
			input.per_customer_limit,
			'Per customer limit'
		),
		is_active: input.is_active !== false
	}
}

export async function createOrUpdateDiscount(
	tenantId: string,
	discountId: string | null,
	input: DiscountInput
) {
	const { supabase, user } = await requireTenantAccess(tenantId)
	const payload = sanitizeInput(input)

	if (discountId) {
		const { error } = await supabase
			.from('discounts')
			.update({ ...payload, updated_at: new Date().toISOString() })
			.eq('id', discountId)
			.eq('tenant_id', tenantId)

		if (error) throw new Error(error.message)
	} else {
		const { error } = await supabase.from('discounts').insert({
			tenant_id: tenantId,
			...payload,
			created_by: user.id
		})

		if (error) throw new Error(error.message)
	}

	revalidatePath('/settings')
	revalidatePath('/pos')
	return { success: true }
}

export async function deleteDiscount(tenantId: string, discountId: string) {
	const { supabase } = await requireTenantAccess(tenantId)

	const { error } = await supabase
		.from('discounts')
		.delete()
		.eq('id', discountId)
		.eq('tenant_id', tenantId)

	if (error) throw new Error(error.message)

	revalidatePath('/settings')
	revalidatePath('/pos')
	return { success: true }
}

export async function setDiscountActive(
	tenantId: string,
	discountId: string,
	isActive: boolean
) {
	const { supabase } = await requireTenantAccess(tenantId)

	const { error } = await supabase
		.from('discounts')
		.update({ is_active: isActive, updated_at: new Date().toISOString() })
		.eq('id', discountId)
		.eq('tenant_id', tenantId)

	if (error) throw new Error(error.message)

	revalidatePath('/settings')
	revalidatePath('/pos')
	return { success: true }
}

export async function listDiscounts(tenantId: string) {
	const { supabase } = await requireTenantAccess(tenantId)

	const { data, error } = await supabase
		.from('discounts')
		.select(DISCOUNT_COLUMNS)
		.eq('tenant_id', tenantId)
		.order('priority', { ascending: false })
		.order('created_at', { ascending: false })

	if (error) throw new Error(error.message)

	return (data ?? []) as unknown as DiscountRecord[]
}

/**
 * Discounts the POS needs in order to preview auto-application. Only rows that
 * are switched on and inside their validity window are returned; the engine
 * still re-checks everything client-side.
 */
export async function getApplicableDiscounts(
	tenantId: string
): Promise<DiscountRecord[]> {
	const supabase = await createSupabaseServerClient()
	const nowIso = new Date().toISOString()

	const { data, error } = await supabase
		.from('discounts')
		.select(DISCOUNT_COLUMNS)
		.eq('tenant_id', tenantId)
		.eq('is_active', true)
		.lte('valid_from', nowIso)
		.or(`valid_until.is.null,valid_until.gte.${nowIso}`)
		.order('priority', { ascending: false })

	if (error) {
		console.error('Error loading discounts:', error.message)
		return []
	}

	return (data ?? []) as unknown as DiscountRecord[]
}

export type EvaluateDiscountsRequest = {
	subtotal: number
	itemCount: number
	orderType: string
	menuItemIds?: string[]
	customerPhone?: string | null
	couponApplied?: boolean
	excludedDiscountIds?: string[]
	/** Set to false to include manual-only discounts in the result. */
	autoOnly?: boolean
}

/**
 * Server-authoritative evaluation. The cart runs the same engine for instant
 * feedback, but this is the version used when money is written, so a tampered
 * client cannot invent a discount.
 *
 * Category membership is resolved from the database rather than trusted from the
 * request, and per-customer caps are counted here.
 */
export async function evaluateOrderDiscounts(
	tenantId: string,
	request: EvaluateDiscountsRequest
): Promise<DiscountEvaluation> {
	const supabase = await createSupabaseServerClient()

	const discounts = await getApplicableDiscounts(tenantId)
	if (discounts.length === 0) {
		return { applied: [], skipped: [], totalDiscount: 0, couponAllowed: true }
	}

	const menuItemIds = Array.from(
		new Set((request.menuItemIds ?? []).filter(Boolean))
	)

	// Resolve categories server-side so a `contains_category` rule cannot be
	// spoofed by the client.
	let categoryIds: string[] = []
	if (menuItemIds.length > 0) {
		const { data: menuItems } = await supabase
			.from('menu_items')
			.select('id, category_id')
			.eq('tenant_id', tenantId)
			.in('id', menuItemIds)

		categoryIds = Array.from(
			new Set(
				(menuItems ?? [])
					.map((item) => item.category_id as string | null)
					.filter((id): id is string => Boolean(id))
			)
		)
	}

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.maybeSingle()

	const settings = (tenant?.settings as Record<string, unknown> | null) ?? {}
	const timeZone = (settings.timezone as string | undefined) ?? null

	const phone = request.customerPhone?.trim() || null

	let isReturningCustomer = false
	const customerUsageByDiscountId: Record<string, number> = {}

	if (phone) {
		const { data: customer } = await supabase
			.from('customers')
			.select('id')
			.eq('tenant_id', tenantId)
			.eq('phone', phone)
			.maybeSingle()

		isReturningCustomer = Boolean(customer)

		const limited = discounts.filter(
			(d) => typeof d.per_customer_limit === 'number' && d.per_customer_limit > 0
		)

		if (limited.length > 0) {
			const { data: usages } = await supabase
				.from('discount_usages')
				.select('discount_id')
				.eq('tenant_id', tenantId)
				.eq('customer_phone', phone)
				.in(
					'discount_id',
					limited.map((d) => d.id)
				)

			for (const usage of usages ?? []) {
				const id = usage.discount_id as string
				customerUsageByDiscountId[id] =
					(customerUsageByDiscountId[id] ?? 0) + 1
			}
		}
	}

	const ctx: OrderContext = {
		subtotal: Number(request.subtotal) || 0,
		itemCount: Number(request.itemCount) || 0,
		orderType: request.orderType || 'dine_in',
		categoryIds,
		menuItemIds,
		isReturningCustomer,
		customerPhone: phone,
		couponApplied: request.couponApplied === true,
		timeZone,
		customerUsageByDiscountId,
		excludedDiscountIds: request.excludedDiscountIds ?? []
	}

	return evaluateDiscounts(discounts, ctx, {
		autoOnly: request.autoOnly !== false
	})
}

/**
 * Writes the audit rows for the discounts an order actually consumed and bumps
 * each usage counter. Best-effort: a logging failure must not void a completed
 * sale, so failures are reported but not thrown.
 */
export async function recordDiscountUsages(
	tenantId: string,
	orderId: string,
	applied: Array<{ id: string; amount: number }>,
	customerPhone?: string | null
) {
	if (!applied || applied.length === 0) return { success: true }

	const supabase = await createSupabaseServerClient()
	const phone = customerPhone?.trim() || null

	const results = await Promise.allSettled(
		applied.map((entry) =>
			supabase.rpc('record_discount_usage', {
				p_tenant_id: tenantId,
				p_discount_id: entry.id,
				p_order_id: orderId,
				p_customer_phone: phone,
				p_amount: entry.amount
			})
		)
	)

	const failed = results.filter(
		(result) =>
			result.status === 'rejected' ||
			(result.status === 'fulfilled' && result.value.error)
	)

	if (failed.length > 0) {
		console.error(
			`Failed to record ${failed.length} discount usage row(s) for order ${orderId}`
		)
	}

	return { success: failed.length === 0 }
}
