'use client'

import { useEffect, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

export function OrderNotifications() {
	const [permission, setPermission] = useState<NotificationPermission>('default')
	const [showBanner, setShowBanner] = useState(false)
	const subscribedRef = useRef(false)

	useEffect(() => {
		if (!('Notification' in window) || !('serviceWorker' in navigator)) return

		setPermission(Notification.permission)

		if (Notification.permission === 'default') {
			// Show permission banner after a short delay
			const timer = setTimeout(() => setShowBanner(true), 3000)
			return () => clearTimeout(timer)
		}

		if (Notification.permission === 'granted') {
			subscribeToPush()
		}
	}, [])

	const subscribeToPush = async () => {
		if (subscribedRef.current || !VAPID_PUBLIC_KEY) return
		subscribedRef.current = true

		try {
			const supabase = createSupabaseBrowserClient()
			const { data: { user } } = await supabase.auth.getUser()
			if (!user) return

			const { data: pt } = await supabase
				.from('profile_tenants')
				.select('tenant_id')
				.eq('profile_id', user.id)
				.single()
			if (!pt) return

			// Get service worker registration
			const registration = await navigator.serviceWorker.ready

			// Subscribe to push
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
			})

			// Send subscription to server
			await fetch('/api/push-subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subscription: subscription.toJSON(),
					userId: user.id,
					tenantId: pt.tenant_id
				})
			})
		} catch (err) {
			console.error('Push subscription failed:', err)
			subscribedRef.current = false
		}
	}

	const requestPermission = async () => {
		const result = await Notification.requestPermission()
		setPermission(result)
		setShowBanner(false)

		if (result === 'granted') {
			subscribeToPush()
		}
	}

	if (!showBanner || permission !== 'default') return null

	return (
		<div className="fixed top-4 left-4 right-4 z-[9998] md:left-auto md:right-4 md:w-[360px]">
			<div className="rounded-2xl border border-white/20 bg-[#0F1225]/95 backdrop-blur-xl p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
				<div className="flex items-start gap-3">
					<div className="rounded-xl bg-amber-500/20 p-2.5">
						<Bell className="h-5 w-5 text-amber-400" />
					</div>
					<div className="flex-1">
						<h3 className="text-sm font-semibold text-white">Enable Notifications</h3>
						<p className="mt-0.5 text-xs text-white/60">
							Get notified instantly when new orders come in, even when the app is closed.
						</p>
						<div className="mt-3 flex gap-2">
							<Button size="sm" onClick={requestPermission} className="text-xs">
								Enable
							</Button>
							<Button size="sm" variant="ghost" onClick={() => setShowBanner(false)} className="text-xs text-white/60">
								Not now
							</Button>
						</div>
					</div>
					<button onClick={() => setShowBanner(false)} className="text-white/40 hover:text-white">
						<X className="h-4 w-4" />
					</button>
				</div>
			</div>
		</div>
	)
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
	const rawData = window.atob(base64)
	const outputArray = new Uint8Array(rawData.length)
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i)
	}
	return outputArray
}
