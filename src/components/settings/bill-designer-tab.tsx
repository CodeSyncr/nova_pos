'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
	Save,
	RefreshCw,
	Palette,
	Type,
	Layout,
	Eye,
	Paintbrush,
	Sliders,
	Check,
	Smartphone,
	Printer,
	FileText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { updateTenantSettings } from '@/app/actions/settings'
import { BillPreview } from '../bill/bill-preview'
import {
	DEFAULT_WHATSAPP_TEMPLATE,
	DEFAULT_THERMAL_TEMPLATE,
	type BillTemplate
} from '@/lib/bill-template'

type Tenant = {
	id: string
	name: string
	settings: Record<string, unknown> | null
}

type Props = {
	tenant: Tenant
	onRefresh: () => void
}

const MOCK_ORDER = {
	id: 'ord_demo123456',
	created_at: new Date().toISOString(),
	order_type: 'dine_in',
	table_number: '07',
	customer_name: 'Aditya Sharma',
	customer_phone: '+919876543210',
	subtotal: 620.0,
	tax: 31.0,
	discount_amount: 50.0,
	total: 601.0,
	payment_method: 'UPI',
	order_items: [
		{ id: '1', name: 'Paneer Butter Masala', quantity: 1, unit_price: 320.0, total_price: 320.0 },
		{ id: '2', name: 'Butter Naan', quantity: 3, unit_price: 60.0, total_price: 180.0 },
		{ id: '3', name: 'Masala Cold Drink', quantity: 2, unit_price: 60.0, total_price: 120.0 }
	]
}

const WHATSAPP_PRESETS = [
	{
		name: 'Classic Indigo',
		colors: {
			primaryColor: '#6366F1',
			accentColor: '#8B5CF6',
			bgColor: '#0F172A',
			textColor: '#F8FAFC',
			mutedColor: '#94A3B8',
			borderColor: '#1E293B'
		}
	},
	{
		name: 'Emerald Mint',
		colors: {
			primaryColor: '#10B981',
			accentColor: '#059669',
			bgColor: '#062F24',
			textColor: '#ECFDF5',
			mutedColor: '#A7F3D0',
			borderColor: '#064E3B'
		}
	},
	{
		name: 'Cyber Neon',
		colors: {
			primaryColor: '#F43F5E',
			accentColor: '#D946EF',
			bgColor: '#0F0B24',
			textColor: '#FFF1F2',
			mutedColor: '#F472B6',
			borderColor: '#312E81'
		}
	},
	{
		name: 'Warm Sunset',
		colors: {
			primaryColor: '#F97316',
			accentColor: '#EF4444',
			bgColor: '#1C1917',
			textColor: '#FAFAF9',
			mutedColor: '#D6D3D1',
			borderColor: '#292524'
		}
	},
	{
		name: 'Minimal Light',
		colors: {
			primaryColor: '#2563EB',
			accentColor: '#4F46E5',
			bgColor: '#FFFFFF',
			textColor: '#1E293B',
			mutedColor: '#64748B',
			borderColor: '#E2E8F0'
		}
	}
]

const THERMAL_PRESETS = [
	{
		name: 'Standard Monochrome',
		colors: {
			primaryColor: '#000000',
			accentColor: '#000000',
			bgColor: '#FFFFFF',
			textColor: '#000000',
			mutedColor: '#555555',
			borderColor: '#CCCCCC'
		}
	},
	{
		name: 'High Contrast',
		colors: {
			primaryColor: '#000000',
			accentColor: '#000000',
			bgColor: '#FFFFFF',
			textColor: '#000000',
			mutedColor: '#000000',
			borderColor: '#000000'
		}
	}
]

