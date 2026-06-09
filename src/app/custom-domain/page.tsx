import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { ArrowRight, Store, ChefHat, Sparkles, LogIn } from 'lucide-react'
import type { LandingPageConfig } from '@/app/actions/subdomain'

export const dynamic = 'force-dynamic'

type MenuItem = {
	id: string
	name: string
	description: string | null
	base_price: number
}

async function getTenantAndMenu() {
	const headersList = await headers()
	const tenantId = headersList.get('x-tenant-id')
	const customDomain = headersList.get('x-custom-domain')

	if (!tenantId) return null

	const supabase = createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
	)

	const { data: tenant } = await supabase
		.from('tenants')
		.select('id, name, logo_url, landing_page')
		.eq('id', tenantId)
		.maybeSingle()

	if (!tenant) return null

	const { data: menuItems } = await supabase
		.from('menu_items')
		.select('id, name, description, base_price')
		.eq('tenant_id', tenantId)
		.eq('is_active', true)
		.limit(6)

	return {
		tenant,
		customDomain,
		menuItems: (menuItems as MenuItem[]) || []
	}
}

export default async function TenantLandingPage() {
	const data = await getTenantAndMenu()
	if (!data) {
		notFound()
	}

	const { tenant, customDomain, menuItems } = data
	const config = (tenant.landing_page as unknown as LandingPageConfig) || {
		template: 'minimal',
		headline: `Welcome to ${tenant.name}`,
		subheadline: 'Experience exceptional taste and quality ordering directly from us.',
		cta_text: 'View our POS Subdomain',
		cta_url: '#',
		bg_color: '#030712',
		accent_color: '#E0342A',
		logo_url: tenant.logo_url,
		show_pos_link: true
	}

	const logoUrl = config.logo_url || tenant.logo_url
	const posUrl = customDomain ? `https://pos.${customDomain}` : '/pos'

	// Render templates based on config.template
	if (config.template === 'restaurant') {
		return (
			<div
				className="min-h-screen text-white font-sans selection:bg-[#E0342A]/30 selection:text-white"
				style={{ backgroundColor: config.bg_color || '#0B0A09' }}
			>
				{/* Header */}
				<header className="border-b border-white/5 backdrop-blur-md sticky top-0 z-50 bg-black/20">
					<div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
						<div className="flex items-center gap-3">
							{logoUrl ? (
								<img
									src={logoUrl}
									alt={tenant.name}
									className="h-10 w-10 rounded-full object-cover border border-white/10"
								/>
							) : (
								<div className="h-10 w-10 rounded-full bg-[#E0342A]/15 flex items-center justify-center text-[#E0342A] font-bold border border-[#E0342A]/30">
									<ChefHat className="h-5 w-5" />
								</div>
							)}
							<span className="font-semibold text-lg tracking-tight">{tenant.name}</span>
						</div>

						{config.show_pos_link && (
							<a
								href={posUrl}
								className="flex items-center gap-2 text-sm text-white/70 hover:text-white border border-white/10 rounded-full px-4 py-2 hover:bg-white/5 transition-all duration-300"
							>
								<LogIn className="h-4 w-4" />
								<span>Staff POS</span>
							</a>
						)}
					</div>
				</header>

				{/* Hero Section */}
				<main className="max-w-6xl mx-auto px-6 py-20 md:py-32">
					<div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] items-center">
						<div className="space-y-8">
							<div className="inline-flex items-center gap-2 border border-[#E0342A]/30 bg-[#E0342A]/10 rounded-full px-4 py-1.5 text-sm text-[#E0342A]">
								<Sparkles className="h-4 w-4" />
								<span>Exquisite Culinary Experience</span>
							</div>

							<h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight">
								{config.headline || `Welcome to ${tenant.name}`}
							</h1>

							<p className="text-white/70 text-lg leading-relaxed max-w-xl">
								{config.subheadline || 'Indulge in flavors crafted to perfection by our master chefs.'}
							</p>

							<div className="flex flex-wrap gap-4 pt-4">
								<a
									href={config.cta_url || '#menu'}
									className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 font-semibold text-black transition-all duration-300 hover:scale-[1.02] shadow-lg"
									style={{
										backgroundColor: config.accent_color || '#E0342A',
										boxShadow: `0 10px 30px -10px ${config.accent_color || '#E0342A'}`
									}}
								>
									{config.cta_text || 'Order Now'}
									<ArrowRight className="h-5 w-5" />
								</a>
							</div>
						</div>

						{/* Hero Image / Decorator */}
						<div className="relative aspect-square md:aspect-[4/3] lg:aspect-square w-full rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-white/5 flex items-center justify-center">
							<div
								className="absolute inset-0 opacity-20 blur-[100px] pointer-events-none"
								style={{
									background: `radial-gradient(circle, ${config.accent_color || '#E0342A'} 0%, transparent 70%)`
								}}
							/>
							<div className="relative p-12 text-center max-w-md space-y-6">
								<ChefHat
									className="h-20 w-20 mx-auto opacity-80"
									style={{ color: config.accent_color || '#E0342A' }}
								/>
								<h3 className="text-2xl font-bold tracking-tight">Kitchen Is Open</h3>
								<p className="text-white/60">
									We are cooking up delicious meals. Visit us or order online for fast pickup and delivery.
								</p>
							</div>
						</div>
					</div>

					{/* Menu Highlights */}
					{menuItems.length > 0 && (
						<section id="menu" className="mt-32 space-y-12">
							<div className="text-center space-y-4">
								<h2 className="text-3xl md:text-4xl font-bold tracking-tight">Menu Highlights</h2>
								<p className="text-white/60 max-w-md mx-auto">
									A curated selection of our guest favorites, freshly prepared every day.
								</p>
							</div>

							<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
								{menuItems.map((item) => (
									<div
										key={item.id}
										className="border border-white/5 bg-white/2 rounded-2xl p-6 hover:border-white/10 transition-all duration-300 flex flex-col justify-between"
									>
										<div>
											<h3 className="text-xl font-semibold tracking-tight">{item.name}</h3>
											<p className="text-white/50 text-sm mt-2 line-clamp-2">
												{item.description || 'No description available.'}
											</p>
										</div>
										<div className="flex justify-between items-center mt-6">
											<span className="font-semibold text-lg">${item.base_price.toFixed(2)}</span>
											<span
												className="text-xs uppercase tracking-wider font-semibold px-3 py-1.5 rounded-full border"
												style={{
													borderColor: `${config.accent_color || '#E0342A'}30`,
													color: config.accent_color || '#E0342A',
													backgroundColor: `${config.accent_color || '#E0342A'}10`
												}}
											>
												Popular
											</span>
										</div>
									</div>
								))}
							</div>
						</section>
					)}
				</main>

				{/* Footer */}
				<footer className="border-t border-white/5 mt-32 py-12 text-white/40 text-center text-sm">
					<div className="max-w-6xl mx-auto px-6 space-y-4">
						<p>© {new Date().getFullYear()} {tenant.name}. All rights reserved.</p>
						<p className="text-xs">Powered by POS</p>
					</div>
				</footer>
			</div>
		)
	}

	if (config.template === 'pizza') {
		return (
			<div
				className="min-h-screen text-white font-sans selection:bg-[#E0342A]/30 selection:text-white"
				style={{ backgroundColor: config.bg_color || '#090505' }}
			>
				{/* Header */}
				<header className="border-b border-red-500/10 backdrop-blur-md sticky top-0 z-50 bg-black/35">
					<div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
						<div className="flex items-center gap-3">
							{logoUrl ? (
								<img
									src={logoUrl}
									alt={tenant.name}
									className="h-10 w-10 rounded-xl object-cover border border-red-500/20"
								/>
							) : (
								<div className="h-10 w-10 rounded-xl bg-red-600/20 flex items-center justify-center text-red-500 font-bold border border-red-500/30">
									🍕
								</div>
							)}
							<span className="font-bold text-xl tracking-tight uppercase" style={{ color: config.accent_color || '#E0342A' }}>
								{tenant.name}
							</span>
						</div>

						{config.show_pos_link && (
							<a
								href={posUrl}
								className="flex items-center gap-2 text-sm text-white/80 hover:text-white border border-red-500/20 rounded-xl px-4 py-2 hover:bg-red-500/5 transition-all duration-300"
							>
								<LogIn className="h-4 w-4" style={{ color: config.accent_color || '#E0342A' }} />
								<span>Staff POS</span>
							</a>
						)}
					</div>
				</header>

				{/* Hero Section */}
				<main className="max-w-6xl mx-auto px-6 py-20 md:py-32">
					<div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
						<div className="space-y-8">
							<div className="inline-flex items-center gap-2 border border-red-500/20 bg-red-500/10 rounded-xl px-4 py-1.5 text-sm font-semibold tracking-wide text-red-400 uppercase">
								🔥 Hot & Fresh Out of the Oven
							</div>

							<h1 className="text-5xl md:text-7xl font-extrabold leading-tight tracking-tight uppercase">
								{config.headline || `Crispy, cheesy, perfect ${tenant.name}`}
							</h1>

							<p className="text-white/80 text-lg leading-relaxed max-w-xl">
								{config.subheadline || 'Hand-tossed dough, organic tomato sauce, and local premium toppings. The ultimate pizza experience.'}
							</p>

							<div className="flex flex-wrap gap-4 pt-4">
								<a
									href={config.cta_url || '#menu'}
									className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 font-bold text-white transition-all duration-300 hover:scale-[1.02] shadow-lg uppercase tracking-wide"
									style={{
										backgroundColor: config.accent_color || '#E0342A',
										boxShadow: `0 10px 30px -10px ${config.accent_color || '#E0342A'}`
									}}
								>
									{config.cta_text || 'Order Delivery'}
									<ArrowRight className="h-5 w-5" />
								</a>
							</div>
						</div>

						{/* Pizza slice hero decoration */}
						<div className="relative aspect-square w-full rounded-2xl overflow-hidden border border-red-500/10 bg-red-950/10 flex items-center justify-center">
							<div
								className="absolute inset-0 opacity-30 blur-[80px] pointer-events-none"
								style={{
									background: `radial-gradient(circle, ${config.accent_color || '#E0342A'} 0%, transparent 70%)`
								}}
							/>
							<div className="relative p-12 text-center max-w-xs space-y-6">
								<span className="text-8xl block animate-bounce duration-1000">🍕</span>
								<h3 className="text-2xl font-black uppercase tracking-tight" style={{ color: config.accent_color || '#E0342A' }}>
									Dough Masters
								</h3>
								<p className="text-white/70 text-sm">
									We ferment our dough for 48 hours for maximum flavor, crunch, and digestibility.
								</p>
							</div>
						</div>
					</div>

					{/* Pizza menu */}
					{menuItems.length > 0 && (
						<section id="menu" className="mt-32 space-y-12">
							<div className="text-center space-y-4">
								<h2 className="text-4xl font-extrabold tracking-tight uppercase">Featured Slices</h2>
								<p className="text-white/70 max-w-md mx-auto">
									Craving perfection? Explore some of our local legend pizzas.
								</p>
							</div>

							<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
								{menuItems.map((item) => (
									<div
										key={item.id}
										className="border border-red-500/10 bg-red-950/5 rounded-2xl p-6 hover:border-red-500/25 transition-all duration-300 flex flex-col justify-between"
									>
										<div>
											<h3 className="text-xl font-bold tracking-tight uppercase flex justify-between items-start gap-4">
												<span>{item.name}</span>
												<span className="text-red-400">🍕</span>
											</h3>
											<p className="text-white/60 text-sm mt-3 line-clamp-3">
												{item.description || 'Tasty toppings layered on our signature crust.'}
											</p>
										</div>
										<div className="flex justify-between items-center mt-8">
											<span className="font-extrabold text-2xl">${item.base_price.toFixed(2)}</span>
											<span
												className="text-xs uppercase tracking-widest font-black px-3.5 py-2 rounded-xl"
												style={{
													color: config.accent_color || '#E0342A',
													backgroundColor: `${config.accent_color || '#E0342A'}15`
												}}
											>
												Fresh
											</span>
										</div>
									</div>
								))}
							</div>
						</section>
					)}
				</main>

				{/* Footer */}
				<footer className="border-t border-red-500/10 mt-32 py-12 text-white/40 text-center text-sm">
					<div className="max-w-6xl mx-auto px-6 space-y-4">
						<p>© {new Date().getFullYear()} {tenant.name}. All rights reserved.</p>
						<p className="text-xs">Powered by POS</p>
					</div>
				</footer>
			</div>
		)
	}

	// Default/Minimal Template
	return (
		<div
			className="min-h-screen text-white font-sans selection:bg-[#E0342A]/30 selection:text-white flex flex-col justify-between"
			style={{ backgroundColor: config.bg_color || '#030712' }}
		>
			{/* Header */}
			<header className="border-b border-white/5 bg-black/10 backdrop-blur-md">
				<div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
					<div className="flex items-center gap-3">
						{logoUrl ? (
							<img
								src={logoUrl}
								alt={tenant.name}
								className="h-9 w-9 rounded-full object-cover border border-white/10"
							/>
						) : (
							<div className="h-9 w-9 rounded-full bg-[#E0342A]/15 flex items-center justify-center text-[#E0342A] font-bold border border-[#E0342A]/30">
								<Store className="h-4 w-4" />
							</div>
						)}
						<span className="font-semibold text-base tracking-tight">{tenant.name}</span>
					</div>

					{config.show_pos_link && (
						<a
							href={posUrl}
							className="flex items-center gap-2 text-sm text-white/60 hover:text-white border border-white/10 rounded-full px-4 py-2 hover:bg-white/5 transition-all duration-200"
						>
							<LogIn className="h-4 w-4" />
							<span>Staff Login</span>
						</a>
					)}
				</div>
			</header>

			{/* Hero */}
			<main className="max-w-4xl mx-auto px-6 py-24 md:py-36 text-center space-y-10 flex-1 flex flex-col justify-center items-center">
				<div className="space-y-6">
					<h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-tight">
						{config.headline || `Welcome to ${tenant.name}`}
					</h1>

					<p className="text-white/60 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
						{config.subheadline || 'Order food online and enjoy seamless pick-up or fast delivery to your door.'}
					</p>
				</div>

				<div>
					<a
						href={config.cta_url || '#'}
						className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 font-semibold text-white transition-all duration-200 hover:opacity-90 shadow-lg hover:shadow-xl"
						style={{
							backgroundColor: config.accent_color || '#E0342A',
							boxShadow: `0 10px 25px -5px ${config.accent_color || '#E0342A'}50`
						}}
					>
						{config.cta_text || 'View Menu'}
						<ArrowRight className="h-5 w-5" />
					</a>
				</div>

				{menuItems.length > 0 && (
					<div className="pt-20 w-full">
						<div className="border-t border-white/5 pt-12 text-left space-y-8">
							<h2 className="text-xl font-semibold tracking-tight text-white/80">Menu Specials</h2>
							<div className="grid gap-4 sm:grid-cols-2">
								{menuItems.slice(0, 4).map((item) => (
									<div
										key={item.id}
										className="border border-white/5 bg-white/2 rounded-xl p-5 flex justify-between items-center"
									>
										<div>
											<h4 className="font-medium text-white">{item.name}</h4>
											{item.description && (
												<p className="text-xs text-white/50 mt-1 line-clamp-1">{item.description}</p>
											)}
										</div>
										<span className="font-semibold text-white/90 ml-4">${item.base_price.toFixed(2)}</span>
									</div>
								))}
							</div>
						</div>
					</div>
				)}
			</main>

			{/* Footer */}
			<footer className="border-t border-white/5 py-12 text-white/40 text-center text-sm">
				<div className="max-w-6xl mx-auto px-6 space-y-3">
					<p>© {new Date().getFullYear()} {tenant.name}. Powered by POS.</p>
				</div>
			</footer>
		</div>
	)
}
