import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webPush from 'web-push'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!

webPush.setVapidDetails(
	'mailto:support@novapos.in',
	vapidPublicKey,
	vapidPrivateKey
)

/**
 * Confirms the caller may fan a notification out to `tenantId`.
 *
 * This endpoint pushes an attacker-controllable title, body and click-through
 * URL to every subscribed device on a tenant, so leaving it open is a phishing
 * vector aimed at staff. It accepts either:
 *   - a signed-in user who belongs to the tenant (session cookie or Bearer), or
 *   - PUSH_NOTIFY_SECRET as a Bearer token, for server-to-server callers.
 *
 * TRANSITION: the shipped iOS app sends no credentials yet. Until an updated
 * build is out, an unauthenticated call is still allowed so order notifications
 * keep working — set PUSH_NOTIFY_STRICT=true to close that door once the app
 * update has rolled out. Unauthenticated calls are logged meanwhile so you can
 * see whether anything still relies on the legacy path.
 */
async function authorizePush(request: NextRequest, tenantId: string): Promise<NextResponse | null> {
	const auth = request.headers.get('authorization') ?? ''
	const sharedSecret = process.env.PUSH_NOTIFY_SECRET

	if (sharedSecret && auth === `Bearer ${sharedSecret}`) return null

	try {
		const supabase = await createSupabaseServerClient()
		const {
			data: { user }
		} = await supabase.auth.getUser()

		if (user) {
			const { data: membership } = await supabase
				.from('profile_tenants')
				.select('tenant_id')
				.eq('tenant_id', tenantId)
				.eq('profile_id', user.id)
				.maybeSingle()

			if (membership) return null
		}
	} catch {
		// Fall through to the legacy decision below.
	}

	if (process.env.PUSH_NOTIFY_STRICT === 'true') {
		return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
	}

	console.warn(
		`[push-notify] unauthenticated call for tenant ${tenantId} allowed by legacy mode. ` +
			'Set PUSH_NOTIFY_STRICT=true once all clients send credentials.'
	)
	return null
}

export async function POST(request: NextRequest) {
	try {
		const { tenantId, excludeUserId, title, body, url } = await request.json()

		if (!tenantId || !title) {
			return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
		}

		const denied = await authorizePush(request, tenantId)
		if (denied) return denied

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
