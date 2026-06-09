'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
	ClipboardList,
	Plus,
	Trash2,
	Bell,
	Check,
	Clock,
	Loader2,
	CheckCircle2,
	User,
	Users,
	X,
	RefreshCw,
	AlertCircle,
	Pencil
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { CustomSelect } from '@/components/ui/select'
import {
	getTasks,
	createTask,
	updateTask,
	toggleTaskStatus,
	toggleTaskItemStatus,
	deleteTask,
	sendTaskReminder,
	type Task
} from '@/app/actions/tasks'
import { getTenantUsers, type TenantUser } from '@/app/actions/users'

export default function TasksPage() {
	const router = useRouter()
	const { success, error: showError } = useToast()

	const [userId, setUserId] = useState('')
	const [tenantId, setTenantId] = useState('')
	const [isManager, setIsManager] = useState(false)
	const [loading, setLoading] = useState(true)
	const [submitting, setSubmitting] = useState(false)
	const [remindingTaskId, setRemindingTaskId] = useState<string | null>(null)

	// Data states
	const [tasks, setTasks] = useState<Task[]>([])
	const [usersList, setUsersList] = useState<TenantUser[]>([])

	// Modals & form state
	const [showAddModal, setShowAddModal] = useState(false)
	const [editingTask, setEditingTask] = useState<Task | null>(null)
	const [title, setTitle] = useState('')
	const [description, setDescription] = useState('')
	const [assignedTo, setAssignedTo] = useState<string>('unassigned')
	const [isRecurring, setIsRecurring] = useState(true)

	// Checklist sub-items state
	const [newChecklistItems, setNewChecklistItems] = useState<Array<{ id: string; text: string; status: 'pending' | 'completed' }>>([])
	const [checklistItemInput, setChecklistItemInput] = useState('')
	const [reminderInterval, setReminderInterval] = useState<number | null>(null)
	const [reminderStartTime, setReminderStartTime] = useState<string>('09:00')

	// Auth and permission initialization
	useEffect(() => {
		const initUser = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const { data: { user } } = await supabase.auth.getUser()
				if (!user) {
					router.push('/login')
					return
				}
				setUserId(user.id)

				// Fetch profile_tenants link and user role
				const { data: pt } = await supabase
					.from('profile_tenants')
					.select('tenant_id, role_id')
					.eq('profile_id', user.id)
					.single()

				if (!pt) {
					router.push('/onboarding')
					return
				}
				setTenantId(pt.tenant_id)

				// Determine if manager/owner
				let hasAdminAccess = !pt.role_id
				if (pt.role_id) {
					const { data: role } = await supabase
						.from('roles')
						.select('code, permissions')
						.eq('id', pt.role_id)
						.single()
					if (role) {
						const perms = role.permissions
						hasAdminAccess =
							role.code === 'OWNER' ||
							role.code === 'MANAGER' ||
							role.code === 'DEFAULT_OWNER' ||
							role.code === 'DEFAULT_MANAGER' ||
							perms == null ||
							(Array.isArray(perms) && (perms.includes('*') || perms.includes('all')))
					}
				}
				setIsManager(hasAdminAccess)
			} catch (err: any) {
				showError(err.message || 'Initialization failed')
			}
		}
		initUser()
	}, [router, showError])

	// Fetch data helper
	const loadData = useCallback(async () => {
		if (!tenantId) return
		try {
			const [tasksData, usersData] = await Promise.all([
				getTasks(tenantId),
				getTenantUsers(tenantId).catch(() => [] as TenantUser[]) // fallback if load fails
			])
			setTasks(tasksData)
			setUsersList(usersData)
		} catch (err: any) {
			showError(err.message || 'Failed to load task board data')
		} finally {
			setLoading(false)
		}
	}, [tenantId, showError])

	useEffect(() => {
		if (tenantId) {
			loadData()
		}
	}, [tenantId, loadData])

	const addChecklistItem = () => {
		if (!checklistItemInput.trim()) return
		const newItem = {
			id: typeof window !== 'undefined' && window.crypto ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
			text: checklistItemInput.trim(),
			status: 'pending' as const
		}
		setNewChecklistItems([...newChecklistItems, newItem])
		setChecklistItemInput('')
	}

	const removeChecklistItem = (index: number) => {
		setNewChecklistItems(newChecklistItems.filter((_, i) => i !== index))
	}

	const handleOpenAddModal = () => {
		setEditingTask(null)
		setTitle('')
		setDescription('')
		setAssignedTo('unassigned')
		setIsRecurring(true)
		setNewChecklistItems([])
		setReminderInterval(null)
		setReminderStartTime('09:00')
		setShowAddModal(true)
	}

	const handleOpenEditModal = (task: Task) => {
		setEditingTask(task)
		setTitle(task.title)
		setDescription(task.description || '')
		setAssignedTo(task.assigned_to || 'unassigned')
		setIsRecurring(task.is_recurring)
		setNewChecklistItems(task.items || [])
		setReminderInterval(task.reminder_interval)
		setReminderStartTime(task.reminder_start_time || '09:00')
		setShowAddModal(true)
	}

	// Action: Create or Update Task
	const handleSubmitTask = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!title.trim()) return
		setSubmitting(true)

		const startTimeVal = reminderInterval === null ? null : reminderStartTime

		try {
			if (editingTask) {
				await updateTask(
					tenantId,
					editingTask.id,
					title,
					description,
					assignedTo === 'unassigned' ? null : assignedTo,
					isRecurring,
					newChecklistItems,
					reminderInterval,
					startTimeVal
				)
				success('Task updated successfully')
			} else {
				await createTask(
					tenantId,
					title,
					description,
					assignedTo === 'unassigned' ? null : assignedTo,
					isRecurring,
					newChecklistItems,
					reminderInterval,
					startTimeVal
				)
				success('Task created successfully')
			}
			setTitle('')
			setDescription('')
			setAssignedTo('unassigned')
			setIsRecurring(true)
			setNewChecklistItems([])
			setReminderInterval(null)
			setReminderStartTime('09:00')
			setShowAddModal(false)
			setEditingTask(null)
			loadData()
		} catch (err: any) {
			showError(err.message || (editingTask ? 'Failed to update task' : 'Failed to create task'))
		} finally {
			setSubmitting(false)
		}
	}

	// Action: Toggle Task Status
	const handleToggleStatus = async (taskId: string, currentStatus: 'pending' | 'completed') => {
		const nextStatus = currentStatus === 'pending' ? 'completed' : 'pending'
		
		// Optimistic update
		setTasks(prev =>
			prev.map(t => {
				if (t.id === taskId) {
					const itemsCopy = Array.isArray(t.items) ? t.items : []
					return {
						...t,
						status: nextStatus,
						items: itemsCopy.map(i => ({ ...i, status: nextStatus })),
						completed_at: nextStatus === 'completed' ? new Date().toISOString() : null
					}
				}
				return t
			})
		)

		try {
			await toggleTaskStatus(taskId, nextStatus)
			if (nextStatus === 'completed') {
				success('Task marked completed! 🎉')
			} else {
				success('Task status reset to pending')
			}
			loadData()
		} catch (err: any) {
			showError(err.message || 'Failed to update task')
			loadData() // rollback
		}
	}

	// Action: Toggle Sub-task Item Status
	const handleToggleItemStatus = async (taskId: string, itemId: string, itemStatus: 'pending' | 'completed') => {
		// Optimistic update
		setTasks(prev =>
			prev.map(t => {
				if (t.id === taskId) {
					const updatedItems = t.items.map(item =>
						item.id === itemId ? { ...item, status: itemStatus } : item
					)
					const allDone = updatedItems.length > 0 && updatedItems.every(i => i.status === 'completed')
					return {
						...t,
						items: updatedItems,
						status: allDone ? 'completed' as const : 'pending' as const,
						completed_at: allDone ? new Date().toISOString() : null
					}
				}
				return t
			})
		)

		try {
			await toggleTaskItemStatus(taskId, itemId, itemStatus)
			loadData()
		} catch (err: any) {
			showError(err.message || 'Failed to update item status')
			loadData() // rollback
		}
	}

	// Action: Delete Task
	const handleDeleteTask = async (taskId: string) => {
		if (!confirm('Are you sure you want to delete this task?')) return
		try {
			await deleteTask(taskId)
			success('Task deleted')
			loadData()
		} catch (err: any) {
			showError(err.message || 'Failed to delete task')
		}
	}

	// Action: Send Push Notification Reminder
	const handleSendReminder = async (taskId: string) => {
		setRemindingTaskId(taskId)
		try {
			const result = await sendTaskReminder(tenantId, taskId)
			if (result.success) {
				success(`Reminder sent to ${result.sent} active device(s)! 📱`)
			} else {
				showError('User has no active push notification subscriptions. Ask them to enable notifications.')
			}
		} catch (err: any) {
			showError(err.message || 'Failed to send task reminder')
		} finally {
			setRemindingTaskId(null)
		}
	}

	if (loading) {
		return (
			<div className="flex flex-col gap-8 py-6">
				<div className="space-y-3">
					<div className="h-6 w-32 rounded-full bg-white/10 animate-pulse" />
					<div className="h-10 w-64 rounded-xl bg-white/10 animate-pulse" />
				</div>
				<div className="h-96 rounded-[32px] border border-white/10 bg-white/5 animate-pulse" />
			</div>
		)
	}

	// Filter tasks for Staff View
	const myTasks = tasks.filter(t => t.assigned_to === userId)
	const completedMyTasksCount = myTasks.filter(t => t.status === 'completed').length
	const progressPercentage = myTasks.length > 0 ? Math.round((completedMyTasksCount / myTasks.length) * 100) : 0

	// Motivation Quote for Staff
	let motivationMessage = 'Let\'s get started on today\'s tasks!'
	if (progressPercentage === 100 && myTasks.length > 0) {
		motivationMessage = '🎉 Spectacular! You have completed all of your tasks today!'
	} else if (progressPercentage > 50) {
		motivationMessage = 'Keep pushing! More than half-way done.'
	} else if (progressPercentage > 0) {
		motivationMessage = 'Good start! Complete the rest to wrap up the day.'
	}

	const staffOptions = [
		{
			value: 'unassigned',
			label: 'Anyone / Unassigned',
			description: 'Task can be claimed or checked by anyone',
			icon: Users
		},
		...usersList.map(member => ({
			value: member.id,
			label: member.full_name || member.email,
			description: member.role?.name || 'Owner',
			icon: User
		}))
	]

	const reminderOptions = [
		{
			value: 'none',
			label: 'No auto-reminders',
			description: 'Do not send recurring device notifications',
			icon: Bell
		},
		{
			value: '5',
			label: 'Every 5 minutes',
			description: 'Sends push alerts every 5 minutes until complete',
			icon: Bell
		},
		{
			value: '15',
			label: 'Every 15 minutes',
			description: 'Sends push alerts every 15 minutes until complete',
			icon: Bell
		},
		{
			value: '30',
			label: 'Every 30 minutes',
			description: 'Sends push alerts every 30 minutes until complete',
			icon: Bell
		},
		{
			value: '60',
			label: 'Every hour',
			description: 'Sends push alerts every hour until complete',
			icon: Bell
		}
	]

	return (
		<div className="flex flex-col gap-6 py-6">
			{/* Page Header */}
			<header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<div className="flex items-center gap-2 mb-2">
						<div className="rounded-xl bg-[#E0342A]/15 border border-[#E0342A]/30 p-2">
							<ClipboardList className="h-4 w-4 text-[#E0342A]" />
						</div>
						<span className="text-xs uppercase tracking-[0.3em] text-white/40">Collaborative Board</span>
					</div>
					<h1 className="text-3xl font-semibold text-white">Daily Task Board</h1>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						onClick={loadData}
						className="border border-white/10 text-white/60 hover:text-white"
					>
						<RefreshCw className="h-4 w-4 mr-2" /> Refresh
					</Button>
					{isManager && (
						<Button
							onClick={handleOpenAddModal}
							className="bg-[#E0342A] text-white hover:bg-[#c92f26]"
						>
							<Plus className="h-4 w-4 mr-2" /> Add Task
						</Button>
					)}
				</div>
			</header>

			{/* Views container */}
			<div className="grid gap-6">
				{/* 1. PERSONAL CHECKLIST (For both Staff and Managers if they have tasks assigned) */}
				{myTasks.length > 0 && (
					<section className="rounded-[32px] border border-white/10 bg-white/[0.02] p-6 backdrop-blur-3xl">
						<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
							<div>
								<h2 className="text-xl font-semibold text-white">My Daily Checklist</h2>
								<p className="text-xs text-white/50 mt-1">{motivationMessage}</p>
							</div>

							{/* Progress Bar */}
							<div className="flex items-center gap-3 w-full md:w-64">
								<div className="relative h-2 w-full rounded-full bg-white/10 overflow-hidden">
									<motion.div
										className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#E0342A] to-red-500"
										initial={{ width: 0 }}
										animate={{ width: `${progressPercentage}%` }}
										transition={{ duration: 0.5, ease: 'easeOut' }}
									/>
								</div>
								<span className="text-sm font-semibold text-white min-w-[36px] text-right">
									{progressPercentage}%
								</span>
							</div>
						</div>

						{/* Task rows */}
						<div className="space-y-3">
							<AnimatePresence initial={false}>
								{myTasks.map(task => {
									const subItems = Array.isArray(task.items) ? task.items : []
									return (
										<motion.div
											key={task.id}
											initial={{ opacity: 0, y: 10 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, scale: 0.95 }}
											className={`flex flex-col gap-3 rounded-2xl border p-4 transition-all duration-300 ${
												task.status === 'completed'
													? 'border-emerald-500/20 bg-emerald-500/5'
													: 'border-white/[0.06] bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02]'
											}`}
										>
											<div className="flex items-start gap-4">
												{/* Custom Animating Checkbox */}
												<button
													onClick={() => handleToggleStatus(task.id, task.status)}
													className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition ${
														task.status === 'completed'
															? 'border-emerald-500 bg-emerald-500 text-black'
															: 'border-white/25 hover:border-white/40 bg-transparent text-transparent'
													}`}
												>
													<Check className="h-4 w-4 stroke-[3]" />
												</button>

												<div className="flex-1 min-w-0">
													<h4
														className={`font-medium text-sm transition-all duration-300 ${
															task.status === 'completed'
																? 'text-white/40 line-through'
																: 'text-white'
														}`}
													>
														{task.title}
													</h4>
													{task.description && (
														<p
															className={`text-xs mt-1 transition-all duration-300 ${
																task.status === 'completed'
																	? 'text-white/20'
																	: 'text-white/60'
															}`}
														>
															{task.description}
														</p>
													)}
													{task.reminder_interval && (
														<div className="flex items-center gap-1 text-[10px] text-[#E0342A] mt-1.5">
															<Bell className="h-3 w-3" />
															<span>
																Reminds every {task.reminder_interval}m
																{task.reminder_start_time && ` from ${task.reminder_start_time}`}
															</span>
														</div>
													)}
												</div>

												<div className="flex items-center gap-2">
													{task.is_recurring && (
														<span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-[10px] text-white/50">
															Daily
														</span>
													)}
												</div>
											</div>

											{/* Checklist sub-items rendering */}
											{subItems.length > 0 && (
												<div className="ml-10 border-l border-white/10 pl-4 space-y-2.5 mt-1">
													{subItems.map(item => (
														<div key={item.id} className="flex items-center gap-3">
															<button
																onClick={() => {
																	const newStatus = item.status === 'completed' ? 'pending' : 'completed'
																	handleToggleItemStatus(task.id, item.id, newStatus)
																}}
																className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
																	item.status === 'completed'
																		? 'border-emerald-500 bg-emerald-500 text-black'
																		: 'border-white/20 hover:border-white/35 bg-transparent text-transparent'
																}`}
															>
																<Check className="h-2.5 w-2.5 stroke-[3]" />
															</button>
															<span
																className={`text-xs transition ${
																	item.status === 'completed'
																		? 'text-white/30 line-through'
																		: 'text-white/80'
																}`}
															>
																{item.text}
															</span>
														</div>
													))}
												</div>
											)}
										</motion.div>
									)
								})}
							</AnimatePresence>
						</div>
					</section>
				)}

				{/* 2. MANAGER DASHBOARD VIEW */}
				{isManager && (
					<section className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
						<div className="mb-6">
							<h2 className="text-xl font-semibold text-white">All Staff Assignment Boards</h2>
							<p className="text-xs text-white/40 mt-1">Track and manage task completion metrics across your team.</p>
						</div>

						{tasks.length === 0 ? (
							<div className="text-center py-12 rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
								<AlertCircle className="mx-auto h-12 w-12 text-white/10 mb-4" />
								<p className="text-white/60 text-sm">No tasks added to the board yet.</p>
								<Button
									size="sm"
									onClick={handleOpenAddModal}
									className="mt-4 bg-[#E0342A] hover:bg-[#c92f26] text-xs"
								>
									Create First Task
								</Button>
							</div>
						) : (
							<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
								{/* GROUP 1: Unassigned Tasks */}
								{tasks.filter(t => !t.assigned_to).length > 0 && (
									<div className="rounded-2xl border border-white/10 bg-black/40 p-5 space-y-4">
										<div className="flex items-center gap-2.5 pb-3 border-b border-white/5">
											<div className="rounded-xl bg-white/5 border border-white/10 p-2">
												<Users className="h-4 w-4 text-white/60" />
											</div>
											<div>
												<h3 className="font-semibold text-sm text-white">Anyone / Unassigned</h3>
												<p className="text-[10px] text-white/40">
													{tasks.filter(t => !t.assigned_to && t.status === 'completed').length}/
													{tasks.filter(t => !t.assigned_to).length} completed
												</p>
											</div>
										</div>

										<div className="space-y-2">
											{tasks
												.filter(t => !t.assigned_to)
												.map(task => (
													<TaskListItem
														key={task.id}
														task={task}
														onToggleStatus={handleToggleStatus}
														onToggleItemStatus={handleToggleItemStatus}
														onEdit={handleOpenEditModal}
														onDelete={handleDeleteTask}
														onSendReminder={handleSendReminder}
														reminding={remindingTaskId === task.id}
														showReminder={false}
													/>
												))}
										</div>
									</div>
								)}

								{/* GROUP 2: Tasks grouped by active Staff/Owner Member */}
								{usersList.map(member => {
									const memberTasks = tasks.filter(t => t.assigned_to === member.id)
									if (memberTasks.length === 0) return null

									const completedCount = memberTasks.filter(t => t.status === 'completed').length

									return (
										<div key={member.id} className="rounded-2xl border border-white/10 bg-black/40 p-5 space-y-4">
											<div className="flex items-center gap-2.5 pb-3 border-b border-white/5">
												<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#E0342A]/30 to-[#E0342A]/10 text-xs font-bold text-white">
													{(member.full_name || member.email).charAt(0).toUpperCase()}
												</div>
												<div className="min-w-0 flex-1">
													<h3 className="font-semibold text-sm text-white truncate">
														{member.full_name || member.email}
													</h3>
													<p className="text-[10px] text-white/40">
														{completedCount}/{memberTasks.length} completed ({member.role?.name || 'Owner'})
													</p>
												</div>
											</div>

											<div className="space-y-2">
												{memberTasks.map(task => (
													<TaskListItem
														key={task.id}
														task={task}
														onToggleStatus={handleToggleStatus}
														onToggleItemStatus={handleToggleItemStatus}
														onEdit={handleOpenEditModal}
														onDelete={handleDeleteTask}
														onSendReminder={handleSendReminder}
														reminding={remindingTaskId === task.id}
														showReminder={task.status === 'pending'}
													/>
												))}
											</div>
										</div>
									)
								})}
							</div>
						)}
					</section>
				)}

				{/* 3. STAFF LOGGED IN WHO HAS NO TASKS ASSIGNED YET */}
				{!isManager && myTasks.length === 0 && (
					<section className="rounded-[32px] border border-white/10 bg-white/5 p-12 text-center backdrop-blur-2xl">
						<CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400 mb-4" />
						<h2 className="text-xl font-semibold text-white">No Assigned Tasks</h2>
						<p className="text-sm text-white/50 mt-1">
							You don&apos;t have any tasks assigned to you for today. Relax or check with your manager!
						</p>
					</section>
				)}
			</div>

			{/* Add Task side modal (Red smoky gradient themed slideover) */}
			{showAddModal && (
				<SideModal
					title={editingTask ? 'Edit Task' : 'Create Task'}
					subtitle={editingTask ? 'Modify the selected task definition.' : 'Add a new task definition to the board.'}
					onClose={() => {
						setShowAddModal(false)
						setEditingTask(null)
					}}
				>
					<form onSubmit={handleSubmitTask} className="space-y-5">
						<div>
							<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/60">
								Task Title
							</label>
							<input
								type="text"
								required
								value={title}
								onChange={e => setTitle(e.target.value)}
								placeholder="e.g. Clean the espresso machine"
								className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-white/35 focus:border-[#E0342A]/40 focus:outline-none"
							/>
						</div>

						<div>
							<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/60">
								Description (Optional)
							</label>
							<textarea
								value={description}
								onChange={e => setDescription(e.target.value)}
								placeholder="Describe instructions or steps..."
								rows={3}
								className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder-white/35 focus:border-[#E0342A]/40 focus:outline-none resize-none"
							/>
						</div>

						<div>
							<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/60">
								Assign To Staff
							</label>
							<CustomSelect
								value={assignedTo}
								onChange={val => setAssignedTo(val)}
								options={staffOptions}
								className="w-full"
								triggerClassName="bg-black/40 border-white/10 hover:bg-black/50"
							/>
						</div>

						{/* Sub-items checklist builder */}
						<div className="rounded-xl border border-white/[0.06] bg-black/35 p-4 space-y-3">
							<label className="block text-xs font-semibold uppercase tracking-wider text-white/60">
								Sub-Items Checklist
							</label>
							<div className="flex gap-2">
								<input
									type="text"
									value={checklistItemInput}
									onChange={e => setChecklistItemInput(e.target.value)}
									onKeyDown={e => {
										if (e.key === 'Enter') {
											e.preventDefault()
											addChecklistItem()
										}
									}}
									placeholder="Add checklist item..."
									className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/35 focus:border-[#E0342A]/40 focus:outline-none"
								/>
								<Button
									type="button"
									onClick={addChecklistItem}
									className="bg-white/10 hover:bg-white/15 text-white h-9 px-3 rounded-xl text-xs"
								>
									Add
								</Button>
							</div>

							{newChecklistItems.length > 0 && (
								<div className="space-y-1.5 pt-2 max-h-40 overflow-y-auto">
									{newChecklistItems.map((item, idx) => (
										<div key={item.id} className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/5 px-2.5 py-1.5 text-xs text-white/80">
											<span className="truncate">{item.text}</span>
											<button
												type="button"
												onClick={() => removeChecklistItem(idx)}
												className="text-white/40 hover:text-[#E0342A] transition"
											>
												<X className="h-3.5 w-3.5" />
											</button>
										</div>
									))}
								</div>
							)}
						</div>

						{/* Auto-reminders selection */}
						<div>
							<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/60">
								Auto-Reminders
							</label>
							<CustomSelect
								value={reminderInterval === null ? 'none' : reminderInterval.toString()}
								onChange={val => {
									setReminderInterval(val === 'none' ? null : parseInt(val))
								}}
								options={reminderOptions}
								className="w-full"
								triggerClassName="bg-black/40 border-white/10 hover:bg-black/50"
							/>
							<p className="text-[10px] text-white/40 mt-1.5">
								Sends automated device notifications if task is incomplete.
							</p>
						</div>

						{reminderInterval !== null && (
							<div>
								<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/60">
									Reminder Start Time
								</label>
								<input
									type="time"
									required
									value={reminderStartTime}
									onChange={e => setReminderStartTime(e.target.value)}
									className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white focus:border-[#E0342A]/40 focus:outline-none [color-scheme:dark]"
								/>
								<p className="text-[10px] text-white/40 mt-1.5">
									Specifies the local time when daily alerts will begin.
								</p>
							</div>
						)}

						<div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/35 p-3.5">
							<div>
								<p className="text-xs font-semibold uppercase tracking-wider text-white/80">
									Daily Recurring Task
								</p>
								<p className="text-[10px] text-white/40 mt-0.5">
									Task resets automatically at midnight.
								</p>
							</div>
							<label className="relative inline-flex cursor-pointer items-center">
								<input
									type="checkbox"
									checked={isRecurring}
									onChange={e => setIsRecurring(e.target.checked)}
									className="peer sr-only"
								/>
								<div className="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white/40 after:transition-all after:content-[''] peer-checked:bg-[#E0342A] peer-checked:after:translate-x-full peer-checked:after:bg-white" />
							</label>
						</div>

						<Button
							type="submit"
							disabled={submitting}
							className="w-full bg-[#E0342A] text-white hover:bg-[#c92f26] h-11 rounded-xl text-sm font-semibold mt-6"
						>
							{submitting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" /> {editingTask ? 'Saving...' : 'Creating...'}
								</>
							) : (
								editingTask ? 'Save Changes' : 'Add Task'
							)}
						</Button>
					</form>
				</SideModal>
			)}
		</div>
	)
}

// Helper: Task row inside dashboard boards
function TaskListItem({
	task,
	onToggleStatus,
	onToggleItemStatus,
	onEdit,
	onDelete,
	onSendReminder,
	reminding,
	showReminder
}: {
	task: Task
	onToggleStatus: (id: string, stat: 'pending' | 'completed') => void
	onToggleItemStatus: (taskId: string, itemId: string, stat: 'pending' | 'completed') => void
	onEdit: (task: Task) => void
	onDelete: (id: string) => void
	onSendReminder: (id: string) => void
	reminding: boolean
	showReminder: boolean
}) {
	const subItems = Array.isArray(task.items) ? task.items : []
	return (
		<div className="flex flex-col gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition">
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-start gap-2.5 min-w-0">
					<button
						onClick={() => onToggleStatus(task.id, task.status)}
						className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
							task.status === 'completed'
								? 'border-emerald-500 bg-emerald-500 text-black'
								: 'border-white/20 hover:border-white/30 bg-transparent text-transparent'
						}`}
					>
						<Check className="h-3 w-3 stroke-[3]" />
					</button>
					<div className="min-w-0">
						<p
							className={`text-xs font-semibold truncate transition-all ${
								task.status === 'completed' ? 'text-white/30 line-through' : 'text-white'
							}`}
						>
							{task.title}
						</p>
						{task.description && (
							<p
								className={`text-[10px] truncate mt-0.5 transition-all ${
									task.status === 'completed' ? 'text-white/15' : 'text-white/50'
								}`}
							>
								{task.description}
							</p>
						)}
						{task.reminder_interval && (
							<div className="flex items-center gap-1 text-[9px] text-[#E0342A] mt-1">
								<Bell className="h-2.5 w-2.5" />
								<span>
									Auto-remind every {task.reminder_interval}m
									{task.reminder_start_time && ` from ${task.reminder_start_time}`}
								</span>
							</div>
						)}
					</div>
				</div>

				<div className="flex items-center gap-1.5 shrink-0 ml-2">
					{showReminder && (
						<button
							disabled={reminding}
							onClick={() => onSendReminder(task.id)}
							className="p-1.5 rounded-lg border border-white/5 bg-white/[0.03] text-white/50 hover:text-white hover:bg-[#E0342A]/20 transition disabled:opacity-50"
							title="Send Notification Reminder"
						>
							{reminding ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<Bell className="h-3 w-3" />
							)}
						</button>
					)}
					<button
						onClick={() => onEdit(task)}
						className="p-1.5 rounded-lg border border-white/5 bg-white/[0.03] text-white/40 hover:text-white hover:bg-white/10 transition"
						title="Edit Task"
					>
						<Pencil className="h-3 w-3" />
					</button>
					<button
						onClick={() => onDelete(task.id)}
						className="p-1.5 rounded-lg border border-white/5 bg-white/[0.03] text-white/40 hover:text-[#E0342A] hover:bg-[#E0342A]/10 transition"
						title="Delete Task"
					>
						<Trash2 className="h-3 w-3" />
					</button>
				</div>
			</div>

			{/* Sub-items rendering for Management board */}
			{subItems.length > 0 && (
				<div className="ml-6 border-l border-white/10 pl-3.5 space-y-1.5 pt-1">
					{subItems.map(item => (
						<div key={item.id} className="flex items-center gap-2.5">
							<button
								onClick={() => {
									const newStatus = item.status === 'completed' ? 'pending' : 'completed'
									onToggleItemStatus(task.id, item.id, newStatus)
								}}
								className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition ${
									item.status === 'completed'
										? 'border-emerald-500 bg-emerald-500 text-black'
										: 'border-white/10 hover:border-white/20 bg-transparent text-transparent'
								}`}
							>
								<Check className="h-2.5 w-2.5 stroke-[3]" />
							</button>
							<span
								className={`text-[10px] truncate transition ${
									item.status === 'completed' ? 'text-white/25 line-through' : 'text-white/70'
								}`}
							>
								{item.text}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

// Helper: Stat Card (from staff)
function StatCard({
	icon,
	label,
	value,
	color
}: {
	icon: React.ReactNode
	label: string
	value: string
	color: string
}) {
	return (
		<div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${color} p-4`}>
			<div className="rounded-xl bg-white/10 p-2 w-fit text-white/80 mb-3">{icon}</div>
			<p className="text-xl font-semibold text-white">{value}</p>
			<p className="text-xs text-white/50 mt-0.5">{label}</p>
		</div>
	)
}

// Helper: Custom Side Modal matching the SMOKY Pizzeria Da Cafe theme
function SideModal({
	title,
	subtitle,
	onClose,
	children
}: {
	title: string
	subtitle: string
	onClose: () => void
	children: React.ReactNode
}) {
	return (
		<div className="fixed inset-0 z-[9999]">
			<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
			<motion.div
				initial={{ opacity: 0, x: 80 }}
				animate={{ opacity: 1, x: 0 }}
				exit={{ opacity: 0, x: 80 }}
				transition={{ duration: 0.3, ease: 'easeOut' }}
				className="absolute right-0 top-0 h-full w-full max-w-sm overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#1c0808] via-[#080202] to-[#000000] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.9)]"
			>
				<div className="flex items-center justify-between mb-6">
					<div>
						<h2 className="text-xl font-semibold text-white">{title}</h2>
						<p className="text-xs text-white/40 mt-1">{subtitle}</p>
					</div>
					<button
						onClick={onClose}
						className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10 transition"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				{children}
			</motion.div>
		</div>
	)
}
