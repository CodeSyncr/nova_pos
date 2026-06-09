'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import webPush from 'web-push'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

function createAdminClient() {
	if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing admin credentials')
	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	})
}

if (vapidPublicKey && vapidPrivateKey) {
	webPush.setVapidDetails(
		'mailto:support@novapos.in',
		vapidPublicKey,
		vapidPrivateKey
	)
}

export type Task = {
	id: string
	tenant_id: string
	title: string
	description: string | null
	assigned_to: string | null
	is_recurring: boolean
	status: 'pending' | 'completed'
	last_reset_date: string
	completed_at: string | null
	completed_by: string | null
	created_at: string
	updated_at: string
	items: Array<{ id: string; text: string; status: 'pending' | 'completed' }>
	reminder_interval: number | null
	last_reminded_at: string | null
	reminder_start_time: string | null
	assigned_profile?: {
		id: string
		full_name: string | null
	} | null
	completed_profile?: {
		id: string
		full_name: string | null
	} | null
}

// Get the date string (YYYY-MM-DD) for a specific timezone
function getLocalDateOnly(timezone: string): string {
	const todayStr = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date()) // MM/DD/YYYY
	const [m, d, y] = todayStr.split('/')
	return `${y}-${m}-${d}`
}

/**
 * Get all tasks for a tenant. Automatically handles daily resets of recurring tasks.
 */
export async function getTasks(tenantId: string): Promise<Task[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	// 1. Get tenant's timezone
	const { data: tenant } = await admin
		.from('tenants')
		.select('timezone')
		.eq('id', tenantId)
		.single()
	const tz = tenant?.timezone || 'UTC'
	const todayDateStr = getLocalDateOnly(tz)

	// 2. Fetch recurring tasks that have not been reset today
	const { data: expiredTasks } = await admin
		.from('tasks')
		.select('id')
		.eq('tenant_id', tenantId)
		.eq('is_recurring', true)
		.lt('last_reset_date', todayDateStr)

	// 3. Batch reset tasks if any are expired
	if (expiredTasks && expiredTasks.length > 0) {
		const { error: resetError } = await admin
			.from('tasks')
			.update({
				status: 'pending',
				completed_at: null,
				completed_by: null,
				last_reset_date: todayDateStr,
				updated_at: new Date().toISOString()
			})
			.in('id', expiredTasks.map(t => t.id))

		if (resetError) {
			console.error('Error resetting expired tasks:', resetError)
		}
	}

	// 4. Fetch all current tasks with profile details
	const { data: tasks, error } = await admin
		.from('tasks')
		.select(`
			*,
			assigned_profile:profiles!tasks_assigned_to_fkey(id, full_name),
			completed_profile:profiles!tasks_completed_by_fkey(id, full_name)
		`)
		.eq('tenant_id', tenantId)
		.order('created_at', { ascending: false })

	if (error) {
		throw new Error(error.message)
	}

	return (tasks || []).map((t: any) => ({
		...t,
		assigned_profile: Array.isArray(t.assigned_profile) ? t.assigned_profile[0] : t.assigned_profile,
		completed_profile: Array.isArray(t.completed_profile) ? t.completed_profile[0] : t.completed_profile
	})) as Task[]
}

/**
 * Create a new task.
 */
export async function createTask(
	tenantId: string,
	title: string,
	description: string,
	assignedTo: string | null,
	isRecurring: boolean,
	items: Array<{ id: string; text: string; status: 'pending' | 'completed' }> = [],
	reminderInterval: number | null = null,
	reminderStartTime: string | null = null
): Promise<Task> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	// Get tenant's timezone for setting current date
	const { data: tenant } = await admin
		.from('tenants')
		.select('timezone')
		.eq('id', tenantId)
		.single()
	const tz = tenant?.timezone || 'UTC'
	const todayDateStr = getLocalDateOnly(tz)

	const { data: task, error } = await admin
		.from('tasks')
		.insert({
			tenant_id: tenantId,
			title,
			description: description || null,
			assigned_to: assignedTo || null,
			is_recurring: isRecurring,
			status: 'pending',
			last_reset_date: todayDateStr,
			items: items || [],
			reminder_interval: reminderInterval,
			reminder_start_time: reminderStartTime
		})
		.select(`
			*,
			assigned_profile:profiles!tasks_assigned_to_fkey(id, full_name)
		`)
		.single()

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/tasks')
	revalidatePath('/dashboard')

	return {
		...task,
		assigned_profile: Array.isArray(task.assigned_profile) ? task.assigned_profile[0] : task.assigned_profile
	} as Task
}

/**
 * Toggle task completed status.
 */
export async function toggleTaskStatus(
	taskId: string,
	status: 'pending' | 'completed'
): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	// 1. Fetch task to see checklist items
	const { data: task } = await admin
		.from('tasks')
		.select('items')
		.eq('id', taskId)
		.single()

	const currentItems = Array.isArray(task?.items) ? task.items : []
	// Toggling parent task cascades to all sub-items
	const updatedItems = currentItems.map((item: any) => ({
		...item,
		status
	}))

	const updateData: Record<string, any> = {
		status,
		items: updatedItems,
		updated_at: new Date().toISOString()
	}

	if (status === 'completed') {
		updateData.completed_at = new Date().toISOString()
		updateData.completed_by = user.id
	} else {
		updateData.completed_at = null
		updateData.completed_by = null
	}

	const { error } = await admin
		.from('tasks')
		.update(updateData)
		.eq('id', taskId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/tasks')
	revalidatePath('/dashboard')
}

/**
 * Toggle the status of a specific sub-item checklist row.
 */
