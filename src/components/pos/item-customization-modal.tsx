'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Minus, Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

type MenuItemVariant = {
	id: string
	name: string
	price_modifier: number
	is_default: boolean
}

type Topping = {
	id: string
	name: string
	price: number
	description: string | null
}

type MenuItemTopping = {
	topping: Array<Topping> | Topping | null
}

type MenuItem = {
	id: string
	name: string
	description: string | null
	base_price: number
	menu_item_variants: MenuItemVariant[]
	menu_item_toppings: MenuItemTopping[]
}

type SelectedTopping = { id: string; name: string; price: number }

type ItemCustomizationModalProps = {
	item: MenuItem | null
	isOpen: boolean
	onClose: () => void
	onAdd: (item: {
		menuItemId: string
		name: string
		variant: MenuItemVariant | null
		toppings: SelectedTopping[]
		quantity: number
		basePrice: number
	}) => void
	currencySymbol: string
}

export function ItemCustomizationModal({
	item,
	isOpen,
	onClose,
	onAdd,
	currencySymbol
}: ItemCustomizationModalProps) {
	const [selectedVariant, setSelectedVariant] =
		useState<MenuItemVariant | null>(null)
	const [selectedToppings, setSelectedToppings] = useState<SelectedTopping[]>([])
	const [quantity, setQuantity] = useState(1)

	if (!item) return null

	// Initialize default variant
	if (!selectedVariant && item.menu_item_variants.length > 0) {
		const defaultVariant =
			item.menu_item_variants.find((v) => v.is_default) ||
			item.menu_item_variants[0]
		setSelectedVariant(defaultVariant)
	}

	const availableToppings = item.menu_item_toppings
		.map((entry) => {
			const toppingCandidates = entry.topping as
				| Array<Topping>
				| Topping
				| null
				| undefined
			return Array.isArray(toppingCandidates)
				? toppingCandidates[0]
				: toppingCandidates
		})
		.filter((t): t is Topping => t !== null && t !== undefined)

	const toggleTopping = (topping: Topping) => {
		setSelectedToppings((prev) => {
			const exists = prev.find((t) => t.id === topping.id)
			if (exists) return prev.filter((t) => t.id !== topping.id)
			return [...prev, { id: topping.id, name: topping.name, price: topping.price }]
		})
	}

	const fmt = (n: number) => `${currencySymbol}${n.toFixed(0)}`
	const variantPrice = selectedVariant?.price_modifier || 0
	const toppingsPrice = selectedToppings.reduce((sum, t) => sum + t.price, 0)
	const totalPrice = (item.base_price + variantPrice + toppingsPrice) * quantity

	const handleAdd = () => {
		onAdd({
			menuItemId: item.id,
			name: item.name,
			variant: selectedVariant,
			toppings: selectedToppings,
			quantity,
			basePrice: item.base_price
		})
		onClose()
		setSelectedVariant(
			item.menu_item_variants.find((v) => v.is_default) ||
				item.menu_item_variants[0] ||
				null
		)
		setSelectedToppings([])
		setQuantity(1)
	}

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
						className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
					/>
					<motion.div
						initial={{ opacity: 0, y: '100%' }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: '100%' }}
						transition={{ type: 'spring', damping: 30, stiffness: 320 }}
						className="fixed inset-x-0 bottom-0 z-50 flex h-[58vh] w-full flex-col overflow-hidden rounded-t-[28px] border-t border-white/10 bg-[#0a0a0a] shadow-[0_-24px_70px_rgba(0,0,0,0.7)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-[400px] sm:max-h-[calc(100vh-3rem)] sm:w-[580px] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:border"
					>
						{/* Background: chef-panda image with smoke vignette — content floats above it */}
						<div className="pointer-events-none absolute inset-0 overflow-hidden">
							<div className="absolute bottom-0 left-0 h-[70%] w-[52%] sm:w-[38%]">
								<Image
									src="/menu_bg.png"
									alt=""
									fill
									priority
									sizes="320px"
									className="object-contain object-left-bottom"
								/>
							</div>
							{/* warm glow under the panda */}
							<div
								className="absolute inset-0"
								style={{
									background:
										'radial-gradient(44% 36% at 25% 86%, rgba(224,52,42,0.22) 0%, rgba(224,52,42,0) 60%)'
								}}
							/>
							{/* smoke: mute the image so the elements above stay readable, fade into the bg */}
							<div
								className="absolute inset-0"
								style={{
									background:
										'linear-gradient(to top, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.1) 14%, rgba(10,10,10,0.45) 36%, #0a0a0a 74%), ' +
										'radial-gradient(80% 70% at 26% 84%, rgba(10,10,10,0) 24%, rgba(10,10,10,0.5) 70%, #0a0a0a 100%)'
								}}
							/>
						</div>

						{/* Content — floats above the image, full width */}
						<div className="relative z-10 flex h-full min-h-0 w-full flex-col">
							{/* Mobile grab handle */}
							<div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />

							{/* Header: item name + quantity counter on one full-width row */}
							<div className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-4">
								<div className="min-w-0 flex-1">
									<h2 className="truncate text-lg font-semibold text-white">{item.name}</h2>
									<p className="mt-0.5 text-sm text-white/40">Base {fmt(item.base_price)}</p>
								</div>
								<div className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-0.5">
									<button
										onClick={() => setQuantity((q) => Math.max(1, q - 1))}
										className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
									>
										<Minus className="h-3.5 w-3.5" />
									</button>
									<span className="w-7 text-center text-sm font-semibold tabular-nums text-white">
										{quantity}
									</span>
									<button
										onClick={() => setQuantity((q) => q + 1)}
										className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
									>
										<Plus className="h-3.5 w-3.5" />
									</button>
								</div>
								<button
									onClick={onClose}
									className="shrink-0 text-white/40 transition hover:text-white"
								>
									<X className="h-5 w-5" />
								</button>
							</div>

							{/* Description */}
							{item.description && (
								<p className="shrink-0 px-5 pb-3 text-sm leading-relaxed text-white/50">
									{item.description}
								</p>
							)}

						{/* Scrollable body */}
						<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-4">
							{/* Variants */}
							{item.menu_item_variants.length > 0 && (
								<div>
									<p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
										Variant
									</p>
									<div className="flex flex-wrap gap-1.5">
										{item.menu_item_variants.map((variant) => {
											const isSel = selectedVariant?.id === variant.id
											return (
												<button
													key={variant.id}
													onClick={() => setSelectedVariant(variant)}
													className={cn(
														'rounded-full border px-3 py-1.5 text-xs font-medium transition',
														isSel
															? 'border-[#E0342A] bg-[#E0342A] text-white'
															: 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20 hover:text-white'
													)}
												>
													{variant.name}
													{variant.price_modifier !== 0 && (
														<span className="ml-1 opacity-70">
															{variant.price_modifier > 0 ? '+' : '−'}
															{fmt(Math.abs(variant.price_modifier))}
														</span>
													)}
												</button>
											)
										})}
									</div>
								</div>
							)}

							{/* Add-ons — searchable multi-select */}
							{availableToppings.length > 0 && (
								<AddOnsSelect
									toppings={availableToppings}
									selectedToppings={selectedToppings}
									toggleTopping={toggleTopping}
									currencySymbol={currencySymbol}
								/>
							)}

						</div>

						{/* Footer */}
						<div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
							<div>
								<p className="text-[11px] text-white/40">Total</p>
								<p className="text-xl font-bold tabular-nums text-white">{fmt(totalPrice)}</p>
							</div>
							<button
								onClick={handleAdd}
								className="flex items-center gap-2 rounded-2xl bg-[#E0342A] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgba(224,52,42,0.7)] transition hover:bg-[#C42A21]"
							>
								<Plus className="h-4 w-4" />
								Add to cart
							</button>
						</div>
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	)
}

