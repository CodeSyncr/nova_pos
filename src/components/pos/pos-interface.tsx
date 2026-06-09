'use client'

import { useState, useMemo, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Minus, X, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ItemCustomizationModal } from './item-customization-modal'
import { OrderCart } from './order-cart'
import { MenuItemImage } from './menu-item-image'
import { createOrder } from '@/app/actions/orders'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type MenuCategory = {
	id: string
	name: string
	description: string | null
	position: number
	menu_items: MenuItem[]
}

type MenuItem = {
	id: string
	name: string
	description: string | null
	base_price: number
	image_url: string | null
	is_active: boolean
	menu_item_variants: MenuItemVariant[]
	menu_item_toppings: MenuItemTopping[]
}

type MenuItemVariant = {
	id: string
	name: string
	price_modifier: number
	is_default: boolean
}

type MenuItemTopping = {
	topping:
		| Array<{
				id: string
				name: string
				price: number
				description: string | null
		  }>
		| { id: string; name: string; price: number; description: string | null }
		| null
}

type CartItem = {
	id: string
	menuItemId: string
	name: string
	variant: MenuItemVariant | null
	toppings: Array<{ id: string; name: string; price: number }>
	quantity: number
	basePrice: number
}

type Table = {
	id: string
	number: string
	status: 'available' | 'occupied' | 'reserved'
	guests: number
	orderId: string | null
}

type Tenant = {
	id: string
	name: string
	branding: Record<string, unknown> | null
	settings: Record<string, unknown> | null
}

type Customer = {
	id: string
	full_name: string
	phone: string | null
}

type Topping = {
	id: string
	name: string
	price: number
	description: string | null
	category: string | null
}

type POSInterfaceProps = {
	categories: MenuCategory[]
	tenant: Tenant
	currencySymbol: string
	taxRate: number
	toppings?: Topping[]
}

const mockTables: Table[] = [
	{ id: '1', number: 'T-01', status: 'occupied', guests: 2, orderId: 'ord-1' },
	{ id: '2', number: 'T-02', status: 'available', guests: 0, orderId: null },
	{ id: '3', number: 'T-03', status: 'occupied', guests: 4, orderId: 'ord-2' },
	{ id: '4', number: 'T-04', status: 'reserved', guests: 0, orderId: null },
	{ id: '5', number: 'T-05', status: 'available', guests: 0, orderId: null },
	{ id: '6', number: 'T-06', status: 'occupied', guests: 3, orderId: 'ord-3' },
	{ id: '7', number: 'T-07', status: 'available', guests: 0, orderId: null },
	{ id: '8', number: 'T-08', status: 'available', guests: 0, orderId: null }
]

