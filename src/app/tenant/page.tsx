'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
	createTenantWorkspace,
	type TenantCreationPayload
} from '@/app/actions/tenant'
import {
	CheckCircle2,
	Globe,
	MapPin,
	Paintbrush,
	Phone,
	Loader2,
	ArrowRight
} from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const timezones = [
	'UTC',
	'America/New_York',
	'America/Los_Angeles',
	'Europe/London',
	'Europe/Paris',
	'Asia/Kolkata',
	'Asia/Singapore',
	'Australia/Sydney'
]

const currencies = [
	{ code: 'USD', symbol: '$', locale: 'en-US' },
	{ code: 'EUR', symbol: '€', locale: 'de-DE' },
	{ code: 'INR', symbol: '₹', locale: 'en-IN' },
	{ code: 'GBP', symbol: '£', locale: 'en-GB' },
	{ code: 'AED', symbol: 'د.إ', locale: 'ar-AE' }
]

const initialFormState: TenantCreationPayload = {
	name: '',
	logoUrl: '',
	address: {
		street: '',
		city: '',
		state: '',
		pincode: '',
		country: ''
	},
	contactEmail: '',
	contactPhone: '',
	social: {
		website: '',
		instagram: '',
		facebook: ''
	},
	settings: {
		timezone: 'UTC',
		currency: 'USD',
		currencySymbol: '$',
		locale: 'en-US',
		taxRate: 5
	},
	branding: {
		fontFamily: 'Inter',
		primaryColor: '#6B6DFF',
		secondaryColor: '#4DD4FF'
	}
}

