import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
	try {
		const { subscription, userId, tenantId } = await request.json()

		if (!subscription || !userId || !tenantId) {
			return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		})

		// Store push subscription
		const { error } = await supabase.from('push_subscriptions').upsert(
			{
				user_id: userId,
				tenant_id: tenantId,
				endpoint: subscription.endpoint,
				subscription: subscription,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,tenant_id' }
		)

		if (error) {
			console.error('Error storing push subscription:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (err) {
		console.error('Push subscribe error:', err)
		return NextResponse.json({ error: 'Server error' }, { status: 500 })
	}
}