export function POSInterface({
	categories,
	tenant,
	currencySymbol,
	taxRate,
	toppings = []
}: POSInterfaceProps) {
	const router = useRouter()
	const categoriesWithDynamicToppings = useMemo(() => {
		// Only use toppings explicitly linked to each menu item.
		// No category-based fallback — items without linked toppings show none.
		return categories.map((cat) => ({
			...cat,
			menu_items: cat.menu_items.map((item) => ({
				...item,
				menu_item_toppings: (item.menu_item_toppings || []).filter((entry) => {
					// Keep only entries that resolve to a real topping
					const t = entry.topping as unknown
					if (!t) return false
					if (Array.isArray(t)) return t.length > 0 && !!t[0]
					return true
				})
			}))
		}))
	}, [categories])
	const [selectedTable, setSelectedTable] = useState<Table | null>(null)
	const [orderType, setOrderType] = useState<
		'dine_in' | 'takeaway' | 'delivery'
	>('dine_in')
	const [searchQuery, setSearchQuery] = useState('')
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
	const [cart, setCart] = useState<CartItem[]>([])
	const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null)
	const [isPlacingOrder, setIsPlacingOrder] = useState(false)
	const [customerName, setCustomerName] = useState('')
	const [customerPhone, setCustomerPhone] = useState('')
	const [customers, setCustomers] = useState<Customer[]>([])

	// Default to the Pizza category if it exists
	useEffect(() => {
		const pizzaCat = categories.find((c) => /pizza/i.test(c.name))
		if (pizzaCat) {
			setSelectedCategory(pizzaCat.id)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		const loadCustomers = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const { data } = await supabase
					.from('customers')
					.select('id, full_name, phone')
					.eq('tenant_id', tenant.id)
					.order('full_name', { ascending: true })
				setCustomers((data as Customer[]) || [])
			} catch (error) {
				console.error('Error loading customers for POS:', error)
			}
		}
		loadCustomers()
	}, [tenant.id])

	const filteredCategories = useMemo(() => {
		if (!selectedCategory) return categoriesWithDynamicToppings
		return categoriesWithDynamicToppings.filter((cat) => cat.id === selectedCategory)
	}, [categoriesWithDynamicToppings, selectedCategory])

	const filteredMenuItems = useMemo(() => {
		const query = searchQuery.trim().toLowerCase()

		// When searching, search across ALL categories (ignore selected category)
		// and return items sorted by category order, then price low-to-high
		if (query) {
			const allCats = categoriesWithDynamicToppings
			const results: MenuItem[] = []
			allCats.forEach((cat) => {
				const matches = cat.menu_items
					.filter(
						(item) =>
							item.name.toLowerCase().includes(query) ||
							item.description?.toLowerCase().includes(query)
					)
					.sort((a, b) => a.base_price - b.base_price)
				results.push(...matches)
			})
			return results
		}

		// No search — respect category order, items within each sorted by price
		const items: MenuItem[] = []
		filteredCategories.forEach((cat) => {
			const sorted = [...cat.menu_items].sort((a, b) => a.base_price - b.base_price)
			items.push(...sorted)
		})
		return items
	}, [filteredCategories, categoriesWithDynamicToppings, searchQuery])

	// Auto-select customer when phone number matches
	useEffect(() => {
		if (!customerPhone.trim()) {
			return
		}

		const matchingCustomer = customers.find(
			(c) => c.phone && c.phone.trim() === customerPhone.trim()
		)

		if (matchingCustomer && customerName !== matchingCustomer.full_name) {
			setCustomerName(matchingCustomer.full_name)
		}
	}, [customerPhone, customers, customerName])

	const handleItemClick = (item: MenuItem) => {
		if (
			item.menu_item_variants.length > 1 ||
			item.menu_item_toppings.length > 0
		) {
			setCustomizingItem(item)
		} else {
			addToCart(item)
		}
	}

	const addToCart = (item: MenuItem) => {
		const defaultVariant =
			item.menu_item_variants.find((v) => v.is_default) ||
			item.menu_item_variants[0] ||
			null

		// Check if item with same configuration already exists
		const defaultVariantId = defaultVariant?.id || null
		setCart((prevCart) => {
			const existingItem = prevCart.find((cartItem) => {
				if (cartItem.menuItemId !== item.id) return false
				if (cartItem.toppings.length > 0) return false
				const cartItemVariantId = cartItem.variant?.id || null
				return cartItemVariantId === defaultVariantId
			})

			if (existingItem) {
				// Increment quantity if same configuration exists
				return prevCart.map((cartItem) =>
					cartItem.id === existingItem.id
						? { ...cartItem, quantity: cartItem.quantity + 1 }
						: cartItem
				)
			} else {
				// Add new item
				const newCartItem: CartItem = {
					id: `${item.id}-${Date.now()}`,
					menuItemId: item.id,
					name: item.name,
					variant: defaultVariant,
					toppings: [],
					quantity: 1,
					basePrice: item.base_price
				}

				return [...prevCart, newCartItem]
			}
		})
	}

	const handleCustomizedAdd = (customized: {
		menuItemId: string
		name: string
		variant: MenuItemVariant | null
		toppings: Array<{ id: string; name: string; price: number }>
		quantity: number
		basePrice: number
	}) => {
		setCart((prevCart) => {
			// Find existing item with same menu item + variant + toppings (order-independent)
			const customizedToppingIds = new Set(customized.toppings.map((t) => t.id))

			const existingItem = prevCart.find((cartItem) => {
				if (cartItem.menuItemId !== customized.menuItemId) return false
				if ((cartItem.variant?.id || null) !== (customized.variant?.id || null)) return false
				if (cartItem.toppings.length !== customized.toppings.length) return false
				// Order-independent topping comparison
				const cartToppingIds = new Set(cartItem.toppings.map((t) => t.id))
				if (cartToppingIds.size !== customizedToppingIds.size) return false
				for (const id of customizedToppingIds) {
					if (!cartToppingIds.has(id)) return false
				}
				return true
			})

			if (existingItem) {
				return prevCart.map((item) =>
					item.id === existingItem.id
						? { ...item, quantity: item.quantity + customized.quantity }
						: item
				)
			} else {
				const newCartItem: CartItem = {
					id: `${customized.menuItemId}-${Date.now()}`,
					menuItemId: customized.menuItemId,
					name: customized.name,
					variant: customized.variant,
					toppings: customized.toppings,
					quantity: customized.quantity,
					basePrice: customized.basePrice
				}
				return [...prevCart, newCartItem]
			}
		})
	}

	const updateCartItem = (itemId: string, updates: Partial<CartItem>) => {
		setCart((prevCart) =>
			prevCart.map((item) =>
				item.id === itemId ? { ...item, ...updates } : item
			)
		)
	}

	const removeFromCart = (itemId: string) => {
		setCart((prevCart) => prevCart.filter((item) => item.id !== itemId))
	}

	const cartTotal = useMemo(() => {
		return cart.reduce((total, item) => {
			const variantPrice = item.variant?.price_modifier || 0
			const toppingsPrice = item.toppings.reduce(
				(sum, topping) => sum + topping.price,
				0
			)
			const itemTotal =
				(item.basePrice + variantPrice + toppingsPrice) * item.quantity
			return total + itemTotal
		}, 0)
	}, [cart])

	const subtotal = cartTotal
	const tax = subtotal * (taxRate / 100)
	const total = subtotal + tax

	const handlePlaceOrder = async () => {
		// Validate: For dine_in, require table. For takeaway/delivery, table is optional
		if (orderType === 'dine_in' && !selectedTable) {
			alert('Please select a table for dine-in orders')
			return
		}

		if (cart.length === 0) {
			alert('Cart is empty')
			return
		}

		setIsPlacingOrder(true)
		try {
			await createOrder(tenant.id, {
				tableNumber: selectedTable?.number || undefined,
				orderType: orderType,
				customerName: customerName || undefined,
				customerPhone: customerPhone || undefined,
				items: cart.map((item) => ({
					menuItemId: item.menuItemId,
					name: item.name,
					variant: item.variant
						? {
								id: item.variant.id,
								name: item.variant.name,
								priceModifier: item.variant.price_modifier
							}
						: null,
					toppings: item.toppings,
					quantity: item.quantity,
					basePrice: item.basePrice
				})),
				subtotal,
				tax,
				total
			})
			setCart([])
			setSelectedTable(null)
			setOrderType('dine_in')
			setCustomerName('')
			setCustomerPhone('')
			router.push('/orders')
		} catch (error) {
			console.error('Error placing order:', error)
			alert(error instanceof Error ? error.message : 'Failed to place order')
		} finally {
			setIsPlacingOrder(false)
		}
	}
	const [tables, setTables] = useState<Table[]>([])

	useEffect(() => {
		const loadTablesAndStatus = async () => {
			const settings = tenant.settings || {}
			const configuredTables = (settings.tables as Array<{ id: string; name: string; capacity: number; section: string }> | undefined) || []

			let initialTables: Table[] = configuredTables.map(t => ({
				id: t.id,
				number: t.name,
				status: 'available',
				guests: 0,
				orderId: null
			}))

			if (initialTables.length === 0) {
				initialTables = mockTables
			}

			try {
				const supabase = createSupabaseBrowserClient()
				const { data: activeOrders } = await supabase
					.from('orders')
					.select('id, table_number, status')
					.eq('tenant_id', tenant.id)
					.not('status', 'in', '("completed","cancelled")')

				if (activeOrders && activeOrders.length > 0) {
					initialTables = initialTables.map(t => {
						const matchingOrder = activeOrders.find(o => o.table_number === t.number)
						if (matchingOrder) {
							return {
								...t,
								status: 'occupied',
								orderId: matchingOrder.id,
								guests: t.guests || 2
							}
						}
						return t
					})
				}
			} catch (err) {
				console.error('Error loading active orders for tables:', err)
			}

			setTables(initialTables)
		}

		loadTablesAndStatus()
		const interval = setInterval(loadTablesAndStatus, 10000)
		return () => clearInterval(interval)
	}, [tenant.id, tenant.settings])

	const availableTables = tables.filter((t) => t.status === 'available')
	const occupiedTables = tables.filter((t) => t.status === 'occupied')
	const [showCartDrawer, setShowCartDrawer] = useState(false)

	const cartCount = cart.reduce((s, c) => s + c.quantity, 0)

	// Does the entered phone already belong to a saved customer? (drives name auto-fill + "returning" tag)
	const customerExists = useMemo(() => {
		const phone = customerPhone.trim()
		if (!phone) return false
		return customers.some((c) => c.phone && c.phone.trim() === phone)
	}, [customerPhone, customers])

	const cartProps = {
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
		onPlaceOrder: async () => {
			await handlePlaceOrder()
			setShowCartDrawer(false)
		},
		removeFromCart,
		updateCartItem
	}

	return (
		<div
			className="flex flex-col gap-5 py-4 sm:py-6 lg:fixed lg:inset-y-0 lg:right-0 lg:left-[76px] lg:z-20 lg:gap-4 lg:overflow-hidden lg:bg-black lg:p-6"
			suppressHydrationWarning
		>
			{/* Two-pane: menu + cart */}
			<div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
				{/* Menu (header lives here so it spans only the menu width) */}
				<div className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-hidden">
					{/* Search */}
					<div className="relative">
						<Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
						<input
							type="text"
							placeholder="Search menu…"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] py-3 pl-11 pr-4 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#E0342A]/50 focus:bg-white/[0.05]"
						/>
					</div>

					{/* Categories */}
					<div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
						<button
							onClick={() => setSelectedCategory(null)}
							className={cn(
								'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition',
								selectedCategory === null
									? 'bg-[#E0342A] text-white'
									: 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
							)}
						>
							All
						</button>
						{categories.map((category) => (
							<button
								key={category.id}
								onClick={() => setSelectedCategory(category.id)}
								className={cn(
									'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition',
									selectedCategory === category.id
										? 'bg-[#E0342A] text-white'
										: 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
								)}
							>
								{category.name}
							</button>
						))}
					</div>

					{/* Items grid */}
					{filteredMenuItems.length === 0 ? (
						<div className="flex items-center justify-center rounded-2xl border border-dashed border-white/10 py-16 text-sm text-white/40 lg:min-h-0 lg:flex-1">
							No items found
						</div>
					) : (
						<div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:min-h-0 lg:flex-1 lg:content-start lg:overflow-y-auto lg:pr-1 xl:grid-cols-4">
							{filteredMenuItems.map((item) => {
								const totalQuantity = cart
									.filter((c) => c.menuItemId === item.id)
									.reduce((s, c) => s + c.quantity, 0)
								const defaultVariant =
									item.menu_item_variants.find((v) => v.is_default) ||
									item.menu_item_variants[0] ||
									null
								const defaultVariantId = defaultVariant?.id || null
								const defaultCartItems = cart.filter(
									(c) =>
										c.menuItemId === item.id &&
										c.toppings.length === 0 &&
										(c.variant?.id || null) === defaultVariantId
								)

								return (
									<div
										key={item.id}
										onClick={() => handleItemClick(item)}
										className="group relative h-44 cursor-pointer overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] transition hover:border-[#E0342A]/40 sm:h-48"
									>
										<MenuItemImage src={item.image_url} alt={item.name} />
										<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />
										{(item.menu_item_variants.length > 0 ||
											item.menu_item_toppings.length > 0) && (
											<span className="absolute left-2 top-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur-sm">
												customizable
											</span>
										)}
										<div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
											<div className="min-w-0">
												<h3 className="line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow">
													{item.name}
												</h3>
												<span className="mt-0.5 block text-sm font-bold tabular-nums text-white">
													{currencySymbol}
													{item.base_price.toFixed(0)}
												</span>
											</div>
											{totalQuantity > 0 ? (
												<div
													className="flex items-center gap-1 rounded-full border border-white/20 bg-black/40 p-0.5 backdrop-blur-sm"
													onClick={(e) => e.stopPropagation()}
												>
													<button
														onClick={(e) => {
															e.stopPropagation()
															const first = cart.find((c) => c.menuItemId === item.id)
															if (first) {
																if (first.quantity > 1)
																	updateCartItem(first.id, {
																		quantity: first.quantity - 1
																	})
																else removeFromCart(first.id)
															}
														}}
														className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
													>
														<Minus className="h-3.5 w-3.5" />
													</button>
													<span className="min-w-[1.25rem] text-center text-sm font-semibold tabular-nums text-white">
														{totalQuantity}
													</span>
													<button
														onClick={(e) => {
															e.stopPropagation()
															if (
																item.menu_item_variants.length > 1 ||
																item.menu_item_toppings.length > 0
															) {
																setCustomizingItem(item)
															} else {
																const toUpdate = defaultCartItems[0]
																if (toUpdate)
																	updateCartItem(toUpdate.id, {
																		quantity: toUpdate.quantity + 1
																	})
																else addToCart(item)
															}
														}}
														className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
													>
														<Plus className="h-3.5 w-3.5" />
													</button>
												</div>
											) : (
												<button
													onClick={(e) => {
														e.stopPropagation()
														handleItemClick(item)
													}}
													className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E0342A] text-white transition hover:bg-[#C42A21]"
												>
													<Plus className="h-4 w-4" />
												</button>
											)}
										</div>
								</div>
								)
							})}
						</div>
					)}
				</div>

				{/* Cart — persistent on desktop */}
				<aside className="hidden lg:block lg:min-h-0">
					<div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent">
						{/* Image banner */}
						<div className="relative h-40 shrink-0">
							<Image
								src="/pos_bg.png"
								alt=""
								fill
								priority
								sizes="380px"
								className="object-cover object-top"
							/>
							<div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
							<div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-5 pb-3.5">
								<div className="flex items-center gap-2">
									<ShoppingCart className="h-4 w-4 text-[#E0342A]" />
									<h2 className="text-sm font-semibold text-white">Current order</h2>
								</div>
								{cartCount > 0 && (
									<span className="rounded-full bg-[#E0342A] px-2 py-0.5 text-xs font-semibold text-white">
										{cartCount} item{cartCount > 1 ? 's' : ''}
									</span>
								)}
							</div>
						</div>
						<OrderCart {...cartProps} />
					</div>
				</aside>
			</div>

			{/* Mobile cart bottom sheet */}
			<AnimatePresence>
				{showCartDrawer && (
					<>
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => setShowCartDrawer(false)}
							className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
						/>
						<motion.div
							initial={{ y: '100%' }}
							animate={{ y: 0 }}
							exit={{ y: '100%' }}
							transition={{ type: 'spring', damping: 30, stiffness: 300 }}
							className="fixed inset-x-0 bottom-0 z-50 flex h-[92vh] flex-col overflow-hidden rounded-t-[28px] border-t border-white/10 bg-[#0a0a0a] shadow-[0_-24px_70px_rgba(0,0,0,0.7)] lg:hidden"
						>
							{/* Image banner */}
							<div className="relative h-32 shrink-0">
								<Image
									src="/pos_bg.png"
									alt=""
									fill
									priority
									sizes="100vw"
									className="object-cover object-top"
								/>
								<div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/20 to-transparent" />
								<button
									onClick={() => setShowCartDrawer(false)}
									className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition hover:text-white"
								>
									<X className="h-4 w-4" />
								</button>
								<div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-5 pb-3">
									<ShoppingCart className="h-4 w-4 text-[#E0342A]" />
									<h2 className="text-sm font-semibold text-white">Current order</h2>
								</div>
							</div>
							<OrderCart {...cartProps} />
						</motion.div>
					</>
				)}
			</AnimatePresence>

				{/* Floating cart button — mobile only (glowing smoky orb) */}
				<div className="fixed bottom-6 right-6 z-40 lg:hidden">
					<div className="pointer-events-none absolute -inset-3 animate-pulse rounded-full bg-[#E0342A]/50 blur-2xl" />
					<button
						onClick={() => setShowCartDrawer(true)}
						className="relative flex h-16 w-16 items-center justify-center rounded-full shadow-[0_10px_30px_-4px_rgba(224,52,42,0.7)] transition active:scale-95"
						style={{
							background:
								'radial-gradient(circle at 32% 26%, #FF6A5E 0%, #E0342A 46%, #A81D14 100%)'
						}}
					>
						<span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/25 to-transparent" />
						<ShoppingCart className="relative h-6 w-6 text-white drop-shadow" />
						{cartCount > 0 && (
							<span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-white text-xs font-bold text-black">
								{cartCount}
							</span>
						)}
					</button>
				</div>

			{/* Item Customization Modal */}
			<ItemCustomizationModal
				item={customizingItem}
				isOpen={customizingItem !== null}
				onClose={() => setCustomizingItem(null)}
				onAdd={handleCustomizedAdd}
				currencySymbol={currencySymbol}
			/>
		</div>
	)
}
