'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function createAdminClient() {
	if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing admin credentials')
	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	})
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type StaffMember = {
	id: string
	email: string
	fullName: string | null
	roleName: string | null
	monthlySalary: number
	isActive: boolean
	salaryId: string | null
}

export type StaffAdvance = {
	id: string
	profileId: string
	amount: number
	reason: string | null
	advanceDate: string
	status: string
	approvedBy: string | null
	createdAt: string
}

export type AttendanceRecord = {
	id: string
	profileId: string
	date: string
	checkIn: string | null
	checkOut: string | null
	status: string
	notes: string | null
}

// ─── Toggle Staff Status ─────────────────────────────────────────────────────

export async function toggleStaffStatus(tenantId: string, profileId: string, isStaff: boolean) {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	const { error } = await admin
		.from('profile_tenants')
		.update({ is_staff: isStaff })
		.eq('tenant_id', tenantId)
		.eq('profile_id', profileId)

	if (error) throw new Error(error.message)
	revalidatePath('/staff')
	revalidatePath('/settings')
}

// ─── Staff & Salary ──────────────────────────────────────────────────────────

export async function getStaffWithSalary(tenantId: string): Promise<StaffMember[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	// Get profile_tenants - try with is_staff filter first, fallback to role-based
	let pts: any[] = []

	const { data: allPts, error: ptsError } = await admin
		.from('profile_tenants')
		.select('profile_id, role_id, is_staff')
		.eq('tenant_id', tenantId)

	console.log('[Staff] All profile_tenants for tenant:', tenantId, allPts, ptsError)

	if (ptsError || !allPts) {
		console.error('[Staff] Error fetching profile_tenants:', ptsError)
		return []
	}

	// Filter: show users marked as staff, OR users with a role (non-owner), excluding current user
	pts = allPts.filter((pt: any) => {
		if (pt.is_staff === true) return true
		// Fallback: if no one is marked as staff, show users with roles (not owner)
		if (!allPts.some((p: any) => p.is_staff === true)) {
			return pt.role_id !== null && pt.profile_id !== user.id
		}
		return false
	})

	console.log('[Staff] Filtered staff members:', pts.length)

	if (pts.length === 0) return []

	// Get salary configs
	const { data: salaries } = await admin
		.from('staff_salaries')
		.select('*')
		.eq('tenant_id', tenantId)

	const salaryMap = new Map<string, any>()
	salaries?.forEach((s) => salaryMap.set(s.profile_id, s))

	// Get roles
	const roleIds = pts.map((p) => p.role_id).filter(Boolean) as string[]
	const { data: roles } = roleIds.length > 0
		? await admin.from('roles').select('id, name').in('id', roleIds)
		: { data: [] }
	const roleMap = new Map<string, string>()
	roles?.forEach((r) => roleMap.set(r.id, r.name))

	// Build staff list
	const staff: StaffMember[] = []
	for (const pt of pts) {
		const { data: { user: authUser } } = await admin.auth.admin.getUserById(pt.profile_id)
		if (!authUser) continue

		const { data: profile } = await admin
			.from('profiles')
			.select('full_name')
			.eq('id', pt.profile_id)
			.single()

		const salary = salaryMap.get(pt.profile_id)

		staff.push({
			id: pt.profile_id,
			email: authUser.email || '',
			fullName: profile?.full_name || null,
			roleName: pt.role_id ? roleMap.get(pt.role_id) || null : null,
			monthlySalary: salary?.monthly_salary || 0,
			isActive: salary?.is_active !== false,
			salaryId: salary?.id || null
		})
	}

	return staff
}

export async function upsertStaffSalary(
	tenantId: string,
	profileId: string,
	data: { monthlySalary: number; bankAccount?: string; notes?: string }
) {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	const { error } = await admin.from('staff_salaries').upsert(
		{
			tenant_id: tenantId,
			profile_id: profileId,
			monthly_salary: data.monthlySalary,
			bank_account: data.bankAccount || null,
			notes: data.notes || null,
			is_active: true,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'tenant_id,profile_id', ignoreDuplicates: false }
	)

	// If upsert fails due to missing unique constraint, try insert/update
	if (error) {
		const { data: existing } = await admin
			.from('staff_salaries')
			.select('id')
			.eq('tenant_id', tenantId)
			.eq('profile_id', profileId)
			.single()

		if (existing) {
			await admin.from('staff_salaries').update({
				monthly_salary: data.monthlySalary,
				bank_account: data.bankAccount || null,
				notes: data.notes || null,
				updated_at: new Date().toISOString()
			}).eq('id', existing.id)
		} else {
			await admin.from('staff_salaries').insert({
				tenant_id: tenantId,
				profile_id: profileId,
				monthly_salary: data.monthlySalary,
				bank_account: data.bankAccount || null,
				notes: data.notes || null,
				is_active: true
			})
		}
	}

	revalidatePath('/staff')
}

