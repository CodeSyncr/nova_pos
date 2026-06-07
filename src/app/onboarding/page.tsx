'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ChefHat, Coffee, Cloud, Target, User } from 'lucide-react'
import { saveOnboardingProfile } from '@/app/actions/tenant'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const businessTypes = [
	{ id: 'restaurant', label: 'Restaurant', icon: ChefHat },
	{ id: 'cafe', label: 'Café', icon: Coffee },
	{ id: 'cloud', label: 'Cloud Kitchen', icon: Cloud }
]

const experienceLevels = [
	{ id: 'new', label: 'New to POS' },
	{ id: 'scaling', label: 'Scaling operations' },
	{ id: 'enterprise', label: 'Enterprise multi-location' }
]

const stepVariants = {
	initial: { opacity: 0, y: 30 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -30 }
}

export default function OnboardingPage() {
	const [currentStep, setCurrentStep] = useState(0)
	const [businessType, setBusinessType] = useState(businessTypes[0]!.id)
	const [ownerName, setOwnerName] = useState('')
	const [ownerRole, setOwnerRole] = useState('Founder')
	const [experienceLevel, setExperienceLevel] = useState(
		experienceLevels[0]!.id
	)
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)
	const router = useRouter()
	const supabase = useMemo(createSupabaseBrowserClient, [])
	const [isCheckingTenant, setIsCheckingTenant] = useState(true)
	useEffect(() => {
		let active = true

		async function checkTenant() {
			const {
				data: { user }
			} = await supabase.auth.getUser()

			if (!user) {
				setIsCheckingTenant(false)
				return
			}

			const { data } = await supabase
				.from('profile_tenants')
				.select('tenant_id')
				.eq('profile_id', user.id)
				.maybeSingle()

			if (!active) {
				return
			}

			if (data?.tenant_id) {
				router.replace('/tenant')
			} else {
				setIsCheckingTenant(false)
			}
		}

		void checkTenant()

		return () => {
			active = false
		}
	}, [router, supabase])

	const progress = useMemo(() => ((currentStep + 1) / 3) * 100, [currentStep])

	const handleNext = () => {
		setCurrentStep((prev) => Math.min(prev + 1, 2))
	}

	const handleBack = () => {
		setCurrentStep((prev) => Math.max(prev - 1, 0))
	}

	const handleComplete = () => {
		setError(null)
		startTransition(async () => {
			try {
				await saveOnboardingProfile({
					businessType,
					ownerName,
					ownerRole,
					experienceLevel
				})
				router.push('/tenant')
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unexpected error')
			}
		})
	}

	if (isCheckingTenant) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#040516] via-[#050A1F] to-[#020308] text-white">
				<div className="rounded-3xl border border-white/10 bg-white/5 px-12 py-16 text-center backdrop-blur-2xl">
					<p className="text-sm uppercase tracking-[0.4em] text-white/40">
						Preparing
					</p>
					<p className="mt-4 text-white/70">Loading your workspace…</p>
				</div>
			</div>
		)
	}

	return (
		<div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#040516] via-[#050A1F] to-[#020308] text-white">
			<div className="pointer-events-none absolute inset-0">
				<div className="glow -top-32 right-1/3 h-96 w-96 bg-[#7A74FF]/30" />
				<div className="glow bottom-0 left-12 h-80 w-80 bg-[#4DD4FF]/25" />
				<div className="glow -bottom-12 right-10 h-80 w-80 bg-[#FF7ACB]/30" />
			</div>

			<div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-12">
				<header className="space-y-4 text-center">
					<Badge className="border-white/20 bg-white/10 text-white/80">
						<Sparkles className="mr-2 h-4 w-4" /> Story Onboarding
					</Badge>
					<h1 className="text-4xl font-semibold leading-tight md:text-5xl">
						Let’s shape your NovaPOS universe
					</h1>
					<p className="text-white/70">
						Three cinematic steps so we can personalize automation rituals,
						teams, and dashboards for your hospitality concept.
					</p>
				</header>

				<div className="relative rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur-2xl shadow-[0_30px_80px_rgba(4,5,16,0.65)]">
					<div className="mb-8">
						<div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/50">
							<span>Progress</span>
							<span>{currentStep + 1} / 3</span>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
							<div
								className="h-full rounded-full bg-gradient-to-r from-[#6B6DFF] to-[#4DD4FF] transition-all"
								style={{ width: `${progress}%` }}
							/>
						</div>
					</div>

					<AnimatePresence mode="wait">
						{currentStep === 0 ? (
							<motion.div
								key="step-1"
								variants={stepVariants}
								initial="initial"
								animate="animate"
								exit="exit"
								transition={{ duration: 0.5, ease: 'easeOut' }}
								className="space-y-6 text-center"
							>
								<p className="text-sm uppercase tracking-[0.4em] text-white/50">
									Chapter 01
								</p>
								<h2 className="text-3xl font-semibold text-white">
									Welcome to NovaPOS
								</h2>
								<p className="text-white/70">
									We’ll align on your concept, operations focus, and ownership
									details. Each screen takes less than a minute.
								</p>
								<Button size="lg" onClick={handleNext} className="mt-6">
									Begin Setup
								</Button>
							</motion.div>
						) : null}

						{currentStep === 1 ? (
							<motion.div
								key="step-2"
								variants={stepVariants}
								initial="initial"
								animate="animate"
								exit="exit"
								transition={{ duration: 0.5, ease: 'easeOut' }}
							>
								<p className="text-sm uppercase tracking-[0.4em] text-white/50 text-center">
									Chapter 02
								</p>
								<h2 className="mt-3 text-center text-3xl font-semibold text-white">
									What type of concept are we powering?
								</h2>
								<div className="mt-8 grid gap-4 md:grid-cols-3">
									{businessTypes.map((type) => (
										<button
											key={type.id}
											type="button"
											onClick={() => setBusinessType(type.id)}
											className={`rounded-2xl border p-5 text-left transition ${
												businessType === type.id
													? 'border-white/50 bg-white/10 shadow-[0_20px_60px_rgba(15,20,40,0.45)]'
													: 'border-white/10 bg-white/5 hover:border-white/30'
											}`}
										>
											<type.icon className="mb-3 h-6 w-6 text-white/80" />
											<p className="text-lg font-semibold text-white">
												{type.label}
											</p>
											<p className="text-sm text-white/60">
												Personalized automations, reporting, and rituals for
												this concept.
											</p>
										</button>
									))}
								</div>
							</motion.div>
						) : null}

						{currentStep === 2 ? (
							<motion.div
								key="step-3"
								variants={stepVariants}
								initial="initial"
								animate="animate"
								exit="exit"
								transition={{ duration: 0.5, ease: 'easeOut' }}
								className="space-y-6"
							>
								<p className="text-sm uppercase tracking-[0.4em] text-white/50 text-center">
									Chapter 03
								</p>
								<h2 className="text-center text-3xl font-semibold text-white">
									Who’s leading this experience?
								</h2>
								<div className="grid gap-6 md:grid-cols-2">
									<div className="space-y-2">
										<label className="text-sm text-white/70">Owner name</label>
										<div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3">
											<User className="h-4 w-4 text-white/60" />
											<input
												type="text"
												value={ownerName}
												onChange={(event) => setOwnerName(event.target.value)}
												placeholder="Luna Arora"
												className="w-full bg-transparent text-white placeholder:text-white/30 focus:outline-none"
											/>
										</div>
									</div>
									<div className="space-y-2">
										<label className="text-sm text-white/70">Role</label>
										<input
											type="text"
											value={ownerRole}
											onChange={(event) => setOwnerRole(event.target.value)}
											placeholder="Founder & Operator"
											className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
										/>
									</div>
								</div>
								<div className="space-y-3">
									<label className="text-sm text-white/70">
										Experience focus
									</label>
									<div className="grid gap-3 md:grid-cols-3">
										{experienceLevels.map((level) => (
											<button
												key={level.id}
												type="button"
												onClick={() => setExperienceLevel(level.id)}
												className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
													experienceLevel === level.id
														? 'border-white/60 bg-white/10'
														: 'border-white/10 bg-white/5 hover:border-white/30'
												}`}
											>
												{level.label}
											</button>
										))}
									</div>
								</div>
								{error ? (
									<p className="text-sm text-rose-300">{error}</p>
								) : null}
								<p className="text-xs text-white/50">
									This helps calibrate your automations—no marketing spam, ever.
								</p>
							</motion.div>
						) : null}
					</AnimatePresence>

					<div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-white/60 md:flex-row md:items-center md:justify-between">
						<div className="flex items-center gap-2">
							<Target className="h-4 w-4 text-teal-300" />
							<span>
								{currentStep < 2
									? 'Next: personalize automations'
									: 'Ready to launch tenant creation'}
							</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<Button
								variant="ghost"
								onClick={handleBack}
								disabled={currentStep === 0 || isPending}
							>
								Back
							</Button>
							{currentStep < 2 ? (
								<Button
									onClick={handleNext}
									disabled={currentStep === 2 || isPending}
								>
									Continue
								</Button>
							) : (
								<Button
									onClick={handleComplete}
									disabled={isPending || !ownerName.trim()}
								>
									{isPending ? 'Saving...' : 'Continue to tenant setup'}
								</Button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
