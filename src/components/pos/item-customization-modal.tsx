'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

type ItemCustomizationModalProps = {
	item: MenuItem | null
	isOpen: boolean
	onClose: () => void
	onAdd: (item: {
		menuItemId: string
		name: string
		variant: MenuItemVariant | null
		toppings: Array<{ id: string; name: string; price: number }>
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
	const [selectedToppings, setSelectedToppings] = useState<
		Array<{ id: string; name: string; price: number }>
	>([])
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
			if (exists) {
				return prev.filter((t) => t.id !== topping.id)
			}
			return [
				...prev,
				{ id: topping.id, name: topping.name, price: topping.price }
			]
		})
	}

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
		// Reset state
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
						transition={{ type: 'spring', damping: 30, stiffness: 300 }}
						className="fixed bottom-0 left-0 right-0 z-50 max-h-[90vh] w-full overflow-y-auto rounded-t-[32px] border-t border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-4 shadow-[0_-20px_60px_rgba(3,5,18,0.85)] sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-h-[85vh] sm:w-[95vw] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[40px] sm:border sm:border-white/10 sm:p-6 md:p-8"
					>
						{/* Mobile: Drawer Handle */}
						<div className="mx-auto mb-4 h-1 w-12 rounded-full bg-white/20 sm:hidden" />
						
						<div className="flex items-start justify-between gap-3">
							<div className="flex-1 min-w-0">
								<h2 className="text-lg font-semibold text-white sm:text-xl md:text-2xl">
									{item.name}
								</h2>
								{item.description && (
									<p className="mt-1.5 text-xs text-white/60 sm:mt-2 sm:text-sm md:text-base">{item.description}</p>
								)}
							</div>
							<Button
								size="icon"
								variant="ghost"
								onClick={onClose}
								className="flex-shrink-0 rounded-full h-8 w-8 sm:h-10 sm:w-10"
							>
								<X className="h-4 w-4 sm:h-5 sm:w-5" />
							</Button>
						</div>

						<div className="mt-4 space-y-4 sm:mt-6 sm:space-y-6">
							{/* Variants */}
							{item.menu_item_variants.length > 0 && (
								<div>
									<p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-white/70">
										Choose Variant
									</p>
									<div className="grid gap-2 sm:gap-3">
										{item.menu_item_variants.map((variant) => (
											<motion.button
												key={variant.id}
												whileHover={{ scale: 1.02 }}
												whileTap={{ scale: 0.98 }}
												onClick={() => setSelectedVariant(variant)}
												className={cn(
													'flex items-center justify-between rounded-xl border p-3 transition sm:rounded-2xl sm:p-4',
													selectedVariant?.id === variant.id
														? 'border-white/40 bg-white/10'
														: 'border-white/10 bg-white/5 hover:border-white/20'
												)}
											>
												<div className="flex items-center gap-3">
													<div
														className={cn(
															'flex h-5 w-5 items-center justify-center rounded-full border-2',
															selectedVariant?.id === variant.id
																? 'border-white bg-white'
																: 'border-white/30'
														)}
													>
														{selectedVariant?.id === variant.id && (
															<Check className="h-3 w-3 text-[#121633]" />
														)}
													</div>
													<div className="text-left">
														<p className="font-semibold text-white">
															{variant.name}
														</p>
														{variant.price_modifier !== 0 && (
															<p className="text-xs text-white/60">
																{variant.price_modifier > 0 ? '+' : ''}
																{currencySymbol}
																{Math.abs(variant.price_modifier).toFixed(2)}
															</p>
														)}
													</div>
												</div>
												{variant.is_default && (
													<Badge className="border-white/20 bg-white/10 text-white/80">
														Default
													</Badge>
												)}
											</motion.button>
										))}
									</div>
								</div>
							)}

							{/* Add Ons - Collapsible */}
							{availableToppings.length > 0 && (
								<AddOnsAccordion
									toppings={availableToppings}
									selectedToppings={selectedToppings}
									toggleTopping={toggleTopping}
									currencySymbol={currencySymbol}
								/>
							)}

							{/* Quantity */}
							<div>
								<p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-white/70">
									Quantity
								</p>
								<div className="flex items-center gap-3 sm:gap-4">
									<Button
										size="icon"
										variant="ghost"
										onClick={() => setQuantity(Math.max(1, quantity - 1))}
										className="h-9 w-9 sm:h-10 sm:w-10"
									>
										<X className="h-4 w-4" />
									</Button>
									<span className="w-10 text-center text-lg font-semibold text-white sm:w-12 sm:text-xl">
										{quantity}
									</span>
									<Button
										size="icon"
										variant="ghost"
										onClick={() => setQuantity(quantity + 1)}
										className="h-9 w-9 sm:h-10 sm:w-10"
									>
										<Plus className="h-4 w-4" />
									</Button>
								</div>
							</div>
						</div>

						{/* Footer */}
						<div className="mt-6 flex flex-col gap-4 border-t border-white/10 pt-4 sm:mt-8 sm:flex-row sm:items-center sm:justify-between sm:pt-6">
							<div>
								<p className="text-xs text-white/60 sm:text-sm">Total</p>
								<p className="text-xl font-semibold text-white sm:text-2xl">
									{currencySymbol}
									{totalPrice.toFixed(2)}
								</p>
							</div>
							<Button size="lg" onClick={handleAdd} className="w-full sm:w-auto">
								<Plus className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
								Add to Cart
							</Button>
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	)
}