export function BillDesignerTab({ tenant, onRefresh }: Props) {
	const settings = tenant.settings || {}
	const billSettings = (settings.billTemplates as { whatsapp?: BillTemplate; thermal?: BillTemplate } | undefined) || {}

	// Local template configurations
	const [whatsappTemplate, setWhatsappTemplate] = useState<BillTemplate>(() => ({
		...DEFAULT_WHATSAPP_TEMPLATE,
		...billSettings.whatsapp,
		type: 'whatsapp'
	}))

	const [thermalTemplate, setThermalTemplate] = useState<BillTemplate>(() => ({
		...DEFAULT_THERMAL_TEMPLATE,
		...billSettings.thermal,
		type: 'thermal'
	}))

	const [activeDesignType, setActiveDesignType] = useState<'whatsapp' | 'thermal'>('whatsapp')
	const [activeSection, setActiveSection] = useState<'colors' | 'typography' | 'content' | 'text'>('colors')
	const [saving, setSaving] = useState(false)
	const [reviewLink, setReviewLink] = useState<string>((settings.reviewLink as string) || '')
	const { success, error: showError } = useToast()

	const currentTemplate = activeDesignType === 'whatsapp' ? whatsappTemplate : thermalTemplate
	const setCurrentTemplate = activeDesignType === 'whatsapp' ? setWhatsappTemplate : setThermalTemplate
	const presets = activeDesignType === 'whatsapp' ? WHATSAPP_PRESETS : THERMAL_PRESETS

	const updateField = <K extends keyof BillTemplate>(field: K, value: BillTemplate[K]) => {
		setCurrentTemplate((prev) => ({
			...prev,
			[field]: value
		}))
	}

	const applyPreset = (presetColors: typeof WHATSAPP_PRESETS[0]['colors']) => {
		setCurrentTemplate((prev) => ({
			...prev,
			...presetColors
		}))
	}

	const handleSave = async () => {
		setSaving(true)
		try {
			const finalSettings = {
				...settings,
				reviewLink,
				billTemplates: {
					whatsapp: whatsappTemplate,
					thermal: thermalTemplate
				}
			}
			await updateTenantSettings(tenant.id, finalSettings)
			success('Bill templates saved successfully!')
			onRefresh()
		} catch (err: any) {
			console.error(err)
			showError(err.message || 'Failed to save bill designs.')
		} finally {
			setSaving(false)
		}
	}

	const handleReset = () => {
		if (activeDesignType === 'whatsapp') {
			setWhatsappTemplate({ ...DEFAULT_WHATSAPP_TEMPLATE, type: 'whatsapp' })
		} else {
			setThermalTemplate({ ...DEFAULT_THERMAL_TEMPLATE, type: 'thermal' })
		}
		success('Template reset to default values')
	}

	return (
		<div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
			{/* Designer Settings Panel */}
			<div className="flex-1 space-y-6">
				{/* Top Controls: Selector and Reset */}
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
					{/* Type Switcher */}
					<div className="inline-flex rounded-xl bg-black/40 p-1 border border-white/5">
						<button
							onClick={() => setActiveDesignType('whatsapp')}
							className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
								activeDesignType === 'whatsapp'
									? 'bg-white/10 text-white shadow-sm'
									: 'text-white/60 hover:text-white'
							}`}
						>
							<Smartphone className="h-4 w-4" />
							WhatsApp Template
						</button>
						<button
							onClick={() => setActiveDesignType('thermal')}
							className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
								activeDesignType === 'thermal'
									? 'bg-white/10 text-white shadow-sm'
									: 'text-white/60 hover:text-white'
							}`}
						>
							<Printer className="h-4 w-4" />
							Thermal Printer
						</button>
					</div>

					{/* Actions */}
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={handleReset}
							className="text-white/60 hover:text-white border border-white/5"
						>
							<RefreshCw className="mr-1.5 h-3.5 w-3.5" />
							Reset Mode
						</Button>
					</div>
				</div>

				{/* Tab Sections Selector */}
				<div className="flex border-b border-white/10 pb-px gap-4 overflow-x-auto">
					{(
						[
							{ id: 'colors', label: 'Colors & Presets', icon: Palette },
							{ id: 'typography', label: 'Typography', icon: Type },
							{ id: 'content', label: 'Content Toggles', icon: Layout },
							{ id: 'text', label: 'Text Overrides', icon: FileText }
						] as const
					).map((sec) => {
						const Icon = sec.icon
						const isActive = activeSection === sec.id
						return (
							<button
								key={sec.id}
								onClick={() => setActiveSection(sec.id)}
								className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-all ${
									isActive
										? 'border-white text-white'
										: 'border-transparent text-white/50 hover:text-white/80'
								}`}
							>
								<Icon className="h-4 w-4" />
								{sec.label}
							</button>
						)
					})}
				</div>

				{/* Active Section Editor */}
				<div className="rounded-2xl border border-white/10 bg-black/20 p-6 space-y-6">
					{/* Colors & Presets Section */}
					{activeSection === 'colors' && (
						<div className="space-y-6">
							{/* Presets */}
							<div>
								<label className="block text-sm font-medium text-white/80 mb-3">
									Design Presets
								</label>
								<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
									{presets.map((preset) => {
										const isSelected =
											currentTemplate.bgColor === preset.colors.bgColor &&
											currentTemplate.primaryColor === preset.colors.primaryColor
										return (
											<button
												key={preset.name}
												onClick={() => applyPreset(preset.colors)}
												className={`flex flex-col items-start gap-2 rounded-xl p-3 border text-left transition-all ${
													isSelected
														? 'border-white bg-white/10'
														: 'border-white/10 bg-white/5 hover:border-white/20'
												}`}
											>
												<span className="text-xs font-semibold text-white">
													{preset.name}
												</span>
												<div className="flex gap-1 mt-1">
													<span
														className="h-4 w-4 rounded-full border border-white/10"
														style={{ backgroundColor: preset.colors.bgColor }}
													/>
													<span
														className="h-4 w-4 rounded-full"
														style={{ backgroundColor: preset.colors.primaryColor }}
													/>
													<span
														className="h-4 w-4 rounded-full"
														style={{ backgroundColor: preset.colors.textColor }}
													/>
												</div>
											</button>
										)
									})}
								</div>
							</div>

							{/* Custom Color Pickers */}
							<div className="border-t border-white/5 pt-6">
								<h4 className="text-sm font-medium text-white/80 mb-4 flex items-center gap-2">
									<Paintbrush className="h-4 w-4 text-white/60" />
									Custom Colors
								</h4>
								<div className="grid gap-4 sm:grid-cols-2">
									<div>
										<label className="block text-xs text-white/50 mb-1.5">Background</label>
										<div className="flex items-center gap-2">
											<input
												type="color"
												value={currentTemplate.bgColor}
												onChange={(e) => updateField('bgColor', e.target.value)}
												className="h-8 w-8 rounded cursor-pointer bg-transparent border-0"
											/>
											<input
												type="text"
												value={currentTemplate.bgColor}
												onChange={(e) => updateField('bgColor', e.target.value)}
												className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white uppercase"
											/>
										</div>
									</div>

									<div>
										<label className="block text-xs text-white/50 mb-1.5">Text Color</label>
										<div className="flex items-center gap-2">
											<input
												type="color"
												value={currentTemplate.textColor}
												onChange={(e) => updateField('textColor', e.target.value)}
												className="h-8 w-8 rounded cursor-pointer bg-transparent border-0"
											/>
											<input
												type="text"
												value={currentTemplate.textColor}
												onChange={(e) => updateField('textColor', e.target.value)}
												className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white uppercase"
											/>
										</div>
									</div>

									<div>
										<label className="block text-xs text-white/50 mb-1.5">Primary Color</label>
										<div className="flex items-center gap-2">
											<input
												type="color"
												value={currentTemplate.primaryColor}
												onChange={(e) => updateField('primaryColor', e.target.value)}
												className="h-8 w-8 rounded cursor-pointer bg-transparent border-0"
											/>
											<input
												type="text"
												value={currentTemplate.primaryColor}
												onChange={(e) => updateField('primaryColor', e.target.value)}
												className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white uppercase"
											/>
										</div>
									</div>

									{activeDesignType === 'whatsapp' && (
										<div>
											<label className="block text-xs text-white/50 mb-1.5">Accent Color</label>
											<div className="flex items-center gap-2">
												<input
													type="color"
													value={currentTemplate.accentColor}
													onChange={(e) => updateField('accentColor', e.target.value)}
													className="h-8 w-8 rounded cursor-pointer bg-transparent border-0"
												/>
												<input
													type="text"
													value={currentTemplate.accentColor}
													onChange={(e) => updateField('accentColor', e.target.value)}
													className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white uppercase"
												/>
											</div>
										</div>
									)}

									<div>
										<label className="block text-xs text-white/50 mb-1.5">Muted Text</label>
										<div className="flex items-center gap-2">
											<input
												type="color"
												value={currentTemplate.mutedColor}
												onChange={(e) => updateField('mutedColor', e.target.value)}
												className="h-8 w-8 rounded cursor-pointer bg-transparent border-0"
											/>
											<input
												type="text"
												value={currentTemplate.mutedColor}
												onChange={(e) => updateField('mutedColor', e.target.value)}
												className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white uppercase"
											/>
										</div>
									</div>

									<div>
										<label className="block text-xs text-white/50 mb-1.5">Divider Border Color</label>
										<div className="flex items-center gap-2">
											<input
												type="color"
												value={currentTemplate.borderColor}
												onChange={(e) => updateField('borderColor', e.target.value)}
												className="h-8 w-8 rounded cursor-pointer bg-transparent border-0"
											/>
											<input
												type="text"
												value={currentTemplate.borderColor}
												onChange={(e) => updateField('borderColor', e.target.value)}
												className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white uppercase"
											/>
										</div>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Typography Section */}
					{activeSection === 'typography' && (
						<div className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-white/80 mb-2">
									Font Family
								</label>
								<div className="grid gap-3 grid-cols-2">
									{(
										[
											{ id: 'sans', label: 'Sans-Serif (Modern)', desc: 'Inter, system-ui' },
											{ id: 'mono', label: 'Monospace (Receipt)', desc: 'Courier, Courier New' }
										] as const
									).map((font) => (
										<button
											key={font.id}
											onClick={() => updateField('fontFamily', font.id)}
											className={`flex flex-col rounded-xl p-4 border text-left transition-all ${
												currentTemplate.fontFamily === font.id
													? 'border-white bg-white/10'
													: 'border-white/10 bg-white/5 hover:border-white/20'
											}`}
										>
											<span className="text-sm font-semibold text-white">{font.label}</span>
											<span className="text-xs text-white/40 mt-1">{font.desc}</span>
										</button>
									))}
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium text-white/80 mb-2 mt-4">
									Bill Canvas Width
								</label>
								<div className="flex items-center gap-4">
									<input
										type="range"
										min={activeDesignType === 'whatsapp' ? '360' : '280'}
										max={activeDesignType === 'whatsapp' ? '600' : '400'}
										step="10"
										value={currentTemplate.canvasWidth}
										onChange={(e) => updateField('canvasWidth', Number(e.target.value))}
										className="flex-1 accent-indigo-500 bg-white/10 rounded-lg appearance-none h-1.5"
									/>
									<span className="text-sm text-white font-mono shrink-0 w-12 text-right">
										{currentTemplate.canvasWidth}px
									</span>
								</div>
								<p className="text-xs text-white/40 mt-1">
									Width of the generated canvas in pixels. Thermal standard is 320px, WhatsApp optimal is 460px.
								</p>
							</div>
						</div>
					)}

					{/* Content Toggles */}
					{activeSection === 'content' && (
						<div className="grid gap-4 sm:grid-cols-2">
							{(
								[
									{ field: 'showLogo', label: 'Show Branding Logo Bubble' },
									{ field: 'showAddress', label: 'Show Address Line' },
									{ field: 'showPhone', label: 'Show Phone Contact Line' },
									{ field: 'showOrderType', label: 'Show Order Type Badge' },
									{ field: 'showTable', label: 'Show Table Number' },
									{ field: 'showTaxLine', label: 'Show Tax Line breakdown' },
									{ field: 'showBorderDivider', label: 'Show Dashed Dividers' },
									{ field: 'showThankYou', label: 'Show Footer Thank You Line' }
								] as const
							).map((toggle) => (
								<label
									key={toggle.field}
									className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 cursor-pointer hover:bg-white/[0.04] transition-all"
								>
									<input
										type="checkbox"
										checked={!!currentTemplate[toggle.field]}
										onChange={(e) => updateField(toggle.field as any, e.target.checked)}
										className="h-4 w-4 rounded border-white/20 bg-black text-indigo-600 focus:ring-0 focus:ring-offset-0"
									/>
									<span className="text-sm text-white/80">{toggle.label}</span>
								</label>
							))}
						</div>
					)}

					{/* Text Overrides */}
					{activeSection === 'text' && (
						<div className="space-y-4">
							<div>
								<label className="block text-xs text-white/50 mb-1.5">Restaurant Header Name Override</label>
								<input
									type="text"
									value={currentTemplate.headerText}
									onChange={(e) => updateField('headerText', e.target.value)}
									placeholder="Use organization name as default"
									className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
								/>
							</div>

							<div>
								<label className="block text-xs text-white/50 mb-1.5">Brand Tagline</label>
								<input
									type="text"
									value={currentTemplate.taglineText}
									onChange={(e) => updateField('taglineText', e.target.value)}
									placeholder="Enter tagline"
									className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
								/>
							</div>

							<div>
								<label className="block text-xs text-white/50 mb-1.5">Custom Address</label>
								<input
									type="text"
									value={currentTemplate.addressText}
									onChange={(e) => updateField('addressText', e.target.value)}
									placeholder="Enter address to show on receipt"
									className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
								/>
							</div>

							<div>
								<label className="block text-xs text-white/50 mb-1.5">Custom Phone / Contact Number</label>
								<input
									type="text"
									value={currentTemplate.phoneText}
									onChange={(e) => updateField('phoneText', e.target.value)}
									placeholder="Enter phone contact"
									className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
								/>
							</div>

							<div>
								<label className="block text-xs text-white/50 mb-1.5">Footer Thank-you Note</label>
								<textarea
									value={currentTemplate.footerText}
									onChange={(e) => updateField('footerText', e.target.value)}
									placeholder="Thank you message"
									rows={2}
									className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none resize-none"
								/>
							</div>

							<div>
								<label className="block text-xs text-white/50 mb-1.5">Google Review Link (for WhatsApp message)</label>
								<input
									type="url"
									value={reviewLink}
									onChange={(e) => setReviewLink(e.target.value)}
									placeholder="https://share.google/..."
									className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
								/>
								<p className="mt-1 text-xs text-white/40">Included in WhatsApp bill message to encourage reviews</p>
							</div>
						</div>
					)}
				</div>

				{/* Save Changes Panel */}
				<div className="flex justify-end pt-2">
					<Button onClick={handleSave} disabled={saving} size="lg" className="w-full sm:w-auto">
						<Save className="mr-2 h-4 w-4" />
						{saving ? 'Saving Templates...' : 'Save Bill Templates'}
					</Button>
				</div>
			</div>

			{/* Right Panel: Live Canva Preview */}
			<div className="w-full lg:w-[480px] space-y-4 shrink-0">
				<div className="flex items-center justify-between">
					<h3 className="text-sm uppercase tracking-wider text-white/50 font-semibold flex items-center gap-2">
						<Eye className="h-4 w-4" /> Live Designer Canvas
					</h3>
					<span className="text-xs text-white/40">
						{activeDesignType === 'whatsapp' ? 'WhatsApp Image Format' : 'Thermal Monochrome Receipt'}
					</span>
				</div>

				{/* Preview Canvas Container */}
				<div className="flex flex-col items-center justify-center rounded-[32px] border border-white/10 bg-black/40 p-6 backdrop-blur-md relative overflow-hidden min-h-[500px]">
					{/* Grid Lines Pattern for Canvas Feel */}
					<div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

					{/* Scaling wrapper */}
					<div className="relative border border-white/15 shadow-2xl rounded-lg overflow-hidden transition-all duration-300">
						<BillPreview
							template={currentTemplate}
							order={MOCK_ORDER}
							tenantName={tenant.name}
							currencySymbol={(settings.currencySymbol as string) || '₹'}
						/>
					</div>

					<p className="text-xs text-white/40 mt-4 text-center">
						This live preview accurately mimics the output dimensions and fonts.
					</p>
				</div>
			</div>
		</div>
	)
}
