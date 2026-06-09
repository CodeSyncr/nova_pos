'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
	UserCog,
	IndianRupee,
	Banknote,
	Check,
	X,
	Loader2,
	Users,
	ChevronLeft,
	ChevronRight,
	Wallet,
	CalendarDays
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import {
	getStaffWithSalary,
	upsertStaffSalary,
	getStaffAdvances,
	createAdvance,
	deleteAdvance,
	getMonthlyAttendance,
	markAttendance,
	type StaffMember,
	type StaffAdvance,
	type AttendanceRecord
} from '@/app/actions/staff'

type Tab = 'overview' | 'attendance' | 'advances'

const STATUS_CONFIG: Record<string, { label: string; short: string; dot: string; chip: string }> = {
	present: { label: 'Present', short: 'P', dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
	half_day: { label: 'Half Day', short: 'H', dot: 'bg-amber-400', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
	absent: { label: 'Absent', short: 'A', dot: 'bg-red-400', chip: 'bg-red-500/15 text-red-300 border-red-500/30' },
	leave: { label: 'Leave', short: 'L', dot: 'bg-blue-400', chip: 'bg-blue-500/15 text-blue-300 border-blue-500/30' }
}

export default function StaffPage() {
	const router = useRouter()
	const { success, error: showError } = useToast()

	const [tenantId, setTenantId] = useState('')
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	const [loading, setLoading] = useState(true)

	const [activeTab, setActiveTab] = useState<Tab>('overview')
	const [staff, setStaff] = useState<StaffMember[]>([])
	const [advances, setAdvances] = useState<StaffAdvance[]>([])
	const [monthAttendance, setMonthAttendance] = useState<AttendanceRecord[]>([])
	const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))

	// Modals
	const [showSalaryForm, setShowSalaryForm] = useState(false)
	const [showAdvanceForm, setShowAdvanceForm] = useState(false)
	const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
	const [salaryInput, setSalaryInput] = useState('')
	const [advanceAmount, setAdvanceAmount] = useState('')
	const [advanceReason, setAdvanceReason] = useState('')
	const [saving, setSaving] = useState(false)
	const [markingCell, setMarkingCell] = useState<string | null>(null)

	useEffect(() => {
		const load = async () => {
			const supabase = createSupabaseBrowserClient()
			const { data: { user } } = await supabase.auth.getUser()
			if (!user) { router.push('/login'); return }

			const { data: pt } = await supabase
				.from('profile_tenants')
				.select('tenant_id, tenant:tenants(settings)')
				.eq('profile_id', user.id)
				.single()

			const tenant = Array.isArray((pt as any)?.tenant) ? (pt as any).tenant[0] : (pt as any)?.tenant
			if (!pt) { router.push('/onboarding'); return }

			setTenantId(pt.tenant_id)
			const settings = tenant?.settings as Record<string, unknown> | null
			if (settings?.currencySymbol) setCurrencySymbol(settings.currencySymbol as string)
		}
		load()
	}, [router])

	const loadData = useCallback(async () => {
		if (!tenantId) return
		try {
			const [staffData, advancesData, attendanceData] = await Promise.all([
				getStaffWithSalary(tenantId),
				getStaffAdvances(tenantId, undefined, selectedMonth),
				getMonthlyAttendance(tenantId, selectedMonth)
			])
			setStaff(staffData)
			setAdvances(advancesData)
			setMonthAttendance(attendanceData)
		} catch (err: any) {
			showError(err.message || 'Failed to load staff data')
		} finally {
			setLoading(false)
		}
	}, [tenantId, selectedMonth, showError])

	useEffect(() => {
		if (tenantId) loadData()
	}, [tenantId, loadData])

	const fmt = (n: number) => `${currencySymbol}${n.toLocaleString('en-IN')}`

	// ─── Month helpers ────────────────────────────────────────────────────────
	const [year, mon] = selectedMonth.split('-').map(Number)
	const daysInMonth = new Date(year!, mon!, 0).getDate()
	const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
	const monthLabel = new Date(year!, mon! - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
	const todayStr = new Date().toISOString().split('T')[0]

	const shiftMonth = (delta: number) => {
		const d = new Date(year!, mon! - 1 + delta, 1)
		setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
	}

	// Attendance lookup: profileId -> date -> status
	const attendanceMap = new Map<string, Map<string, string>>()
	monthAttendance.forEach((rec) => {
		if (!attendanceMap.has(rec.profileId)) attendanceMap.set(rec.profileId, new Map())
		attendanceMap.get(rec.profileId)!.set(rec.date, rec.status)
	})

	const getStatus = (profileId: string, day: number) => {
		const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`
		return attendanceMap.get(profileId)?.get(dateStr)
	}

	const cycleStatus = async (profileId: string, day: number) => {
		const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`
		const current = getStatus(profileId, day)
		// cycle: none -> present -> half_day -> absent -> leave -> none
		const order = ['present', 'half_day', 'absent', 'leave']
		const idx = current ? order.indexOf(current) : -1
		const next = order[idx + 1] // undefined means clear (set absent removal not supported, so just set leave->present cycle)
		const newStatus = next || 'present'

		const cellKey = `${profileId}-${day}`
		setMarkingCell(cellKey)
		try {
			await markAttendance(tenantId, profileId, {
				date: dateStr,
				status: newStatus,
				checkIn: newStatus === 'present' || newStatus === 'half_day' ? new Date().toISOString() : undefined
			})
			// Optimistic local update
			if (!attendanceMap.has(profileId)) attendanceMap.set(profileId, new Map())
			attendanceMap.get(profileId)!.set(dateStr, newStatus)
			setMonthAttendance((prev) => {
				const existing = prev.find((r) => r.profileId === profileId && r.date === dateStr)
				if (existing) {
					return prev.map((r) => (r.profileId === profileId && r.date === dateStr ? { ...r, status: newStatus } : r))
				}
				return [...prev, { id: `${profileId}-${dateStr}`, profileId, date: dateStr, checkIn: null, checkOut: null, status: newStatus, notes: null }]
			})
		} catch (err: any) {
			showError(err.message)
		} finally {
			setMarkingCell(null)
		}
	}

	const handleSaveSalary = async () => {
		if (!selectedStaff || !salaryInput) return
		setSaving(true)
		try {
			await upsertStaffSalary(tenantId, selectedStaff.id, { monthlySalary: parseFloat(salaryInput) })
			success('Salary updated')
			setShowSalaryForm(false)
			loadData()
		} catch (err: any) { showError(err.message) } finally { setSaving(false) }
	}

	const handleCreateAdvance = async () => {
		if (!selectedStaff || !advanceAmount) return
		setSaving(true)
		try {
			await createAdvance(tenantId, selectedStaff.id, { amount: parseFloat(advanceAmount), reason: advanceReason || undefined })
			success('Advance recorded')
			setShowAdvanceForm(false)
			setAdvanceAmount('')
			setAdvanceReason('')
			loadData()
		} catch (err: any) { showError(err.message) } finally { setSaving(false) }
	}

	const handleDeleteAdvance = async (id: string) => {
		if (!confirm('Delete this advance?')) return
		try {
			await deleteAdvance(id)
			success('Advance deleted')
			loadData()
		} catch (err: any) { showError(err.message) }
	}

	// Per-staff month summary
	const getSummary = (profileId: string) => {
		const map = attendanceMap.get(profileId)
		let present = 0, half = 0, absent = 0, leave = 0
		map?.forEach((status) => {
			if (status === 'present') present++
			else if (status === 'half_day') half++
			else if (status === 'absent') absent++
			else if (status === 'leave') leave++
		})
		return { present, half, absent, leave }
	}

	const totalSalary = staff.reduce((s, m) => s + m.monthlySalary, 0)
	const totalAdvances = advances.reduce((s, a) => s + a.amount, 0)

	if (loading) {
		return (
			<div className="flex flex-col gap-8 py-6">
				<div className="space-y-3">
					<div className="h-6 w-32 rounded-full bg-white/10 animate-pulse" />
					<div className="h-10 w-64 rounded-xl bg-white/10 animate-pulse" />
				</div>
				<div className="grid gap-4 md:grid-cols-3">
					{[1, 2, 3].map((i) => (
						<div key={i} className="h-32 rounded-2xl border border-white/10 bg-white/5 animate-pulse" />
					))}
				</div>
				<div className="h-64 rounded-2xl border border-white/10 bg-white/5 animate-pulse" />
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-6 py-6">
			{/* Header */}
			<header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<div className="flex items-center gap-2 mb-2">
						<div className="rounded-xl bg-[#E0342A]/15 border border-[#E0342A]/30 p-2">
							<UserCog className="h-4 w-4 text-[#E0342A]" />
						</div>
						<span className="text-xs uppercase tracking-[0.3em] text-white/40">Staff Management</span>
					</div>
					<h1 className="text-3xl font-semibold text-white">Team & Payroll</h1>
				</div>
				{/* Month switcher */}
				<div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
					<button onClick={() => shiftMonth(-1)} className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
						<ChevronLeft className="h-4 w-4" />
					</button>
					<span className="min-w-[130px] text-center text-sm font-medium text-white">{monthLabel}</span>
					<button onClick={() => shiftMonth(1)} className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
						<ChevronRight className="h-4 w-4" />
					</button>
				</div>
			</header>

			{/* Summary stats */}
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
				<StatCard icon={<Users className="h-5 w-5" />} label="Team Members" value={staff.length.toString()} color="from-blue-500/20 to-cyan-500/20" />
				<StatCard icon={<Wallet className="h-5 w-5" />} label="Monthly Payroll" value={fmt(totalSalary)} color="from-emerald-500/20 to-green-500/20" />
				<StatCard icon={<Banknote className="h-5 w-5" />} label="Advances Given" value={fmt(totalAdvances)} color="from-amber-500/20 to-orange-500/20" />
				<StatCard icon={<IndianRupee className="h-5 w-5" />} label="Net Payable" value={fmt(Math.max(0, totalSalary - totalAdvances))} color="from-purple-500/20 to-pink-500/20" />
			</div>

			{/* Tabs */}
			<div className="flex gap-1 rounded-xl bg-white/5 p-1 border border-white/10 w-fit">
				{([['overview', 'Overview'], ['attendance', 'Attendance'], ['advances', 'Advances']] as [Tab, string][]).map(([tab, label]) => (
					<button
						key={tab}
						onClick={() => setActiveTab(tab)}
						className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
							activeTab === tab ? 'bg-[#E0342A] text-white shadow-lg shadow-[#E0342A]/20' : 'text-white/50 hover:text-white'
						}`}
					>
						{label}
					</button>
				))}
			</div>

			{staff.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
					<UserCog className="mx-auto h-12 w-12 text-white/20 mb-4" />
					<p className="text-white/60">No staff members yet. Mark users as staff in Settings → Users.</p>
				</div>
			) : (
				<>
					{/* ─── Overview Tab ─────────────────────────────────────── */}
					{activeTab === 'overview' && (
						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{staff.map((member) => {
								const memberAdvances = advances.filter((a) => a.profileId === member.id).reduce((s, a) => s + a.amount, 0)
								const summary = getSummary(member.id)
								const net = member.monthlySalary - memberAdvances
								return (
									<motion.div
										key={member.id}
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-5 space-y-4"
									>
										<div className="flex items-start gap-3">
											<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#E0342A]/30 to-[#E0342A]/10 text-sm font-bold text-white">
												{(member.fullName || member.email).charAt(0).toUpperCase()}
											</div>
											<div className="min-w-0 flex-1">
												<h3 className="font-semibold text-white truncate">{member.fullName || member.email}</h3>
												<p className="text-xs text-white/40 truncate">{member.roleName || 'No role'}</p>
											</div>
										</div>

										<div className="grid grid-cols-2 gap-2">
											<div className="rounded-xl bg-black/20 border border-white/5 p-3">
												<p className="text-[10px] uppercase tracking-wider text-white/40">Salary</p>
												<p className="text-base font-semibold text-white">{member.monthlySalary > 0 ? fmt(member.monthlySalary) : '—'}</p>
											</div>
											<div className="rounded-xl bg-black/20 border border-white/5 p-3">
												<p className="text-[10px] uppercase tracking-wider text-white/40">Net Payable</p>
												<p className="text-base font-semibold text-emerald-300">{fmt(Math.max(0, net))}</p>
											</div>
										</div>

										{/* Mini attendance summary */}
										<div className="flex items-center gap-3 text-xs">
											<span className="flex items-center gap-1 text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" />{summary.present}</span>
											<span className="flex items-center gap-1 text-amber-300"><span className="h-2 w-2 rounded-full bg-amber-400" />{summary.half}</span>
											<span className="flex items-center gap-1 text-red-300"><span className="h-2 w-2 rounded-full bg-red-400" />{summary.absent}</span>
											<span className="flex items-center gap-1 text-blue-300"><span className="h-2 w-2 rounded-full bg-blue-400" />{summary.leave}</span>
										</div>

										<div className="flex gap-2">
											<Button size="sm" variant="ghost" className="flex-1 border border-white/10 text-xs"
												onClick={() => { setSelectedStaff(member); setSalaryInput(member.monthlySalary.toString()); setShowSalaryForm(true) }}>
												<IndianRupee className="mr-1 h-3 w-3" /> Salary
											</Button>
											<Button size="sm" variant="ghost" className="flex-1 border border-white/10 text-xs"
												onClick={() => { setSelectedStaff(member); setShowAdvanceForm(true) }}>
												<Banknote className="mr-1 h-3 w-3" /> Advance
											</Button>
										</div>
									</motion.div>
								)
							})}
						</div>
					)}

					{/* ─── Attendance Tab — Monthly Calendar Grid ──────────── */}
					{activeTab === 'attendance' && (
						<div className="space-y-4">
							{/* Legend */}
							<div className="flex flex-wrap items-center gap-4 text-xs text-white/50">
								<span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Present</span>
								<span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Half Day</span>
								<span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Absent</span>
								<span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Leave</span>
								<span className="ml-auto text-white/30">Tap a cell to cycle status</span>
							</div>

							<div className="rounded-2xl border border-white/10 bg-white/5 overflow-x-auto">
								<table className="w-full border-collapse">
									<thead>
										<tr className="border-b border-white/10">
											<th className="sticky left-0 z-10 bg-[#0c0f1d] px-4 py-3 text-left text-xs font-medium text-white/60 min-w-[160px]">
												<div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Staff</div>
											</th>
											{days.map((day) => {
												const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`
												const isToday = dateStr === todayStr
												const dow = new Date(year!, mon! - 1, day).toLocaleDateString('en-IN', { weekday: 'short' }).charAt(0)
												return (
													<th key={day} className={`px-0 py-2 text-center text-[10px] font-medium min-w-[28px] ${isToday ? 'text-[#E0342A]' : 'text-white/40'}`}>
														<div>{day}</div>
														<div className="text-white/25">{dow}</div>
													</th>
												)
											})}
										</tr>
									</thead>
									<tbody>
										{staff.map((member) => (
											<tr key={member.id} className="border-b border-white/5">
												<td className="sticky left-0 z-10 bg-[#0c0f1d] px-4 py-2 min-w-[160px]">
													<p className="text-sm font-medium text-white truncate">{member.fullName || member.email}</p>
													<p className="text-[10px] text-white/40 truncate">{member.roleName || 'No role'}</p>
												</td>
												{days.map((day) => {
													const status = getStatus(member.id, day)
													const cfg = status ? STATUS_CONFIG[status] : null
													const cellKey = `${member.id}-${day}`
													const isMarking = markingCell === cellKey
													return (
														<td key={day} className="px-0.5 py-1 text-center">
															<button
																onClick={() => cycleStatus(member.id, day)}
																disabled={isMarking}
																className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold transition ${
																	cfg
																		? `${cfg.dot} text-black`
																		: 'bg-white/5 text-white/20 hover:bg-white/10'
																}`}
																title={cfg?.label || 'Not marked'}
															>
																{isMarking ? <Loader2 className="h-3 w-3 animate-spin" /> : cfg?.short || '·'}
															</button>
														</td>
													)
												})}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					)}

					{/* ─── Advances Tab ────────────────────────────────────── */}
					{activeTab === 'advances' && (
						<div className="space-y-4">
							{advances.length === 0 ? (
								<div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
									<Banknote className="mx-auto h-10 w-10 text-white/20 mb-3" />
									<p className="text-white/50">No advances given in {monthLabel}</p>
								</div>
							) : (
								<div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
									<table className="w-full text-sm">
										<thead>
											<tr className="border-b border-white/10 bg-white/5">
												<th className="px-5 py-3 text-left text-white/60 font-medium">Staff</th>
												<th className="px-5 py-3 text-left text-white/60 font-medium">Amount</th>
												<th className="px-5 py-3 text-left text-white/60 font-medium">Reason</th>
												<th className="px-5 py-3 text-left text-white/60 font-medium">Date</th>
												<th className="px-5 py-3 text-right text-white/60 font-medium">Action</th>
											</tr>
										</thead>
										<tbody>
											{advances.map((adv) => {
												const member = staff.find((s) => s.id === adv.profileId)
												return (
													<tr key={adv.id} className="border-b border-white/5 hover:bg-white/5">
														<td className="px-5 py-3 text-white">{member?.fullName || member?.email || 'Unknown'}</td>
														<td className="px-5 py-3 font-semibold text-amber-300">{fmt(adv.amount)}</td>
														<td className="px-5 py-3 text-white/60">{adv.reason || '—'}</td>
														<td className="px-5 py-3 text-white/60">{new Date(adv.advanceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
														<td className="px-5 py-3 text-right">
															<button onClick={() => handleDeleteAdvance(adv.id)} className="text-red-400/70 hover:text-red-400 text-xs">Delete</button>
														</td>
													</tr>
												)
											})}
										</tbody>
									</table>
								</div>
							)}
						</div>
					)}
				</>
			)}

			{/* Salary Modal */}
			{showSalaryForm && selectedStaff && (
				<SideModal title="Set Salary" subtitle={selectedStaff.fullName || selectedStaff.email} onClose={() => setShowSalaryForm(false)}>
					<div className="space-y-4">
						<div>
							<label className="mb-2 block text-sm text-white/70">Monthly Salary</label>
							<input type="number" value={salaryInput} onChange={(e) => setSalaryInput(e.target.value)}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-white/30 focus:outline-none" placeholder="e.g. 15000" />
						</div>
						<Button onClick={handleSaveSalary} disabled={saving} className="w-full">
							{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Save Salary
						</Button>
					</div>
				</SideModal>
			)}

			{/* Advance Modal */}
			{showAdvanceForm && selectedStaff && (
				<SideModal title="Give Advance" subtitle={selectedStaff.fullName || selectedStaff.email} onClose={() => setShowAdvanceForm(false)}>
					<div className="space-y-4">
						<div>
							<label className="mb-2 block text-sm text-white/70">Amount</label>
							<input type="number" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-white/30 focus:outline-none" placeholder="e.g. 2000" />
						</div>
						<div>
							<label className="mb-2 block text-sm text-white/70">Reason (optional)</label>
							<input type="text" value={advanceReason} onChange={(e) => setAdvanceReason(e.target.value)}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-white/30 focus:outline-none" placeholder="e.g. Medical emergency" />
						</div>
						<Button onClick={handleCreateAdvance} disabled={saving} className="w-full">
							{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Banknote className="mr-2 h-4 w-4" />} Record Advance
						</Button>
					</div>
				</SideModal>
			)}
		</div>
	)
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
	return (
		<div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${color} p-4`}>
			<div className="rounded-xl bg-white/10 p-2 w-fit text-white/80 mb-3">{icon}</div>
			<p className="text-xl font-semibold text-white">{value}</p>
			<p className="text-xs text-white/50 mt-0.5">{label}</p>
		</div>
	)
}

function SideModal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
	return (
		<div className="fixed inset-0 z-[9999]">
			<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
			<motion.div
				initial={{ opacity: 0, x: 80 }}
				animate={{ opacity: 1, x: 0 }}
				className="absolute right-0 top-0 h-full w-full max-w-sm overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8"
			>
				<div className="flex items-center justify-between mb-6">
					<div>
						<h2 className="text-xl font-semibold text-white">{title}</h2>
						<p className="text-sm text-white/50">{subtitle}</p>
					</div>
					<button onClick={onClose} className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10">
						<X className="h-4 w-4" />
					</button>
				</div>
				{children}
			</motion.div>
		</div>
	)
}