// ─── Advances ────────────────────────────────────────────────────────────────

export async function getStaffAdvances(
	tenantId: string,
	profileId?: string,
	month?: string // YYYY-MM
): Promise<StaffAdvance[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	let query = admin
		.from('staff_advances')
		.select('*')
		.eq('tenant_id', tenantId)
		.order('advance_date', { ascending: false })

	if (profileId) query = query.eq('profile_id', profileId)
	if (month) {
		const startDate = `${month}-01`
		// Calculate last day of month properly
		const [year, mon] = month.split('-').map(Number)
		const lastDay = new Date(year!, mon!, 0).getDate()
		const endDate = `${month}-${String(lastDay).padStart(2, '0')}`
		query = query.gte('advance_date', startDate).lte('advance_date', endDate)
	}

	const { data, error } = await query
	if (error) throw new Error(error.message)

	return (data || []).map((a) => ({
		id: a.id,
		profileId: a.profile_id,
		amount: a.amount,
		reason: a.reason,
		advanceDate: a.advance_date,
		status: a.status,
		approvedBy: a.approved_by,
		createdAt: a.created_at
	}))
}

export async function createAdvance(
	tenantId: string,
	profileId: string,
	data: { amount: number; reason?: string; date?: string }
) {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	const { error } = await admin.from('staff_advances').insert({
		tenant_id: tenantId,
		profile_id: profileId,
		amount: data.amount,
		reason: data.reason || null,
		advance_date: data.date || new Date().toISOString().split('T')[0],
		status: 'approved',
		approved_by: user.id
	})

	if (error) throw new Error(error.message)
	revalidatePath('/staff')
}

export async function deleteAdvance(advanceId: string) {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()
	const { error } = await admin.from('staff_advances').delete().eq('id', advanceId)
	if (error) throw new Error(error.message)
	revalidatePath('/staff')
}

// ─── Attendance ──────────────────────────────────────────────────────────────

export async function getAttendance(
	tenantId: string,
	date?: string, // YYYY-MM-DD
	profileId?: string
): Promise<AttendanceRecord[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	let query = admin
		.from('staff_attendance')
		.select('*')
		.eq('tenant_id', tenantId)
		.order('date', { ascending: false })

	if (date) query = query.eq('date', date)
	if (profileId) query = query.eq('profile_id', profileId)

	const { data, error } = await query
	if (error) throw new Error(error.message)

	return (data || []).map((a) => ({
		id: a.id,
		profileId: a.profile_id,
		date: a.date,
		checkIn: a.check_in,
		checkOut: a.check_out,
		status: a.status,
		notes: a.notes
	}))
}

export async function markAttendance(
	tenantId: string,
	profileId: string,
	data: { date: string; status: string; checkIn?: string; checkOut?: string; notes?: string }
) {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	// Upsert attendance for this date
	const { error } = await admin.from('staff_attendance').upsert(
		{
			tenant_id: tenantId,
			profile_id: profileId,
			date: data.date,
			status: data.status,
			check_in: data.checkIn || null,
			check_out: data.checkOut || null,
			notes: data.notes || null
		},
		{ onConflict: 'tenant_id,profile_id,date' }
	)

	if (error) throw new Error(error.message)
	revalidatePath('/staff')
}

// Get all attendance records for a whole month (all staff)
export async function getMonthlyAttendance(
	tenantId: string,
	month: string // YYYY-MM
): Promise<AttendanceRecord[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	const [year, mon] = month.split('-').map(Number)
	const lastDay = new Date(year!, mon!, 0).getDate()
	const startDate = `${month}-01`
	const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

	const { data, error } = await admin
		.from('staff_attendance')
		.select('*')
		.eq('tenant_id', tenantId)
		.gte('date', startDate)
		.lte('date', endDate)
		.order('date', { ascending: true })

	if (error) throw new Error(error.message)

	return (data || []).map((a) => ({
		id: a.id,
		profileId: a.profile_id,
		date: a.date,
		checkIn: a.check_in,
		checkOut: a.check_out,
		status: a.status,
		notes: a.notes
	}))
}

export async function getMonthlyAttendanceSummary(
	tenantId: string,
	profileId: string,
	month: string // YYYY-MM
): Promise<{ present: number; absent: number; halfDay: number; leave: number; totalDays: number }> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	const startDate = `${month}-01`
	const endDate = `${month}-31`

	const { data } = await admin
		.from('staff_attendance')
		.select('status')
		.eq('tenant_id', tenantId)
		.eq('profile_id', profileId)
		.gte('date', startDate)
		.lte('date', endDate)

	const records = data || []
	return {
		present: records.filter((r) => r.status === 'present').length,
		absent: records.filter((r) => r.status === 'absent').length,
		halfDay: records.filter((r) => r.status === 'half_day').length,
		leave: records.filter((r) => r.status === 'leave').length,
		totalDays: records.length
	}
}
