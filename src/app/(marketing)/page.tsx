'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
	ArrowRight,
	ChevronRight,
	HandPlatter,
	Layers,
	ShieldCheck,
	Sparkles,
	Star,
	Workflow
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Logo } from '@/components/brand/logo'

const features = [
	{
		title: 'Unified Operations',
		description:
			'Menu, orders, staff, and inventory stay perfectly in sync with live automations',
		icon: Layers
	},
	{
		title: 'Intelligent Automations',
		description:
			'Trigger prep flows, notify staff, and route orders automatically across channels',
		icon: Workflow
	},
	{
		title: 'Enterprise-grade Security',
		description:
			'Granular permissions, audit trails, and encrypted data powered by Supabase',
		icon: ShieldCheck
	}
]

const flows = [
	{
		title: 'Design your concept',
		copy: 'Pick your restaurant style, brand palette, and service modes',
		stat: '02 min'
	},
	{
		title: 'Sync your team',
		copy: 'Invite managers, define roles, and create rituals with one tap',
		stat: '05 min'
	},
	{
		title: 'Launch live',
		copy: 'Activate payments, menus, and channels simultaneously',
		stat: 'Instant'
	}
]

const pricing = [
	{
		name: 'Starter',
		price: '$59',
		tagline: 'Per location / month',
		benefits: [
			'Unlimited orders',
			'Menu designer',
			'Automations Lite',
			'Email support'
		],
		popular: false
	},
	{
		name: 'Scale',
		price: '$149',
		tagline: 'Per location / month',
		benefits: [
			'Advanced automations',
			'Multi-location suite',
			'Team permissions',
			'Priority support'
		],
		popular: true
	},
	{
		name: 'Enterprise',
		price: 'Custom',
		tagline: 'Volume pricing',
		benefits: [
			'Dedicated CSM',
			'Custom SLAs',
			'Premium onboarding',
			'Security reviews'
		],
		popular: false
	}
]

const fadeUp = {
	initial: { opacity: 0, y: 20 },
	whileInView: { opacity: 1, y: 0 },
	viewport: { once: true, amount: 0.2 }
}

