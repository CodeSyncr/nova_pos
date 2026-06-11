import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Aggregated staff data for the given tenant + month.
 *
 * The web Staff page does its reads via the service-role key because
 * `profile_tenants` is RLS-gated to the requesting user's own row. The iOS
 * app only carries a normal bearer token, so it can't see other tenant
 * members directly. This endpoint:
 *
 *   1. Validates the caller's bearer token AND that they belong to the
 *      requested tenant (via the user-scoped client → respects RLS).
 *   2. Reads the rest with the service-role admin client to bypass RLS
 *      for inter-member lookups.
 *   3. Returns staff list, monthly advances, and monthly attendance in a
 *      single response so iOS only does one round trip.
 *
 * GET /api/staff/data?tenantId=<uuid>&month=YYYY-MM
 */
export async function GET(request: NextRequest) {
	try {
		if (!supabaseUrl || !supabaseServiceKey) {
			return NextResponse.json({ error: 'Server admin credentials missing' }, { status: 500 })
		}
		const { searchParams } = new URL(request.url)
		const tenantId = searchParams.get('tenantId') || ''
		const month = searchParams.get('month') || ''
		if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
		if (!/^\d{4}-\d{2}$/.test(month)) {
			return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
		}

		// 1. Identity check — runs against the user-scoped client (RLS-aware).
		const userClient = await createSupabaseServerClient()
		const { data: authData, error: authErr } = await userClient.auth.getUser()
		if (authErr || !authData?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
		const callerId = authData.user.id

		// User must have a row in profile_tenants for this tenant; RLS lets
		// them see their own row at minimum.
		const { data: callerLink } = await userClient
			.from('profile_tenants')
			.select('profile_id, role_id, is_staff')
			.eq('profile_id', callerId)
			.eq('tenant_id', tenantId)
			.maybeSingle()
		if (!callerLink) {
			return NextResponse.json({ error: 'No access to this tenant' }, { status: 403 })
		}

		// 2. Privileged reads with the admin client.
		const admin = createClient(supabaseUrl, supabaseServiceKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		})

		// 2a. profile_tenants for the whole tenant.
		const { data: ptRows, error: ptErr } = await admin
			.from('profile_tenants')
			.select('profile_id, role_id, is_staff')
			.eq('tenant_id', tenantId)
		if (ptErr) {
			return NextResponse.json({ error: ptErr.message }, { status: 500 })
		}

		// Filter logic mirrors the web's Staff page:
		// - if anyone is explicitly flagged `is_staff = true`, those are the
		//   staff;
		// - otherwise fall back to "anyone with a role except the owner
		//   (current caller)".
		const allRows = ptRows || []
		const anyFlagged = allRows.some((r) => r.is_staff === true)
		const filtered = anyFlagged
			? allRows.filter((r) => r.is_staff === true)
			: allRows.filter((r) => r.role_id !== null && r.profile_id !== callerId)

		const profileIds = filtered.map((r) => r.profile_id)
		const roleIds = Array.from(new Set(filtered.map((r) => r.role_id).filter(Boolean) as string[]))

		// 2b. profiles → display names.
		const profileMap = new Map<string, string>()
		if (profileIds.length > 0) {
			const { data: profiles } = await admin
				.from('profiles')
				.select('id, full_name')
				.in('id', profileIds)
			profiles?.forEach((p) => {
				if (p.full_name) profileMap.set(p.id, p.full_name)
			})
		}

		// 2c. auth.users → emails (admin-only, but useful as a fallback display).
		const emailMap = new Map<string, string>()
		for (const pid of profileIds) {
			try {
				const { data } = await admin.auth.admin.getUserById(pid)
				if (data?.user?.email) emailMap.set(pid, data.user.email)
			} catch {
				// non-fatal — name fallback still works
			}
		}

		// 2d. roles
		const roleMap = new Map<string, string>()
		if (roleIds.length > 0) {
			const { data: roles } = await admin
				.from('roles')
				.select('id, name')
				.in('id', roleIds)
			roles?.forEach((r) => roleMap.set(r.id, r.name))
		}

		// 2e. salaries
		const salaryMap = new Map<string, { id: string; monthly_salary: number }>()
		const { data: salaries } = await admin
			.from('staff_salaries')
			.select('id, profile_id, monthly_salary')
			.eq('tenant_id', tenantId)
		salaries?.forEach((s) => {
			salaryMap.set(s.profile_id, {
				id: s.id,
				monthly_salary: Number(s.monthly_salary) || 0
			})
		})

		// 2f. advances + attendance for the month
		const startDate = `${month}-01`
		const [yStr, mStr] = month.split('-')
		const lastDay = new Date(Number(yStr), Number(mStr), 0).getDate()
		const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

		const { data: advances } = await admin
			.from('staff_advances')
			.select('id, profile_id, amount, reason, advance_date')
			.eq('tenant_id', tenantId)
			.gte('advance_date', startDate)
			.lte('advance_date', endDate)
			.order('advance_date', { ascending: false })

		const { data: attendance } = await admin
			.from('staff_attendance')
			.select('id, profile_id, date, status')
			.eq('tenant_id', tenantId)
			.gte('date', startDate)
			.lte('date', endDate)

		const staff = filtered.map((r) => {
			const fullName = profileMap.get(r.profile_id)
			const email = emailMap.get(r.profile_id)
			const display =
				fullName || email || `Staff ${r.profile_id.slice(0, 6)}`
			const sal = salaryMap.get(r.profile_id)
			return {
				id: r.profile_id,
				displayName: display,
				roleName: r.role_id ? roleMap.get(r.role_id) || null : null,
				monthlySalary: sal?.monthly_salary || 0,
				salaryRowId: sal?.id || null
			}
		})

		return NextResponse.json({
			staff,
			advances: (advances || []).map((a) => ({
				id: a.id,
				profileId: a.profile_id,
				amount: Number(a.amount) || 0,
				reason: a.reason,
				advanceDate: a.advance_date
			})),
			attendance: (attendance || []).map((r) => ({
				id: r.id,
				profileId: r.profile_id,
				date: r.date,
				status: r.status
			}))
		})
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to load staff data'
		console.error('[staff/data]', message)
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