export async function toggleTaskItemStatus(
	taskId: string,
	itemId: string,
	itemStatus: 'pending' | 'completed'
): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	// 1. Fetch current task
	const { data: task, error: fetchError } = await admin
		.from('tasks')
		.select('items')
		.eq('id', taskId)
		.single()

	if (fetchError || !task) {
		throw new Error('Task not found')
	}

	const subItems = Array.isArray(task.items) ? task.items : []
	const updatedItems = subItems.map((item: any) => {
		if (item.id === itemId) {
			return { ...item, status: itemStatus }
		}
		return item
	})

	// 2. Determine if parent task status should change
	const allCompleted = updatedItems.length > 0 && updatedItems.every((item: any) => item.status === 'completed')
	const newParentStatus = allCompleted ? 'completed' : 'pending'

	const updateData: Record<string, any> = {
		items: updatedItems,
		status: newParentStatus,
		updated_at: new Date().toISOString()
	}

	if (newParentStatus === 'completed') {
		updateData.completed_at = new Date().toISOString()
		updateData.completed_by = user.id
	} else {
		updateData.completed_at = null
		updateData.completed_by = null
	}

	const { error: updateError } = await admin
		.from('tasks')
		.update(updateData)
		.eq('id', taskId)

	if (updateError) {
		throw new Error(updateError.message)
	}

	revalidatePath('/tasks')
	revalidatePath('/dashboard')
}

/**
 * Delete a task.
 */
export async function deleteTask(taskId: string): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	const { error } = await admin
		.from('tasks')
		.delete()
		.eq('id', taskId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/tasks')
	revalidatePath('/dashboard')
}

/**
 * Send a web push notification to a staff member for a specific task.
 */
export async function sendTaskReminder(tenantId: string, taskId: string): Promise<{ success: boolean; sent: number }> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	// 1. Get task details
	const { data: task, error: taskError } = await admin
		.from('tasks')
		.select('title, assigned_to')
		.eq('id', taskId)
		.single()

	if (taskError || !task) {
		throw new Error('Task not found')
	}

	if (!task.assigned_to) {
		throw new Error('Task is not assigned to anyone')
	}

	// 2. Fetch push subscriptions for the assigned user
	const { data: subscriptions, error: subError } = await admin
		.from('push_subscriptions')
		.select('subscription, user_id')
		.eq('tenant_id', tenantId)
		.eq('user_id', task.assigned_to)

	if (subError) {
		console.error('Error fetching subscriptions for reminder:', subError)
		return { success: false, sent: 0 }
	}

	if (!subscriptions || subscriptions.length === 0) {
		return { success: false, sent: 0 }
	}

	const payload = JSON.stringify({
		title: 'Task Reminder 📋',
		body: `Please check and complete your task: "${task.title}"`,
		icon: '/icon-192.svg',
		badge: '/icon-192.svg',
		url: '/tasks',
		timestamp: Date.now()
	})

	let sent = 0
	for (const sub of subscriptions) {
		try {
			await webPush.sendNotification(sub.subscription, payload)
			sent++
		} catch (err: any) {
			// Clean up subscription if expired
			if (err.statusCode === 404 || err.statusCode === 410) {
				await admin
					.from('push_subscriptions')
					.delete()
					.eq('user_id', sub.user_id)
					.eq('tenant_id', tenantId)
			}
		}
	}

	return { success: true, sent }
}

/**
 * Update an existing task.
 */
export async function updateTask(
	tenantId: string,
	taskId: string,
	title: string,
	description: string,
	assignedTo: string | null,
	isRecurring: boolean,
	items: Array<{ id: string; text: string; status: 'pending' | 'completed' }> = [],
	reminderInterval: number | null = null,
	reminderStartTime: string | null = null
): Promise<Task> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const admin = createAdminClient()

	// 1. Fetch current task to check status & completed info
	const { data: existingTask, error: fetchError } = await admin
		.from('tasks')
		.select('status, completed_at, completed_by')
		.eq('id', taskId)
		.eq('tenant_id', tenantId)
		.single()

	if (fetchError || !existingTask) {
		throw new Error('Task not found')
	}

	let status = existingTask.status || 'pending'
	let completedAt = existingTask.completed_at
	let completedBy = existingTask.completed_by

	// If there are items, recalculate overall status
	if (items && items.length > 0) {
		const allCompleted = items.every(item => item.status === 'completed')
		status = allCompleted ? 'completed' : 'pending'
		if (status === 'completed') {
			completedAt = completedAt || new Date().toISOString()
			completedBy = completedBy || user.id
		} else {
			completedAt = null
			completedBy = null
		}
	}

	const updateData: Record<string, any> = {
		title,
		description: description || null,
		assigned_to: assignedTo || null,
		is_recurring: isRecurring,
		items: items || [],
		reminder_interval: reminderInterval,
		reminder_start_time: reminderStartTime,
		status,
		completed_at: completedAt,
		completed_by: completedBy,
		updated_at: new Date().toISOString()
	}

	const { data: task, error } = await admin
		.from('tasks')
		.update(updateData)
		.eq('id', taskId)
		.eq('tenant_id', tenantId)
		.select(`
			*,
			assigned_profile:profiles!tasks_assigned_to_fkey(id, full_name),
			completed_profile:profiles!tasks_completed_by_fkey(id, full_name)
		`)
		.single()

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/tasks')
	revalidatePath('/dashboard')

	return {
		...task,
		assigned_profile: Array.isArray(task.assigned_profile) ? task.assigned_profile[0] : task.assigned_profile,
		completed_profile: Array.isArray(task.completed_profile) ? task.completed_profile[0] : task.completed_profile
	} as Task
}

