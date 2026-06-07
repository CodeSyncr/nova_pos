// Bill template configuration stored in tenant.settings.billTemplates

export type BillTemplate = {
	// Layout
	canvasWidth: number // 460 for WhatsApp, 320 for thermal
	type: 'whatsapp' | 'thermal'

	// Colors
	primaryColor: string   // e.g. '#5B7BFF'
	accentColor: string    // e.g. '#8E65FF'
	bgColor: string        // e.g. '#0D0F1A'
	textColor: string      // e.g. '#FFFFFF'
	mutedColor: string     // e.g. '#9CA3AF'
	borderColor: string    // e.g. '#1F2937'

	// Typography
	fontFamily: 'sans' | 'mono'

	// Content toggles
	showLogo: boolean
	showAddress: boolean
	showPhone: boolean
	showOrderType: boolean
	showTable: boolean
	showThankYou: boolean
	showTaxLine: boolean
	showBorderDivider: boolean

	// Text
	headerText: string  // restaurant name override, '' = use tenant name
	addressText: string
	phoneText: string
	footerText: string  // thank you message
	taglineText: string // shown under restaurant name
}

export const DEFAULT_WHATSAPP_TEMPLATE: BillTemplate = {
	canvasWidth: 460,
	type: 'whatsapp',
	primaryColor: '#6366F1',
	accentColor: '#8B5CF6',
	bgColor: '#0F172A',
	textColor: '#F8FAFC',
	mutedColor: '#94A3B8',
	borderColor: '#1E293B',
	fontFamily: 'sans',
	showLogo: false,
	showAddress: true,
	showPhone: true,
	showOrderType: true,
	showTable: true,
	showThankYou: true,
	showTaxLine: true,
	showBorderDivider: true,
	headerText: '',
	addressText: '',
	phoneText: '',
	footerText: 'Thank you for dining with us! 🙏',
	taglineText: 'Your favourite restaurant'
}

export const DEFAULT_THERMAL_TEMPLATE: BillTemplate = {
	canvasWidth: 320,
	type: 'thermal',
	primaryColor: '#000000',
	accentColor: '#000000',
	bgColor: '#FFFFFF',
	textColor: '#000000',
	mutedColor: '#555555',
	borderColor: '#CCCCCC',
	fontFamily: 'mono',
	showLogo: false,
	showAddress: true,
	showPhone: true,
	showOrderType: true,
	showTable: true,
	showThankYou: true,
	showTaxLine: true,
	showBorderDivider: true,
	headerText: '',
	addressText: '',
	phoneText: '',
	footerText: 'Thank you! Visit Again.',
	taglineText: ''
}