function AddOnsSelect({
	toppings,
	selectedToppings,
	toggleTopping,
	currencySymbol
}: {
	toppings: Topping[]
	selectedToppings: SelectedTopping[]
	toggleTopping: (topping: Topping) => void
	currencySymbol: string
}) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const ref = useRef<HTMLDivElement>(null)

	// Close the dropdown when clicking outside of it
	useEffect(() => {
		if (!open) return
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false)
			}
		}
		document.addEventListener('mousedown', handler)
		return () => document.removeEventListener('mousedown', handler)
	}, [open])

	const fmt = (n: number) => `${currencySymbol}${n.toFixed(0)}`
	const q = query.trim().toLowerCase()
	const filtered = q
		? toppings.filter((t) => t.name.toLowerCase().includes(q))
		: toppings

	return (
		<div>
			<p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
				Add-ons
				{selectedToppings.length > 0 && (
					<span className="rounded-full bg-[#E0342A]/15 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-[#E0342A]">
						{selectedToppings.length}
					</span>
				)}
			</p>

			{/* Selected chips */}
			{selectedToppings.length > 0 && (
				<div className="mb-2 flex flex-wrap gap-1.5">
					{selectedToppings.map((t) => (
						<span
							key={t.id}
							className="flex items-center gap-1 rounded-full bg-[#E0342A]/15 py-0.5 pl-2.5 pr-1.5 text-xs text-[#E0342A]"
						>
							{t.name}
							<button
								onClick={() =>
									toggleTopping(
										toppings.find((tp) => tp.id === t.id) || {
											id: t.id,
											name: t.name,
											price: t.price,
											description: null
										}
									)
								}
								className="rounded-full p-0.5 hover:bg-[#E0342A]/20"
							>
								<X className="h-3 w-3" />
							</button>
						</span>
					))}
				</div>
			)}

			{/* Searchable dropdown */}
			<div
				ref={ref}
				className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]"
			>
				<div className="flex items-center gap-2 px-3 py-2.5">
					<Search className="h-4 w-4 shrink-0 text-white/30" />
					<input
						value={query}
						onChange={(e) => {
							setQuery(e.target.value)
							setOpen(true)
						}}
						onFocus={() => setOpen(true)}
						placeholder="Search add-ons…"
						className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
					/>
					<button
						onClick={() => setOpen((o) => !o)}
						className="shrink-0 text-white/40 transition hover:text-white"
					>
						<ChevronDown
							className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
						/>
					</button>
				</div>

				{open && (
					<div className="max-h-40 space-y-0.5 overflow-y-auto border-t border-white/[0.06] p-1.5">
						{filtered.length === 0 ? (
							<p className="py-6 text-center text-xs text-white/30">No add-ons found</p>
						) : (
							filtered.map((topping) => {
								const isSel = selectedToppings.some((t) => t.id === topping.id)
								return (
									<button
										key={topping.id}
										onClick={() => toggleTopping(topping)}
										className={cn(
											'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition',
											isSel ? 'bg-[#E0342A]/10' : 'hover:bg-white/5'
										)}
									>
										<span className="flex min-w-0 items-center gap-2.5">
											<span
												className={cn(
													'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
													isSel
														? 'border-[#E0342A] bg-[#E0342A]'
														: 'border-white/25'
												)}
											>
												{isSel && <Check className="h-2.5 w-2.5 text-white" />}
											</span>
											<span className="truncate text-sm text-white">{topping.name}</span>
										</span>
										<span className="shrink-0 text-xs tabular-nums text-white/45">
											+{fmt(topping.price)}
										</span>
									</button>
								)
							})
						)}
					</div>
				)}
			</div>
		</div>
	)
}
