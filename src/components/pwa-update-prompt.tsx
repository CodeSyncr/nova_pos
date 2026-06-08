'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PWAUpdatePrompt() {
	const [showUpdate, setShowUpdate] = useState(false)
	const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

	useEffect(() => {
		if (!('serviceWorker' in navigator)) return

		const checkForUpdates = async () => {
			try {
				const reg = await navigator.serviceWorker.getRegistration()
				if (!reg) return

				setRegistration(reg)

				// Force check for updates immediately
				reg.update()

				// Check for waiting worker (update ready)
				if (reg.waiting) {
					setShowUpdate(true)
					return
				}

				// Listen for new updates
				reg.addEventListener('updatefound', () => {
					const newWorker = reg.installing
					if (!newWorker) return

					newWorker.addEventListener('statechange', () => {
						if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
							setShowUpdate(true)
						}
					})
				})
			} catch (err) {
				console.error('SW update check failed:', err)
			}
		}

		checkForUpdates()

		// Check for updates periodically (every 30 seconds)
		const interval = setInterval(() => {
			navigator.serviceWorker.getRegistration().then((reg) => {
				if (reg) reg.update()
			})
		}, 30000)

		// Also listen for controller change (another tab triggered update)
		let refreshing = false
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (!refreshing) {
				refreshing = true
				window.location.reload()
			}
		})

		return () => clearInterval(interval)
	}, [])

	const handleUpdate = () => {
		if (registration?.waiting) {
			// Tell waiting SW to take over
			registration.waiting.postMessage({ type: 'SKIP_WAITING' })
		} else {
			// Force reload to get latest
			window.location.reload()
		}
	}

	if (!showUpdate) return null

	return (
		<div className="fixed bottom-4 left-4 right-4 z-[9999] md:left-auto md:right-4 md:w-[360px]">
			<div className="rounded-2xl border border-white/20 bg-[#0F1225]/95 backdrop-blur-xl p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
				<div className="flex items-start gap-3">
					<div className="rounded-xl bg-blue-500/20 p-2.5">
						<RefreshCw className="h-5 w-5 text-blue-400" />
					</div>
					<div className="flex-1">
						<h3 className="text-sm font-semibold text-white">Update Available</h3>
						<p className="mt-0.5 text-xs text-white/60">
							A new version of Nova POS is ready. Update now for the latest features.
						</p>
						<div className="mt-3 flex gap-2">
							<Button size="sm" onClick={handleUpdate} className="text-xs">
								<RefreshCw className="mr-1.5 h-3.5 w-3.5" />
								Update Now
							</Button>
							<Button size="sm" variant="ghost" onClick={() => setShowUpdate(false)} className="text-xs text-white/60">
								Later
							</Button>
						</div>
					</div>
					<button onClick={() => setShowUpdate(false)} className="text-white/40 hover:text-white">
						<X className="h-4 w-4" />
					</button>
				</div>
			</div>
		</div>
	)
}
