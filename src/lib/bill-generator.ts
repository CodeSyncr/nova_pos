// Bill generator: builds a styled PDF bill natively using jsPDF
// Replicates the BillPreview design with colors, backgrounds, and layout
// This runs client-side only

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillTemplate } from './bill-template'
import { EscPosEncoder } from './esc-pos-encoder'

export type BillOrderData = {
	id: string
	created_at: string
	order_type: string
	table_number: string | null
	customer_name: string | null
	customer_phone: string | null
	subtotal: number
	tax: number
	discount_amount?: number
	total: number
	payment_method?: string | null
	order_items: Array<{
		id: string
		name: string
		quantity: number
		unit_price: number
		total_price: number
	}>
}

export type BillConfig = {
	order: BillOrderData
	template: BillTemplate
	tenantName: string
	currencySymbol: string
}

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '')
	const bigint = parseInt(h, 16)
	return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255]
}

// ─────────────────────────────────────────────────────────────────────────────
// BLUETOOTH PRINTER CONFIG
//
// Step 1: Run this one-time in your browser console on the same page to find
//         the exact BLE name your AT-402 broadcasts:
//
//   navigator.bluetooth.requestDevice({ acceptAllDevices: true })
//     .then(d => console.log('Name:', d.name, '| ID:', d.id))
//
// Step 2: Replace the value below with whatever name was logged.
//         Common AT-402 names: 'Printer001', 'RPP02N', 'BT Printer', 'MTP-II'
//
// After the user picks the printer ONCE via the popup, the browser remembers
// the permission and getDevices() will return it on every subsequent call —
// no popup shown again.
// ─────────────────────────────────────────────────────────────────────────────
const PRINTER_NAME = 'Printer001' // ← change this to your actual printer BLE name

/**
 * Returns a connected BluetoothDevice for the thermal printer.
 *
 * Flow:
 *  1. Try getDevices() — returns previously permitted devices without any popup.
 *  2. If the printer is found, connect (or reuse existing connection) and return.
 *  3. If not found (first time), fall back to requestDevice() which shows the
 *     picker once. After the user selects it, the browser remembers permission
 *     so future calls skip the picker.
 */
async function getPrinter(commonServices: string[]): Promise<any> {
	if (typeof window === 'undefined' || !(navigator as any).bluetooth) {
		throw new Error(
			'Web Bluetooth is not supported on this browser or device. Please use Chrome or Edge.'
		)
	}

	// ── 1. Try to reuse a previously permitted device (no popup) ──────────────
	if (typeof (navigator as any).bluetooth.getDevices === 'function') {
		try {
			const devices: any[] = await (navigator as any).bluetooth.getDevices()
			console.log('[BT] Previously permitted devices returned by browser:', devices.map(d => ({ name: d.name, id: d.id })))
			
			const printer = devices.find((d) => 
				d.name && d.name.trim().toLowerCase() === PRINTER_NAME.trim().toLowerCase()
			)

			if (printer) {
				console.log('[BT] Found permitted printer in getDevices():', printer.name)
				// Reconnect if GATT dropped (e.g. printer was powered off and back on)
				if (!printer.gatt!.connected) {
					console.log('[BT] Connecting to printer GATT server...')
					await printer.gatt!.connect()
					console.log('[BT] GATT connected successfully.')
				}
				return printer
			} else {
				console.log(`[BT] No permitted device matches name "${PRINTER_NAME}"`)
			}
		} catch (e) {
			// getDevices() can throw if the Permissions Policy blocks it
			console.warn('[BT] getDevices() lookup failed, falling back to requestDevice():', e)
		}
	}

	// ── 2. First-time: show the picker so the user grants permission once ──────
	console.log('[BT] No permitted printer found — showing device picker')
	const device = await (navigator as any).bluetooth.requestDevice({
		filters: [{ name: PRINTER_NAME }],
		optionalServices: commonServices,
	})

	console.log('[BT] User selected printer:', device.name, '- connecting to GATT...')
	await device.gatt!.connect()
	console.log('[BT] GATT connected successfully.')
	return device
}