export default function TenantPage() {
	const [formState, setFormState] = useState(initialFormState)
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)
	const [successTenant, setSuccessTenant] = useState<{
		name: string
		tenantId: string
	} | null>(null)
	const router = useRouter()
	const supabase = useMemo(createSupabaseBrowserClient, [])
	const [isCheckingTenant, setIsCheckingTenant] = useState(true)

	useEffect(() => {
		let active = true

		async function ensureNewTenantFlow() {
			const {
				data: { user }
			} = await supabase.auth.getUser()

			if (!user) {
				router.replace('/login')
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

			if (!data?.tenant_id) {
				setIsCheckingTenant(false)
				return
			}

			const { data: tenant } = await supabase
				.from('tenants')
				.select('onboarding_complete')
				.eq('id', data.tenant_id)
				.maybeSingle()

			if (!tenant) {
				setIsCheckingTenant(false)
				return
			}

			if (tenant.onboarding_complete) {
				router.replace('/dashboard')
			} else {
				setIsCheckingTenant(false)
			}
		}

		void ensureNewTenantFlow()

		return () => {
			active = false
		}
	}, [router, supabase])

	const currentCurrency = useMemo(
		() =>
			currencies.find((c) => c.code === formState.settings.currency) ??
			currencies[0]!,
		[formState.settings.currency]
	)

	const handleInputChange = (
		field: keyof TenantCreationPayload,
		value: unknown
	) => {
		setFormState((prev) => ({
			...prev,
			[field]: value
		}))
	}

	const handleAddressChange = (
		field: keyof TenantCreationPayload['address'],
		value: string
	) => {
		setFormState((prev) => ({
			...prev,
			address: {
				...prev.address,
				[field]: value
			}
		}))
	}

	const handleBrandingChange = (
		field: keyof TenantCreationPayload['branding'],
		value: string
	) => {
		setFormState((prev) => ({
			...prev,
			branding: {
				...prev.branding,
				[field]: value
			}
		}))
	}

	const handleSettingsChange = (
		field: keyof TenantCreationPayload['settings'],
		value: string | number
	) => {
		setFormState((prev) => ({
			...prev,
			settings: {
				...prev.settings,
				[field]: value
			}
		}))
	}

	const handleSocialChange = (
		field: keyof TenantCreationPayload['social'],
		value: string
	) => {
		setFormState((prev) => ({
			...prev,
			social: {
				...prev.social,
				[field]: value
			}
		}))
	}

	const handleSubmit = () => {
		setError(null)
		startTransition(async () => {
			try {
				const result = await createTenantWorkspace(formState)
				setSuccessTenant({ name: result.tenantName, tenantId: result.tenantId })
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unable to create tenant')
			}
		})
	}

	const handleGoToSubdomainSetup = () => {
		if (successTenant) {
			router.push(`/subdomain-setup?tenantId=${successTenant.tenantId}`)
		}
	}

	const handleSkipSubdomain = () => {
		router.push('/dashboard')
	}

	if (isCheckingTenant) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#03030A] via-[#050818] to-[#02030A] text-white">
				<div className="rounded-3xl border border-white/10 bg-white/5 px-12 py-16 text-center backdrop-blur-2xl">
					<p className="text-sm uppercase tracking-[0.4em] text-white/40">
						Checking workspace
					</p>
					<p className="mt-4 text-white/70">Loading tenant status…</p>
				</div>
			</div>
		)
	}

	return (
		<div className="relative min-h-screen bg-gradient-to-b from-[#03030A] via-[#050818] to-[#02030A] text-white">
			<div className="pointer-events-none absolute inset-0">
				<div className="glow -top-32 left-1/2 h-96 w-96 -translate-x-1/2 bg-[#6B6DFF]/30" />
				<div className="glow bottom-0 right-10 h-80 w-80 bg-[#4DD4FF]/25" />
			</div>

			<div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
				<header className="space-y-4 text-center">
					<Badge className="border-white/20 bg-white/10 text-white/80">
						<Globe className="mr-2 h-4 w-4" /> Tenant Creation
					</Badge>
					<h1 className="text-4xl font-semibold md:text-5xl">
						Craft your restaurant universe
					</h1>
					<p className="text-white/70">
						We’ll use this data to configure payments, locales, branding, and
						automation defaults.
					</p>
				</header>

				{successTenant ? (
					<motion.div
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						className="rounded-[32px] border border-emerald-400/30 bg-emerald-400/10 p-10 text-center backdrop-blur-2xl"
					>
						<CheckCircle2 className="mx-auto h-14 w-14 text-emerald-300" />
						<h2 className="mt-4 text-3xl font-semibold text-white">
							{successTenant.name} is live!
						</h2>
						<p className="mt-2 text-white/70">
							Your workspace is ready! Set up your custom subdomain to get a
							unique URL for your restaurant.
						</p>
						<div className="mt-8 flex gap-4 justify-center">
							<Button
								size="lg"
								variant="ghost"
								onClick={handleSkipSubdomain}
								className="border border-white/20"
							>
								Skip for now
							</Button>
							<Button size="lg" onClick={handleGoToSubdomainSetup}>
								Set up subdomain
								<ArrowRight className="ml-2 h-4 w-4" />
							</Button>
						</div>
					</motion.div>
				) : (
					<div className="grid gap-8 rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur-2xl shadow-[0_30px_90px_rgba(3,4,10,0.9)] lg:grid-cols-[1.35fr_0.65fr]">
						<section className="space-y-6">
							<div>
								<h2 className="text-2xl font-semibold text-white">
									Restaurant profile
								</h2>
								<p className="text-sm text-white/60">
									This powers the UI copy, emails, and invoices.
								</p>
							</div>
							<div className="space-y-4">
								<label className="text-sm text-white/70">Concept name</label>
								<input
									type="text"
									value={formState.name}
									onChange={(e) => handleInputChange('name', e.target.value)}
									placeholder="Test Cloud Kitchen"
									className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
								/>
							</div>
							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<label className="text-sm text-white/70">Logo URL</label>
									<input
										type="url"
										value={formState.logoUrl}
										onChange={(e) =>
											handleInputChange('logoUrl', e.target.value)
										}
										placeholder="https://..."
										className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
								</div>
								<div className="space-y-2">
									<label className="text-sm text-white/70">
										Customer email
									</label>
									<input
										type="email"
										value={formState.contactEmail}
										onChange={(e) =>
											handleInputChange('contactEmail', e.target.value)
										}
										placeholder="hello@restaurant.com"
										className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
								</div>
								<div className="space-y-2">
									<label className="text-sm text-white/70">Phone</label>
									<div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3">
										<Phone className="h-4 w-4 text-white/60" />
										<input
											type="tel"
											value={formState.contactPhone}
											onChange={(e) =>
												handleInputChange('contactPhone', e.target.value)
											}
											placeholder="+1 555 0100"
											className="w-full bg-transparent text-white placeholder:text-white/30 focus:outline-none"
										/>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-sm text-white/70">Website</label>
									<input
										type="url"
										value={formState.social.website}
										onChange={(e) =>
											handleSocialChange('website', e.target.value)
										}
										placeholder="https://"
										className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
								</div>
							</div>
							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<label className="text-sm text-white/70">Instagram</label>
									<input
										type="text"
										value={formState.social.instagram}
										onChange={(e) =>
											handleSocialChange('instagram', e.target.value)
										}
										placeholder="@novapos"
										className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
								</div>
								<div className="space-y-2">
									<label className="text-sm text-white/70">Facebook</label>
									<input
										type="text"
										value={formState.social.facebook}
										onChange={(e) =>
											handleSocialChange('facebook', e.target.value)
										}
										placeholder="facebook.com/novapos"
										className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
								</div>
							</div>

							<div className="space-y-4">
								<h3 className="flex items-center gap-2 text-lg font-semibold text-white">
									<MapPin className="h-4 w-4 text-white/60" /> Location
								</h3>
								<div className="grid gap-4 md:grid-cols-2">
									<input
										type="text"
										value={formState.address.street}
										onChange={(e) =>
											handleAddressChange('street', e.target.value)
										}
										placeholder="Street"
										className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
									<input
										type="text"
										value={formState.address.city}
										onChange={(e) =>
											handleAddressChange('city', e.target.value)
										}
										placeholder="City"
										className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
									<input
										type="text"
										value={formState.address.state}
										onChange={(e) =>
											handleAddressChange('state', e.target.value)
										}
										placeholder="State"
										className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
									<input
										type="text"
										value={formState.address.pincode}
										onChange={(e) =>
											handleAddressChange('pincode', e.target.value)
										}
										placeholder="Postal code"
										className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
									<input
										type="text"
										value={formState.address.country}
										onChange={(e) =>
											handleAddressChange('country', e.target.value)
										}
										placeholder="Country"
										className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
								</div>
							</div>
						</section>

						<section className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6">
							<div className="space-y-1">
								<h3 className="flex items-center gap-2 text-xl font-semibold text-white">
									<Paintbrush className="h-4 w-4 text-white/60" />
									Branding & locale
								</h3>
								<p className="text-sm text-white/60">
									These values theme the dashboard and receipts.
								</p>
							</div>

							<div className="space-y-4">
								<label className="text-sm text-white/70">Font family</label>
								<input
									type="text"
									value={formState.branding.fontFamily}
									onChange={(e) =>
										handleBrandingChange('fontFamily', e.target.value)
									}
									placeholder="Inter"
									className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
								/>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<label className="text-sm text-white/70">Primary color</label>
									<input
										type="color"
										value={formState.branding.primaryColor}
										onChange={(e) =>
											handleBrandingChange('primaryColor', e.target.value)
										}
										className="h-12 w-full rounded-2xl border border-white/15 bg-white/5 px-2"
									/>
								</div>
								<div className="space-y-2">
									<label className="text-sm text-white/70">
										Secondary color
									</label>
									<input
										type="color"
										value={formState.branding.secondaryColor}
										onChange={(e) =>
											handleBrandingChange('secondaryColor', e.target.value)
										}
										className="h-12 w-full rounded-2xl border border-white/15 bg-white/5 px-2"
									/>
								</div>
							</div>

							<div className="space-y-4">
								<label className="text-sm text-white/70">Timezone</label>
								<select
									value={formState.settings.timezone}
									onChange={(e) =>
										handleSettingsChange('timezone', e.target.value)
									}
									className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white focus:outline-none"
								>
									{timezones.map((zone) => (
										<option key={zone} value={zone} className="bg-[#05060E]">
											{zone}
										</option>
									))}
								</select>
							</div>

							<div className="space-y-4">
								<label className="text-sm text-white/70">Currency</label>
								<select
									value={formState.settings.currency}
									onChange={(e) => {
										const selection = currencies.find(
											(c) => c.code === e.target.value
										)!
										handleSettingsChange('currency', selection.code)
										handleSettingsChange('currencySymbol', selection.symbol)
										handleSettingsChange('locale', selection.locale)
									}}
									className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white focus:outline-none"
								>
									{currencies.map((currency) => (
										<option
											key={currency.code}
											value={currency.code}
											className="bg-[#05060E]"
										>
											{currency.code} · {currency.locale}
										</option>
									))}
								</select>
							</div>
							<div className="space-y-2">
								<label className="text-sm text-white/70">Locale</label>
								<input
									type="text"
									value={formState.settings.locale}
									onChange={(e) =>
										handleSettingsChange('locale', e.target.value)
									}
									className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white focus:outline-none"
								/>
							</div>
							<div className="space-y-2">
								<label className="text-sm text-white/70">Tax rate (%)</label>
								<input
									type="number"
									min={0}
									max={100}
									step={0.5}
									value={formState.settings.taxRate}
									onChange={(e) =>
										handleSettingsChange('taxRate', Number(e.target.value))
									}
									className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white focus:outline-none"
								/>
							</div>
						</section>
					</div>
				)}

				{!successTenant && (
					<footer className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-white/70 md:flex-row">
						<div>
							<p className="text-xs uppercase tracking-[0.3em]">Summary</p>
							<p className="text-sm">
								{formState.name || 'Your workspace'} • {currentCurrency.code} •{' '}
								{formState.settings.timezone}
							</p>
						</div>
						<div className="flex items-center gap-3">
							<Button
								variant="ghost"
								onClick={() => setFormState(initialFormState)}
								disabled={isPending}
							>
								Reset
							</Button>
							<Button
								onClick={handleSubmit}
								disabled={isPending || !formState.name}
							>
								{isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
									</>
								) : (
									'Create tenant'
								)}
							</Button>
						</div>
					</footer>
				)}

				{error ? (
					<p className="text-center text-sm text-rose-300">{error}</p>
				) : null}
			</div>
		</div>
	)
}
