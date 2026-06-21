'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Fingerprint } from 'lucide-react'
// no animations: form and sheet render statically
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
	const [supabaseClient] = useState(createSupabaseBrowserClient)
	const router = useRouter()

	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [showPassword, setShowPassword] = useState(false)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let isMounted = true

		const redirectAfterAuth = async (userId: string) => {
			const { data: pt } = await supabaseClient
				.from('profile_tenants')
				.select('role_id')
				.eq('profile_id', userId)
				.single()

			if (!isMounted) return

			// No workspace yet → onboarding
			if (!pt) {
				router.replace('/onboarding')
				return
			}

			// Owner/admin (OWNER role or ["*"] permissions) → dashboard; restricted staff → POS
			let isFullAccess = !pt.role_id
			if (pt.role_id) {
				const { data: role } = await supabaseClient
					.from('roles')
					.select('code, permissions')
					.eq('id', pt.role_id)
					.single()
				const perms = role?.permissions as unknown
				isFullAccess =
					role?.code === 'OWNER' ||
					perms == null ||
					(Array.isArray(perms) &&
						(perms.includes('*') || perms.includes('all')))
			}

			if (!isMounted) return
			router.replace(isFullAccess ? '/dashboard' : '/pos')
		}

		supabaseClient.auth.getSession().then(({ data }) => {
			if (data.session && isMounted) {
				redirectAfterAuth(data.session.user.id)
			}
		})

		const {
			data: { subscription }
		} = supabaseClient.auth.onAuthStateChange((_event, session) => {
			if (session) redirectAfterAuth(session.user.id)
		})

		return () => {
			isMounted = false
			subscription.unsubscribe()
		}
	}, [router, supabaseClient])

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault()
		if (loading) return
		setError(null)
		setLoading(true)

		const { error: signInError } = await supabaseClient.auth.signInWithPassword({
			email: email.trim(),
			password
		})

		if (signInError) {
			setError(signInError.message)
			setLoading(false)
			return
		}
		// onAuthStateChange handles the redirect; keep the button busy until it does.
	}

	const handleGoogleSignIn = async () => {
		if (loading) return
		setError(null)
		setLoading(true)

		try {
			const { error: oauthError } = await supabaseClient.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo: `${window.location.origin}/auth/callback`
				}
			})
			if (oauthError) {
				setError(oauthError.message)
				setLoading(false)
			}
		} catch (err: any) {
			setError(err.message || 'An error occurred during Google sign in')
			setLoading(false)
		}
	}

	const handlePasskeySignIn = async () => {
		if (loading) return
		setError(null)
		setLoading(true)

		try {
			const { error: passkeyError } = await (supabaseClient.auth as any).signInWithPasskey()
			if (passkeyError) {
				setError(passkeyError.message)
				setLoading(false)
			}
		} catch (err: any) {
			setError(err.message || 'Passkey sign-in failed or was cancelled.')
			setLoading(false)
		}
	}

	const formBody = (
		<>
			<div className="mb-7">
				<h1 className="text-2xl font-semibold tracking-tight text-white">
					Sign in
				</h1>
				<p className="mt-1 text-sm text-white/40">
					Welcome back to Pizzeria Da Cafe
				</p>
			</div>

			<form onSubmit={handleSubmit} className="space-y-4">
				{/* Email */}
				<div className="space-y-1.5">
					<label
						htmlFor="email"
						className="text-xs font-medium uppercase tracking-wider text-white/40"
					>
						Email
					</label>
					<div className="relative">
						<Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
						<input
							id="email"
							type="email"
							required
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@pizzeriadacafe.com"
							className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white placeholder-white/25 outline-none focus:border-[#E0342A] focus:bg-white/[0.06] focus:ring-2 focus:ring-[#E0342A]/20"
						/>
					</div>
				</div>

				{/* Password */}
				<div className="space-y-1.5">
					<label
						htmlFor="password"
						className="text-xs font-medium uppercase tracking-wider text-white/40"
					>
						Password
					</label>
					<div className="relative">
						<Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
						<input
							id="password"
							type={showPassword ? 'text' : 'password'}
							required
							autoComplete="current-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••"
							className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-11 text-sm text-white placeholder-white/25 outline-none focus:border-[#E0342A] focus:bg-white/[0.06] focus:ring-2 focus:ring-[#E0342A]/20"
						/>
						<button
							type="button"
							onClick={() => setShowPassword((s) => !s)}
							className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							{showPassword ? (
								<EyeOff className="h-4 w-4" />
							) : (
								<Eye className="h-4 w-4" />
							)}
						</button>
					</div>
				</div>

				{/* Error */}
				{error && (
					<p className="rounded-lg border border-[#E0342A]/30 bg-[#E0342A]/10 px-3 py-2 text-xs text-red-300">
						{error}
					</p>
				)}

				{/* Submit */}
				<button
					type="submit"
					disabled={loading}
					className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#E0342A] py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(224,52,42,0.6)] hover:bg-[#C42A21] disabled:cursor-not-allowed disabled:opacity-70"
				>
					{loading ? (
						<>
							{null}
							Signing in…
						</>
					) : (
						<>
							Sign in
							<ArrowRight className="h-4 w-4" />
						</>
					)}
				</button>
			</form>

			<div className="my-5 flex items-center justify-center gap-3">
				<div className="h-[1px] flex-1 bg-white/10" />
				<span className="text-xs uppercase tracking-wider text-white/30 font-medium">or</span>
				<div className="h-[1px] flex-1 bg-white/10" />
			</div>

			<div className="flex flex-col gap-3">
				<button
					type="button"
					onClick={handlePasskeySignIn}
					disabled={loading}
					className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] py-3 text-sm font-semibold text-white hover:bg-white/[0.08] hover:border-white/20 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70"
				>
					<Fingerprint className="h-5 w-5 shrink-0 text-[#E0342A]" />
					Sign in with Passkey / Face ID
				</button>

				<button
					type="button"
					onClick={handleGoogleSignIn}
					disabled={loading}
					className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] py-3 text-sm font-semibold text-white hover:bg-white/[0.08] hover:border-white/20 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70"
				>
					<svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
						<path
							fill="#4285F4"
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						/>
						<path
							fill="#34A853"
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						/>
						<path
							fill="#FBBC05"
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
						/>
						<path
							fill="#EA4335"
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						/>
					</svg>
					Continue with Google
				</button>
			</div>
		</>
	)

	return (
		<div className="relative min-h-dvh overflow-hidden bg-black text-white lg:grid lg:grid-cols-2">
			{/* Illustration — full-screen background on mobile, left column on desktop */}
			<div className="absolute inset-0 lg:relative lg:h-dvh">
				<Image
					src="/login_bg.png"
					alt="Pizzeria Da Cafe"
					fill
					priority
					className="object-cover object-top lg:object-center"
				/>
				{/* Fade the image into the sheet on mobile */}
				<div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/70 to-transparent lg:hidden" />
			</div>

			{/* Form — bottom sheet on mobile, centered right column on desktop */}
			<div className="relative z-10 flex min-h-dvh flex-col justify-end lg:items-center lg:justify-center lg:px-6">
				<div className="w-full rounded-t-[28px] border-t border-white/10 bg-black/70 px-6 pb-10 pt-5 shadow-[0_-24px_70px_rgba(0,0,0,0.7)] backdrop-blur-2xl lg:max-w-sm lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
					{/* Grab handle — mobile only */}
					<div className="mx-auto mb-6 h-1.5 w-11 rounded-full bg-white/20 lg:hidden" />
					{formBody}
				</div>
			</div>
		</div>
	)
}
