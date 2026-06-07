'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
	Save,
	Building2,
	Palette,
	Globe,
	MapPin,
	Phone,
	Mail,
	Link2,
	Copy,
	Check,
	DollarSign,
	Calendar
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CustomSelect } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { updateTenantOrganization } from '@/app/actions/settings'

type Tenant = {
	id: string
	name: string
	slug: string | null
	branding: Record<string, unknown> | null
	contact: Record<string, unknown> | null
	social: Record<string, unknown> | null
	settings: Record<string, unknown> | null
}

type OrganizationSettingsTabProps = {
	tenant: Tenant
	onRefresh: () => void
}

export function OrganizationSettingsTab({
	tenant,
	onRefresh
}: OrganizationSettingsTabProps) {
	const branding = tenant.branding || {}
	const contact = tenant.contact || {}
	const social = tenant.social || {}
	const settings = tenant.settings || {}
	const address = (contact.address as Record<string, unknown>) || {}
	const [copied, setCopied] = useState(false)
	const { success, error: showError } = useToast()

	const [formData, setFormData] = useState({
		name: tenant.name || '',
		logoUrl: (tenant as { logo_url?: string }).logo_url || '',
		branding: {
			fontFamily: (branding.fontFamily as string) || 'Inter',
			primaryColor: (branding.primaryColor as string) || '#6B6DFF',
			secondaryColor: (branding.secondaryColor as string) || '#4DD4FF'
		},
		contact: {
			email: (contact.email as string) || '',
			phone: (contact.phone as string) || '',
			address: {
				street: (address.street as string) || '',
				city: (address.city as string) || '',
				state: (address.state as string) || '',
				pincode: (address.pincode as string) || '',
				country: (address.country as string) || ''
			}
		},
		social: {
			website: (social.website as string) || '',
			instagram: (social.instagram as string) || '',
			facebook: (social.facebook as string) || ''
		},
		currency: {
			code: (settings.currency as string) || 'INR',
			symbol: (settings.currencySymbol as string) || '₹'
		},
		monthStartDay: (settings.monthStartDay as number) || 1,
		monthEndDay: (settings.monthEndDay as number) || 0
	})
	const [saving, setSaving] = useState(false)

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		try {
			// Ensure monthStartDay and monthEndDay are included
			const dataToSave = {
				...formData,
				monthStartDay: formData.monthStartDay,
				monthEndDay: formData.monthEndDay
			}
			console.log('=== SAVING ORGANIZATION SETTINGS ===')
			console.log('Tenant ID:', tenant.id)
			console.log('Data to save:', JSON.stringify({
				name: dataToSave.name,
				monthStartDay: dataToSave.monthStartDay,
				monthEndDay: dataToSave.monthEndDay,
				currency: dataToSave.currency,
				logoUrl: dataToSave.logoUrl,
				branding: dataToSave.branding,
				contact: dataToSave.contact,
				social: dataToSave.social
			}, null, 2))
			
			const result = await updateTenantOrganization(tenant.id, dataToSave)
			console.log('=== UPDATE RESULT FROM SERVER ===')
			console.log(JSON.stringify(result, null, 2))
			console.log('=== END RESULT ===')
			success('Organization settings saved successfully!')
			onRefresh()
		} catch (error) {
			console.error('Error updating organization:', error)
			const errorMessage =
				error instanceof Error
					? error.message
					: 'Failed to update organization settings'
			showError(errorMessage)
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="space-y-8">
			<div>
				<h3 className="text-xl font-semibold text-white">
					Organization Details
				</h3>
				<p className="text-sm text-white/60">
					Manage your restaurant's identity and contact information
				</p>
			</div>

			{/* Subdomain Display */}
			{tenant.slug ? (
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					className="rounded-xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-6"
				>
					<div className="mb-4 flex items-center gap-3">
						<div className="rounded-xl bg-emerald-400/20 p-2.5">
							<Link2 className="h-5 w-5 text-emerald-300" />
						</div>
						<div className="flex-1">
							<h4 className="text-lg font-semibold text-white">
								Your Workspace URL
							</h4>
							<p className="text-sm text-white/60">
								This is your unique subdomain for accessing your workspace
							</p>
						</div>
					</div>
					<div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-4 py-3">
						<code className="flex-1 font-mono text-lg text-white">
							{tenant.slug}.novapos.in
						</code>
						<button
							type="button"
							onClick={() => {
								navigator.clipboard.writeText(`${tenant.slug}.novapos.in`)
								setCopied(true)
								setTimeout(() => setCopied(false), 2000)
							}}
							className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/80 transition hover:bg-white/20 hover:text-white"
						>
							{copied ? (
								<>
									<Check className="h-4 w-4 text-emerald-400" />
									<span className="text-emerald-400">Copied!</span>
								</>
							) : (
								<>
									<Copy className="h-4 w-4" />
									<span>Copy</span>
								</>
							)}
						</button>
					</div>
					<p className="mt-3 text-xs text-white/50">
						Share this URL with your team members to give them access to your
						workspace
					</p>
				</motion.div>
			) : (
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					className="rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-6"
				>
					<div className="mb-4 flex items-center gap-3">
						<div className="rounded-xl bg-amber-400/20 p-2.5">
							<Link2 className="h-5 w-5 text-amber-300" />
						</div>
						<div className="flex-1">
							<h4 className="text-lg font-semibold text-white">
								No Subdomain Configured
							</h4>
							<p className="text-sm text-white/60">
								Your workspace doesn't have a custom subdomain yet
							</p>
						</div>
					</div>
					<p className="text-sm text-white/70">
						Subdomains are set during tenant creation. If you need to add one,
						please contact support.
					</p>
				</motion.div>
			)}

			<form onSubmit={handleSubmit} className="space-y-8">
				{/* Basic Info */}
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					className="rounded-xl border border-white/10 bg-black/20 p-6"
				>
					<div className="mb-4 flex items-center gap-3">
						<Building2 className="h-5 w-5 text-blue-400" />
						<h4 className="text-lg font-semibold text-white">
							Basic Information
						</h4>
					</div>
					<div className="space-y-4">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Restaurant Name *
							</label>
							<input
								type="text"
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="Your Restaurant Name"
								required
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Logo URL
							</label>
							<input
								type="url"
								value={formData.logoUrl}
								onChange={(e) =>
									setFormData({ ...formData, logoUrl: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="https://example.com/logo.png"
							/>
							{formData.logoUrl && (
								<div className="mt-3">
									<img
										src={formData.logoUrl}
										alt="Logo preview"
										className="h-20 w-20 rounded-lg object-cover"
									/>
								</div>
							)}
						</div>
					</div>
				</motion.div>

				{/* Branding */}
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.1 }}
					className="rounded-xl border border-white/10 bg-black/20 p-6"
				>
					<div className="mb-4 flex items-center gap-3">
						<Palette className="h-5 w-5 text-purple-400" />
						<h4 className="text-lg font-semibold text-white">Branding</h4>
					</div>
					<div className="grid gap-4 md:grid-cols-3">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Font Family
							</label>
							<CustomSelect
								value={formData.branding.fontFamily}
								onChange={(val) =>
									setFormData({
										...formData,
										branding: {
											...formData.branding,
											fontFamily: val
										}
									})
								}
								options={[
									{ value: 'Inter', label: 'Inter', description: 'Clean geometric sans-serif' },
									{ value: 'Poppins', label: 'Poppins', description: 'Modern friendly sans-serif' },
									{ value: 'Roboto', label: 'Roboto', description: 'Structured clean sans-serif' },
									{ value: 'Open Sans', label: 'Open Sans', description: 'Highly readable neutral sans-serif' }
								]}
								placeholder="Select font family"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Primary Color
							</label>
							<div className="flex gap-2">
								<input
									type="color"
									value={formData.branding.primaryColor}
									onChange={(e) =>
										setFormData({
											...formData,
											branding: {
												...formData.branding,
												primaryColor: e.target.value
											}
										})
									}
									className="h-10 w-20 cursor-pointer rounded-xl border border-white/10"
								/>
								<input
									type="text"
									value={formData.branding.primaryColor}
									onChange={(e) =>
										setFormData({
											...formData,
											branding: {
												...formData.branding,
												primaryColor: e.target.value
											}
										})
									}
									className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="#6B6DFF"
								/>
							</div>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Secondary Color
							</label>
							<div className="flex gap-2">
								<input
									type="color"
									value={formData.branding.secondaryColor}
									onChange={(e) =>
										setFormData({
											...formData,
											branding: {
												...formData.branding,
												secondaryColor: e.target.value
											}
										})
									}
									className="h-10 w-20 cursor-pointer rounded-xl border border-white/10"
								/>
								<input
									type="text"
									value={formData.branding.secondaryColor}
									onChange={(e) =>
										setFormData({
											...formData,
											branding: {
												...formData.branding,
												secondaryColor: e.target.value
											}
										})
									}
									className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="#4DD4FF"
								/>
							</div>
						</div>
					</div>
				</motion.div>

				{/* Contact */}
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.2 }}
					className="rounded-xl border border-white/10 bg-black/20 p-6"
				>
					<div className="mb-4 flex items-center gap-3">
						<Phone className="h-5 w-5 text-emerald-400" />
						<h4 className="text-lg font-semibold text-white">
							Contact Information
						</h4>
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								<Mail className="mr-2 inline h-4 w-4" />
								Email
							</label>
							<input
								type="email"
								value={formData.contact.email}
								onChange={(e) =>
									setFormData({
										...formData,
										contact: { ...formData.contact, email: e.target.value }
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="contact@restaurant.com"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								<Phone className="mr-2 inline h-4 w-4" />
								Phone
							</label>
							<input
								type="tel"
								value={formData.contact.phone}
								onChange={(e) =>
									setFormData({
										...formData,
										contact: { ...formData.contact, phone: e.target.value }
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="+1 234 567 8900"
							/>
						</div>
					</div>
					<div className="mt-4">
						<label className="mb-2 block text-sm font-medium text-white">
							<MapPin className="mr-2 inline h-4 w-4" />
							Address
						</label>
						<div className="grid gap-3 md:grid-cols-2">
							<input
								type="text"
								value={formData.contact.address.street}
								onChange={(e) =>
									setFormData({
										...formData,
										contact: {
											...formData.contact,
											address: {
												...formData.contact.address,
												street: e.target.value
											}
										}
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="Street Address"
							/>
							<input
								type="text"
								value={formData.contact.address.city}
								onChange={(e) =>
									setFormData({
										...formData,
										contact: {
											...formData.contact,
											address: {
												...formData.contact.address,
												city: e.target.value
											}
										}
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="City"
							/>
							<input
								type="text"
								value={formData.contact.address.state}
								onChange={(e) =>
									setFormData({
										...formData,
										contact: {
											...formData.contact,
											address: {
												...formData.contact.address,
												state: e.target.value
											}
										}
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="State"
							/>
							<input
								type="text"
								value={formData.contact.address.pincode}
								onChange={(e) =>
									setFormData({
										...formData,
										contact: {
											...formData.contact,
											address: {
												...formData.contact.address,
												pincode: e.target.value
											}
										}
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="ZIP/Postal Code"
							/>
							<input
								type="text"
								value={formData.contact.address.country}
								onChange={(e) =>
									setFormData({
										...formData,
										contact: {
											...formData.contact,
											address: {
												...formData.contact.address,
												country: e.target.value
											}
										}
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none md:col-span-2"
								placeholder="Country"
							/>
						</div>
					</div>
				</motion.div>

				{/* Currency */}
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.3 }}
					className="rounded-xl border border-white/10 bg-black/20 p-6"
				>
					<div className="mb-4 flex items-center gap-3">
						<DollarSign className="h-5 w-5 text-emerald-400" />
						<h4 className="text-lg font-semibold text-white">
							Currency Settings
						</h4>
					</div>
					<p className="mb-4 text-sm text-white/60">
						Set your default currency that will be used throughout the
						application
					</p>
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Currency Code *
							</label>
							<input
								type="text"
								value={formData.currency.code}
								onChange={(e) =>
									setFormData({
										...formData,
										currency: {
											...formData.currency,
											code: e.target.value.toUpperCase()
										}
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="INR"
								required
								maxLength={3}
							/>
							<p className="mt-1 text-xs text-white/60">
								ISO 4217 currency code (e.g., INR, USD, EUR)
							</p>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Currency Symbol *
							</label>
							<input
								type="text"
								value={formData.currency.symbol}
								onChange={(e) =>
									setFormData({
										...formData,
										currency: {
											...formData.currency,
											symbol: e.target.value
										}
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="₹"
								required
								maxLength={5}
							/>
							<p className="mt-1 text-xs text-white/60">
								Symbol to display with amounts (e.g., ₹, $, €)
							</p>
						</div>
					</div>
				</motion.div>

				{/* Financial Period */}
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.35 }}
					className="rounded-xl border border-white/10 bg-black/20 p-6"
				>
					<div className="mb-4 flex items-center gap-3">
						<Calendar className="h-5 w-5 text-amber-400" />
						<h4 className="text-lg font-semibold text-white">
							Financial Period
						</h4>
					</div>
					<p className="mb-4 text-sm text-white/60">
						Configure your financial period start and end dates for analytics and reporting
					</p>
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Month Start Day *
							</label>
							<input
								type="number"
								min="1"
								max="31"
								value={formData.monthStartDay}
								onChange={(e) =>
									setFormData({
										...formData,
										monthStartDay: Number(e.target.value)
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="1"
								required
							/>
							<p className="mt-1 text-xs text-white/60">
								The day of the month when your financial period starts (1-31).
								Default is 1st. For example, if set to 5, your month will run
								from 5th to 4th of next month.
							</p>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Month End Day
							</label>
							<input
								type="number"
								min="0"
								max="31"
								value={formData.monthEndDay || ''}
								onChange={(e) =>
									setFormData({
										...formData,
										monthEndDay: e.target.value ? Number(e.target.value) : 0
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="0 (auto-calculated)"
							/>
							<p className="mt-1 text-xs text-white/60">
								Leave as 0 to auto-calculate based on month start day (one day before next period starts). 
								Set a specific day if you need a fixed end date. For example, if start day is 5, set end day to 4 to run from 5th to 4th of next month.
							</p>
						</div>
					</div>
				</motion.div>

				{/* Social */}
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.4 }}
					className="rounded-xl border border-white/10 bg-black/20 p-6"
				>
					<div className="mb-4 flex items-center gap-3">
						<Globe className="h-5 w-5 text-cyan-400" />
						<h4 className="text-lg font-semibold text-white">Social Links</h4>
					</div>
					<div className="grid gap-4 md:grid-cols-3">
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Website
							</label>
							<input
								type="url"
								value={formData.social.website}
								onChange={(e) =>
									setFormData({
										...formData,
										social: { ...formData.social, website: e.target.value }
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="https://restaurant.com"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Instagram
							</label>
							<input
								type="text"
								value={formData.social.instagram}
								onChange={(e) =>
									setFormData({
										...formData,
										social: { ...formData.social, instagram: e.target.value }
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="@restaurant"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-white">
								Facebook
							</label>
							<input
								type="text"
								value={formData.social.facebook}
								onChange={(e) =>
									setFormData({
										...formData,
										social: { ...formData.social, facebook: e.target.value }
									})
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="restaurant"
							/>
						</div>
					</div>
				</motion.div>

				<div className="flex justify-end">
					<Button type="submit" disabled={saving} size="lg">
						<Save className="mr-2 h-4 w-4" />
						{saving ? 'Saving...' : 'Save Changes'}
					</Button>
				</div>
			</form>
		</div>
	)
}
