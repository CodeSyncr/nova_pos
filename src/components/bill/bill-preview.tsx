'use client'

import { useState } from 'react'
import type { BillTemplate } from '@/lib/bill-template'
import type { BillOrderData } from '@/lib/bill-generator'

type Props = {
	template: BillTemplate
	order: BillOrderData
	tenantName: string
	currencySymbol: string
	reviewLink?: string
	/** Used by the generator to find the element. Must be unique per order. */
	id?: string
	/** Scale for display purposes (not applied when capturing) */
	scale?: number
}

function fmt(n: number, sym: string) {
	return `${sym}${n.toFixed(2)}`
}

function fmtDate(iso: string) {
	return new Date(iso).toLocaleString('en-IN', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	})
}

export function BillPreview({ template: t, order, tenantName, currencySymbol, reviewLink, id, scale = 1 }: Props) {
	const [logoFailed, setLogoFailed] = useState(false)
	const ff = t.fontFamily === 'mono' ? 'font-family: "Courier New", Courier, monospace;' : 'font-family: Inter, system-ui, sans-serif;'
	const isThermal = t.type === 'thermal'
	const divider = t.showBorderDivider
		? `border-top: 1px dashed ${t.borderColor}; margin: 10px 0;`
		: `border-top: none; margin: 10px 0;`

	const headerName = t.headerText || tenantName

	return (
		<div
			id={id}
			style={{
				width: `${t.canvasWidth}px`,
				backgroundColor: t.bgColor,
				color: t.textColor,
				transform: `scale(${scale})`,
				transformOrigin: 'top left',
				padding: isThermal ? '16px 12px' : '24px',
				boxSizing: 'border-box',
				fontFamily: t.fontFamily === 'mono' ? '"Courier New", Courier, monospace' : 'Inter, system-ui, sans-serif',
				fontSize: isThermal ? '12px' : '13px',
				lineHeight: '1.5'
			}}
		>
			{/* Header */}
			<div style={{ textAlign: 'center', marginBottom: '16px' }}>
				{t.showLogo && (
					!logoFailed ? (
						<img 
							src={isThermal ? "/favicon.png" : "/logo.png"} 
							alt="Logo" 
							style={{
								width: '48px',
								height: '48px',
								objectFit: 'contain',
								margin: '0 auto 8px',
								display: 'block'
							}} 
							onError={() => setLogoFailed(true)}
						/>
					) : (
						<div style={{
							width: '48px', height: '48px', borderRadius: '50%',
							background: `linear-gradient(135deg, ${t.primaryColor}, ${t.accentColor})`,
							margin: '0 auto 8px',
							display: 'flex', alignItems: 'center', justifyContent: 'center',
							color: '#fff', fontWeight: 700, fontSize: '18px'
						}}>
							{headerName.charAt(0).toUpperCase()}
						</div>
					)
				)}
				<div style={{
					fontSize: isThermal ? '16px' : '22px',
					fontWeight: 700,
					color: isThermal ? t.textColor : t.primaryColor,
					letterSpacing: isThermal ? '0.05em' : '0',
					textTransform: isThermal ? 'uppercase' : 'none'
				}}>
					{headerName}
				</div>
				{t.taglineText && (
					<div style={{ color: t.mutedColor, fontSize: '11px', marginTop: '2px' }}>
						{t.taglineText}
					</div>
				)}
				{t.showAddress && t.addressText && (
					<div style={{ color: t.mutedColor, fontSize: '11px', marginTop: '4px' }}>
						{t.addressText}
					</div>
				)}
				{t.showPhone && t.phoneText && (
					<div style={{ color: t.mutedColor, fontSize: '11px' }}>
						📞 {t.phoneText}
					</div>
				)}
			</div>

			{/* Divider */}
			<div style={{ borderTop: `1px dashed ${t.borderColor}`, margin: '10px 0' }} />

			{/* Order Meta */}
			<div style={{ marginBottom: '12px' }}>
				{[
					['Order #', `#${order.id.slice(0, 8).toUpperCase()}`],
					['Date', fmtDate(order.created_at)],
					...(t.showOrderType ? [['Type', order.order_type.replace('_', ' ')]] : []),
					...(t.showTable && order.table_number ? [['Table', order.table_number]] : []),
					...(order.customer_name ? [['Customer', order.customer_name]] : []),
					...(order.payment_method ? [['Payment', order.payment_method]] : [])
				].map(([label, value]) => (
					<div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
						<span style={{ color: t.mutedColor }}>{label}</span>
						<span style={{ color: t.textColor, fontWeight: 500, textTransform: 'capitalize' }}>{value}</span>
					</div>
				))}
			</div>

			{/* Divider */}
			<div style={{ borderTop: `1px dashed ${t.borderColor}`, margin: '10px 0' }} />

			{/* Items */}
			<div style={{ marginBottom: '12px' }}>
				{isThermal ? (
					// Thermal: compact fixed-width layout
					<>
						<div style={{ display: 'flex', justifyContent: 'space-between', color: t.mutedColor, fontSize: '10px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
							<span>Item</span>
							<span>Qty × Price = Total</span>
						</div>
						{order.order_items.map((item) => (
							<div key={item.id} style={{ marginBottom: '5px' }}>
								<div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
									<span style={{ flex: '1', minWidth: 0, marginRight: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
									<span style={{ whiteSpace: 'nowrap', color: t.mutedColor, fontSize: '11px' }}>
										{item.quantity} × {fmt(item.unit_price, currencySymbol)} = {fmt(item.total_price, currencySymbol)}
									</span>
								</div>
							</div>
						))}
					</>
				) : (
					// WhatsApp: full row with background
					<>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 12px', color: t.mutedColor, fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px' }}>
							<span>Item</span>
							<span style={{ textAlign: 'center' }}>Qty</span>
							<span style={{ textAlign: 'right' }}>Amount</span>
						</div>
						{order.order_items.map((item, i) => (
							<div key={item.id} style={{
								display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 12px',
								padding: '8px', borderRadius: '6px',
								backgroundColor: i % 2 === 0 ? `${t.borderColor}60` : 'transparent',
								marginBottom: '3px'
							}}>
								<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
								<span style={{ textAlign: 'center', color: t.mutedColor }}>{item.quantity}</span>
								<span style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(item.total_price, currencySymbol)}</span>
							</div>
						))}
					</>
				)}
			</div>

			{/* Divider */}
			<div style={{ borderTop: `1px dashed ${t.borderColor}`, margin: '10px 0' }} />

			{/* Totals */}
			<div style={{ marginBottom: '8px' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
					<span style={{ color: t.mutedColor }}>Subtotal</span>
					<span>{fmt(order.subtotal, currencySymbol)}</span>
				</div>
				{t.showTaxLine && order.tax > 0 && (
					<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
						<span style={{ color: t.mutedColor }}>Tax</span>
						<span>{fmt(order.tax, currencySymbol)}</span>
					</div>
				)}
				{(order.discount_amount ?? 0) > 0 && (
					<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
						<span style={{ color: '#10B981' }}>Discount</span>
						<span style={{ color: '#10B981' }}>-{fmt(order.discount_amount!, currencySymbol)}</span>
					</div>
				)}
			</div>

			{/* Total */}
			<div style={{
				display: 'flex', justifyContent: 'space-between', alignItems: 'center',
				borderTop: `2px solid ${isThermal ? t.textColor : t.primaryColor}`,
				paddingTop: '10px', marginTop: '4px'
			}}>
				<span style={{ fontWeight: 700, fontSize: isThermal ? '14px' : '18px', textTransform: 'uppercase' }}>Total</span>
				<span style={{
					fontWeight: 700,
					fontSize: isThermal ? '16px' : '22px',
					color: isThermal ? t.textColor : t.primaryColor
				}}>
					{fmt(order.total, currencySymbol)}
				</span>
			</div>

			{/* Footer */}
			{t.showThankYou && t.footerText && (
				<>
					<div style={{ borderTop: `1px dashed ${t.borderColor}`, margin: '14px 0 10px' }} />
					<div style={{ textAlign: 'center', color: t.mutedColor, fontSize: '12px' }}>
						{t.footerText}
					</div>
				</>
			)}

			{isThermal && order.status === 'completed' && reviewLink && (
				<div style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					marginTop: '16px',
					textAlign: 'center'
				}}>
					<div style={{ fontWeight: 700, fontSize: '11px', color: t.textColor, marginBottom: '6px' }}>
						LEAVE US A GOOGLE REVIEW
					</div>
					<img
						src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(reviewLink)}`}
						alt="Google Review QR"
						style={{
							width: '80px',
							height: '80px',
							backgroundColor: '#FFFFFF',
							padding: '4px',
							border: `1px solid ${t.borderColor}`
						}}
					/>
				</div>
			)}

			{isThermal && (
				<div style={{ textAlign: 'center', marginTop: '8px', fontSize: '10px', color: t.borderColor }}>
					{'* '.repeat(Math.floor(t.canvasWidth / 12))}
				</div>
			)}
		</div>
	)
}
