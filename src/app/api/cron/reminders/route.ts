import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webPush from 'web-push'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!

if (vapidPublicKey && vapidPrivateKey) {
	webPush.setVapidDetails(
		'mailto:support@novapos.in',
		vapidPublicKey,
		vapidPrivateKey
	)
}

export async function GET(request: NextRequest) {
	return handleReminders()
}

export async function POST(request: NextRequest) {
	return handleReminders()
}

async function handleReminders() {
	try {
		if (!supabaseUrl || !supabaseServiceKey) {
			return NextResponse.json({ error: 'Missing credentials' }, { status: 500 })
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		})

		// 1. Find all pending tasks that have a reminder_interval and are assigned to someone
		const { data: tasks, error } = await supabase
			.from('tasks')
			.select('*, tenants(timezone)')
			.eq('status', 'pending')
			.not('reminder_interval', 'is', null)
			.not('assigned_to', 'is', null)

		if (error) {
			console.error('Error fetching tasks for cron reminders:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		if (!tasks || tasks.length === 0) {
			return NextResponse.json({ processed: 0, sent: 0 })
		}

		const now = new Date()
		let totalSent = 0
		const remindedTasks: string[] = []

		for (const task of tasks) {
			const intervalMinutes = task.reminder_interval
			const lastReminded = task.last_reminded_at ? new Date(task.last_reminded_at) : null
			const timezone = (task.tenants as any)?.timezone || 'Asia/Kolkata'
			const startTime = task.reminder_start_time

			let shouldRemind = false

			if (startTime) {
				const localFormatter = new Intl.DateTimeFormat('en-US', {
					timeZone: timezone,
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
					hour12: false
				})
				const parts = localFormatter.formatToParts(now)
				const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]))
				
				const localTodayStr = `${partMap.year}-${partMap.month}-${partMap.day}`
				const localHour = parseInt(partMap.hour, 10) % 24
				const localMinute = parseInt(partMap.minute, 10)
				
				const currentLocalMinutes = localHour * 60 + localMinute

				const [startHour, startMinute] = startTime.split(':').map(Number)
				const startMinutes = startHour * 60 + startMinute

				if (currentLocalMinutes >= startMinutes) {
					if (lastReminded) {
						const lastRemindedParts = localFormatter.formatToParts(lastReminded)
						const lastRemindedMap = Object.fromEntries(lastRemindedParts.map(p => [p.type, p.value]))
						const lastRemindedLocalDayStr = `${lastRemindedMap.year}-${lastRemindedMap.month}-${lastRemindedMap.day}`

						if (lastRemindedLocalDayStr === localTodayStr) {
							shouldRemind = (now.getTime() - lastReminded.getTime()) >= intervalMinutes * 60 * 1000
						} else {
							shouldRemind = true
						}
					} else {
						shouldRemind = true
					}
				}
			} else {
				shouldRemind = !lastReminded || (now.getTime() - lastReminded.getTime()) >= intervalMinutes * 60 * 1000
			}

			if (shouldRemind) {
				// Fetch push subscriptions for the assigned user
				const { data: subscriptions } = await supabase
					.from('push_subscriptions')
					.select('subscription, user_id')
					.eq('tenant_id', task.tenant_id)
					.eq('user_id', task.assigned_to)

				if (subscriptions && subscriptions.length > 0) {
					// Get sub-items info
					const subItems = Array.isArray(task.items) ? task.items : []
					const pendingSubItems = subItems.filter((i: any) => i.status === 'pending').length
					const itemsText = pendingSubItems > 0 
						? ` (${pendingSubItems} pending checklist items)`
						: ''

					const payload = JSON.stringify({
						title: 'Urgent Task Reminder ⚠️',
						body: `Pending task: "${task.title}"${itemsText}. Please complete it!`,
						icon: '/icon-192.svg',
						badge: '/icon-192.svg',
						url: '/tasks',
						timestamp: Date.now()
					})

					for (const sub of subscriptions) {
						try {
							await webPush.sendNotification(sub.subscription, payload)
							totalSent++
						} catch (err: any) {
							// If subscription expired or failed, clean it up
							if (err.statusCode === 404 || err.statusCode === 410) {
								await supabase
									.from('push_subscriptions')
									.delete()
									.eq('user_id', sub.user_id)
									.eq('tenant_id', task.tenant_id)
							}
						}
					}
				}

				// Update last_reminded_at in database
				await supabase
					.from('tasks')
					.update({ last_reminded_at: now.toISOString() })
					.eq('id', task.id)

				remindedTasks.push(task.id)
			}
		}

		return NextResponse.json({
			processed: tasks.length,
			sent: totalSent,
			remindedTaskIds: remindedTasks
		})
	} catch (err: any) {
		console.error('Reminder cron error:', err)
		return NextResponse.json({ error: 'Server error' }, { status: 500 })
	}
}