/**
 * Generates the PDF document natively using jsPDF.
 */
export async function generateBillPDF(config: BillConfig): Promise<any> {
	const { default: jsPDF } = await import('jspdf')

	const { order, template: t, tenantName, currencySymbol } = config
	const sym = currencySymbol === '\u20B9' ? 'Rs.' : currencySymbol

	const isThermal = t.type === 'thermal'
	const font = t.fontFamily === 'mono' ? 'courier' : 'helvetica'

	const W = 80
	const pad = isThermal ? 4 : 5
	const cw = W - pad * 2

	// Calculate height dynamically based on content
	const itemRowH = isThermal ? 4 : 5.5
	let estimatedH = pad // top padding
	estimatedH += t.showLogo ? 14 : 0
	estimatedH += isThermal ? 5 : 7 // header name
	estimatedH += t.taglineText ? 4 : 0
	estimatedH += (t.showAddress && t.addressText) ? 4 : 0
	estimatedH += (t.showPhone && t.phoneText) ? 4 : 0
	estimatedH += 5 // spacing + divider
	// meta rows
	let metaCount = 2 // order# + date
	if (t.showOrderType) metaCount++
	if (t.showTable && order.table_number) metaCount++
	if (order.customer_name) metaCount++
	if (order.payment_method) metaCount++
	estimatedH += metaCount * 4 + 5 // meta + divider
	estimatedH += 4 // items header
	estimatedH += order.order_items.length * itemRowH + 6 // items + divider
	estimatedH += 4 // subtotal
	estimatedH += (t.showTaxLine && order.tax > 0) ? 4 : 0
	estimatedH += (order.discount_amount && order.discount_amount > 0) ? 4 : 0
	estimatedH += 12 // total line + grand total
	estimatedH += 4 // divider
	estimatedH += (t.showThankYou && t.footerText) ? 8 : 0
	estimatedH += 6 // order id
	estimatedH += isThermal ? 6 : 0
	estimatedH += pad // bottom padding

	const H = Math.max(60, Math.ceil(estimatedH))

	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, H] })
	let y = pad

	const bgRgb = hexToRgb(t.bgColor)
	const txtRgb = hexToRgb(t.textColor)
	const mutRgb = hexToRgb(t.mutedColor)
	const priRgb = hexToRgb(t.primaryColor)
	const brdRgb = hexToRgb(t.borderColor)

	// Background fill
	doc.setFillColor(...bgRgb)
	doc.rect(0, 0, W, H, 'F')

	// ── Utility functions ────────────────────────────────────────────────────────

	const fmtAmt = (n: number) => `${sym} ${n.toFixed(2)}`

	const fmtDate = (iso: string) => {
		const d = new Date(iso)
		return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
			'  ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
	}

	// Strip emojis and non-latin characters that jsPDF default fonts can't render
	const safe = (text: string) => text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim()

	const divider = () => {
		if (!t.showBorderDivider) { y += 3; return }
		doc.setDrawColor(...brdRgb)
		doc.setLineWidth(0.15)
		doc.setLineDashPattern([1, 1], 0)
		doc.line(pad, y, pad + cw, y)
		doc.setLineDashPattern([], 0)
		y += 4
	}

	// ── HEADER ───────────────────────────────────────────────────────────────────

	const headerName = safe(t.headerText || tenantName)

	if (t.showLogo) {
		const r = 4
		doc.setFillColor(...priRgb)
		doc.circle(W / 2, y + r, r, 'F')
		doc.setFontSize(9)
		doc.setFont(font, 'bold')
		doc.setTextColor(255, 255, 255)
		doc.text(headerName.charAt(0).toUpperCase(), W / 2, y + r + 1.2, { align: 'center' })
		y += r * 2 + 3
	}

	// Name
	doc.setFontSize(isThermal ? 12 : 16)
	doc.setFont(font, 'bold')
	doc.setTextColor(...(isThermal ? txtRgb : priRgb))
	doc.text(headerName, W / 2, y, { align: 'center' })
	y += isThermal ? 5 : 7

	if (t.taglineText) {
		doc.setFontSize(7)
		doc.setFont(font, 'normal')
		doc.setTextColor(...mutRgb)
		doc.text(safe(t.taglineText), W / 2, y, { align: 'center' })
		y += 4
	}

	if (t.showAddress && t.addressText) {
		doc.setFontSize(7)
		doc.setFont(font, 'normal')
		doc.setTextColor(...mutRgb)
		doc.text(safe(t.addressText), W / 2, y, { align: 'center' })
		y += 4
	}

	if (t.showPhone && t.phoneText) {
		doc.setFontSize(7)
		doc.setFont(font, 'normal')
		doc.setTextColor(...mutRgb)
		doc.text(safe(t.phoneText), W / 2, y, { align: 'center' })
		y += 4
	}

	y += 1
	divider()

	// ── ORDER META ───────────────────────────────────────────────────────────────

	const metaRows: [string, string][] = [
		['Order #', `#${order.id.slice(0, 8).toUpperCase()}`],
		['Date', fmtDate(order.created_at)]
	]
	if (t.showOrderType) metaRows.push(['Type', order.order_type.replace('_', ' ')])
	if (t.showTable && order.table_number) metaRows.push(['Table', order.table_number])
	if (order.customer_name) metaRows.push(['Customer', safe(order.customer_name)])
	if (order.payment_method) metaRows.push(['Payment', safe(order.payment_method)])

	doc.setFontSize(7.5)
	metaRows.forEach(([label, value]) => {
		doc.setFont(font, 'normal')
		doc.setTextColor(...mutRgb)
		doc.text(label, pad, y)
		doc.setFont(font, 'bold')
		doc.setTextColor(...txtRgb)
		doc.text(value, pad + cw, y, { align: 'right' })
		y += 4
	})

	y += 1
	divider()

	// ── ITEMS HEADER ─────────────────────────────────────────────────────────────

	doc.setFontSize(6.5)
	doc.setFont(font, 'bold')
	doc.setTextColor(...mutRgb)

	if (isThermal) {
		doc.text('ITEM', pad, y)
		doc.text('TOTAL', pad + cw, y, { align: 'right' })
	} else {
		doc.text('ITEM', pad + 1, y)
		doc.text('QTY', pad + cw * 0.62, y)
		doc.text('AMOUNT', pad + cw, y, { align: 'right' })
	}
	y += 4

	// ── ITEMS ────────────────────────────────────────────────────────────────────

	const rowH = isThermal ? 4 : 5.5

	order.order_items.forEach((item, i) => {
		// Alternating stripe for WhatsApp style
		if (!isThermal && i % 2 === 0) {
			doc.setFillColor(...brdRgb)
			doc.roundedRect(pad, y - 2.8, cw, rowH, 1, 1, 'F')
		}

		// Truncate name to fit
		doc.setFontSize(7.5)
		doc.setFont(font, 'normal')
		let name = item.name
		const maxW = isThermal ? cw * 0.5 : cw * 0.5
		while (doc.getTextWidth(name) > maxW && name.length > 2) {
			name = name.slice(0, -1)
		}
		if (name !== item.name) name += '..'

		doc.setTextColor(...txtRgb)
		doc.text(name, pad + (isThermal ? 0 : 1), y)

		if (isThermal) {
			doc.setTextColor(...mutRgb)
			doc.setFontSize(7)
			doc.text(`${item.quantity} x ${fmtAmt(item.unit_price)}`, pad + cw * 0.5, y)
			doc.setTextColor(...txtRgb)
			doc.text(fmtAmt(item.total_price), pad + cw, y, { align: 'right' })
		} else {
			doc.setTextColor(...mutRgb)
			doc.text(item.quantity.toString(), pad + cw * 0.63, y)
			doc.setFont(font, 'bold')
			doc.setTextColor(...txtRgb)
			doc.text(fmtAmt(item.total_price), pad + cw, y, { align: 'right' })
		}

		y += rowH
	})

	y += 2
	divider()

	// ── TOTALS ───────────────────────────────────────────────────────────────────

	doc.setFontSize(8)

	// Subtotal
	doc.setFont(font, 'normal')
	doc.setTextColor(...mutRgb)
	doc.text('Subtotal', pad, y)
	doc.setTextColor(...txtRgb)
	doc.text(fmtAmt(order.subtotal), pad + cw, y, { align: 'right' })
	y += 4

	// Tax
	if (t.showTaxLine && order.tax > 0) {
		doc.setTextColor(...mutRgb)
		doc.text('Tax', pad, y)
		doc.setTextColor(...txtRgb)
		doc.text(fmtAmt(order.tax), pad + cw, y, { align: 'right' })
		y += 4
	}

	// Discount
	if (order.discount_amount && order.discount_amount > 0) {
		doc.setTextColor(16, 185, 129)
		doc.text('Discount', pad, y)
		doc.text(`- ${fmtAmt(order.discount_amount)}`, pad + cw, y, { align: 'right' })
		y += 4
	}

	// Total line
	y += 1
	doc.setDrawColor(...(isThermal ? txtRgb : priRgb))
	doc.setLineWidth(0.4)
	doc.setLineDashPattern([], 0)
	doc.line(pad, y, pad + cw, y)
	y += 5

	// Grand total
	doc.setFontSize(isThermal ? 11 : 14)
	doc.setFont(font, 'bold')
	doc.setTextColor(...txtRgb)
	doc.text('TOTAL', pad, y)
	doc.setTextColor(...(isThermal ? txtRgb : priRgb))
	doc.text(fmtAmt(order.total), pad + cw, y, { align: 'right' })
	y += isThermal ? 5 : 7

	divider()

	// ── FOOTER ───────────────────────────────────────────────────────────────────

	if (t.showThankYou && t.footerText) {
		y += 1
		doc.setFontSize(8)
		doc.setFont(font, 'normal')
		doc.setTextColor(...mutRgb)
		doc.text(safe(t.footerText), W / 2, y, { align: 'center' })
		y += 5
	}

	doc.setFontSize(6)
	doc.setFont(font, 'normal')
	doc.setTextColor(...brdRgb)
	doc.text(`Order: ${order.id.slice(0, 12)}`, W / 2, y, { align: 'center' })

	if (isThermal) {
		y += 4
		doc.setFontSize(6)
		doc.setTextColor(...brdRgb)
		const stars = '* '.repeat(Math.floor(cw / 3))
		doc.text(stars, W / 2, y, { align: 'center' })
	}

	return doc
}