function AddOnsAccordion({
	toppings,
	selectedToppings,
	toggleTopping,
	currencySymbol
}: {
	toppings: Topping[]
	selectedToppings: Array<{ id: string; name: string; price: number }>
	toggleTopping: (topping: Topping) => void
	currencySymbol: string
}) {
	const [isOpen, setIsOpen] = useState(false)
	const selectedCount = selectedToppings.length

	return (
		<div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center justify-between p-3 sm:p-4 text-left transition hover:bg-white/5"
			>
				<div className="flex items-center gap-2">
					<p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">
						Add Ons
					</p>
					{selectedCount > 0 && (
						<Badge className="border-emerald-400/30 bg-emerald-400/10 text-xs text-emerald-300">
							{selectedCount} selected
						</Badge>
					)}
				</div>
				<ChevronDown className={cn('h-4 w-4 text-white/50 transition-transform', isOpen && 'rotate-180')} />
			</button>

			<AnimatePresence>
				{isOpen && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="overflow-hidden"
					>
						<div className="grid gap-2 p-3 pt-0 sm:gap-3 sm:p-4 sm:pt-0">
							{toppings.map((topping) => {
								const isSelected = selectedToppings.some((t) => t.id === topping.id)
								return (
									<motion.button
										key={topping.id}
										whileTap={{ scale: 0.98 }}
										onClick={() => toggleTopping(topping)}
										className={cn(
											'flex items-center justify-between rounded-xl border p-3 transition',
											isSelected
												? 'border-emerald-400/40 bg-emerald-400/10'
												: 'border-white/10 bg-white/5 hover:border-white/20'
										)}
									>
										<div className="flex items-center gap-3">
											<div
												className={cn(
													'flex h-5 w-5 items-center justify-center rounded border-2',
													isSelected
														? 'border-emerald-400 bg-emerald-400'
														: 'border-white/30'
												)}
											>
												{isSelected && <Check className="h-3 w-3 text-white" />}
											</div>
											<div className="text-left">
												<p className="font-semibold text-white">{topping.name}</p>
												{topping.description && (
													<p className="text-xs text-white/60">{topping.description}</p>
												)}
											</div>
										</div>
										<p className="font-semibold text-white">
											+{currencySymbol}{topping.price.toFixed(2)}
										</p>
									</motion.button>
								)
							})}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}
