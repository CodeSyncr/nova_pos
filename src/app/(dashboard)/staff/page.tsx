'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
	UserCog,
	IndianRupee,
	Calendar,
	Clock,
	Plus,
	Banknote,
	Check,
	X,
	Loader2,
	AlertTriangle
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import {
	getStaffWithSalary,
	upsertStaffSalary,
	getStaffAdvances,
	createAdvance,
	deleteAdvance,
	getAttendance,
	markAttendance,
	type StaffMember,
	type StaffAdvance,
	type AttendanceRecord
} from '@/app/actions/staff'

type Tab = 'overview' | 'attendance' | 'advances'

export default function StaffPage() {
	const router = useRouter()
	const { success, error: showError } = useToast()

	const [tenantId, setTenantId] = useState('')
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	const [loading, setLoading] = useState(true)

	const [activeTab, setActiveTab] = useState<Tab>('overview')
	const [staff, setStaff] = useState<StaffMember[]>([])
	const [advances, setAdvances] = useState<StaffAdvance[]>([])
	const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
	const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]!)
	const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))

	// Modals
	const [showSalaryForm, setShowSalaryForm] = useState(false)
	const [showAdvanceForm, setShowAdvanceForm] = useState(false)
	const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
	const [salaryInput, setSalaryInput] = useState('')
	const [advanceAmount, setAdvanceAmount] = useState('')
	const [advanceReason, setAdvanceReason] = useState('')
	const [saving, setSaving] = useState(false)

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
			setLoading(false)
		}
		load()
	}, [router])

	const loadData = useCallback(async () => {
		if (!tenantId) return
		try {
			const [staffData, advancesData, attendanceData] = await Promise.all([
				getStaffWithSalary(tenantId),
				getStaffAdvances(tenantId, undefined, selectedMonth),
				getAttendance(tenantId, selectedDate)
			])
			setStaff(staffData)
			setAdvances(advancesData)
			setAttendance(attendanceData)
		} catch (err: any) {
			showError(err.message || 'Failed to load staff data')
		}
	}, [tenantId, selectedDate, selectedMonth, showError])

	useEffect(() => {
		if (tenantId) loadData()
	}, [tenantId, loadData])

	const handleSaveSalary = async () => {
		if (!selectedStaff || !salaryInput) return
		setSaving(true)
		try {
			await upsertStaffSalary(tenantId, selectedStaff.id, {
				monthlySalary: parseFloat(salaryInput)
			})
			success('Salary updated')
			setShowSalaryForm(false)
			loadData()
		} catch (err: any) {
			showError(err.message)
		} finally { setSaving(false) }
	}

	const handleCreateAdvance = async () => {
		if (!selectedStaff || !advanceAmount) return
		setSaving(true)
		try {
			await createAdvance(tenantId, selectedStaff.id, {
				amount: parseFloat(advanceAmount),
				reason: advanceReason || undefined
			})
			success('Advance recorded')
			setShowAdvanceForm(false)
			setAdvanceAmount('')
			setAdvanceReason('')
			loadData()
		} catch (err: any) {
			showError(err.message)
		} finally { setSaving(false) }
	}

	const handleMarkAttendance = async (profileId: string, status: string) => {
		try {
			const now = new Date().toISOString()
			await markAttendance(tenantId, profileId, {
				date: selectedDate,
				status,
				checkIn: status === 'present' || status === 'half_day' ? now : undefined
			})
			success(`Marked ${status}`)
			loadData()
		} catch (err: any) {
			showError(err.message)
		}
	}

	const handleDeleteAdvance = async (id: string) => {
		if (!confirm('Delete this advance?')) return
		try {
			await deleteAdvance(id)
			success('Advance deleted')
			loadData()
		} catch (err: any) {
			showError(err.message)
		}
	}

	const fmt = (n: number) => `${currencySymbol}${n.toLocaleString('en-IN')}`

	if (loading) {
		return (
			<div className="flex h-[calc(100vh-120px)] items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-white/40" />
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-8 py-6">
			{/* Header */}
			<header className="space-y-3">
				<Badge className="border-white/20 bg-white/10 text-white/80">
					<UserCog className="mr-2 h-4 w-4" /> Staff Management
				</Badge>
				<h1 className="text-4xl font-semibold text-white">Staff & Payroll</h1>
				<p className="text-white/60">Manage salaries, advances, and attendance for your team.</p>
			</header>

			{/* Tabs */}
			<div className="flex gap-2 rounded-xl bg-white/5 p-1 border border-white/10 w-fit">
				{(['overview', 'attendance', 'advances'] as Tab[]).map((tab) => (
					<button
						key={tab}
						onClick={() => setActiveTab(tab)}
						className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
							activeTab === tab ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
						}`}
					>
						{tab.charAt(0).toUpperCase() + tab.slice(1)}
					</button>
				))}
			</div>

			{/* Overview Tab */}
			{activeTab === 'overview' && (
				<div className="space-y-4">
					{staff.length === 0 ? (
						<div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
							<UserCog className="mx-auto h-12 w-12 text-white/30 mb-4" />
							<p className="text-white/60">No staff members found. Add users in Settings → Users first.</p>
						</div>
					) : (
						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{staff.map((member) => {
								const monthAdvances = advances
									.filter((a) => a.profileId === member.id)
									.reduce((sum, a) => sum + a.amount, 0)

								return (
									<motion.div
										key={member.id}
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4"
									>
										<div className="flex items-start justify-between">
											<div>
												<h3 className="text-lg font-semibold text-white">
													{member.fullName || member.email}
												</h3>
												<p className="text-xs text-white/50">{member.email}</p>
												{member.roleName && (
													<Badge className="mt-1 border-white/20 bg-white/10 text-white/70 text-xs">
														{member.roleName}
													</Badge>
												)}
											</div>
										</div>

										<div className="grid grid-cols-2 gap-3">
											<div className="rounded-xl bg-white/5 border border-white/10 p-3">
												<p className="text-xs text-white/50">Salary</p>
												<p className="text-lg font-semibold text-white">
													{member.monthlySalary > 0 ? fmt(member.monthlySalary) : 'Not set'}
												</p>
											</div>
											<div className="rounded-xl bg-white/5 border border-white/10 p-3">
												<p className="text-xs text-white/50">Advances ({selectedMonth.slice(5)})</p>
												<p className="text-lg font-semibold text-amber-300">
													{monthAdvances > 0 ? fmt(monthAdvances) : '—'}
												</p>
											</div>
										</div>

										<div className="flex gap-2">
											<Button
												size="sm"
												variant="ghost"
												className="flex-1 border border-white/10 text-xs"
												onClick={() => {
													setSelectedStaff(member)
													setSalaryInput(member.monthlySalary.toString())
													setShowSalaryForm(true)
												}}
											>
												<IndianRupee className="mr-1 h-3 w-3" />
												Set Salary
											</Button>
											<Button
												size="sm"
												variant="ghost"
												className="flex-1 border border-white/10 text-xs"
												onClick={() => {
													setSelectedStaff(member)
													setShowAdvanceForm(true)
												}}
											>
												<Banknote className="mr-1 h-3 w-3" />
												Give Advance
											</Button>
										</div>
									</motion.div>
								)
							})}
						</div>
					)}
				</div>
			)}

			{/* Attendance Tab */}
			{activeTab === 'attendance' && (
				<div className="space-y-4">
					<div className="flex items-center gap-4">
						<input
							type="date"
							value={selectedDate}
							onChange={(e) => setSelectedDate(e.target.value)}
							className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
						/>
					</div>

					{staff.length === 0 ? (
						<p className="text-white/50 py-8 text-center">No staff members</p>
					) : (
						<div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-white/10 bg-white/5">
										<th className="px-5 py-3 text-left text-white/70 font-medium">Staff</th>
										<th className="px-5 py-3 text-left text-white/70 font-medium">Status</th>
										<th className="px-5 py-3 text-left text-white/70 font-medium">Check In</th>
										<th className="px-5 py-3 text-right text-white/70 font-medium">Actions</th>
									</tr>
								</thead>
								<tbody>
									{staff.map((member) => {
										const record = attendance.find((a) => a.profileId === member.id)
										return (
											<tr key={member.id} className="border-b border-white/5 hover:bg-white/5">
												<td className="px-5 py-3">
													<p className="text-white font-medium">{member.fullName || member.email}</p>
													<p className="text-xs text-white/40">{member.roleName || 'No role'}</p>
												</td>
												<td className="px-5 py-3">
													{record ? (
														<AttendanceBadge status={record.status} />
													) : (
														<span className="text-white/40 text-xs">Not marked</span>
													)}
												</td>
												<td className="px-5 py-3 text-white/60 text-xs">
													{record?.checkIn
														? new Date(record.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
														: '—'}
												</td>
												<td className="px-5 py-3 text-right">
													<div className="flex gap-1 justify-end">
														<button
															onClick={() => handleMarkAttendance(member.id, 'present')}
															className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20"
														>
															Present
														</button>
														<button
															onClick={() => handleMarkAttendance(member.id, 'half_day')}
															className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/20"
														>
															Half
														</button>
														<button
															onClick={() => handleMarkAttendance(member.id, 'absent')}
															className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20"
														>
															Absent
														</button>
														<button
															onClick={() => handleMarkAttendance(member.id, 'leave')}
															className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs text-blue-300 hover:bg-blue-500/20"
														>
															Leave
														</button>
													</div>
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

			{/* Advances Tab */}
			{activeTab === 'advances' && (
				<div className="space-y-4">
					<div className="flex items-center gap-4">
						<input
							type="month"
							value={selectedMonth}
							onChange={(e) => setSelectedMonth(e.target.value)}
							className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
						/>
					</div>

					{advances.length === 0 ? (
						<div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
							<Banknote className="mx-auto h-10 w-10 text-white/30 mb-3" />
							<p className="text-white/50">No advances for this month</p>
						</div>
					) : (
						<div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-white/10 bg-white/5">
										<th className="px-5 py-3 text-left text-white/70 font-medium">Staff</th>
										<th className="px-5 py-3 text-left text-white/70 font-medium">Amount</th>
										<th className="px-5 py-3 text-left text-white/70 font-medium">Reason</th>
										<th className="px-5 py-3 text-left text-white/70 font-medium">Date</th>
										<th className="px-5 py-3 text-right text-white/70 font-medium">Action</th>
									</tr>
								</thead>
								<tbody>
									{advances.map((adv) => {
										const member = staff.find((s) => s.id === adv.profileId)
										return (
											<tr key={adv.id} className="border-b border-white/5 hover:bg-white/5">
												<td className="px-5 py-3 text-white">{member?.fullName || member?.email || 'Unknown'}</td>
												<td className="px-5 py-3 text-amber-300 font-semibold">{fmt(adv.amount)}</td>
												<td className="px-5 py-3 text-white/60">{adv.reason || '—'}</td>
												<td className="px-5 py-3 text-white/60">{new Date(adv.advanceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
												<td className="px-5 py-3 text-right">
													<button
														onClick={() => handleDeleteAdvance(adv.id)}
														className="text-red-400/70 hover:text-red-400 text-xs"
													>
														Delete
													</button>
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					)}

					{/* Total */}
					{advances.length > 0 && (
						<div className="flex justify-end">
							<div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-5 py-3">
								<p className="text-xs text-amber-300/70">Total Advances</p>
								<p className="text-xl font-semibold text-amber-300">
									{fmt(advances.reduce((s, a) => s + a.amount, 0))}
								</p>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Salary Form Modal */}
			{showSalaryForm && selectedStaff && (
				<SideModal title="Set Salary" subtitle={selectedStaff.fullName || selectedStaff.email} onClose={() => setShowSalaryForm(false)}>
					<div className="space-y-4">
						<div>
							<label className="mb-2 block text-sm text-white/70">Monthly Salary</label>
							<input
								type="number"
								value={salaryInput}
								onChange={(e) => setSalaryInput(e.target.value)}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-white/30 focus:outline-none"
								placeholder="e.g. 15000"
							/>
						</div>
						<Button onClick={handleSaveSalary} disabled={saving} className="w-full">
							{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
							Save Salary
						</Button>
					</div>
				</SideModal>
			)}

			{/* Advance Form Modal */}
			{showAdvanceForm && selectedStaff && (
				<SideModal title="Give Advance" subtitle={selectedStaff.fullName || selectedStaff.email} onClose={() => setShowAdvanceForm(false)}>
					<div className="space-y-4">
						<div>
							<label className="mb-2 block text-sm text-white/70">Amount</label>
							<input
								type="number"
								value={advanceAmount}
								onChange={(e) => setAdvanceAmount(e.target.value)}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-white/30 focus:outline-none"
								placeholder="e.g. 2000"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm text-white/70">Reason (optional)</label>
							<input
								type="text"
								value={advanceReason}
								onChange={(e) => setAdvanceReason(e.target.value)}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white focus:border-white/30 focus:outline-none"
								placeholder="e.g. Medical emergency"
							/>
						</div>
						<Button onClick={handleCreateAdvance} disabled={saving} className="w-full">
							{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Banknote className="mr-2 h-4 w-4" />}
							Record Advance
						</Button>
					</div>
				</SideModal>
			)}
		</div>
	)
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function AttendanceBadge({ status }: { status: string }) {
	const styles: Record<string, string> = {
		present: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
		half_day: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
		absent: 'bg-red-500/20 text-red-300 border-red-500/30',
		leave: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
	}
	const labels: Record<string, string> = {
		present: 'Present',
		half_day: 'Half Day',
		absent: 'Absent',
		leave: 'Leave'
	}
	return (
		<span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status] || styles.absent}`}>
			{labels[status] || status}
		</span>
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