/**
 * Generates a styled PDF bill, uploads to Supabase Storage, returns the public URL.
 */
export async function generateAndUploadBill(
	config: BillConfig,
	supabase: SupabaseClient,
	tenantId: string
): Promise<{ url: string; path: string }> {
	const doc = await generateBillPDF(config)
	const pdfBlob = doc.output('blob')

	const { order } = config
	const orderDate = new Date(order.created_at).toISOString().split('T')[0]
	const oid = order.id.slice(0, 8)
	const ts = Date.now()
	const path = `${tenantId}/${ts}_Bill_ORD-${oid}_${orderDate}.pdf`

	const { error: uploadError } = await supabase.storage
		.from('bills')
		.upload(path, pdfBlob, {
			contentType: 'application/pdf',
			upsert: true
		})

	if (uploadError) {
		throw new Error(`Storage upload failed: ${uploadError.message}`)
	}

	const { data: urlData } = supabase.storage.from('bills').getPublicUrl(path)
	return { url: urlData.publicUrl, path }
}

/**
 * Generates and prints the bill using browser printing via a hidden iframe.
 */
export async function printBill(config: BillConfig): Promise<void> {
	const doc = await generateBillPDF(config)
	const pdfBlob = doc.output('blob')
	const blobUrl = URL.createObjectURL(pdfBlob)

	const iframe = document.createElement('iframe')
	iframe.style.position = 'fixed'
	iframe.style.right = '0'
	iframe.style.bottom = '0'
	iframe.style.width = '0'
	iframe.style.height = '0'
	iframe.style.border = '0'
	iframe.src = blobUrl
	document.body.appendChild(iframe)

	iframe.onload = () => {
		iframe.contentWindow?.focus()
		iframe.contentWindow?.print()
		setTimeout(() => {
			document.body.removeChild(iframe)
			URL.revokeObjectURL(blobUrl)
		}, 1000)
	}
}

