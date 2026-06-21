'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Fingerprint, X, Shield, Sparkles, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function PasskeyEnrollModal() {
	const [isOpen, setIsOpen] = useState(false)
	const [status, setStatus] = useState<'idle' | 'registering' | 'success' | 'error'>('idle')
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const [userId, setUserId] = useState<string | null>(null)
	const [dontShowAgain, setDontShowAgain] = useState(false)

	const supabase = createSupabaseBrowserClient()

	useEffect(() => {
		const checkEligibility = async () => {
			try {
				// 1. Check if browser supports WebAuthn
				if (typeof window === 'undefined' || !window.PublicKeyCredential) {
					return
				}

				// 2. Check if user is authenticated
				const { data: { user } } = await supabase.auth.getUser()
				if (!user) return
				setUserId(user.id)

				// 3. Check if user has already dismissed the prompt
				const dismissed = localStorage.getItem(`dismiss-passkey-prompt-${user.id}`)
				if (dismissed === 'true') {
					return
				}

				// 4. Check if user already has a passkey enrolled
				const { data, error } = await (supabase.auth as any).passkey.list()
				if (error) {
					console.warn('Could not list passkeys:', error)
					return
				}

				// If they don't have any passkeys, prompt them
				if (Array.isArray(data) && data.length === 0) {
					// Add a tiny delay for a nicer initial experience after page load
					setTimeout(() => {
						setIsOpen(true)
					}, 1500)
				}
			} catch (err) {
				console.error('Error checking passkey eligibility:', err)
			}
		}

		checkEligibility()
	}, [supabase])

	const handleRegister = async () => {
		if (!userId) return
		setStatus('registering')
		setErrorMessage(null)

		try {
			const { error } = await (supabase.auth as any).registerPasskey()
			if (error) {
				throw error
			}

			setStatus('success')
			// Auto close after 2.5 seconds on success
			setTimeout(() => {
				setIsOpen(false)
			}, 2500)
		} catch (err: any) {
			console.error('Passkey registration error:', err)
			setStatus('error')
			setErrorMessage(err.message || 'The biometric registration was cancelled or failed.')
		}
	}

	const handleDismiss = (permanent = false) => {
		if (userId) {
			if (permanent || dontShowAgain) {
				localStorage.setItem(`dismiss-passkey-prompt-${userId}`, 'true')
			} else {
				// Just dismiss for the current session (set short cookie or sessionStorage, or local storage with expiry)
				// For simplicity, we'll store a temporary flag in session storage
				sessionStorage.setItem(`dismiss-passkey-prompt-temp-${userId}`, 'true')
			}
		}
		setIsOpen(false)
	}

	if (!isOpen) return null

	return (
		<AnimatePresence>
			<div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
				{/* Backdrop */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					onClick={() => handleDismiss(false)}
					className="absolute inset-0 bg-black/80 backdrop-blur-md"
				/>

				{/* Modal Card */}
				<motion.div
					initial={{ opacity: 0, scale: 0.9, y: 20 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.9, y: 20 }}
					transition={{ type: 'spring', damping: 25, stiffness: 350 }}
					className="relative z-10 w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-black/90 p-8 shadow-[0_24px_70px_rgba(0,0,0,0.8)] backdrop-blur-2xl text-center"
				>
					{/* Close button */}
					<button
						onClick={() => handleDismiss(false)}
						className="absolute right-5 top-5 rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
						aria-label="Close modal"
					>
						<X className="h-5 w-5" />
					</button>

					{status !== 'success' && (
						<>
							{/* Glowing Ring with Icon */}
							<div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#E0342A]/10 border border-[#E0342A]/20">
								<div className="absolute inset-0 animate-ping rounded-3xl bg-[#E0342A]/5" />
								<Fingerprint className="h-10 w-10 text-[#E0342A]" />
							</div>

							<h3 className="text-2xl font-bold tracking-tight text-white mb-2">
								Enable Biometric Sign-in
							</h3>
							
							<p className="text-sm text-white/60 mb-6 px-2">
								Sign in instantly and securely next time using Face ID, Touch ID, or your device passcode instead of typing your password.
							</p>

							{/* Error message */}
							{status === 'error' && errorMessage && (
								<motion.div
									initial={{ opacity: 0, y: -10 }}
									animate={{ opacity: 1, y: 0 }}
									className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-left text-xs text-red-300"
								>
									<AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
									<span>{errorMessage}</span>
								</motion.div>
							)}

							{/* Actions */}
							<div className="space-y-3">
								<Button
									onClick={handleRegister}
									disabled={status === 'registering'}
									className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#E0342A] hover:bg-[#C42A21] text-white py-3 font-semibold shadow-[0_10px_30px_-8px_rgba(224,52,42,0.6)]"
								>
									{status === 'registering' ? (
										<>
											<Loader2 className="h-4 w-4 animate-spin" />
											Configuring sensor...
										</>
									) : (
										<>
											<Fingerprint className="h-4 w-4" />
											Activate Face ID / Touch ID
										</>
									)}
								</Button>

								<Button
									variant="ghost"
									onClick={() => handleDismiss(false)}
									disabled={status === 'registering'}
									className="w-full rounded-xl border border-white/10 bg-white/[0.02] text-sm text-white/70 hover:bg-white/[0.08]"
								>
									Maybe Later
								</Button>
							</div>

							{/* Dont ask again checkbox */}
							<div className="mt-6 flex items-center justify-center gap-2 text-xs text-white/40">
								<input
									type="checkbox"
									id="dont-show"
									checked={dontShowAgain}
									onChange={(e) => setDontShowAgain(e.target.checked)}
									className="rounded border-white/10 bg-black text-[#E0342A] focus:ring-0"
								/>
								<label htmlFor="dont-show" className="cursor-pointer select-none">
									Do not ask me again on this device
								</label>
							</div>
						</>
					)}

					{status === 'success' && (
						<motion.div
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							className="py-6"
						>
							<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
								<CheckCircle2 className="h-12 w-12" />
							</div>
							<h3 className="text-2xl font-bold tracking-tight text-white mb-2">
								Biometrics Activated!
							</h3>
							<p className="text-sm text-white/60">
								Your passkey is successfully registered. You can now log in securely using your fingerprint or face recognition.
							</p>
						</motion.div>
					)}
				</motion.div>
			</div>
		</AnimatePresence>
	)
}