export default function MarketingPage() {
	return (
		<div className="isolate flex min-h-screen flex-col bg-gradient-to-b from-[#040513] via-[#06081C] to-[#03040A] text-white">
			<header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-8">
				<Logo />
				<nav className="flex items-center gap-4 text-sm text-white/70">
					<Link className="hover:text-white" href="#features">
						Features
					</Link>
					<Link className="hover:text-white" href="#how-it-works">
						How it works
					</Link>
					<Link className="hover:text-white" href="#pricing">
						Pricing
					</Link>
					<Button
						asChild
						variant="ghost"
						className="border-white/15 text-white"
					>
						<Link href="/login">Log in</Link>
					</Button>
				</nav>
			</header>

			<main className="flex flex-1 flex-col gap-24 pb-32">
				<section className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-6 pt-12 text-center">
					<Badge className="border-white/20 bg-white/10 text-white/80">
						<Sparkles className="mr-2 h-4 w-4" /> Premium POS for modern
						hospitality
					</Badge>
					<motion.div
						className="space-y-6"
						initial={{ opacity: 0, y: 30 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.9, ease: 'easeOut' }}
					>
						<h1 className="text-balance text-5xl font-semibold leading-tight tracking-tight text-white md:text-6xl">
							Fluid restaurant operations powered by story-led onboarding
						</h1>
						<p className="mx-auto max-w-2xl text-lg text-white/70">
							NovaPOS blends cinematic onboarding, Supabase security, and an
							elegant dashboard to run every dining ritual from reservation to
							revenue.
						</p>
						<div className="flex flex-wrap items-center justify-center gap-4">
							<Button asChild size="lg">
								<Link
									href="/signup"
									className="flex items-center gap-2 text-base"
								>
									Start for free <ArrowRight className="h-5 w-5" />
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								size="lg"
								className="backdrop-blur-sm"
							>
								<Link href="#how-it-works" className="flex items-center gap-2">
									See how it flows <ChevronRight className="h-5 w-5" />
								</Link>
							</Button>
						</div>
					</motion.div>
					<div className="relative mt-8 w-full rounded-[34px] border border-white/10 bg-white/5 p-1 shadow-2xl backdrop-blur-2xl">
						<div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-[#131735] via-[#0B0F26] to-[#070814] p-6">
							<div className="grid gap-6 md:grid-cols-3">
								{features.map(function renderFeature(feature) {
									return (
										<Card
											key={feature.title}
											className="border-white/5 bg-white/5 text-left shadow-none backdrop-blur-xl"
										>
											<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
												<feature.icon className="h-5 w-5" />
											</div>
											<h3 className="text-lg font-semibold text-white">
												{feature.title}
											</h3>
											<p className="mt-2 text-sm text-white/70">
												{feature.description}
											</p>
										</Card>
									)
								})}
							</div>
						</div>
					</div>
					<div className="flex flex-wrap items-center justify-center gap-6 text-white/60">
						<div className="flex items-center gap-2">
							<Star className="h-4 w-4 text-amber-400" />
							<span>4.9/5 customer satisfaction</span>
						</div>
						<div className="flex items-center gap-2">
							<HandPlatter className="h-4 w-4 text-teal-300" />
							<span>Trusted by 1,200+ restaurants</span>
						</div>
					</div>
				</section>

				<section id="features" className="mx-auto w-full max-w-5xl px-6">
					<motion.div {...fadeUp} transition={{ duration: 0.8, delay: 0.1 }}>
						<p className="text-sm uppercase tracking-[0.4em] text-white/50">
							Why NovaPOS
						</p>
						<h2 className="mt-3 text-4xl font-semibold text-white">
							Serve with cinematic flow
						</h2>
						<p className="mt-4 max-w-2xl text-base text-white/70">
							A single canvas for service, automations, and insights. Crafted
							with shadcn components and beautiful gradients for your frontline
							teams.
						</p>
					</motion.div>
					<div className="mt-10 grid gap-6 md:grid-cols-3">
						{features.map(function renderFeatureCard(feature, index) {
							return (
								<motion.div
									key={feature.title}
									className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-2xl"
									initial="initial"
									whileInView="whileInView"
									variants={fadeUp}
									transition={{ delay: index * 0.1, duration: 0.6 }}
								>
									<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white">
										<feature.icon className="h-5 w-5" />
									</div>
									<h3 className="text-lg font-semibold text-white">
										{feature.title}
									</h3>
									<p className="mt-2 text-sm text-white/70">
										{feature.description}
									</p>
								</motion.div>
							)
						})}
					</div>
				</section>

				<section id="how-it-works" className="mx-auto w-full max-w-5xl px-6">
					<div className="grid gap-10 md:grid-cols-[1.1fr_0.9fr]">
						<motion.div
							className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#13162F] to-[#070A1C] p-8 shadow-[0_40px_90px_rgba(3,4,11,0.9)]"
							initial={{ opacity: 0, x: -40 }}
							whileInView={{ opacity: 1, x: 0 }}
							viewport={{ once: true, amount: 0.4 }}
						>
							<p className="text-sm uppercase tracking-[0.4em] text-white/50">
								Story onboarding
							</p>
							<h2 className="mt-3 text-4xl font-semibold text-white">
								Three cinematic steps
							</h2>
							<p className="mt-4 text-white/70">
								Onboarding built with Framer Motion to guide new operators
								through a story that feels like flipping through a magazine.
							</p>
							<div className="mt-8 space-y-6">
								{flows.map(function renderFlow(flow, index) {
									return (
										<div
											key={flow.title}
											className="flex gap-4 rounded-2xl bg-white/5 p-4"
										>
											<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold text-white">
												0{index + 1}
											</div>
											<div>
												<div className="flex items-center gap-3">
													<h3 className="text-lg font-semibold text-white">
														{flow.title}
													</h3>
													<span className="text-xs uppercase tracking-wide text-white/50">
														{flow.stat}
													</span>
												</div>
												<p className="text-sm text-white/65">{flow.copy}</p>
											</div>
										</div>
									)
								})}
							</div>
						</motion.div>

						<motion.div
							className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl"
							initial={{ opacity: 0, x: 40 }}
							whileInView={{ opacity: 1, x: 0 }}
							viewport={{ once: true, amount: 0.4 }}
						>
							<div className="mb-6 flex items-center gap-3 text-white/70">
								<div className="h-2 w-2 rounded-full bg-emerald-400" />
								Live preview
							</div>
							<div className="space-y-4">
								<div className="rounded-2xl border border-white/5 bg-[#090B1C] p-4">
									<p className="text-xs uppercase tracking-[0.4em] text-white/40">
										Realtime view
									</p>
									<p className="mt-2 text-2xl font-semibold">
										Welcome back,{' '}
										<span className="text-[#76E4FF]">Luna Bistro</span>
									</p>
									<p className="mt-2 text-sm text-white/60">
										All stations synced · 4 channels active
									</p>
								</div>
								<div className="grid gap-4 md:grid-cols-2">
									<Card className="border-white/5 bg-white/5 p-4 text-left shadow-none">
										<p className="text-xs uppercase tracking-[0.3em] text-white/50">
											Orders
										</p>
										<p className="mt-2 text-3xl font-semibold">186</p>
										<p className="text-xs text-emerald-400">+18% live</p>
									</Card>
									<Card className="border-white/5 bg-white/5 p-4 text-left shadow-none">
										<p className="text-xs uppercase tracking-[0.3em] text-white/50">
											Guests
										</p>
										<p className="mt-2 text-3xl font-semibold">742</p>
										<p className="text-xs text-emerald-400">+24% live</p>
									</Card>
								</div>
								<div className="rounded-2xl border border-white/5 bg-white/5 p-4">
									<p className="text-xs uppercase tracking-[0.3em] text-white/50">
										Focus
									</p>
									<p className="mt-2 text-lg text-white/80">
										Next onboarding steps unlock tenant creation for your
										concept, keeping the story feeling seamless.
									</p>
								</div>
							</div>
						</motion.div>
					</div>
				</section>

				<section id="pricing" className="mx-auto w-full max-w-6xl px-6">
					<div className="text-center">
						<p className="text-sm uppercase tracking-[0.4em] text-white/50">
							Pricing
						</p>
						<h2 className="mt-3 text-4xl font-semibold text-white">
							Choose your pace
						</h2>
						<p className="mt-4 text-white/70">
							Straightforward plans crafted for every concept scale.
						</p>
					</div>
					<div className="mt-10 grid gap-6 md:grid-cols-3">
						{pricing.map(function renderPlan(plan) {
							return (
								<motion.div
									key={plan.name}
									className={`rounded-3xl border border-white/10 p-6 ${
										plan.popular
											? 'bg-gradient-to-br from-[#1A1D3F] to-[#0B0E25]'
											: 'bg-white/5'
									} backdrop-blur-2xl`}
									initial="initial"
									whileInView="whileInView"
									variants={fadeUp}
									transition={{ duration: 0.6 }}
								>
									<div className="flex items-center justify-between">
										<h3 className="text-xl font-semibold text-white">
											{plan.name}
										</h3>
										{plan.popular ? (
											<span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-white">
												Most loved
											</span>
										) : null}
									</div>
									<p className="mt-6 text-4xl font-semibold text-white">
										{plan.price}
									</p>
									<p className="text-sm text-white/60">{plan.tagline}</p>
									<ul className="mt-6 space-y-3 text-sm text-white/80">
										{plan.benefits.map(function renderBenefit(benefit) {
											return (
												<li key={benefit} className="flex items-center gap-2">
													<div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
													{benefit}
												</li>
											)
										})}
									</ul>
									<Button
										asChild
										variant={plan.popular ? 'default' : 'ghost'}
										className="mt-8 w-full"
									>
										<Link href="/signup">Get started</Link>
									</Button>
								</motion.div>
							)
						})}
					</div>
				</section>
			</main>

			<footer className="border-t border-white/10 bg-black/30 py-10">
				<div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 text-center text-white/70 md:flex-row md:justify-between md:text-left">
					<div>
						<Logo className="justify-center md:justify-start" />
						<p className="mt-2 text-sm text-white/60">
							Beautifully crafted in Next.js 14 · Supabase · Tailwind ·
							shadcn/ui
						</p>
					</div>
					<div className="flex items-center gap-4">
						<Button asChild size="sm" variant="ghost">
							<Link href="/login">Login</Link>
						</Button>
						<Button asChild size="sm">
							<Link href="/signup" className="flex items-center gap-2">
								Create account <ArrowRight className="h-4 w-4" />
							</Link>
						</Button>
					</div>
				</div>
			</footer>
		</div>
	)
}