/**
 * Opens WhatsApp with formatted bill message.
 */
export function openWhatsApp(
	billUrl: string,
	customerPhone?: string | null,
	restaurantName?: string,
	tagline?: string,
	reviewLink?: string
) {
	const name = restaurantName || 'us'
	const tag = tagline || 'Good food, great moments'

	const lines = [
		`*${name}*`,
		`\u2022\u2060  - - - - - - - - - - - - - -`,
		`Thank you for dining with us!`,
		`We hope you loved your meal.`,
		``,
		`*Download your bill:*`,
		billUrl,
		`\u2022\u2060  - - - - - - - - - - - - - -`
	]

	if (reviewLink) {
		lines.push(``, `Enjoyed your experience?`, `A quick review means the world to us:`, reviewLink)
	}

	lines.push(``, `Visit us again soon!`, `*${name}*`, `_${tag}_`)

	const message = encodeURIComponent(lines.join('\n'))
	let waUrl: string
	if (customerPhone) {
		const cleaned = customerPhone.replace(/[^\d+]/g, '')
		waUrl = `https://wa.me/${cleaned}?text=${message}`
	} else {
		waUrl = `https://wa.me/?text=${message}`
	}

	// Use location.href for PWA standalone mode (window.open is blocked)
	const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
		(window.navigator as any).standalone === true

	if (isStandalone) {
		window.location.href = waUrl
	} else {
		window.open(waUrl, '_blank')
	}
}

