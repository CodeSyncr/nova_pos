'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
	Minus,
	Plus,
	Table as TableIcon,
	User,
	CheckCircle2,
	ShoppingCart
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = {
	id: string
	name: string
	price_modifier: number
	is_default: boolean
}

type CartItem = {
	id: string
	menuItemId: string
	name: string
	variant: Variant | null
	toppings: Array<{ id: string; name: string; price: number }>
	quantity: number
	basePrice: number
}

type TableT = {
	id: string
	number: string
	status: 'available' | 'occupied' | 'reserved'
	guests: number
	orderId: string | null
}

type OrderType = 'dine_in' | 'takeaway' | 'delivery'

type OrderCartProps = {
	cart: CartItem[]
	currencySymbol: string
	taxRate: number
	subtotal: number
	tax: number
	total: number
	orderType: OrderType
	setOrderType: (t: OrderType) => void
	selectedTable: TableT | null
	setSelectedTable: (t: TableT | null) => void
	availableTables: TableT[]
	occupiedTables: TableT[]
	customerName: string
	setCustomerName: (v: string) => void
	customerPhone: string
	setCustomerPhone: (v: string) => void
	customerExists: boolean
	isPlacingOrder: boolean
	onPlaceOrder: () => void
	removeFromCart: (id: string) => void
	updateCartItem: (id: string, updates: { quantity: number }) => void
}

const ORDER_TYPES: { id: OrderType; label: string }[] = [
	{ id: 'dine_in', label: 'Dine in' },
	{ id: 'takeaway', label: 'Takeaway' },
	{ id: 'delivery', label: 'Delivery' }
]

