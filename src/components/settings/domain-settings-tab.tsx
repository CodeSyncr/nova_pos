'use client'

import { useState, useTransition } from 'react'
import {
	Globe,
	Check,
	AlertCircle,
	Trash2,
	ExternalLink,
	Save,
	Loader2,
	Eye,
	Layout,
	RefreshCw,
	HelpCircle,
	ArrowRight
} from 'lucide-react'
import { Button } from '@/components/ui/button' // or custom button below
import {
	setCustomDomain,
	saveLandingPage,
	verifyCustomDomain,
	type LandingPageConfig,
	type LandingPageTemplate
} from '@/app/actions/subdomain'

type TenantData = {
	id: string
	name: string
	slug: string | null
	custom_domain: string | null
	landing_page: Record<string, unknown> | null
	logo_url: string | null
}

interface DomainSettingsTabProps {
	tenant: TenantData
	onRefresh: () => void
}

export function DomainSettingsTab({ tenant, onRefresh }: DomainSettingsTabProps) {
	// Subdomain state
	const [customDomainInput, setCustomDomainInput] = useState(tenant.custom_domain || '')
	const [isPendingDomain, startDomainTransition] = useTransition()
	const [domainError, setDomainError] = useState<string | null>(null)
	const [domainSuccess, setDomainSuccess] = useState<string | null>(null)

	// Verification state
	const [verificationResult, setVerificationResult] = useState<{
		verified: boolean
		cname: string | null
		message: string
	} | null>(null)
	const [isVerifying, setIsVerifying] = useState(false)

	// Landing Page state
	const defaultLandingConfig: LandingPageConfig = {
		template: 'minimal',
		headline: `Welcome to ${tenant.name}`,
		subheadline: 'Experience exceptional taste and quality ordering directly from us.',
		cta_text: 'View Menu',
		cta_url: '#',
		bg_color: '#030712',
		accent_color: '#3b82f6',
		logo_url: tenant.logo_url,
		show_pos_link: true
	}

	const initialConfig = {
		...defaultLandingConfig,
		...(tenant.landing_page as unknown as LandingPageConfig)
	}

	const [landingConfig, setLandingConfig] = useState<LandingPageConfig>(initialConfig)
	const [isPendingLanding, startLandingTransition] = useTransition()
	const [landingError, setLandingError] = useState<string | null>(null)
	const [landingSuccess, setLandingSuccess] = useState<string | null>(null)

	// Live preview preview state
	const [previewTab, setPreviewTab] = useState<'desktop' | 'mobile'>('desktop')

	const handleSaveDomain = () => {
		setDomainError(null)
		setDomainSuccess(null)
		setVerificationResult(null)

		startDomainTransition(async () => {
			try {
				const domain = customDomainInput.trim() === '' ? null : customDomainInput.trim()
				const result = await setCustomDomain(tenant.id, domain)
				setDomainSuccess(result.message)
				onRefresh()
			} catch (err) {
				setDomainError(err instanceof Error ? err.message : 'Failed to update custom domain')
			}
		})
	}

	const handleVerifyDomain = async () => {
		if (!tenant.custom_domain) return
		setIsVerifying(true)
		setDomainError(null)
		setDomainSuccess(null)
		try {
			const result = await verifyCustomDomain(tenant.custom_domain)
			setVerificationResult(result)
			if (result.verified) {
				setDomainSuccess('Congratulations! Your CNAME record is verified and active.')
			}
		} catch (err) {
			setDomainError('Verification check failed. Please check your DNS setup and try again.')
		} finally {
			setIsVerifying(false)
		}
	}

	const handleDeleteDomain = () => {
		setDomainError(null)
		setDomainSuccess(null)
		setVerificationResult(null)

		startDomainTransition(async () => {
			try {
				const result = await setCustomDomain(tenant.id, null)
				setCustomDomainInput('')
				setDomainSuccess(result.message)
				onRefresh()
			} catch (err) {
				setDomainError(err instanceof Error ? err.message : 'Failed to remove custom domain')
			}
		})
	}

	const handleSaveLandingPage = () => {
		setLandingError(null)
		setLandingSuccess(null)

		startLandingTransition(async () => {
			try {
				const result = await saveLandingPage(tenant.id, landingConfig)
				setLandingSuccess(result.message)
				onRefresh()
			} catch (err) {
				setLandingError(err instanceof Error ? err.message : 'Failed to save landing page')
			}
		})
	}

	const updateLandingField = (field: keyof LandingPageConfig, value: unknown) => {
		setLandingConfig((prev) => ({
			...prev,
			[field]: value
		}))
	}

	const platformSubdomain = tenant.slug ? `${tenant.slug}.novapos.in` : null

	return (
		<div className="space-y-12">
			{/* Part 1: Domain Management */}
			<section className="space-y-6">
				<div>
					<h3 className="text-xl font-semibold text-white flex items-center gap-2">
						<Globe className="h-5 w-5 text-indigo-400" />
						Domain Configuration
					</h3>
					<p className="text-sm text-white/60 mt-1">
						Manage where your customers access your landing page and where staff access the POS register.
					</p>
				</div>

				<div className="grid gap-6 md:grid-cols-2">
					{/* Subdomain Card */}
					<div className="rounded-2xl border border-white/5 bg-white/2 p-6 flex flex-col justify-between">
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<span className="text-xs uppercase tracking-wider text-white/40 font-semibold">
									Platform Subdomain
								</span>
								<span className="rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs px-2.5 py-0.5 font-medium">
									Active
								</span>
							</div>
							{platformSubdomain ? (
								<div>
									<h4 className="text-2xl font-bold tracking-tight text-white">
										{platformSubdomain}
									</h4>
									<p className="text-sm text-white/50 mt-1">
										Access POS at <code className="bg-white/5 px-1.5 py-0.5 rounded text-indigo-300">{platformSubdomain}/pos</code>
									</p>
								</div>
							) : (
								<div>
									<p className="text-white/60 text-sm">No platform subdomain set up yet.</p>
								</div>
							)}
						</div>
						<div className="mt-6 flex gap-3">
							{platformSubdomain && (
								<a
									href={`https://${platformSubdomain}`}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white border border-white/10 rounded-xl px-4 py-2.5 hover:bg-white/5 transition-all duration-200"
								>
									<span>Visit Site</span>
									<ExternalLink className="h-4 w-4" />
								</a>
							)}
						</div>
					</div>

					{/* Custom Domain Card */}
					<div className="rounded-2xl border border-white/5 bg-white/2 p-6 space-y-4">
						<div className="flex items-center justify-between">
							<span className="text-xs uppercase tracking-wider text-white/40 font-semibold">
								Custom Domain
							</span>
							{tenant.custom_domain ? (
								<span
									className={`rounded-full border text-xs px-2.5 py-0.5 font-medium ${
										verificationResult?.verified
											? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
											: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
									}`}
								>
									{verificationResult?.verified ? 'Verified' : 'Pending DNS'}
								</span>
							) : (
								<span className="rounded-full bg-white/5 text-white/40 border border-white/10 text-xs px-2.5 py-0.5 font-medium">
									Not Configured
								</span>
							)}
						</div>

						{tenant.custom_domain ? (
							<div className="space-y-4">
								<div className="flex justify-between items-center bg-white/5 rounded-xl p-3.5 border border-white/5">
									<code className="text-white text-lg font-medium">{tenant.custom_domain}</code>
									<button
										onClick={handleDeleteDomain}
										disabled={isPendingDomain}
										className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors"
										title="Remove custom domain"
									>
										{isPendingDomain ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Trash2 className="h-4 w-4" />
										)}
									</button>
								</div>
								<div className="flex gap-2">
									<button
										onClick={handleVerifyDomain}
										disabled={isVerifying}
										className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2 px-4 text-sm font-semibold border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-50 transition-colors"
									>
										{isVerifying ? (
											<>
												<Loader2 className="h-4 w-4 animate-spin" />
												<span>Checking...</span>
											</>
										) : (
											<>
												<RefreshCw className="h-4 w-4" />
												<span>Verify Setup</span>
											</>
										)}
									</button>
								</div>
							</div>
						) : (
							<div className="space-y-4">
								<div className="flex gap-2">
									<input
										type="text"
										value={customDomainInput}
										onChange={(e) => setCustomDomainInput(e.target.value)}
										placeholder="e.g. pizzeriada.cafe"
										className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none"
									/>
									<button
										onClick={handleSaveDomain}
										disabled={isPendingDomain || !customDomainInput}
										className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 py-2.5 px-5 font-semibold text-white text-sm disabled:opacity-50 transition-all duration-200"
									>
										{isPendingDomain ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											'Save'
										)}
									</button>
								</div>
								<p className="text-xs text-white/40">
									Enter your registered domain (e.g. <code>pizzeriada.cafe</code>). We will provide DNS records next.
								</p>
							</div>
						)}
					</div>
				</div>

				{/* DNS Instructions (Shown if domain set up) */}
				{tenant.custom_domain && (
					<div className="rounded-2xl border border-white/10 bg-indigo-950/15 p-6 space-y-4">
						<h4 className="text-base font-semibold text-white flex items-center gap-2">
							<HelpCircle className="h-4 w-4 text-indigo-400" />
							Required DNS Setup Instructions
						</h4>
						<p className="text-sm text-white/70">
							To map <strong className="text-white">{tenant.custom_domain}</strong> to your POS, log in to your DNS provider (e.g. GoDaddy, Namecheap, Cloudflare) and create these two records:
						</p>

						<div className="overflow-x-auto">
							<table className="w-full text-left text-sm border-collapse">
								<thead>
									<tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
										<th className="py-2.5 px-3">Type</th>
										<th className="py-2.5 px-3">Host / Name</th>
										<th className="py-2.5 px-3">Target Value</th>
										<th className="py-2.5 px-3">TTL</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-white/5 font-mono text-white/90">
									<tr>
										<td className="py-3 px-3 text-indigo-400 font-semibold">CNAME</td>
										<td className="py-3 px-3">@ (or root)</td>
										<td className="py-3 px-3">novapos.in</td>
										<td className="py-3 px-3">Automatic / 1 Hour</td>
									</tr>
									<tr>
										<td className="py-3 px-3 text-indigo-400 font-semibold">CNAME</td>
										<td className="py-3 px-3">pos</td>
										<td className="py-3 px-3">novapos.in</td>
										<td className="py-3 px-3">Automatic / 1 Hour</td>
									</tr>
								</tbody>
							</table>
						</div>

						<div className="rounded-xl bg-black/35 p-3.5 border border-white/5 text-xs text-white/50 space-y-2">
							<div className="flex items-start gap-2">
								<span className="text-emerald-400">✓</span>
								<span>
									<strong>SSL Encryption:</strong> SSL certificate is provisioned automatically once traffic points to our server.
								</span>
							</div>
							<div className="flex items-start gap-2">
								<span className="text-indigo-400">💡</span>
								<span>
									<strong>POS Subdomain:</strong> Staff will access the POS terminal directly at{' '}
									<code className="text-white bg-white/5 px-1 rounded">pos.{tenant.custom_domain}</code>.
								</span>
							</div>
						</div>
					</div>
				)}

				{/* Domain Feedback Alerts */}
				{domainError && (
					<div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 flex gap-3 text-rose-300 text-sm">
						<AlertCircle className="h-5 w-5 shrink-0" />
						<div>{domainError}</div>
					</div>
				)}
				{domainSuccess && (
					<div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 flex gap-3 text-emerald-300 text-sm">
						<Check className="h-5 w-5 shrink-0" />
						<div>{domainSuccess}</div>
					</div>
				)}
				{verificationResult && !verificationResult.verified && (
					<div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex gap-3 text-amber-300 text-sm">
						<AlertCircle className="h-5 w-5 shrink-0" />
						<div>
							<p className="font-semibold">DNS Verification Failed</p>
							<p className="mt-1 text-xs text-white/60">{verificationResult.message}</p>
						</div>
					</div>
				)}
			</section>

			<hr className="border-white/10" />

			{/* Part 2: Landing Page Builder */}
			<section className="space-y-6">
				<div>
					<h3 className="text-xl font-semibold text-white flex items-center gap-2">
						<Layout className="h-5 w-5 text-indigo-400" />
						Landing Page Builder
					</h3>
					<p className="text-sm text-white/60 mt-1">
						Design a custom public-facing landing page served at your custom domain.
					</p>
				</div>

				<div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
					{/* Form Builder Panel */}
					<div className="space-y-6">
						{/* Template selector */}
						<div className="space-y-3">
							<label className="text-sm font-semibold text-white/80 block">Select Template</label>
							<div className="grid grid-cols-3 gap-3">
								{(['minimal', 'restaurant', 'pizza'] as LandingPageTemplate[]).map((temp) => (
									<button
										key={temp}
										type="button"
										onClick={() => updateLandingField('template', temp)}
										className={`p-4 rounded-xl border text-center transition-all ${
											landingConfig.template === temp
												? 'border-indigo-500 bg-indigo-500/10 text-white font-bold'
												: 'border-white/10 bg-white/5 text-white/60 hover:border-white/20'
										}`}
									>
										<div className="text-xl mb-1.5 capitalize font-semibold">
											{temp === 'minimal' && '🍃'}
											{temp === 'restaurant' && '🍽️'}
											{temp === 'pizza' && '🍕'}
										</div>
										<div className="text-xs uppercase tracking-wider">{temp}</div>
									</button>
								))}
							</div>
						</div>

						{/* Form Copy Inputs */}
						<div className="space-y-4">
							<div className="space-y-2">
								<label className="text-xs uppercase tracking-wider font-semibold text-white/60">Headline</label>
								<input
									type="text"
									value={landingConfig.headline}
									onChange={(e) => updateLandingField('headline', e.target.value)}
									placeholder="Indulge in Flavors"
									className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
								/>
							</div>

							<div className="space-y-2">
								<label className="text-xs uppercase tracking-wider font-semibold text-white/60">Subheadline</label>
								<textarea
									rows={3}
									value={landingConfig.subheadline}
									onChange={(e) => updateLandingField('subheadline', e.target.value)}
									placeholder="A brief description of what makes your restaurant special."
									className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
								/>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<label className="text-xs uppercase tracking-wider font-semibold text-white/60">CTA Button Text</label>
									<input
										type="text"
										value={landingConfig.cta_text}
										onChange={(e) => updateLandingField('cta_text', e.target.value)}
										placeholder="Order Now"
										className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
								</div>
								<div className="space-y-2">
									<label className="text-xs uppercase tracking-wider font-semibold text-white/60">CTA Button Link</label>
									<input
										type="text"
										value={landingConfig.cta_url}
										onChange={(e) => updateLandingField('cta_url', e.target.value)}
										placeholder="https://..."
										className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
									/>
								</div>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<label className="text-xs uppercase tracking-wider font-semibold text-white/60">Background Color</label>
									<div className="flex gap-2">
										<input
											type="color"
											value={landingConfig.bg_color}
											onChange={(e) => updateLandingField('bg_color', e.target.value)}
											className="h-11 w-14 rounded-xl border border-white/15 bg-white/5 px-1.5"
										/>
										<input
											type="text"
											value={landingConfig.bg_color}
											onChange={(e) => updateLandingField('bg_color', e.target.value)}
											className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-white font-mono"
										/>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-xs uppercase tracking-wider font-semibold text-white/60">Accent Color</label>
									<div className="flex gap-2">
										<input
											type="color"
											value={landingConfig.accent_color}
											onChange={(e) => updateLandingField('accent_color', e.target.value)}
											className="h-11 w-14 rounded-xl border border-white/15 bg-white/5 px-1.5"
										/>
										<input
											type="text"
											value={landingConfig.accent_color}
											onChange={(e) => updateLandingField('accent_color', e.target.value)}
											className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-white font-mono"
										/>
									</div>
								</div>
							</div>

							<div className="space-y-2">
								<label className="text-xs uppercase tracking-wider font-semibold text-white/60">Logo URL Override</label>
								<input
									type="text"
									value={landingConfig.logo_url || ''}
									onChange={(e) => updateLandingField('logo_url', e.target.value || null)}
									placeholder="Leave empty to use restaurant logo"
									className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none"
								/>
							</div>

							<div className="flex items-center justify-between border-t border-white/5 pt-4">
								<div>
									<label className="text-sm font-semibold text-white">Show Staff POS Link</label>
									<p className="text-xs text-white/50">Display a "Staff Login" button leading to the POS.</p>
								</div>
								<input
									type="checkbox"
									checked={landingConfig.show_pos_link}
									onChange={(e) => updateLandingField('show_pos_link', e.target.checked)}
									className="h-5 w-5 rounded border-white/15 bg-white/5 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
								/>
							</div>
						</div>

						{/* Action Buttons */}
						<div className="border-t border-white/10 pt-6 flex flex-col gap-3">
							<button
								onClick={handleSaveLandingPage}
								disabled={isPendingLanding}
								className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 py-3.5 px-4 font-bold text-white text-sm disabled:opacity-50 transition-all duration-200"
							>
								{isPendingLanding ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										<span>Saving Page Config...</span>
									</>
								) : (
									<>
										<Save className="h-4 w-4" />
										<span>Save Landing Page Configuration</span>
									</>
								)}
							</button>

							{landingError && (
								<p className="text-sm text-rose-400 text-center">{landingError}</p>
							)}
							{landingSuccess && (
								<p className="text-sm text-emerald-400 text-center">{landingSuccess}</p>
							)}
						</div>
					</div>

					{/* Live Simulator Preview */}
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<span className="text-sm font-semibold text-white flex items-center gap-2">
								<Eye className="h-4 w-4 text-indigo-400" />
								Real-Time Live Simulator
							</span>
							<div className="flex border border-white/10 rounded-lg p-0.5 overflow-hidden text-xs">
								<button
									onClick={() => setPreviewTab('desktop')}
									className={`px-3 py-1 rounded-md transition-colors ${
										previewTab === 'desktop' ? 'bg-indigo-500 text-white font-semibold' : 'text-white/60 hover:text-white'
									}`}
								>
									Desktop
								</button>
								<button
									onClick={() => setPreviewTab('mobile')}
									className={`px-3 py-1 rounded-md transition-colors ${
										previewTab === 'mobile' ? 'bg-indigo-500 text-white font-semibold' : 'text-white/60 hover:text-white'
									}`}
								>
									Mobile
								</button>
							</div>
						</div>

						<div className="border border-white/10 rounded-[28px] overflow-hidden bg-black/60 shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-2">
							<div
								className={`mx-auto rounded-[20px] overflow-hidden flex flex-col justify-between border border-white/5 transition-all duration-500 font-sans`}
								style={{
									aspectRatio: previewTab === 'desktop' ? '16/10' : '9/16',
									maxWidth: previewTab === 'desktop' ? '100%' : '320px',
									backgroundColor: landingConfig.bg_color || '#030712'
								}}
							>
								{/* Mock Simulator Header */}
								<div className="border-b border-white/5 px-4 py-3 flex items-center justify-between text-white bg-black/20 text-[10px] sm:text-xs">
									<div className="flex items-center gap-1.5 max-w-[65%] truncate">
										{landingConfig.logo_url || tenant.logo_url ? (
											<img
												src={landingConfig.logo_url || tenant.logo_url || ''}
												alt="logo"
												className="h-4.5 w-4.5 rounded-full object-cover border border-white/10"
											/>
										) : (
											<span className="h-4.5 w-4.5 rounded-full bg-white/10 flex items-center justify-center font-bold">
												{tenant.name.substring(0, 1)}
											</span>
										)}
										<span className="font-semibold text-white/90 truncate">{tenant.name}</span>
									</div>
									{landingConfig.show_pos_link && (
										<span className="text-[9px] text-white/50 border border-white/10 px-2 py-0.5 rounded-full hover:bg-white/5">
											Staff Login
										</span>
									)}
								</div>

								{/* Mock Simulator Body */}
								<div className="flex-1 p-6 flex flex-col justify-center items-center text-center space-y-4">
									{landingConfig.template === 'restaurant' && (
										<div className="inline-flex items-center gap-1 border border-amber-500/20 bg-amber-500/10 rounded-full px-2.5 py-0.5 text-[8px] text-amber-300">
											✨ Restaurant
										</div>
									)}
									{landingConfig.template === 'pizza' && (
										<div className="inline-flex items-center gap-1 border border-red-500/20 bg-red-500/10 rounded-xl px-2.5 py-0.5 text-[8px] text-red-400 uppercase font-bold">
											🍕 Pizza Edition
										</div>
									)}

									<h1 className="text-white font-extrabold text-base sm:text-2xl tracking-tight leading-tight max-w-[90%]">
										{landingConfig.headline || `Welcome to ${tenant.name}`}
									</h1>

									<p className="text-white/60 text-[10px] sm:text-xs leading-relaxed max-w-[85%]">
										{landingConfig.subheadline || 'Experience exceptional taste and quality.'}
									</p>

									<div className="pt-2">
										<span
											className="inline-flex items-center gap-1 text-[10px] sm:text-xs rounded-full px-4 py-2 font-bold text-white shadow-md cursor-default"
											style={{ backgroundColor: landingConfig.accent_color || '#3b82f6' }}
										>
											{landingConfig.cta_text || 'Order Now'}
											<ArrowRight className="h-3 w-3" />
										</span>
									</div>
								</div>

								{/* Mock Simulator Footer */}
								<div className="py-2.5 border-t border-white/5 text-center text-[7px] sm:text-[9px] text-white/30">
									© {new Date().getFullYear()} {tenant.name} • Powered by NovaPOS
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>
	)
}
