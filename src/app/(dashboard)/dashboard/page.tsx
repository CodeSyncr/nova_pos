import { redirect } from 'next/navigation'
import { createSupabaseServerComponentClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { MenuAssistant } from '@/components/dashboard/menu-assistant'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
	Activity,
	Brain,
	ChefHat,
	Clock,
	Flame,
	Leaf,
	Sparkles,
	TrendingUp,
	Users
} from 'lucide-react'

type TenantRecord = {
	id: string
	name: string
	branding: Record<string, unknown> | null
	settings: Record<string, unknown> | null
}

const aiHighlights = [
	{
		title: 'Prep cadence',
		body: 'AI suggests staggering pasta batches every 18 minutes during dinner service.',
		icon: Clock
	},
	{
		title: 'Guest mood',
		body: 'Saffron + smoke pairings trending in POS orders, consider a tasting flight.',
		icon: Brain
	},
	{
		title: 'Sustainability',
		body: 'Switch to hydroponic basil supplier for 12% savings and fresher aromatics.',
		icon: Leaf
	}
]

const heroStats = [
	{
		label: 'Live orders',
		value: '64',
		trend: '+18% vs last hour',
		icon: Activity
	},
	{
		label: 'Menu conversion',
		value: '42%',
		trend: '+5% AI boost',
		icon: TrendingUp
	},
	{ label: 'Tables synced', value: '18', trend: 'POS · Web · QR', icon: Users }
]

const upcomingFlows = [
	{
		title: 'Staff ritual · Golden hour',
		description: 'Brief bar + expo team on pasta variants launching tonight.',
		tag: 'Automation'
	},
	{
		title: 'AI sourcing insight',
		description: 'Top dish uses 32% of burrata stock. Trigger smart reorder?',
		tag: 'Procurement'
	},
	{
		title: 'Taste test · Ember oil',
		description:
			'Kitchen wants to record a new SOP clip for the tablet station.',
		tag: 'SOP Studio'
	}
]

export default async function DashboardPage() {
	const supabase = await createSupabaseServerComponentClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		redirect('/login')
	}

	const { data, error } = await supabase
		.from('profile_tenants')
		.select(
			`
        tenant_id,
        tenant:tenant_id (
          id,
          name,
          slug,
          branding,
          settings
        )
      `
		)
		.eq('profile_id', user.id)
		.single()

	const tenantData = Array.isArray(data?.tenant) ? data.tenant[0] : data?.tenant
	const tenant =
		(tenantData as unknown as
			| (TenantRecord & {
					slug?: string | null
					settings?: Record<string, unknown> | null
			  })
			| null) ?? null

	if (error || !tenant) {
		redirect('/tenant')
	}

	// Disabled: Redirect to subdomain setup if tenant doesn't have a subdomain and hasn't skipped it
	// const settings = tenant.settings || {}
	// const subdomainSkipped = settings.subdomain_skipped === true

	// if (tenant && !tenant.slug && !subdomainSkipped) {
	// 	redirect(`/subdomain-setup?tenantId=${tenant.id}`)
	// }

	const greetingName = tenant.name ?? 'Operator'
	const locale = (tenant.settings?.locale as string | undefined) ?? 'en-US'
	const timezone = (tenant.settings?.timezone as string | undefined) ?? 'UTC'

	return (
		<div className="flex flex-col gap-10 py-6">
			<section className="relative overflow-hidden rounded-[40px] border border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 text-white shadow-[0_50px_140px_rgba(3,5,18,0.75)]">
				<div className="pointer-events-none absolute inset-0">
					<div className="glow -top-32 left-1/2 h-96 w-96 -translate-x-1/2 bg-[#7C74FF]/30" />
					<div className="glow bottom-0 right-1/4 h-80 w-80 bg-[#4DD4FF]/20" />
					<div className="glow -bottom-32 left-1/3 h-72 w-72 bg-[#FF7ACB]/20" />
				</div>
				<div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
					<div className="space-y-4">
						<Badge className="border-white/20 bg-white/10 text-white/80">
							Cohort · {timezone} · {locale}
						</Badge>
						<h1 className="text-4xl font-semibold md:text-5xl">
							Welcome back, {greetingName}
						</h1>
						<p className="text-white/70 md:max-w-xl">
							NovaPOS stitched today’s rituals, AI recommendations, and
							multi-channel telemetry into a single canvas.
						</p>
						<div className="flex flex-wrap gap-3">
							<Button size="sm" variant="default">
								<Sparkles className="mr-2 h-4 w-4" />
								Run service briefing
							</Button>
							<Button size="sm" variant="ghost">
								View automation log
							</Button>
						</div>
					</div>
					<div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-2xl md:min-w-[320px]">
						<p className="text-xs uppercase tracking-[0.4em] text-white/50">
							Live vitals
						</p>
						<div className="grid gap-3">
							{heroStats.map((stat) => (
								<div
									key={stat.label}
									className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
								>
									<div>
										<p className="text-xs uppercase tracking-[0.3em] text-white/50">
											{stat.label}
										</p>
										<p className="text-sm text-white/70">{stat.trend}</p>
									</div>
									<div className="text-right">
										<p className="text-2xl font-semibold text-white">
											{stat.value}
										</p>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>

			<MenuAssistant />

			<div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
				<section className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-xs uppercase tracking-[0.4em] text-white/50">
								Operations radar
							</p>
							<h2 className="text-2xl font-semibold text-white">
								Today’s automations
							</h2>
						</div>
						<Button variant="ghost" size="sm">
							View timeline
						</Button>
					</div>
					<div className="mt-6 space-y-4">
						{upcomingFlows.map((flow) => (
							<div
								key={flow.title}
								className="rounded-3xl border border-white/10 bg-[#070A1C]/60 px-5 py-4 shadow-[0_20px_60px_rgba(7,10,28,0.55)]"
							>
								<p className="text-xs uppercase tracking-[0.3em] text-white/40">
									{flow.tag}
								</p>
								<h3 className="text-lg font-semibold text-white">
									{flow.title}
								</h3>
								<p className="text-sm text-white/60">{flow.description}</p>
							</div>
						))}
					</div>
				</section>

				<section className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
					<p className="text-xs uppercase tracking-[0.4em] text-white/50">
						AI highlights
					</p>
					<div className="mt-5 space-y-4">
						{aiHighlights.map((highlight) => (
							<div
								key={highlight.title}
								className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4"
							>
								<div className="flex items-center gap-3 text-white/80">
									<highlight.icon className="h-4 w-4" />
									<span className="text-sm uppercase tracking-[0.3em] text-white/50">
										Insight
									</span>
								</div>
								<h3 className="mt-2 text-lg font-semibold text-white">
									{highlight.title}
								</h3>
								<p className="text-sm text-white/70">{highlight.body}</p>
							</div>
						))}
					</div>
				</section>
			</div>

		</div>
	)
}
