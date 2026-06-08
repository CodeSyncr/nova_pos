import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || ''

let vapidConfigured = false

function ensureVapid() {
	if (vapidConfigured || !vapidPublicKey || !vapidPrivateKey) return
	webPush.setVapidDetails('mailto:support@novapos.in', vapidPublicKey, vapidPrivateKey)
	vapidConfigured = true
}

/**
 * Send push notifications to all subscribed users of a tenant (except the sender).
 * Safe to call even if VAPID keys aren't configured — will silently no-op.
 */
export async function sendPushToTenant(options: {
	tenantId: string
	excludeUserId: string
	title: string
	body: string
	url?: string
}) {
	if (!vapidPublicKey || !vapidPrivateKey || !supabaseServiceKey) return

	ensureVapid()

	const supabase = createClient(supabaseUrl, supabaseServiceKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	})

	const { data: subscriptions } = await supabase
		.from('push_subscriptions')
		.select('subscription, user_id')
		.eq('tenant_id', options.tenantId)
		.neq('user_id', options.excludeUserId)

	if (!subscriptions || subscriptions.length === 0) return

	const payload = JSON.stringify({
		title: options.title,
		body: options.body,
		icon: '/icon-192.svg',
		badge: '/icon-192.svg',
		url: options.url || '/orders',
		timestamp: Date.now()
	})

	for (const sub of subscriptions) {
		try {
			await webPush.sendNotification(sub.subscription, payload)
		} catch (err: any) {
			// Remove expired subscriptions
			if (err.statusCode === 404 || err.statusCode === 410) {
				await supabase
					.from('push_subscriptions')
					.delete()
					.eq('user_id', sub.user_id)
					.eq('tenant_id', options.tenantId)
			}
		}
	}
}
