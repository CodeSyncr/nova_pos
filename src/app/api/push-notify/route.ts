import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webPush from 'web-push'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!

webPush.setVapidDetails(
	'mailto:support@novapos.in',
	vapidPublicKey,
	vapidPrivateKey
)

export async function POST(request: NextRequest) {
	try {
		const { tenantId, excludeUserId, title, body, url } = await request.json()

		if (!tenantId || !title) {
			return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		})

		// Get all push subscriptions for this tenant (except the sender)
		let query = supabase
			.from('push_subscriptions')
			.select('subscription, user_id')
			.eq('tenant_id', tenantId)

		if (excludeUserId) {
			query = query.neq('user_id', excludeUserId)
		}

		const { data: subscriptions, error } = await query

		if (error) {
			console.error('Error fetching subscriptions:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		if (!subscriptions || subscriptions.length === 0) {
			return NextResponse.json({ sent: 0 })
		}

		const payload = JSON.stringify({
			title,
			body,
			icon: '/icon-192.svg',
			badge: '/icon-192.svg',
			url: url || '/orders',
			timestamp: Date.now()
		})

		let sent = 0
		const failed: string[] = []

		for (const sub of subscriptions) {
			try {
				await webPush.sendNotification(sub.subscription, payload)
				sent++
			} catch (err: any) {
				// If subscription expired, remove it
				if (err.statusCode === 404 || err.statusCode === 410) {
					await supabase
						.from('push_subscriptions')
						.delete()
						.eq('user_id', sub.user_id)
						.eq('tenant_id', tenantId)
				}
				failed.push(sub.user_id)
			}
		}

		return NextResponse.json({ sent, failed: failed.length })
	} catch (err) {
		console.error('Push notify error:', err)
		return NextResponse.json({ error: 'Server error' }, { status: 500 })
	}
}
