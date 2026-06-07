'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Check, X, Loader, ArrowRight, Link2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { checkSubdomainAvailability } from '@/app/actions/tenant'
import { setTenantSubdomain, skipSubdomainSetup } from '@/app/actions/subdomain'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function SubdomainSetupPage() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const tenantId = searchParams.get('tenantId')
	const [subdomain, setSubdomain] = useState('')
	const [subdomainStatus, setSubdomainStatus] = useState<{
		checking: boolean
		available: boolean | null
		valid: boolean
		message: string
	}>({
		checking: false,
		available: null,
		valid: true,
		message: ''
	})
	const [isSubmitting, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)
	const [tenantName, setTenantName] = useState<string | null>(null)

	useEffect(() => {
		if (!tenantId) {
			router.push('/tenant')
			return
		}

		// Load tenant name
		const loadTenant = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const { data } = await supabase
					.from('tenants')
					.select('name, slug')
					.eq('id', tenantId)
					.single()

				if (data) {
					setTenantName(data.name)
					// If subdomain already exists, redirect to dashboard
					if (data.slug) {
						router.push('/dashboard')
					}
				}
			} catch (error) {
				console.error('Error loading tenant:', error)
			}
		}

		loadTenant()
	}, [tenantId, router])

	const handleSubdomainChange = (value: string) => {
		const cleaned = value
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, '')
			.replace(/^-+|-+$/g, '')
			.slice(0, 63)

		setSubdomain(cleaned)
		setError(null)

		if (cleaned.length >= 3) {
			checkAvailability(cleaned)
		} else {
			setSubdomainStatus({
				checking: false,
				available: null,
				valid: cleaned.length === 0 || cleaned.length >= 3,
				message:
					cleaned.length > 0 && cleaned.length < 3
						? 'Subdomain must be at least 3 characters'
						: ''
			})
		}
	}

	const checkAvailability = async (subdomainValue: string) => {
		setSubdomainStatus({
			checking: true,
			available: null,
			valid: true,
			message: 'Checking availability...'
		})

		try {
			const result = await checkSubdomainAvailability(subdomainValue)
			setSubdomainStatus({
				checking: false,
				available: result.available,
				valid: result.valid,
				message: result.message
			})
		} catch {
			setSubdomainStatus({
				checking: false,
				available: false,
				valid: true,
				message: 'Error checking availability'
			})
		}
	}

	const handleSubmit = () => {
		if (!tenantId) {
			setError('Tenant ID is missing')
			return
		}

		if (!subdomain || subdomain.length < 3) {
			setError('Please enter a valid subdomain (at least 3 characters)')
			return
		}

		if (subdomainStatus.available !== true) {
			setError('Please choose an available subdomain')
			return
		}

		setError(null)
		startTransition(async () => {
			try {
				await setTenantSubdomain(tenantId, subdomain)
				setSuccess(true)
				setTimeout(() => {
					router.push('/dashboard')
				}, 2000)
			} catch (err) {
				setError(
					err instanceof Error ? err.message : 'Failed to set up subdomain'
				)
			}
		})
	}

	const handleSkip = () => {
		if (!tenantId) {
			router.push('/dashboard')
			return
		}

		startTransition(async () => {
			try {
				await skipSubdomainSetup(tenantId)
				// Refresh the router to ensure server components get fresh data
				await router.refresh()
				// Small delay to ensure cache is cleared
				await new Promise((resolve) => setTimeout(resolve, 100))
				router.push('/dashboard')
			} catch (err) {
				setError(
					err instanceof Error ? err.message : 'Failed to skip subdomain setup'
				)
			}
		})
	}

	return (
		<div className="relative min-h-screen bg-gradient-to-b from-[#03030A] via-[#050818] to-[#02030A] text-white">
			<div className="pointer-events-none absolute inset-0">
				<div className="glow -top-32 left-1/2 h-96 w-96 -translate-x-1/2 bg-[#6B6DFF]/30" />
				<div className="glow bottom-0 right-10 h-80 w-80 bg-[#4DD4FF]/25" />
			</div>

			<div className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-8 px-6 py-12">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="w-full space-y-8 rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur-2xl shadow-[0_30px_90px_rgba(3,4,10,0.9)]"
				>
					<header className="space-y-4 text-center">
						<Badge className="border-white/20 bg-white/10 text-white/80">
							<Sparkles className="mr-2 h-4 w-4" /> Subdomain Setup
						</Badge>
						<div className="flex items-center justify-center">
							<div className="rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 p-4">
								<Link2 className="h-8 w-8 text-cyan-300" />
							</div>
						</div>
						<h1 className="text-3xl font-semibold md:text-4xl">
							Claim your unique URL
						</h1>
						<p className="text-white/70">
							{tenantName && (
								<span className="font-semibold text-white">{tenantName}</span>
							)}{' '}
							needs a custom subdomain. Choose something memorable that
							represents your brand.
						</p>
					</header>

					{success ? (
						<motion.div
							initial={{ opacity: 0, scale: 0.95 }}
							animate={{ opacity: 1, scale: 1 }}
							className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-center"
						>
							<Check className="mx-auto h-12 w-12 text-emerald-300" />
							<h2 className="mt-4 text-2xl font-semibold text-white">
								Subdomain Created!
							</h2>
							<p className="mt-2 text-white/70">
								Your workspace is now accessible at{' '}
								<span className="font-mono text-emerald-300">
									{subdomain}.novapos.in
								</span>
							</p>
							<p className="mt-4 text-sm text-white/60">
								Redirecting to dashboard...
							</p>
						</motion.div>
					) : (
						<div className="space-y-6">
							<div className="space-y-4">
								<label className="block text-sm font-medium text-white">
									Choose your subdomain
								</label>
								<div className="relative">
									<div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3">
										<input
											type="text"
											value={subdomain}
											onChange={(e) => handleSubdomainChange(e.target.value)}
											placeholder="pizzeria"
											className="flex-1 bg-transparent text-white placeholder:text-white/30 focus:outline-none"
											maxLength={63}
											disabled={isSubmitting}
										/>
										<span className="text-white/50">.novapos.in</span>
										{subdomainStatus.checking && (
											<Loader className="h-4 w-4 animate-spin text-white/60" />
										)}
										{!subdomainStatus.checking &&
											subdomainStatus.available === true && (
												<Check className="h-4 w-4 text-emerald-400" />
											)}
										{!subdomainStatus.checking &&
											subdomainStatus.available === false && (
												<X className="h-4 w-4 text-red-400" />
											)}
									</div>
									{subdomain && (
										<div className="mt-2 flex items-center gap-2">
											{subdomainStatus.checking ? (
												<p className="text-xs text-white/50">
													Checking availability...
												</p>
											) : subdomainStatus.available === true ? (
												<p className="text-xs text-emerald-400">
													✓ {subdomainStatus.message}
												</p>
											) : subdomainStatus.available === false ? (
												<p className="text-xs text-red-400">
													✗ {subdomainStatus.message}
												</p>
											) : subdomainStatus.message ? (
												<p className="text-xs text-amber-400">
													{subdomainStatus.message}
												</p>
											) : null}
										</div>
									)}
									<p className="mt-2 text-xs text-white/40">
										Your workspace will be accessible at{' '}
										<span className="font-mono text-white/60">
											{subdomain || 'your-subdomain'}.novapos.in
										</span>
									</p>
								</div>
							</div>

							{error && (
								<div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4">
									<p className="text-sm text-red-300">{error}</p>
								</div>
							)}

							<div className="flex gap-4">
								<Button
									variant="ghost"
									size="lg"
									onClick={handleSkip}
									disabled={isSubmitting}
									className="flex-1 border border-white/20"
								>
									Skip for now
								</Button>
								<Button
									size="lg"
									onClick={handleSubmit}
									disabled={
										isSubmitting ||
										subdomainStatus.available !== true ||
										!subdomain ||
										subdomain.length < 3
									}
									className="flex-1"
								>
									{isSubmitting ? (
										<>
											<Loader className="mr-2 h-4 w-4 animate-spin" />
											Setting up...
										</>
									) : (
										<>
											Create subdomain
											<ArrowRight className="ml-2 h-4 w-4" />
										</>
									)}
								</Button>
							</div>

							<div className="rounded-xl border border-blue-400/30 bg-blue-400/10 p-4">
								<p className="text-xs text-blue-200">
									💡 <strong>Tip:</strong> Choose a subdomain that's easy to
									remember and represents your brand. You can set it up later in
									settings if you skip now.
								</p>
							</div>
						</div>
					)}
				</motion.div>
			</div>
		</div>
	)
}