export function OrderCart({
	cart,
	currencySymbol,
	taxRate,
	subtotal,
	tax,
	total,
	orderType,
	setOrderType,
	selectedTable,
	setSelectedTable,
	availableTables,
	occupiedTables,
	customerName,
	setCustomerName,
	customerPhone,
	setCustomerPhone,
	customerExists,
	isPlacingOrder,
	onPlaceOrder,
	removeFromCart,
	updateCartItem
}: OrderCartProps) {
	const fmt = (n: number) => `${currencySymbol}${n.toFixed(0)}`

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
				{/* Order type */}
				<div>
					<p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
						Order type
					</p>
					<div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-1">
						{ORDER_TYPES.map((t) => (
							<button
								key={t.id}
								onClick={() => {
									setOrderType(t.id)
									if (t.id !== 'dine_in') setSelectedTable(null)
								}}
								className={cn(
									'rounded-xl py-2 text-xs font-medium transition',
									orderType === t.id
										? 'bg-[#E0342A] text-white'
										: 'text-white/50 hover:text-white'
								)}
							>
								{t.label}
							</button>
						))}
					</div>
				</div>

				{/* Table (dine-in only) — compact single-row picker */}
				{orderType === 'dine_in' && (
					<div>
						<p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
							<TableIcon className="h-3 w-3" /> Table{' '}
							{!selectedTable && <span className="text-[#E0342A]">*</span>}
						</p>
						<div className="flex gap-1.5 overflow-x-auto pb-0.5">
							{[...occupiedTables, ...availableTables].map((t) => {
								const isSel = selectedTable?.id === t.id
								return (
									<button
										key={t.id}
										onClick={() => setSelectedTable(isSel ? null : t)}
										className={cn(
											'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition',
											isSel
												? 'border-[#E0342A] bg-[#E0342A] text-white'
												: t.status === 'occupied'
													? 'border-[#E0342A]/25 bg-[#E0342A]/[0.08] text-white/90 hover:border-[#E0342A]/50'
													: 'border-white/[0.08] bg-white/[0.02] text-white/70 hover:border-white/20 hover:text-white'
										)}
									>
										{t.number}
									</button>
								)
							})}
						</div>
					</div>
				)}

				{/* Items */}
				{cart.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 py-14 text-center">
						<ShoppingCart className="h-7 w-7 text-white/20" />
						<p className="text-sm text-white/40">Your cart is empty</p>
						<p className="text-xs text-white/25">Tap menu items to add them</p>
					</div>
				) : (
					<div className="space-y-2">
						<AnimatePresence initial={false}>
							{cart.map((item) => {
								const variantPrice = item.variant?.price_modifier || 0
								const toppingsPrice = item.toppings.reduce((s, t) => s + t.price, 0)
								const itemPrice =
									(item.basePrice + variantPrice + toppingsPrice) * item.quantity
								const sub = [
									item.variant?.name,
									item.toppings.length > 0
										? `${item.toppings.length} add-on${item.toppings.length > 1 ? 's' : ''}`
										: null
								]
									.filter(Boolean)
									.join(' · ')
								return (
									<motion.div
										key={item.id}
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
									>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium text-white">{item.name}</p>
											{sub && <p className="truncate text-[11px] text-white/40">{sub}</p>}
										</div>
										<div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-0.5">
											<button
												onClick={() =>
													item.quantity <= 1
														? removeFromCart(item.id)
														: updateCartItem(item.id, { quantity: item.quantity - 1 })
												}
												className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
											>
												<Minus className="h-3 w-3" />
											</button>
											<span className="w-5 text-center text-xs font-semibold tabular-nums text-white">
												{item.quantity}
											</span>
											<button
												onClick={() =>
													updateCartItem(item.id, { quantity: item.quantity + 1 })
												}
												className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
											>
												<Plus className="h-3 w-3" />
											</button>
										</div>
										<p className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-white">
											{fmt(itemPrice)}
										</p>
									</motion.div>
								)
							})}
						</AnimatePresence>
					</div>
				)}

				{/* Customer — phone first; name auto-fills for returning customers */}
				{cart.length > 0 && (
					<div>
						<p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
							<User className="h-3 w-3" /> Customer
							{customerExists ? (
								<span className="font-normal normal-case tracking-normal text-[#E0342A]">
									· returning
								</span>
							) : (
								<span className="font-normal normal-case tracking-normal text-white/25">
									· optional
								</span>
							)}
						</p>
						<div className="grid grid-cols-2 gap-2">
							<input
								value={customerPhone}
								onChange={(e) => setCustomerPhone(e.target.value)}
								placeholder="Phone"
								type="tel"
								className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#E0342A]/40"
							/>
							<input
								value={customerName}
								onChange={(e) => setCustomerName(e.target.value)}
								placeholder="Name"
								className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#E0342A]/40"
							/>
						</div>
					</div>
				)}
			</div>

			{/* Footer — summary + CTA */}
			{cart.length > 0 && (
				<div className="shrink-0 border-t border-white/[0.06] px-5 py-4">
					<div className="space-y-1.5">
						{taxRate > 0 && (
							<div className="flex justify-between text-sm text-white/50">
								<span>Tax ({taxRate}%)</span>
								<span className="tabular-nums">{fmt(tax)}</span>
							</div>
						)}
						<div className="flex items-baseline justify-between pt-1">
							<span className="text-sm font-medium text-white">Total</span>
							<span className="text-2xl font-bold tabular-nums text-white">{fmt(total)}</span>
						</div>
					</div>
					<button
						onClick={onPlaceOrder}
						disabled={isPlacingOrder || (orderType === 'dine_in' && !selectedTable)}
						className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#E0342A] py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgba(224,52,42,0.7)] transition hover:bg-[#C42A21] disabled:cursor-not-allowed disabled:opacity-50"
					>
						<CheckCircle2 className="h-4 w-4" />
						{isPlacingOrder ? 'Placing order…' : 'Place order'}
					</button>
					{orderType === 'dine_in' && !selectedTable && (
						<p className="mt-2 text-center text-[11px] text-[#E0342A]">
							Select a table to continue
						</p>
					)}
				</div>
			)}
		</div>
	)
}
