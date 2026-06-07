'use client'

import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
	Search,
	Plus,
	Minus,
	X,
	Brain,
	Table,
	ShoppingCart,
	User,
	CheckCircle2,
	Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ItemCustomizationModal } from './item-customization-modal'
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

const aiSuggestions = [
	{
		id: '1',
		message:
			'Guests at T-01 ordered pasta. Suggest truffle oil (+₹150) for 23% higher ticket.',
		confidence: 0.89,
		action: 'upsell'
	},
	{
		id: '2',
		message:
			'Popular combo: Signature Pasta + Burrata (+₹200). 67% of diners add this.',
		confidence: 0.76,
		action: 'combo'
	},
	{
		id: '3',
		message:
			'Peak hour detected. Recommend prepping 3x linguine batches in next 15min.',
		confidence: 0.82,
		action: 'prep'
	}
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
		return categories.map((cat) => ({
			...cat,
			menu_items: cat.menu_items.map((item) => {
				let linkedToppings = item.menu_item_toppings || []
				if (linkedToppings.length === 0) {
					const matchingToppings = toppings.filter((t) => {
						if (!t.category) return false
						const ids = t.category.split(',').map((id: string) => id.trim())
						return ids.includes(cat.id)
					})
					linkedToppings = matchingToppings.map((t) => ({
						topping: t
					}))
				}
				return {
					...item,
					menu_item_toppings: linkedToppings
				}
			})
		}))
	}, [categories, toppings])
	const [selectedTable, setSelectedTable] = useState<Table | null>(null)
	const [orderType, setOrderType] = useState<
		'dine_in' | 'takeaway' | 'delivery'
	>('dine_in')
	const [searchQuery, setSearchQuery] = useState('')
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
	const [cart, setCart] = useState<CartItem[]>([])
	const [showAISuggestions, setShowAISuggestions] = useState(true)
	const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null)
	const [isPlacingOrder, setIsPlacingOrder] = useState(false)
	const [customerName, setCustomerName] = useState('')
	const [customerPhone, setCustomerPhone] = useState('')
	const [customers, setCustomers] = useState<Customer[]>([])

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
		const items = filteredCategories.flatMap((cat) => cat.menu_items)
		if (!searchQuery) return items
		const query = searchQuery.toLowerCase()
		return items.filter(
			(item) =>
				item.name.toLowerCase().includes(query) ||
				item.description?.toLowerCase().includes(query)
		)
	}, [filteredCategories, searchQuery])

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
			item.menu_item_variants.length > 0 ||
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
		// Check if item with same configuration exists
		setCart((prevCart) => {
			const existingItem = prevCart.find(
				(cartItem) =>
					cartItem.menuItemId === customized.menuItemId &&
					cartItem.variant?.id === customized.variant?.id &&
					cartItem.toppings.length === customized.toppings.length &&
					cartItem.toppings.every(
						(topping, index) => topping.id === customized.toppings[index]?.id
					)
			)

			if (existingItem) {
				// Increment quantity if same configuration exists
				return prevCart.map((item) =>
					item.id === existingItem.id
						? { ...item, quantity: item.quantity + customized.quantity }
						: item
				)
			} else {
				// Add new item if different configuration
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

	return (
		<div
			className="flex w-full max-w-full flex-col gap-4 overflow-x-hidden overflow-y-visible py-4 sm:py-6"
			suppressHydrationWarning
		>
			{/* Header - Fixed */}
			<header className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<Badge className="border-white/20 bg-white/10 text-white/80">
						Point of Sale
					</Badge>
					<h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
						Live service terminal
					</h1>
					<p className="hidden text-white/60 sm:block">
						AI-powered ordering with real-time insights
					</p>
				</div>
				<div className="flex items-center gap-2 sm:gap-3">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setShowAISuggestions(!showAISuggestions)}
						className="hidden sm:flex"
					>
						<Brain className="mr-2 h-4 w-4" />
						AI Insights {showAISuggestions ? 'ON' : 'OFF'}
					</Button>
					<Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
						<Zap className="mr-1 h-3 w-3" />
						Live
					</Badge>
				</div>
			</header>

			{/* Main Layout - Full width, cart in side modal */}
			<div className="min-h-0 flex-1 overflow-x-hidden overflow-y-visible">
				{/* Tables Panel - Commented out for now */}
				{/* <motion.div
					initial={{ opacity: 0, x: -20 }}
					animate={{ opacity: 1, x: 0 }}
					className={cn(
						'hidden flex-col gap-4 overflow-hidden rounded-[32px] border border-white/10 bg-white/5 p-4 backdrop-blur-2xl sm:flex lg:p-6',
						showTablesPanel && 'fixed inset-0 z-50 flex sm:relative sm:inset-auto sm:z-auto'
					)}
				>
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold text-white">Tables</h2>
						<Badge className="border-white/20 text-white/70">
							{occupiedTables.length} active
						</Badge>
					</div>

					<div className="flex-1 space-y-3 overflow-y-auto">
						{occupiedTables.length > 0 && (
							<div>
								<p className="mb-2 text-xs uppercase tracking-[0.3em] text-white/50">
									Occupied
								</p>
								<div className="space-y-2">
									{occupiedTables.map((table) => (
										<motion.button
											key={table.id}
											whileHover={{ scale: 1.02 }}
											whileTap={{ scale: 0.98 }}
											onClick={() => setSelectedTable(table)}
											className={cn(
												'w-full rounded-2xl border border-white/10 bg-gradient-to-br from-[#5C5CFF]/20 to-[#2DE1FF]/10 p-4 text-left transition',
												selectedTable?.id === table.id
													? 'border-white/40 bg-white/10 shadow-[0_15px_40px_rgba(8,12,32,0.35)]'
													: 'hover:border-white/20 hover:bg-white/5'
											)}
										>
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-3">
													<div className="rounded-xl bg-emerald-400/20 p-2">
														<Table className="h-4 w-4 text-emerald-300" />
													</div>
													<div>
														<p className="font-semibold text-white">
															{table.number}
														</p>
														<p className="text-xs text-white/60">
															{table.guests} guests
														</p>
													</div>
												</div>
												<ChevronRight className="h-4 w-4 text-white/40" />
											</div>
										</motion.button>
									))}
								</div>
							</div>
						)}

						<div>
							<p className="mb-2 text-xs uppercase tracking-[0.3em] text-white/50">
								Available
							</p>
							<div className="grid grid-cols-2 gap-2">
								{availableTables.map((table) => (
									<motion.button
										key={table.id}
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
										onClick={() => setSelectedTable(table)}
										className={cn(
											'rounded-xl border border-white/10 bg-white/5 p-3 text-center transition hover:border-white/20 hover:bg-white/10',
											selectedTable?.id === table.id
												? 'border-white/40 bg-white/10'
												: ''
										)}
									>
										<p className="text-sm font-medium text-white">
											{table.number}
										</p>
									</motion.button>
								))}
							</div>
						</div>
					</div>

					{selectedTable && (
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#5C5CFF]/20 to-[#2DE1FF]/10 p-4"
						>
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm font-semibold text-white">
										{selectedTable.number}
									</p>
									<p className="text-xs text-white/60">
										{selectedTable.status === 'occupied'
											? `${selectedTable.guests} guests`
											: 'Ready for order'}
									</p>
								</div>
								<Button
									size="sm"
									variant="ghost"
									onClick={() => setSelectedTable(null)}
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						</motion.div>
					)}
				</motion.div> */}

				{/* Menu Panel */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="flex w-full max-w-full flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur-2xl sm:gap-3 sm:rounded-[32px] sm:p-3 md:gap-4 md:p-4 lg:h-full lg:min-h-0 lg:overflow-hidden lg:p-6"
				>
					{/* Search - Fixed */}
					<div className="relative shrink-0 w-full">
						<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40 sm:left-3 md:left-4" />
						<input
							type="text"
							placeholder="Search menu items..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-white/5 pl-8 pr-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 sm:pl-10 sm:pr-4 sm:rounded-2xl sm:py-2.5 md:px-12 md:py-3"
						/>
					</div>

					{/* Category Filter - Fixed */}
					<div className="shrink-0 w-full">
						<div className="flex flex-wrap gap-1.5 sm:gap-2">
							<Button
								variant={selectedCategory === null ? 'default' : 'ghost'}
								size="sm"
								onClick={() => setSelectedCategory(null)}
								className="shrink-0"
							>
								All
							</Button>
							{categories.map((category) => (
								<Button
									key={category.id}
									variant={
										selectedCategory === category.id ? 'default' : 'ghost'
									}
									size="sm"
									onClick={() => setSelectedCategory(category.id)}
									className="shrink-0"
								>
									{category.name}
								</Button>
							))}
						</div>
					</div>

					{/* AI Suggestions - Fixed */}
					{showAISuggestions && (
						<motion.div
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: 'auto' }}
							className="shrink-0 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4"
						>
							<div className="flex items-center gap-2">
								<Brain className="h-4 w-4 text-emerald-300" />
								<p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">
									AI Insight
								</p>
							</div>
							<p className="mt-2 text-sm text-emerald-100">
								{aiSuggestions[0]?.message}
							</p>
							<p className="mt-1 text-xs text-emerald-200/70">
								{Math.round(aiSuggestions[0]?.confidence * 100)}% confidence
							</p>
						</motion.div>
					)}

					{/* Menu Items Grid - Scrollable */}
					<div className="space-y-2 sm:space-y-3 md:space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overflow-x-hidden">
						{filteredMenuItems.length === 0 ? (
							<div className="flex h-full items-center justify-center py-8">
								<p className="text-white/60">No items found</p>
							</div>
						) : (
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 lg:gap-3 xl:grid-cols-4">
								{filteredMenuItems.map((item) => (
									<motion.div
										key={item.id}
										whileHover={{ scale: 1.02 }}
										whileTap={{ scale: 0.98 }}
										onClick={() => handleItemClick(item)}
										className="w-full cursor-pointer rounded-xl border border-white/10 bg-[#070A1C]/60 p-3 text-left shadow-[0_20px_60px_rgba(7,10,28,0.55)] transition hover:border-white/20 sm:rounded-2xl sm:p-4 md:rounded-3xl md:p-5"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="flex-1 min-w-0">
												<h3 className="text-base font-semibold text-white sm:text-lg">
													{item.name}
												</h3>
												{item.description && (
													<p className="mt-1 line-clamp-2 text-xs text-white/60 sm:text-sm">
														{item.description}
													</p>
												)}
												<div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
													{item.menu_item_variants.length > 0 && (
														<Badge className="border-white/20 bg-white/10 text-xs text-white/80">
															{item.menu_item_variants.length} variants
														</Badge>
													)}
													{item.menu_item_toppings.length > 0 && (
														<Badge className="border-emerald-400/30 bg-emerald-400/10 text-xs text-emerald-200">
															{item.menu_item_toppings.length} add ons
														</Badge>
													)}
												</div>
											</div>
											<div className="flex flex-shrink-0 flex-col items-end gap-2">
												<p className="text-lg font-semibold text-white sm:text-xl">
													{currencySymbol}
													{item.base_price.toFixed(2)}
												</p>
												{(() => {
													// Count ALL cart items with the same menuItemId (regardless of add ons/variants)
													// Add ons and variants are internal details - the menu item shows total count
													const totalQuantity = cart
														.filter(
															(cartItem) => cartItem.menuItemId === item.id
														)
														.reduce(
															(sum, cartItem) => sum + cartItem.quantity,
															0
														)

													// Find the default variant for incrementing quantity
													const defaultVariant =
														item.menu_item_variants.find((v) => v.is_default) ||
														item.menu_item_variants[0] ||
														null
													const defaultVariantId = defaultVariant?.id || null
													// Find cart items with default variant and no add ons for quick increment
													const defaultCartItems = cart.filter((cartItem) => {
														if (cartItem.menuItemId !== item.id) return false
														if (cartItem.toppings.length > 0) return false
														const cartItemVariantId =
															cartItem.variant?.id || null
														return cartItemVariantId === defaultVariantId
													})

													if (totalQuantity > 0) {
														// Show quantity counter: "- 1 +" format on small devices
														return (
															<div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-1 sm:gap-2 sm:px-2.5">
																<Button
																	size="icon"
																	variant="ghost"
																	onClick={(e) => {
																		e.stopPropagation()
																		// Remove one quantity from the first cart item of this menu item
																		// If it's the last quantity, remove the item entirely
																		const firstCartItem = cart.find(
																			(cartItem) =>
																				cartItem.menuItemId === item.id
																		)
																		if (firstCartItem) {
																			if (firstCartItem.quantity > 1) {
																				updateCartItem(firstCartItem.id, {
																					quantity: firstCartItem.quantity - 1
																				})
																			} else {
																				removeFromCart(firstCartItem.id)
																			}
																		}
																	}}
																	className="h-6 w-6 rounded-full p-0 sm:h-7 sm:w-7"
																>
																	<Minus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
																</Button>
																<span className="min-w-[1.25rem] text-center text-xs font-semibold text-white sm:min-w-[1.5rem] sm:text-sm">
																	{totalQuantity}
																</span>
																<Button
																	size="icon"
																	variant="ghost"
																	onClick={(e) => {
																		e.stopPropagation()
																		// Always open modal if item has variants/add ons, otherwise increment default item
																		if (
																			item.menu_item_variants.length > 0 ||
																			item.menu_item_toppings.length > 0
																		) {
																			setCustomizingItem(item)
																		} else {
																			// If no variants/add ons, increment the default cart item or add new one
																			const itemToUpdate = defaultCartItems[0]
																			if (itemToUpdate) {
																				updateCartItem(itemToUpdate.id, {
																					quantity: itemToUpdate.quantity + 1
																				})
																			} else {
																				addToCart(item)
																			}
																		}
																	}}
																	className="h-6 w-6 rounded-full p-0 sm:h-7 sm:w-7"
																>
																	<Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
																</Button>
															</div>
														)
													} else {
														// Show add button (just "+" on small devices)
														return (
															<Button
																size="sm"
																onClick={(e) => {
																	e.stopPropagation()
																	handleItemClick(item)
																}}
																className="h-8 w-8 rounded-full p-0 sm:h-9 sm:w-auto sm:px-3 sm:rounded-lg"
															>
																<Plus className="h-4 w-4 sm:mr-2" />
																<span className="hidden sm:inline">Add</span>
															</Button>
														)
													}
												})()}
											</div>
										</div>
									</motion.div>
								))}
							</div>
						)}
					</div>
				</motion.div>
			</div>

			{/* Cart Side Modal - All Devices */}
			<AnimatePresence>
				{showCartDrawer && (
					<>
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => setShowCartDrawer(false)}
							className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
						/>
						<motion.div
							initial={{ x: '100%' }}
							animate={{ x: 0 }}
							exit={{ x: '100%' }}
							transition={{ type: 'spring', damping: 30, stiffness: 300 }}
							className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col gap-3 overflow-hidden border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-3 shadow-[0_-20px_60px_rgba(3,5,18,0.85)] sm:p-4 md:p-6"
						>
							{/* Cart Header */}
							<div className="flex shrink-0 items-center justify-between pb-2">
								<div className="flex items-center gap-2">
									<ShoppingCart className="h-4 w-4 text-white/80 sm:h-5 sm:w-5" />
									<h2 className="text-base font-semibold text-white sm:text-lg">
										Cart
									</h2>
									{cart.length > 0 && (
										<Badge className="border-white/20 bg-white/10 text-xs text-white/80">
											{cart.length}
										</Badge>
									)}
								</div>
								<Button
									size="icon"
									variant="ghost"
									onClick={() => setShowCartDrawer(false)}
									className="h-8 w-8 sm:h-10 sm:w-10"
								>
									<X className="h-4 w-4 sm:h-5 sm:w-5" />
								</Button>
							</div>

							{/* Order Type Selection - Fixed */}
							<div className="shrink-0 space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-2 sm:rounded-2xl sm:space-y-2 sm:p-3">
								<div className="flex items-center gap-1.5 text-xs text-white/70 sm:text-sm">
									<span>Order Type</span>
								</div>
								<div className="grid grid-cols-3 gap-1.5 sm:gap-2">
									{(['dine_in', 'takeaway', 'delivery'] as const).map(
										(type) => (
											<button
												key={type}
												onClick={() => {
													setOrderType(type)
													// Clear table selection when switching to non-dine-in
													if (type !== 'dine_in') {
														setSelectedTable(null)
													}
												}}
												className={cn(
													'rounded-lg border px-2 py-1.5 text-[10px] font-medium transition sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs',
													orderType === type
														? 'border-white/40 bg-white/10 text-white'
														: 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10'
												)}
											>
												{type === 'dine_in'
													? 'Dine In'
													: type === 'takeaway'
														? 'Takeaway'
														: 'Delivery'}
											</button>
										)
									)}
								</div>
							</div>

							{/* Table Selection - Only show for dine-in - Fixed */}
							{orderType === 'dine_in' && (
								<div className="shrink-0 space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-2 sm:rounded-2xl sm:space-y-2 sm:p-3">
									<div className="flex items-center gap-1.5 text-xs text-white/70 sm:text-sm">
										<Table className="h-3 w-3 text-white/60 sm:h-4 sm:w-4" />
										<span>
											Table{' '}
											{!selectedTable && (
												<span className="text-red-400">*</span>
											)}
										</span>
									</div>
									{selectedTable ? (
										<div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3">
											<div>
												<p className="text-sm font-semibold text-white">
													{selectedTable.number}
												</p>
												<p className="text-xs text-white/60">
													{selectedTable.status === 'occupied'
														? `${selectedTable.guests} guests`
														: 'Available'}
												</p>
											</div>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setSelectedTable(null)}
												className="h-8 w-8 p-0"
											>
												<X className="h-4 w-4" />
											</Button>
										</div>
									) : (
										<div className="space-y-2">
											{occupiedTables.length > 0 && (
												<div>
													<p className="mb-2 text-xs uppercase tracking-[0.3em] text-white/50">
														Occupied
													</p>
													<div className="grid grid-cols-2 gap-2">
														{occupiedTables.map((table) => (
															<motion.button
																key={table.id}
																whileHover={{ scale: 1.02 }}
																whileTap={{ scale: 0.98 }}
																onClick={() => setSelectedTable(table)}
																className="rounded-xl border border-white/10 bg-gradient-to-br from-[#5C5CFF]/20 to-[#2DE1FF]/10 p-2 text-center transition hover:border-white/20 hover:bg-white/10"
															>
																<p className="text-xs font-medium text-white">
																	{table.number}
																</p>
																<p className="text-[10px] text-white/60">
																	{table.guests} guests
																</p>
															</motion.button>
														))}
													</div>
												</div>
											)}
											<div>
												<p className="mb-2 text-xs uppercase tracking-[0.3em] text-white/50">
													Available
												</p>
												<div className="grid grid-cols-3 gap-2">
													{availableTables.map((table) => (
														<motion.button
															key={table.id}
															whileHover={{ scale: 1.05 }}
															whileTap={{ scale: 0.95 }}
															onClick={() => setSelectedTable(table)}
															className="rounded-xl border border-white/10 bg-white/5 p-2 text-center text-xs font-medium text-white transition hover:border-white/20 hover:bg-white/10"
														>
															{table.number}
														</motion.button>
													))}
												</div>
											</div>
										</div>
									)}
								</div>
							)}

							{/* Cart Items - Scrollable */}
							{cart.length === 0 ? (
								<div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5">
									<p className="text-center text-sm text-white/60">
										Cart is empty
										<br />
										Add items from the menu
									</p>
								</div>
							) : (
								<div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 sm:space-y-3">
									<AnimatePresence>
										{cart.map((item) => {
											const variantPrice = item.variant?.price_modifier || 0
											const toppingsPrice = item.toppings.reduce(
												(sum, t) => sum + t.price,
												0
											)
											const itemPrice =
												(item.basePrice + variantPrice + toppingsPrice) *
												item.quantity

											return (
												<motion.div
													key={item.id}
													initial={{ opacity: 0, x: -20 }}
													animate={{ opacity: 1, x: 0 }}
													exit={{ opacity: 0, x: 20 }}
													className="rounded-xl border border-white/10 bg-[#070A1C]/60 p-3 sm:rounded-2xl sm:p-4"
												>
													<div className="flex items-start justify-between gap-2">
														<div className="flex-1 min-w-0">
															<h4 className="text-sm font-semibold text-white sm:text-base">
																{item.name}
															</h4>
															{item.variant && (
																<p className="mt-0.5 text-[10px] text-white/50 sm:mt-1 sm:text-xs">
																	{item.variant.name}
																	{item.variant.price_modifier !== 0 &&
																		` (+${currencySymbol}${Math.abs(item.variant.price_modifier).toFixed(2)})`}
																</p>
															)}
															{item.toppings.length > 0 && (
																<p className="mt-0.5 text-[10px] text-white/50 sm:mt-1 sm:text-xs">
																	{item.toppings.length} add on
																	{item.toppings.length > 1 ? 's' : ''}
																</p>
															)}
														</div>
														<Button
															size="icon"
															variant="ghost"
															onClick={() => removeFromCart(item.id)}
															className="h-7 w-7 flex-shrink-0 sm:h-8 sm:w-8"
														>
															<X className="h-3 w-3 sm:h-4 sm:w-4" />
														</Button>
													</div>
													<div className="mt-2 flex items-center justify-between sm:mt-3">
														<div className="flex items-center gap-1.5 sm:gap-2">
															<Button
																size="icon"
																variant="ghost"
																onClick={() =>
																	updateCartItem(item.id, {
																		quantity: Math.max(1, item.quantity - 1)
																	})
																}
																className="h-7 w-7 sm:h-8 sm:w-8"
															>
																<Minus className="h-3 w-3 sm:h-4 sm:w-4" />
															</Button>
															<span className="w-6 text-center text-xs font-medium text-white sm:w-8 sm:text-sm">
																{item.quantity}
															</span>
															<Button
																size="icon"
																variant="ghost"
																onClick={() =>
																	updateCartItem(item.id, {
																		quantity: item.quantity + 1
																	})
																}
																className="h-7 w-7 sm:h-8 sm:w-8"
															>
																<Plus className="h-3 w-3 sm:h-4 sm:w-4" />
															</Button>
														</div>
														<p className="text-sm font-semibold text-white sm:text-base">
															{currencySymbol}
															{itemPrice.toFixed(2)}
														</p>
													</div>
												</motion.div>
											)
										})}
									</AnimatePresence>
								</div>
							)}

							{/* Customer quick attach - Fixed */}
							{cart.length > 0 && (
								<div className="shrink-0 space-y-2 rounded-xl border border-white/10 bg-white/5 p-2 sm:rounded-2xl sm:space-y-3 sm:p-3">
									<div className="flex items-center gap-1.5 text-xs text-white/70 sm:text-sm">
										<User className="h-3 w-3 text-white/60 sm:h-4 sm:w-4" />
										<span>Customer (optional)</span>
									</div>
									<div className="mt-1.5 space-y-1.5 sm:mt-2 sm:space-y-2">
										<div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
											<input
												type="text"
												value={customerName}
												onChange={(e) => setCustomerName(e.target.value)}
												placeholder="Name"
												className="w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none sm:rounded-xl sm:px-3 sm:py-2"
											/>
											<input
												type="tel"
												value={customerPhone}
												onChange={(e) => setCustomerPhone(e.target.value)}
												placeholder="Phone"
												className="w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none sm:rounded-xl sm:px-3 sm:py-2"
											/>
										</div>
									</div>
								</div>
							)}

							{/* Cart Summary - Fixed */}
							{cart.length > 0 && (
								<div className="shrink-0 space-y-2 rounded-xl border border-white/10 bg-white/5 p-2 sm:rounded-2xl sm:space-y-3 sm:p-3">
									<div className="flex items-center justify-between text-xs text-white/70 sm:text-sm">
										<span>Subtotal</span>
										<span>
											{currencySymbol}
											{subtotal.toFixed(2)}
										</span>
									</div>
									{taxRate > 0 && (
										<div className="flex items-center justify-between text-xs text-white/70 sm:text-sm">
											<span>Tax ({taxRate}%)</span>
											<span>
												{currencySymbol}
												{tax.toFixed(2)}
											</span>
										</div>
									)}
									<div className="flex items-center justify-between border-t border-white/10 pt-2 text-base font-semibold text-white sm:pt-3 sm:text-lg">
										<span>Total</span>
										<span>
											{currencySymbol}
											{total.toFixed(2)}
										</span>
									</div>
									<Button
										className="w-full h-10 text-sm sm:h-12 sm:text-base"
										size="lg"
										onClick={async () => {
											await handlePlaceOrder()
											setShowCartDrawer(false)
										}}
										disabled={
											isPlacingOrder ||
											(orderType === 'dine_in' && !selectedTable)
										}
									>
										<CheckCircle2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
										{isPlacingOrder ? 'Placing Order...' : 'Place Order'}
									</Button>
									{orderType === 'dine_in' && !selectedTable && (
										<p className="mt-1 text-center text-[10px] text-red-400 sm:mt-2 sm:text-xs">
											Please select a table to place order
										</p>
									)}
								</div>
							)}
						</motion.div>
					</>
				)}
			</AnimatePresence>

			{/* Floating Cart Button - All Devices */}
			<motion.button
				initial={{ scale: 0 }}
				animate={{ scale: 1 }}
				whileTap={{ scale: 0.95 }}
				whileHover={{ scale: 1.05 }}
				onClick={() => setShowCartDrawer(true)}
				className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#5C5CFF] to-[#2DE1FF] shadow-lg shadow-[#5C5CFF]/30 transition-all hover:shadow-xl hover:shadow-[#5C5CFF]/40"
			>
				<div className="relative">
					<ShoppingCart className="h-7 w-7 text-white" />
					{cart.length > 0 && (
						<span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400 text-xs font-semibold text-black">
							{cart.length}
						</span>
					)}
				</div>
			</motion.button>

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
