import { NextRequest, NextResponse } from 'next/server'
import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || ''

/**
 * GET /api/push-test?tenantId=xxx
 * Sends a test push notification to all subscribers of a tenant.
 * Use this to verify push is working.
 */
export async function GET(request: NextRequest) {
	const tenantId = request.nextUrl.searchParams.get('tenantId')

	if (!tenantId) {
		return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
	}

	if (!vapidPublicKey || !vapidPrivateKey) {
		return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
	}

	webPush.setVapidDetails('mailto:support@novapos.in', vapidPublicKey, vapidPrivateKey)

	const supabase = createClient(supabaseUrl, supabaseServiceKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	})

	const { data: subscriptions, error } = await supabase
		.from('push_subscriptions')
		.select('subscription, user_id')
		.eq('tenant_id', tenantId)

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 })
	}

	if (!subscriptions || subscriptions.length === 0) {
		return NextResponse.json({ error: 'No subscriptions found for this tenant', tenantId })
	}

	const payload = JSON.stringify({
		title: 'Test Notification',
		body: 'Push notifications are working! 🎉',
		icon: '/icon-192.svg',
		url: '/dashboard',
		timestamp: Date.now()
	})

	const results: Array<{ userId: string; status: string; error?: string }> = []

	for (const sub of subscriptions) {
		try {
			await webPush.sendNotification(sub.subscription, payload)
			results.push({ userId: sub.user_id, status: 'sent' })
		} catch (err: any) {
			results.push({
				userId: sub.user_id,
				status: 'failed',
				error: err.body || err.message || String(err)
			})

			// Clean up expired subscriptions
			if (err.statusCode === 404 || err.statusCode === 410) {
				await supabase
					.from('push_subscriptions')
					.delete()
					.eq('user_id', sub.user_id)
					.eq('tenant_id', tenantId)
			}
		}
	}

	return NextResponse.json({
		tenantId,
		totalSubscriptions: subscriptions.length,
		results
	})
}