/**
 * Generates raw ESC/POS commands from order details and prints to a BLE thermal printer.
 *
 * On first call: shows the browser device picker once so the user grants permission.
 * On subsequent calls: silently reconnects using getDevices() — no popup shown.
 */
export async function printBluetoothBill(config: BillConfig): Promise<void> {
	if (typeof window === 'undefined' || !(navigator as any).bluetooth) {
		throw new Error(
			'Web Bluetooth is not supported on this browser or device. Please use Chrome or Edge.'
		)
	}

	const commonServices = [
		'000018f0-0000-1000-8000-00805f9b34fb', // Standard BLE Printing
		'0000ff00-0000-1000-8000-00805f9b34fb', // Custom thermal printer service
		'0000af30-0000-1000-8000-00805f9b34fb',
		'e7e1a000-86f1-4a91-9128-520904ab0306'
	]

	// ── 1. Get printer (reuses existing permission, no popup after first time) ──
	const device = await getPrinter(commonServices)

	if (!device || !device.gatt) {
		throw new Error('No Bluetooth device found.')
	}

	// ── 2. Ensure GATT is connected ────────────────────────────────────────────
	// getPrinter already connects, but guard here in case something disconnected
	// between getPrinter returning and this line executing.
	const server = device.gatt.connected
		? device.gatt
		: await device.gatt.connect()

	// ── 3. Find writable characteristic ───────────────────────────────────────
	let service: any = null
	let characteristic: any = null

	for (const serviceUuid of commonServices) {
		try {
			service = await server.getPrimaryService(serviceUuid)
			if (service) {
				const characteristics = await service.getCharacteristics()
				for (const char of characteristics) {
					if (char.properties.write || char.properties.writeWithoutResponse) {
						characteristic = char
						break
					}
				}
				if (characteristic) break
			}
		} catch (e) {
			console.warn(`[BT] Service ${serviceUuid} not found or inaccessible.`)
		}
	}

	// Fallback: search all primary services
	if (!characteristic) {
		try {
			const services = await server.getPrimaryServices()
			for (const s of services) {
				const characteristics = await s.getCharacteristics()
				for (const char of characteristics) {
					if (char.properties.write || char.properties.writeWithoutResponse) {
						characteristic = char
						service = s
						break
					}
				}
				if (characteristic) break
			}
		} catch (e) {
			console.warn('[BT] Failed to query all primary services:', e)
		}
	}

	if (!characteristic) {
		throw new Error(
			'Could not find a writable characteristic on this Bluetooth device. Make sure it is a receipt printer.'
		)
	}

	// ── 4. Build ESC/POS receipt ───────────────────────────────────────────────
	const { order, template: t, tenantName, currencySymbol } = config
	const charWidth = 48
	const sym = (currencySymbol === '\u20B9' || currencySymbol === '₹') ? 'Rs' : currencySymbol
	const formatAmt = (n: number) => `${sym} ${n.toFixed(2)}`

	const encoder = new EscPosEncoder()
	encoder.initialize()

	// Header
	encoder.alignCenter()
	encoder.bold(true)
	encoder.sizeDouble()
	encoder.line(t.headerText || tenantName)
	encoder.sizeNormal()
	encoder.bold(false)

	if (t.taglineText) encoder.line(t.taglineText)
	if (t.showAddress && t.addressText) encoder.line(t.addressText)
	if (t.showPhone && t.phoneText) encoder.line(t.phoneText)

	encoder.divider(charWidth)

	// Order meta
	encoder.alignLeft()
	encoder.row('Order #', `#${order.id.slice(0, 8).toUpperCase()}`, charWidth)

	const formatDate = (iso: string) => {
		const d = new Date(iso)
		return (
			d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
			' ' +
			d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
		)
	}
	encoder.row('Date', formatDate(order.created_at), charWidth)

	if (t.showOrderType) encoder.row('Type', order.order_type.replace('_', ' ').toUpperCase(), charWidth)
	if (t.showTable && order.table_number) encoder.row('Table', order.table_number, charWidth)
	if (order.customer_name) encoder.row('Customer', order.customer_name, charWidth)
	if (order.payment_method) encoder.row('Payment', order.payment_method.toUpperCase(), charWidth)

	encoder.divider(charWidth)

	// Items header
	encoder.bold(true)
	encoder.threeColumnRow('ITEM', 'QTY', 'AMOUNT', charWidth)
	encoder.bold(false)
	encoder.divider(charWidth)

	// Items
	order.order_items.forEach((item) => {
		encoder.itemRow(item.name, item.quantity, formatAmt(item.total_price), charWidth)
	})

	encoder.divider(charWidth)

	// Totals
	if (t.showTaxLine && order.tax > 0) encoder.row('Tax', formatAmt(order.tax), charWidth)
	if (order.discount_amount && order.discount_amount > 0) {
		encoder.row('Discount', `-${formatAmt(order.discount_amount)}`, charWidth)
	}

	encoder.bold(true)
	encoder.row('TOTAL', formatAmt(order.total), charWidth)
	encoder.bold(false)

	encoder.divider(charWidth)

	// UPI QR if unpaid
	if (!order.payment_method) {
		encoder.alignCenter()
		encoder.bold(true)
		encoder.line('SCAN TO PAY VIA UPI')
		encoder.bold(false)
		encoder.line('UPI ID: pizzeriadacafe@kotak')
		encoder.line(`Amount: ${formatAmt(order.total)}`)
		encoder.line()

		const upiUrl = `upi://pay?pa=pizzeriadacafe@kotak&pn=Pizzeria%20Da%20Cafe&am=${order.total.toFixed(2)}&cu=INR`
		encoder.qrcode(upiUrl)
		encoder.line()
		encoder.divider(charWidth)
	}

	// Footer
	if (t.showThankYou && t.footerText) {
		encoder.alignCenter()
		encoder.line(t.footerText)
	}

	encoder.alignCenter()
	encoder.line(`ID: ${order.id.slice(0, 12)}`)

	if (t.type === 'thermal') {
		encoder.line('* '.repeat(Math.floor(charWidth / 2)))
	}

	encoder.cut()

	// ── 5. Send in BLE-safe chunks (max 20 bytes per write) ───────────────────
	const data = encoder.encode()
	const chunkSize = 20
	for (let offset = 0; offset < data.length; offset += chunkSize) {
		const chunk = data.slice(offset, offset + chunkSize)
		await characteristic.writeValue(chunk)
	}
}