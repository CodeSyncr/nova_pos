'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CustomSelect, SelectOption } from '@/components/ui/select'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Clock,
	CheckCircle2,
	XCircle,
	ChefHat,
	Package,
	Receipt,
	Search,
	Filter,
	X,
	Percent,
	DollarSign,
	User,
	Calendar,
	CalendarDays,
	Edit,
	Plus,
	Minus,
	Trash2,
	ChevronDown,
	Coins,
	CreditCard,
	QrCode,
	Wallet,
	MoreHorizontal
} from 'lucide-react'
import {
	updateOrderStatus,
	deleteOrder,
	completeOrderWithPayment,
	updateOrder
} from '@/app/actions/orders'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { generateAndUploadBill, openWhatsApp } from '@/lib/bill-generator'
import { DEFAULT_WHATSAPP_TEMPLATE } from '@/lib/bill-template'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { ItemCustomizationModal } from '@/components/pos/item-customization-modal'

const orderTypeOptions: SelectOption[] = [
	{
		value: 'dine_in',
		label: 'Dine In',
		icon: ChefHat,
		description: 'Customer dining in restaurant',
		colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
	},
	{
		value: 'takeaway',
		label: 'Takeaway',
		icon: Package,
		description: 'Self-pickup takeaway order',
		colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
	},
	{
		value: 'delivery',
		label: 'Delivery',
		icon: Clock,
		description: 'Home delivery courier',
		colorClass: 'text-sky-400 bg-sky-500/10 border-sky-500/20'
	}
]

const paymentOptions: SelectOption[] = [
	{
		value: 'cash',
		label: 'Cash',
		icon: Coins,
		description: 'Accept cash in hand',
		colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
	},
	{
		value: 'card',
		label: 'Card',
		icon: CreditCard,
		description: 'Credit/Debit card reader terminal',
		colorClass: 'text-sky-400 bg-sky-500/10 border-sky-500/20'
	},
	{
		value: 'upi',
		label: 'UPI',
		icon: QrCode,
		description: 'Direct UPI mobile bank transfer',
		colorClass: 'text-violet-400 bg-violet-500/10 border-violet-500/20'
	},
	{
		value: 'wallet',
		label: 'Wallet',
		icon: Wallet,
		description: 'Paytm, PhonePe, GPay, etc.',
		colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
	},
	{
		value: 'other',
		label: 'Other',
		icon: MoreHorizontal,
		description: 'Alternative payment channel',
		colorClass: 'text-pink-400 bg-pink-500/10 border-pink-500/20'
	}
]


type Order = {
	id: string
	table_number: string | null
	status: string
	order_type: string
	customer_name: string | null
	customer_phone: string | null
	subtotal: number
	tax: number
	discount_amount?: number
	discount_type?: string | null
	discount_value?: number | null
	payment_method?: string | null
	total: number
	created_at: string
	order_items: Array<{
		id: string
		name: string
		quantity: number
		unit_price: number
		total_price: number
		notes: string | null
	}>
}

const statusConfig: Record<
	string,
	{ label: string; color: string; icon: typeof Clock }
> = {
	pending: {
		label: 'Pending',
		color: 'bg-yellow-400/20 text-yellow-300',
		icon: Clock
	},
	confirmed: {
		label: 'Confirmed',
		color: 'bg-blue-400/20 text-blue-300',
		icon: CheckCircle2
	},
	preparing: {
		label: 'Preparing',
		color: 'bg-purple-400/20 text-purple-300',
		icon: ChefHat
	},
	ready: {
		label: 'Ready',
		color: 'bg-green-400/20 text-green-300',
		icon: Package
	},
	completed: {
		label: 'Completed',
		color: 'bg-emerald-400/20 text-emerald-300',
		icon: CheckCircle2
	},
	cancelled: {
		label: 'Cancelled',
		color: 'bg-red-400/20 text-red-300',
		icon: XCircle
	}
}

export default function OrdersPage() {
	const router = useRouter()
	const [orders, setOrders] = useState<Order[]>([])
	const [loading, setLoading] = useState(true)
	const [statusFilter, setStatusFilter] = useState<string | null>(null)
	const [searchQuery, setSearchQuery] = useState('')
	const [completingOrder, setCompletingOrder] = useState<Order | null>(null)
	const [editingOrder, setEditingOrder] = useState<Order | null>(null)
	const [editedItems, setEditedItems] = useState<
		Array<{
			id?: string
			menuItemId: string
			name: string
			quantity: number
			unitPrice: number
			totalPrice: number
			notes: string | null
		}>
	>([])
	const [editDiscountType, setEditDiscountType] = useState<
		'percent' | 'fixed' | null
	>(null)
	const [editDiscountValue, setEditDiscountValue] = useState('')
	const [editCustomerName, setEditCustomerName] = useState('')
	const [editTableNumber, setEditTableNumber] = useState<string | null>(null)
	const [editOrderType, setEditOrderType] = useState<
		'dine_in' | 'takeaway' | 'delivery'
	>('dine_in')
	const [menuItems, setMenuItems] = useState<
		Array<{
			id: string
			name: string
			description: string | null
			base_price: number
			category_id: string
			menu_item_variants: Array<{
				id: string
				name: string
				price_modifier: number
				is_default: boolean
			}>
			menu_item_toppings: Array<{
				topping:
					| Array<{
							id: string
							name: string
							price: number
							description: string | null
					  }>
					| {
							id: string
							name: string
							price: number
							description: string | null
					  }
					| null
			}>
		}>
	>([])
	const [categories, setCategories] = useState<
		Array<{ id: string; name: string }>
	>([])
	const [tables, setTables] = useState<Array<{ id: string; number: string }>>(
		[]
	)
	const [showAddItem, setShowAddItem] = useState(false)
	const [itemSearchQuery, setItemSearchQuery] = useState('')
	const [selectedCategoryForItem, setSelectedCategoryForItem] = useState<
		string | null
	>(null)
	const [customizingItem, setCustomizingItem] = useState<{
		id: string
		name: string
		description: string | null
		base_price: number
		menu_item_variants: Array<{
			id: string
			name: string
			price_modifier: number
			is_default: boolean
		}>
		menu_item_toppings: Array<{
			topping:
				| Array<{
						id: string
						name: string
						price: number
						description: string | null
				  }>
				| {
						id: string
						name: string
						price: number
						description: string | null
				  }
				| null
		}>
	} | null>(null)
	const [discountType, setDiscountType] = useState<'percent' | 'fixed' | null>(
		null
	)
	const [discountValue, setDiscountValue] = useState('')
	const [paymentMethod, setPaymentMethod] = useState('')
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	const [taxRate, setTaxRate] = useState(0)
	const toast = useToast()

	// Date filter state
	const [dateFilter, setDateFilter] = useState<
		'today' | 'yesterday' | 'last7days' | 'custom'
	>('today')
	const [customStartDate, setCustomStartDate] = useState('')
	const [customEndDate, setCustomEndDate] = useState('')

	// Bill sending states
	const [sendingBillId, setSendingBillId] = useState<string | null>(null)
	const [tenantName, setTenantName] = useState('')
	const [tenantId, setTenantId] = useState('')
	const [whatsappTemplate, setWhatsappTemplate] = useState<any>(null)
	const [billReviewLink, setBillReviewLink] = useState('')
	const [billTagline, setBillTagline] = useState('')
	const [toppings, setToppings] = useState<any[]>([])
	const [isPaymentDropdownOpen, setIsPaymentDropdownOpen] = useState(false)

	const tableOptions = useMemo(() => {
		const opts = tables.map((table) => ({
			value: table.number,
			label: `Table ${table.number}`,
			description: `Dining Table ${table.number}`,
			icon: User,
			colorClass: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
		}))
		return [
			{ value: '', label: 'Select table', description: 'Clear table assignment', icon: X, colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
			...opts
		]
	}, [tables])

	useEffect(() => {
		loadOrders()
		const interval = setInterval(loadOrders, 5000) // Refresh every 5 seconds
		return () => clearInterval(interval)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [statusFilter])

	const loadOrders = async () => {
		const supabase = createSupabaseBrowserClient()
		const {
			data: { user }
		} = await supabase.auth.getUser()

		if (!user) {
			router.push('/login')
			return
		}

		const { data: tenantRow } = await supabase
			.from('profile_tenants')
			.select('tenant_id, tenant:tenants(name, settings)')
			.eq('profile_id', user.id)
			.single()

		if (!tenantRow) {
			router.push('/tenant')
			return
		}

		// Get currency symbol from tenant settings
		const tenant = Array.isArray(tenantRow.tenant)
			? tenantRow.tenant[0]
			: tenantRow.tenant
		const settings = (tenant?.settings as Record<string, unknown>) || {}
		const currency = (settings.currencySymbol as string) || '₹'
		const tax = (settings.taxRate as number) || 0
		setCurrencySymbol(currency)
		setTaxRate(tax)
		setTenantName(tenant?.name || '')
		setTenantId(tenantRow.tenant_id)
		if (settings && typeof settings === 'object') {
			const templates = (settings as any).billTemplates
			if (templates?.whatsapp) {
				setWhatsappTemplate(templates.whatsapp)
				setBillTagline(templates.whatsapp.taglineText || '')
			} else {
				setWhatsappTemplate(null)
			}
			setBillReviewLink((settings as any).reviewLink || '')
		}

		// Load menu items and categories for edit modal
		const { data: menuItemsData } = await supabase
			.from('menu_items')
			.select(
				`
				id,
				name,
				base_price,
				category_id,
				menu_item_variants (
					id,
					name,
					price_modifier,
					is_default
				),
				menu_item_toppings (
					topping: topping_id (
						id,
						name,
						price,
						description
					)
				)
			`
			)
			.eq('tenant_id', tenantRow.tenant_id)
			.eq('is_active', true)

		const { data: toppingsData } = await supabase
			.from('toppings')
			.select('id, name, price, description, category')
			.eq('tenant_id', tenantRow.tenant_id)

		if (toppingsData) {
			setToppings(toppingsData)
		}

		const { data: categoriesData } = await supabase
			.from('menu_categories')
			.select('id, name')
			.eq('tenant_id', tenantRow.tenant_id)
			.order('position', { ascending: true })

		const { data: tablesData } = await supabase
			.from('tables')
			.select('id, number')
			.eq('tenant_id', tenantRow.tenant_id)
			.order('number', { ascending: true })

		if (menuItemsData) {
			// Ensure description field exists for all items and handle null/undefined variants/toppings
			const itemsWithDescription = menuItemsData.map((item) => {
				let linkedToppings = (item as { menu_item_toppings?: any[] }).menu_item_toppings || []
				if (linkedToppings.length === 0 && toppingsData) {
					const matchingToppings = toppingsData.filter((t) => {
						if (!t.category) return false
						const ids = t.category.split(',').map((id: string) => id.trim())
						return ids.includes(item.category_id)
					})
					linkedToppings = matchingToppings.map((t) => ({
						topping: t
					}))
				}
				return {
					...item,
					description:
						(item as { description?: string | null }).description || null,
					menu_item_variants:
						(item as { menu_item_variants?: unknown[] }).menu_item_variants || [],
					menu_item_toppings: linkedToppings
				}
			})
			setMenuItems(itemsWithDescription as typeof menuItems)
		}
		if (categoriesData) setCategories(categoriesData)
		if (tablesData) setTables(tablesData)

		let query = supabase
			.from('orders')
			.select(
				`
        id,
        table_number,
        status,
        order_type,
        customer_name,
        customer_phone,
        subtotal,
        tax,
        discount_amount,
        discount_type,
        discount_value,
        payment_method,
        total,
        created_at,
        created_by,
        order_items (
          id,
          name,
          quantity,
          unit_price,
          total_price,
          notes
        )
      `
			)
			.eq('tenant_id', tenantRow.tenant_id)
			.order('created_at', { ascending: false })

		// Check if user has view_own permission (waiter mode - only see own orders)
		const { data: ptRole } = await supabase
			.from('profile_tenants')
			.select('role_id')
			.eq('profile_id', user.id)
			.eq('tenant_id', tenantRow.tenant_id)
			.single()

		if (ptRole?.role_id) {
			const { data: roleData } = await supabase
				.from('roles')
				.select('permissions')
				.eq('id', ptRole.role_id)
				.single()

			const perms = roleData?.permissions as Record<string, string[]> | null
			if (perms) {
				const orderPerms = perms.orders || []
				// If user has view_own but NOT view or all, filter by created_by
				const hasViewAll = orderPerms.includes('all') || orderPerms.includes('*') || orderPerms.includes('view')
				if (!hasViewAll && orderPerms.includes('view_own')) {
					query = query.eq('created_by', user.id)
				}
			}
		}

		if (statusFilter) {
			query = query.eq('status', statusFilter)
		}

		const { data: ordersData } = await query

		setOrders((ordersData as Order[]) || [])
		setLoading(false)
	}

	const handleStatusUpdate = async (orderId: string, newStatus: string) => {
		try {
			await updateOrderStatus(
				orderId,
				newStatus as
					| 'pending'
					| 'confirmed'
					| 'preparing'
					| 'ready'
					| 'completed'
					| 'cancelled'
			)
			loadOrders()
			toast.success('Order status updated successfully')
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Failed to update order'
			)
		}
	}

	const handleCompleteClick = (order: Order) => {
		setCompletingOrder(order)
		setDiscountType(order.discount_type as 'percent' | 'fixed' | null)
		setDiscountValue(order.discount_value?.toString() || '')
		setPaymentMethod(order.payment_method || '')
	}

	const handleCompleteOrder = async () => {
		if (!completingOrder || !paymentMethod) {
			toast.error('Please select a payment method')
			return
		}

		try {
			await completeOrderWithPayment(
				completingOrder.id,
				paymentMethod || 'cash',
				discountType || undefined,
				discountValue ? parseFloat(discountValue) : undefined
			)
			setCompletingOrder(null)
			setDiscountType(null)
			setDiscountValue('')
			setPaymentMethod('')
			loadOrders()
			toast.success('Order completed successfully')
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Failed to complete order'
			)
		}
	}

	const handleDelete = async (orderId: string) => {
		try {
			await deleteOrder(orderId)
			loadOrders()
			toast.success('Order deleted successfully')
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Failed to delete order'
			)
		}
	}

	const handleSendBill = async (order: Order) => {
		if (sendingBillId) return
		setSendingBillId(order.id)

		try {
			const supabase = createSupabaseBrowserClient()
			const finalTemplate = whatsappTemplate || {
				...DEFAULT_WHATSAPP_TEMPLATE,
				type: 'whatsapp'
			}

			const billOrderData = {
				id: order.id,
				created_at: order.created_at,
				order_type: order.order_type,
				table_number: order.table_number,
				customer_name: order.customer_name,
				customer_phone: order.customer_phone,
				subtotal: order.subtotal,
				tax: order.tax,
				discount_amount: order.discount_amount,
				total: order.total,
				payment_method: order.payment_method,
				order_items: order.order_items.map((item) => ({
					id: item.id,
					name: item.name,
					quantity: item.quantity,
					unit_price: item.unit_price,
					total_price: item.total_price
				}))
			}

			const config = {
				order: billOrderData,
				template: finalTemplate,
				tenantName: tenantName,
				currencySymbol: currencySymbol
			}

			const { url } = await generateAndUploadBill(config, supabase, tenantId)
			openWhatsApp(url, order.customer_phone, tenantName, billTagline, billReviewLink)
			toast.success('Bill generated & WhatsApp opened successfully!')
		} catch (err: any) {
			console.error('Error generating/uploading bill:', err)
			toast.error(`Error sending bill: ${err.message || err}`)
		} finally {
			setSendingBillId(null)
		}
	}

	const handleEditClick = (order: Order) => {
		setEditingOrder(order)
		setEditedItems(
			order.order_items.map((item) => ({
				id: item.id,
				menuItemId: '', // We'll need to fetch this or store it
				name: item.name,
				quantity: item.quantity,
				unitPrice: item.unit_price,
				totalPrice: item.total_price,
				notes: item.notes
			}))
		)
		setEditCustomerName(order.customer_name || '')
		setEditTableNumber(order.table_number)
		setEditOrderType(order.order_type as 'dine_in' | 'takeaway' | 'delivery')
		setEditDiscountType(order.discount_type as 'percent' | 'fixed' | null)
		setEditDiscountValue(order.discount_value?.toString() || '')
		setShowAddItem(false)
		setItemSearchQuery('')
		setSelectedCategoryForItem(null)
	}

	const handleUpdateItemQuantity = (index: number, delta: number) => {
		setEditedItems((items) => {
			const newItems = [...items]
			const item = newItems[index]
			const newQuantity = Math.max(1, item.quantity + delta)
			const newTotalPrice = item.unitPrice * newQuantity
			newItems[index] = {
				...item,
				quantity: newQuantity,
				totalPrice: newTotalPrice
			}
			return newItems
		})
	}

	const handleRemoveItem = (index: number) => {
		setEditedItems((items) => items.filter((_, i) => i !== index))
	}

	const handleItemClick = (menuItem: {
		id: string
		name: string
		description: string | null
		base_price: number
		menu_item_variants: Array<{
			id: string
			name: string
			price_modifier: number
			is_default: boolean
		}>
		menu_item_toppings: Array<{
			topping:
				| Array<{
						id: string
						name: string
						price: number
						description: string | null
				  }>
				| {
						id: string
						name: string
						price: number
						description: string | null
				  }
				| null
		}>
	}) => {
		// Check if item has variants or add-ons
		const hasVariants = (menuItem.menu_item_variants?.length ?? 0) > 0
		const hasToppings = (menuItem.menu_item_toppings?.length ?? 0) > 0

		if (hasVariants || hasToppings) {
			// Open customization modal
			setCustomizingItem(menuItem)
		} else {
			// Add directly without customization
			handleAddItemDirect(menuItem)
		}
	}

	const handleAddItemDirect = (menuItem: {
		id: string
		name: string
		base_price: number
	}) => {
		setEditedItems((items) => [
			...items,
			{
				menuItemId: menuItem.id,
				name: menuItem.name,
				quantity: 1,
				unitPrice: menuItem.base_price,
				totalPrice: menuItem.base_price,
				notes: null
			}
		])
		setShowAddItem(false)
		setItemSearchQuery('')
		setSelectedCategoryForItem(null)
	}

	const handleCustomizedAdd = (customized: {
		menuItemId: string
		name: string
		variant: {
			id: string
			name: string
			price_modifier: number
			is_default: boolean
		} | null
		toppings: Array<{ id: string; name: string; price: number }>
		quantity: number
		basePrice: number
	}) => {
		const variantPrice = customized.variant?.price_modifier || 0
		const toppingsPrice = customized.toppings.reduce(
			(sum, t) => sum + t.price,
			0
		)
		const unitPrice = customized.basePrice + variantPrice + toppingsPrice
		const totalPrice = unitPrice * customized.quantity

		// Build item name with variant and add-ons
		let itemName = customized.name
		if (customized.variant) {
			itemName += ` (${customized.variant.name})`
		}
		if (customized.toppings.length > 0) {
			const toppingNames = customized.toppings.map((t) => t.name).join(', ')
			itemName += ` + ${toppingNames}`
		}

		setEditedItems((items) => [
			...items,
			{
				menuItemId: customized.menuItemId,
				name: itemName,
				quantity: customized.quantity,
				unitPrice,
				totalPrice,
				notes: null
			}
		])
		setCustomizingItem(null)
		setShowAddItem(false)
		setItemSearchQuery('')
		setSelectedCategoryForItem(null)
	}

	const filteredMenuItemsForAdd = menuItems.filter((item) => {
		const matchesSearch = item.name
			.toLowerCase()
			.includes(itemSearchQuery.toLowerCase())
		const matchesCategory =
			!selectedCategoryForItem || item.category_id === selectedCategoryForItem
		return matchesSearch && matchesCategory
	})

	const handleSaveOrder = async () => {
		if (!editingOrder) return

		const subtotal = editedItems.reduce((sum, item) => sum + item.totalPrice, 0)
		const tax = subtotal * (taxRate / 100)

		// Calculate discount
		let discountAmount = 0
		if (editDiscountType && editDiscountValue) {
			const value = parseFloat(editDiscountValue) || 0
			const totalBeforeDiscount = subtotal + tax

			if (editDiscountType === 'percent') {
				discountAmount = totalBeforeDiscount * (value / 100)
			} else {
				discountAmount = Math.min(value, totalBeforeDiscount)
			}
		}

		const total = subtotal + tax - discountAmount

		try {
			await updateOrder(editingOrder.id, {
				customerName: editCustomerName || null,
				customerPhone: null,
				customerEmail: null,
				tableNumber: editTableNumber,
				orderType: editOrderType,
				items: editedItems,
				subtotal,
				tax,
				total,
				discountAmount: discountAmount > 0 ? discountAmount : undefined,
				discountType: editDiscountType || undefined,
				discountValue: editDiscountValue
					? parseFloat(editDiscountValue)
					: undefined
			})
			setEditingOrder(null)
			setEditedItems([])
			setEditCustomerName('')
			setEditTableNumber(null)
			setEditOrderType('dine_in')
			setEditDiscountType(null)
			setEditDiscountValue('')
			loadOrders()
			toast.success('Order updated successfully')
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Failed to update order'
			)
		}
	}

	// Date filtering logic
	const getDateRange = () => {
		const now = new Date()
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

		switch (dateFilter) {
			case 'today':
				return {
					start: today,
					end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
				}
			case 'yesterday': {
				const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
				return {
					start: yesterday,
					end: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
				}
			}
			case 'last7days':
				return {
					start: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000),
					end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
				}
			case 'custom': {
				if (customStartDate && customEndDate) {
					return {
						start: new Date(customStartDate),
						end: new Date(
							new Date(customEndDate).getTime() + 24 * 60 * 60 * 1000 - 1
						)
					}
				}
				return null
			}
			default:
				return null
		}
	}

	const filteredOrders = orders.filter((order) => {
		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase()
			const matchesSearch =
				order.table_number?.toLowerCase().includes(query) ||
				order.customer_name?.toLowerCase().includes(query) ||
				order.id.toLowerCase().includes(query)
			if (!matchesSearch) return false
		}

		// Status filter
		if (statusFilter && order.status !== statusFilter) {
			return false
		}

		// Date filter
		const dateRange = getDateRange()
		if (dateRange) {
			const orderDate = new Date(order.created_at)
			if (orderDate < dateRange.start || orderDate > dateRange.end) {
				return false
			}
		}

		return true
	})

	// Calculate discount and new total for completing order
	const calculatedDiscount = useMemo(() => {
		if (!completingOrder || !discountType || !discountValue) return 0
		const value = parseFloat(discountValue) || 0
		const subtotal = completingOrder.subtotal
		const tax = completingOrder.tax
		const totalBeforeDiscount = subtotal + tax

		if (discountType === 'percent') {
			return totalBeforeDiscount * (value / 100)
		} else {
			return Math.min(value, totalBeforeDiscount)
		}
	}, [completingOrder, discountType, discountValue])

	const calculatedTotal = useMemo(() => {
		if (!completingOrder) return 0
		const subtotal = completingOrder.subtotal
		const tax = completingOrder.tax
		return subtotal + tax - calculatedDiscount
	}, [completingOrder, calculatedDiscount])

	if (loading) {
		return (
			<div className="flex h-[calc(100vh-120px)] items-center justify-center">
				<div className="text-center">
					<div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white/60 mx-auto" />
				<p className="text-white/60">Loading orders...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-8 py-6">
			<header className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<Badge className="border-white/20 bg-white/10 text-white/80">
						Orders
					</Badge>
					<h1 className="mt-3 text-3xl font-semibold text-white">
						Order Management
					</h1>
					<p className="text-white/60">
						Track and manage all orders in real-time
					</p>
				</div>
			</header>

			{/* Filters */}
			<div className="space-y-4">
				{/* Search and Status Filters */}
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="relative flex-1 max-w-md">
					<Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
					<input
						type="text"
						placeholder="Search by table, customer, or order ID..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full rounded-2xl border border-white/10 bg-white/5 px-12 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
					/>
				</div>
				<div className="flex gap-2 overflow-x-auto">
					<Button
						variant={statusFilter === null ? 'default' : 'ghost'}
						size="sm"
						onClick={() => setStatusFilter(null)}
					>
						<Filter className="mr-2 h-4 w-4" />
						All
					</Button>
					{Object.entries(statusConfig).map(([status, config]) => {
						const Icon = config.icon
						return (
							<Button
								key={status}
								variant={statusFilter === status ? 'default' : 'ghost'}
								size="sm"
								onClick={() => setStatusFilter(status)}
							>
								<Icon className="mr-2 h-4 w-4" />
								{config.label}
							</Button>
						)
					})}
					</div>
				</div>

				{/* Date Filters */}
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-2 overflow-x-auto">
						<CalendarDays className="h-4 w-4 shrink-0 text-white/60" />
						<div className="flex gap-2">
							<Button
								variant={dateFilter === 'today' ? 'default' : 'ghost'}
								size="sm"
								onClick={() => setDateFilter('today')}
								className="shrink-0"
							>
								Today
							</Button>
							<Button
								variant={dateFilter === 'yesterday' ? 'default' : 'ghost'}
								size="sm"
								onClick={() => setDateFilter('yesterday')}
								className="shrink-0"
							>
								Yesterday
							</Button>
							<Button
								variant={dateFilter === 'last7days' ? 'default' : 'ghost'}
								size="sm"
								onClick={() => setDateFilter('last7days')}
								className="shrink-0"
							>
								Last 7 Days
							</Button>
							<Button
								variant={dateFilter === 'custom' ? 'default' : 'ghost'}
								size="sm"
								onClick={() => setDateFilter('custom')}
								className="shrink-0"
							>
								Custom
							</Button>
						</div>
					</div>
					{dateFilter === 'custom' && (
						<div className="flex items-center gap-2">
							<input
								type="date"
								value={customStartDate}
								onChange={(e) => setCustomStartDate(e.target.value)}
								className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
							/>
							<span className="text-white/60">to</span>
							<input
								type="date"
								value={customEndDate}
								onChange={(e) => setCustomEndDate(e.target.value)}
								max={new Date().toISOString().split('T')[0]}
								className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
							/>
						</div>
					)}
				</div>
			</div>

			{/* Orders List */}
			{filteredOrders.length === 0 ? (
				<section className="rounded-[28px] border border-dashed border-white/20 bg-white/5 p-10 text-center backdrop-blur-2xl">
					<Receipt className="mx-auto h-10 w-10 text-white/50" />
					<h2 className="mt-4 text-2xl font-semibold text-white">
						No orders yet
					</h2>
					<p className="mt-2 text-white/60">
						Orders placed through POS will appear here
					</p>
				</section>
			) : (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
					{filteredOrders.map((order) => {
						const status = statusConfig[order.status] || statusConfig.pending
						const StatusIcon = status.icon
						const itemCount = order.order_items.reduce(
							(sum, item) => sum + item.quantity,
							0
						)
						const timeAgo = new Date(order.created_at)
						const now = new Date()
						const minutesAgo = Math.floor(
							(now.getTime() - timeAgo.getTime()) / 60000
						)

						return (
							<motion.div
								key={order.id}
								initial={{ opacity: 0, scale: 0.95 }}
								animate={{ opacity: 1, scale: 1 }}
								className="group relative flex min-h-[500px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl transition-all hover:border-white/20 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
							>
								{/* Status Bar */}
								<div
									className={cn(
										'absolute top-0 left-0 right-0 h-1',
										status.color
									)}
								/>

								{/* Header */}
								<div className="mb-4 flex items-start justify-between">
									<div className="flex-1">
										<div className="mb-2 flex items-center gap-2">
											<div
												className={cn(
													'flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-medium',
													status.color
												)}
											>
												<StatusIcon className="h-3.5 w-3.5" />
												{status.label}
											</div>
											{order.table_number && (
												<div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80">
													Table {order.table_number}
												</div>
											)}
										</div>
										<h3 className="text-lg font-bold text-white">
											#{order.id.slice(0, 8).toUpperCase()}
										</h3>
										<div className="mt-1.5 flex items-center gap-3 text-xs text-white/50">
										{order.customer_name && (
												<div className="flex items-center gap-1">
													<User className="h-3 w-3" />
													<span className="font-medium">
														{order.customer_name}
													</span>
												</div>
										)}
											<div className="flex items-center gap-1">
												<Calendar className="h-3 w-3" />
												<span>
													{minutesAgo < 1
														? 'Just now'
														: minutesAgo < 60
															? `${minutesAgo}m ago`
															: `${Math.floor(minutesAgo / 60)}h ago`}
												</span>
											</div>
										</div>
									</div>
								</div>

								{/* Order Items */}
								<div className="mb-4 space-y-2">
									{order.order_items.slice(0, 4).map((item) => (
												<div
													key={item.id}
											className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
												>
											<div className="flex-1 min-w-0">
												<p className="font-medium text-white truncate">
													{item.name}
												</p>
												<div className="mt-0.5 flex items-center gap-2 text-xs text-white/50">
													<span>Qty: {item.quantity}</span>
														{item.notes && (
														<span className="truncate">• {item.notes}</span>
														)}
													</div>
											</div>
											<div className="ml-3 shrink-0 text-sm font-semibold text-white">
												{currencySymbol}
												{item.total_price.toFixed(2)}
											</div>
												</div>
											))}
									{order.order_items.length > 4 && (
										<div className="rounded-lg bg-white/5 px-3 py-2 text-center text-xs font-medium text-white/60">
											+{order.order_items.length - 4} more item
											{order.order_items.length - 4 !== 1 ? 's' : ''}
										</div>
									)}
									</div>

								{/* Summary */}
								<div className="mb-4 space-y-1.5 rounded-lg border border-white/10 bg-white/5 p-3">
									<div className="flex items-center justify-between text-xs">
										<span className="text-white/60">Subtotal</span>
										<span className="font-medium text-white">
											{currencySymbol}
											{order.subtotal.toFixed(2)}
										</span>
											</div>
									{order.tax > 0 && (
										<div className="flex items-center justify-between text-xs">
											<span className="text-white/60">Tax</span>
											<span className="font-medium text-white">
												{currencySymbol}
												{order.tax.toFixed(2)}
											</span>
											</div>
									)}
											{order.discount_amount && order.discount_amount > 0 && (
										<div className="flex items-center justify-between text-xs">
											<span className="text-emerald-300">Discount</span>
											<span className="font-medium text-emerald-300">
												-{currencySymbol}
												{order.discount_amount.toFixed(2)}
													</span>
												</div>
											)}
									<div className="border-t border-white/10 pt-1.5 mt-1.5 flex items-center justify-between">
										<span className="text-sm font-semibold text-white">
											Total
										</span>
										<span className="text-lg font-bold text-white">
											{currencySymbol}
											{/* Recalculate total to ensure accuracy: subtotal + tax - discount */}
											{(order.subtotal + order.tax - (order.discount_amount || 0)).toFixed(2)}
										</span>
									</div>
								</div>

								{/* Footer - Fixed at bottom */}
								<div className="mt-auto space-y-3 pt-4">
									{/* Status Actions */}
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											{order.payment_method && (
												<div className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium capitalize text-white/70">
														{order.payment_method}
												</div>
											)}
											<div className="text-xs text-white/50">
												{itemCount} item{itemCount !== 1 ? 's' : ''}
											</div>
										</div>
										<div className="flex items-center gap-1.5">
											{order.status === 'pending' && (
												<Button
													size="sm"
													onClick={() =>
														handleStatusUpdate(order.id, 'confirmed')
													}
													className="h-8 text-xs font-medium"
												>
													<CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
													Confirm
												</Button>
											)}
											{order.status === 'confirmed' && (
												<Button
													size="sm"
													onClick={() =>
														handleStatusUpdate(order.id, 'preparing')
													}
													className="h-8 text-xs font-medium"
												>
													<ChefHat className="mr-1.5 h-3.5 w-3.5" />
													Start
												</Button>
											)}
											{order.status === 'preparing' && (
												<Button
													size="sm"
													onClick={() => handleStatusUpdate(order.id, 'ready')}
													className="h-8 text-xs font-medium"
												>
													<Package className="mr-1.5 h-3.5 w-3.5" />
													Ready
												</Button>
											)}
											{order.status === 'ready' && (
												<Button
													size="sm"
													onClick={() => handleCompleteClick(order)}
													className="h-8 text-xs font-medium bg-emerald-500 hover:bg-emerald-600"
												>
													<CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
													Complete
												</Button>
											)}
											{order.status !== 'completed' &&
												order.status !== 'cancelled' && (
													<Button
														size="icon"
														variant="ghost"
														onClick={() =>
															handleStatusUpdate(order.id, 'cancelled')
														}
														className="h-8 w-8 text-red-400 hover:bg-red-400/10 hover:text-red-300"
													>
														<XCircle className="h-4 w-4" />
													</Button>
												)}
										</div>
									</div>

									{/* Send Bill Action */}
									<Button
										variant="ghost"
										size="sm"
										onClick={() => handleSendBill(order)}
										disabled={sendingBillId !== null}
										className="w-full border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 h-9"
									>
										{sendingBillId === order.id ? (
											<div className="flex items-center gap-1.5 justify-center">
												<div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
												<span>Sending...</span>
											</div>
										) : (
											<>
												<Receipt className="mr-2 h-4 w-4" />
												Send Bill to WhatsApp
											</>
										)}
									</Button>

									{/* Edit and Delete Buttons - Fixed at bottom */}
									<div className="flex items-center gap-2 border-t border-white/10 pt-3">
											<Button
											variant="ghost"
												size="sm"
											onClick={() => handleEditClick(order)}
											className="flex-1 border border-white/10 hover:bg-white/10"
										>
											<Edit className="mr-2 h-4 w-4" />
											Edit
										</Button>
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
												variant="ghost"
													size="sm"
													className="flex-1 border border-red-400/20 text-red-400 hover:bg-red-400/10 hover:text-red-300"
												>
													<Trash2 className="mr-2 h-4 w-4" />
													Delete
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														Delete Order #{order.id.slice(0, 8).toUpperCase()}?
													</AlertDialogTitle>
													<AlertDialogDescription>
														This order will be permanently deleted. This action
														cannot be undone.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>Keep Order</AlertDialogCancel>
													<AlertDialogAction
												onClick={() => handleDelete(order.id)}
														className="bg-red-500 hover:bg-red-600"
											>
												Delete
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</div>
								</div>
							</motion.div>
						)
					})}
				</div>
			)}

			{/* Edit Order Modal */}
			{editingOrder && (
				<div className="fixed inset-0 z-50">
					<div
						className="absolute inset-0 bg-black/60 backdrop-blur-sm"
						onClick={() => {
							setEditingOrder(null)
							setEditedItems([])
						}}
					/>
					<motion.div
						initial={{ opacity: 0, x: 80 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: 80 }}
						className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-6 shadow-[0_40px_120px_rgba(3,5,18,0.85)]"
					>
						<div className="mb-6 flex items-center justify-between">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-white/50">
									Edit order
								</p>
								<h2 className="mt-1 text-2xl font-semibold text-white">
									Order #{editingOrder.id.slice(0, 8).toUpperCase()}
								</h2>
							</div>
							<Button
								size="icon"
								variant="ghost"
								onClick={() => {
									setEditingOrder(null)
									setEditedItems([])
									setEditCustomerName('')
									setEditTableNumber(null)
									setEditOrderType('dine_in')
									setEditDiscountType(null)
									setEditDiscountValue('')
									setShowAddItem(false)
									setItemSearchQuery('')
									setSelectedCategoryForItem(null)
								}}
							>
								<X className="h-5 w-5" />
											</Button>
										</div>

						<div className="space-y-6">
							{/* Customer & Order Info */}
							<div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
								<h3 className="text-sm font-semibold text-white">
									Order Details
								</h3>
								<div className="space-y-3">
									<div>
										<label className="mb-1 block text-xs text-white/60">
											Customer Name
										</label>
										<input
											type="text"
											value={editCustomerName}
											onChange={(e) => setEditCustomerName(e.target.value)}
											placeholder="Enter customer name"
											className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
										/>
									</div>
									<div className="grid grid-cols-2 gap-3">
										<div>
											<label className="mb-1.5 block text-xs text-white/60">
												Order Type
											</label>
											<CustomSelect
												value={editOrderType}
												onChange={(val) => setEditOrderType(val as any)}
												options={orderTypeOptions}
												placeholder="Select type"
											/>
										</div>
										{editOrderType === 'dine_in' && (
											<div>
												<label className="mb-1.5 block text-xs text-white/60">
													Table
												</label>
												<CustomSelect
													value={editTableNumber || ''}
													onChange={(val) => setEditTableNumber(val || null)}
													options={tableOptions}
													placeholder="Select table"
												/>
											</div>
										)}
									</div>
								</div>
							</div>

							{/* Order Items */}
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<h3 className="text-sm font-semibold text-white">
										Order Items
									</h3>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setShowAddItem(!showAddItem)}
										className="h-8 text-xs"
									>
										<Plus className="mr-1.5 h-3.5 w-3.5" />
										Add Item
									</Button>
								</div>

								{/* Add Item Section */}
								{showAddItem && (
									<div className="rounded-lg border border-white/10 bg-white/5 p-4">
										<div className="mb-3">
											<div className="relative mb-2">
												<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
												<input
													type="text"
													placeholder="Search menu items..."
													value={itemSearchQuery}
													onChange={(e) => setItemSearchQuery(e.target.value)}
													className="w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
												/>
											</div>
											<div className="flex gap-2 overflow-x-auto">
												<Button
													variant={
														selectedCategoryForItem === null
															? 'default'
															: 'ghost'
													}
													size="sm"
													onClick={() => setSelectedCategoryForItem(null)}
													className="shrink-0 text-xs"
												>
													All
												</Button>
												{categories.map((cat) => (
													<Button
														key={cat.id}
														variant={
															selectedCategoryForItem === cat.id
																? 'default'
																: 'ghost'
														}
														size="sm"
														onClick={() => setSelectedCategoryForItem(cat.id)}
														className="shrink-0 text-xs"
													>
														{cat.name}
													</Button>
												))}
											</div>
										</div>
										<div className="max-h-48 space-y-2 overflow-y-auto">
											{filteredMenuItemsForAdd.length === 0 ? (
												<p className="text-center text-xs text-white/50">
													No items found
												</p>
											) : (
												filteredMenuItemsForAdd.map((item) => {
													const hasVariants =
														(item.menu_item_variants?.length ?? 0) > 0
													const hasToppings =
														(item.menu_item_toppings?.length ?? 0) > 0
													return (
														<button
															key={item.id}
															onClick={() => handleItemClick(item)}
															className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left transition hover:border-white/20 hover:bg-white/10"
														>
															<div className="flex items-center justify-between">
																<div className="flex-1">
																	<span className="text-sm font-medium text-white">
																		{item.name}
																	</span>
																	{(hasVariants || hasToppings) && (
																		<div className="mt-1 flex gap-1">
																			{hasVariants && (
																				<span className="text-xs text-white/50">
																					Variants
																				</span>
																			)}
																			{hasToppings && (
																				<span className="text-xs text-white/50">
																					Add-ons
																				</span>
																			)}
									</div>
																	)}
								</div>
																<span className="text-sm text-white/60">
																	{currencySymbol}
																	{item.base_price.toFixed(2)}
																</span>
															</div>
														</button>
													)
												})
											)}
										</div>
									</div>
								)}

								{editedItems.map((item, index) => (
									<div
										key={index}
										className="rounded-lg border border-white/10 bg-white/5 p-4"
									>
										<div className="mb-3 flex items-start justify-between">
											<div className="flex-1">
												<p className="font-medium text-white">{item.name}</p>
												<p className="mt-1 text-sm text-white/60">
													{currencySymbol}
													{item.unitPrice.toFixed(2)} each
												</p>
												{item.notes && (
													<p className="mt-1 text-xs text-white/50">
														{item.notes}
													</p>
												)}
											</div>
											<Button
												size="icon"
												variant="ghost"
												onClick={() => handleRemoveItem(index)}
												className="h-8 w-8 text-red-400 hover:bg-red-400/10"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-3">
												<Button
													size="icon"
													variant="ghost"
													onClick={() => handleUpdateItemQuantity(index, -1)}
													className="h-8 w-8 border border-white/10"
												>
													<Minus className="h-4 w-4" />
												</Button>
												<span className="w-8 text-center font-medium text-white">
													{item.quantity}
												</span>
												<Button
													size="icon"
													variant="ghost"
													onClick={() => handleUpdateItemQuantity(index, 1)}
													className="h-8 w-8 border border-white/10"
												>
													<Plus className="h-4 w-4" />
												</Button>
											</div>
											<p className="text-lg font-semibold text-white">
												{currencySymbol}
												{item.totalPrice.toFixed(2)}
											</p>
										</div>
									</div>
								))}
							</div>

							{/* Discount Section */}
							<div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
								<div className="flex items-center justify-between">
									<span className="text-sm font-semibold text-white">
										Discount
									</span>
									<div className="flex gap-1">
										<Button
											type="button"
											size="sm"
											variant={
												editDiscountType === 'percent' ? 'default' : 'ghost'
											}
											onClick={() => {
												setEditDiscountType('percent')
												if (!editDiscountValue) setEditDiscountValue('')
											}}
											className="h-7 text-xs"
										>
											<Percent className="h-3 w-3" />
										</Button>
										<Button
											type="button"
											size="sm"
											variant={
												editDiscountType === 'fixed' ? 'default' : 'ghost'
											}
											onClick={() => {
												setEditDiscountType('fixed')
												if (!editDiscountValue) setEditDiscountValue('')
											}}
											className="h-7 text-xs"
										>
											<DollarSign className="h-3 w-3" />
										</Button>
										{editDiscountType && (
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={() => {
													setEditDiscountType(null)
													setEditDiscountValue('')
												}}
												className="h-7 text-xs"
											>
												<X className="h-3 w-3" />
											</Button>
										)}
									</div>
								</div>
								{editDiscountType && (
									<input
										type="number"
										step={editDiscountType === 'percent' ? '0.1' : '0.01'}
										min="0"
										max={editDiscountType === 'percent' ? '100' : undefined}
										value={editDiscountValue}
										onChange={(e) => setEditDiscountValue(e.target.value)}
										placeholder={
											editDiscountType === 'percent'
												? 'Enter %'
												: 'Enter amount'
										}
										className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									/>
								)}
							</div>

							{/* Summary */}
							<div className="rounded-lg border border-white/10 bg-white/5 p-4">
								<div className="mb-3 flex items-center justify-between text-sm">
									<span className="text-white/60">Subtotal</span>
									<span className="font-medium text-white">
										{currencySymbol}
										{editedItems
											.reduce((sum, item) => sum + item.totalPrice, 0)
											.toFixed(2)}
									</span>
								</div>
								{taxRate > 0 && (
									<div className="mb-3 flex items-center justify-between text-sm">
										<span className="text-white/60">Tax</span>
										<span className="font-medium text-white">
											{currencySymbol}
											{(
												editedItems.reduce(
													(sum, item) => sum + item.totalPrice,
													0
												) *
												(taxRate / 100)
											).toFixed(2)}
										</span>
									</div>
								)}
								{editDiscountType &&
									editDiscountValue &&
									(() => {
										const subtotal = editedItems.reduce(
											(sum, item) => sum + item.totalPrice,
											0
										)
										const tax = subtotal * (taxRate / 100)
										const totalBeforeDiscount = subtotal + tax
										const value = parseFloat(editDiscountValue) || 0
										const discount =
											editDiscountType === 'percent'
												? totalBeforeDiscount * (value / 100)
												: Math.min(value, totalBeforeDiscount)
										return (
											<div className="mb-3 flex items-center justify-between text-sm">
												<span className="text-emerald-300">Discount</span>
												<span className="font-medium text-emerald-300">
													-{currencySymbol}
													{discount.toFixed(2)}
												</span>
											</div>
										)
									})()}
								<div className="border-t border-white/10 pt-3 flex items-center justify-between">
									<span className="text-base font-semibold text-white">
										Total
									</span>
									<span className="text-xl font-bold text-white">
										{currencySymbol}
										{(() => {
											const subtotal = editedItems.reduce(
												(sum, item) => sum + item.totalPrice,
												0
											)
											const tax = subtotal * (taxRate / 100)
											const totalBeforeDiscount = subtotal + tax
											let discount = 0
											if (editDiscountType && editDiscountValue) {
												const value = parseFloat(editDiscountValue) || 0
												discount =
													editDiscountType === 'percent'
														? totalBeforeDiscount * (value / 100)
														: Math.min(value, totalBeforeDiscount)
											}
											return (totalBeforeDiscount - discount).toFixed(2)
										})()}
									</span>
								</div>
							</div>

							{/* Actions */}
							<div className="flex gap-3 pt-4">
								<Button
									variant="ghost"
									onClick={() => {
										setEditingOrder(null)
										setEditedItems([])
									}}
									className="flex-1"
								>
									Cancel
								</Button>
								<Button onClick={handleSaveOrder} className="flex-1">
									<CheckCircle2 className="mr-2 h-4 w-4" />
									Save Changes
								</Button>
							</div>
						</div>
					</motion.div>
				</div>
			)}

			{/* Complete Order Modal */}
			{completingOrder && (
				<div className="fixed inset-0 z-50">
					<div
						className="absolute inset-0 bg-black/60 backdrop-blur-sm"
						onClick={() => {
							setCompletingOrder(null)
							setDiscountType(null)
							setDiscountValue('')
							setPaymentMethod('')
						}}
					/>
					<motion.div
						initial={{ opacity: 0, x: 80 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: 80 }}
						className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 shadow-[0_40px_120px_rgba(3,5,18,0.85)]"
					>
						<div className="flex items-center justify-between mb-6">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-white/50">
									Complete order
								</p>
								<h2 className="mt-1 text-2xl font-semibold text-white">
									Order #{completingOrder.id.slice(0, 8)}
								</h2>
							</div>
							<Button
								size="icon"
								variant="ghost"
								onClick={() => {
									setCompletingOrder(null)
									setDiscountType(null)
									setDiscountValue('')
									setPaymentMethod('')
									setIsPaymentDropdownOpen(false)
								}}
							>
								<X className="h-5 w-5" />
							</Button>
						</div>

						<div className="space-y-6">
							{/* Order Summary */}
							<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
								<div className="flex items-center justify-between text-sm text-white/70 mb-2">
									<span>Subtotal</span>
									<span>
										{currencySymbol}
										{completingOrder.subtotal.toFixed(2)}
									</span>
								</div>
								<div className="flex items-center justify-between text-sm text-white/70 mb-2">
									<span>Tax</span>
									<span>
										{currencySymbol}
										{completingOrder.tax.toFixed(2)}
									</span>
								</div>
								{(calculatedDiscount > 0 ||
									(completingOrder.discount_amount &&
										completingOrder.discount_amount > 0)) && (
									<div className="flex items-center justify-between text-sm text-emerald-300 mb-2">
										<span>
											Discount
											{discountType === 'percent' && discountValue
												? ` (${parseFloat(discountValue).toFixed(1)}%)`
												: discountType === 'fixed' && discountValue
													? ''
													: completingOrder.discount_type === 'percent' &&
														  completingOrder.discount_value
														? ` (${completingOrder.discount_value.toFixed(1)}%)`
														: ''}
										</span>
										<span>
											-{currencySymbol}
											{calculatedDiscount > 0
												? calculatedDiscount.toFixed(2)
												: (completingOrder.discount_amount || 0).toFixed(2)}
										</span>
									</div>
								)}
								<div className="flex items-center justify-between border-t border-white/10 pt-2 text-lg font-semibold text-white">
									<span>Total</span>
									<span>
										{currencySymbol}
										{calculatedTotal > 0
											? calculatedTotal.toFixed(2)
											: completingOrder.total.toFixed(2)}
									</span>
								</div>
							</div>

							{/* Discount Section */}
							<div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium text-white/70">
										Apply Discount
									</span>
									<div className="flex gap-1">
										<Button
											type="button"
											size="sm"
											variant={discountType === 'percent' ? 'default' : 'ghost'}
											onClick={() => {
												setDiscountType('percent')
												if (!discountValue) setDiscountValue('')
											}}
											className="h-7 text-xs"
										>
											<Percent className="h-3 w-3" />
										</Button>
										<Button
											type="button"
											size="sm"
											variant={discountType === 'fixed' ? 'default' : 'ghost'}
											onClick={() => {
												setDiscountType('fixed')
												if (!discountValue) setDiscountValue('')
											}}
											className="h-7 text-xs"
										>
											<DollarSign className="h-3 w-3" />
										</Button>
										{discountType && (
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={() => {
													setDiscountType(null)
													setDiscountValue('')
												}}
												className="h-7 text-xs"
											>
												<X className="h-3 w-3" />
											</Button>
										)}
									</div>
								</div>
								{discountType && (
									<input
										type="number"
										step={discountType === 'percent' ? '0.1' : '0.01'}
										min="0"
										max={discountType === 'percent' ? '100' : undefined}
										value={discountValue}
										onChange={(e) => setDiscountValue(e.target.value)}
										placeholder={
											discountType === 'percent' ? 'Enter %' : 'Enter amount'
										}
										className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									/>
								)}
							</div>

							{/* Payment Method */}
							<div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
								<label className="block text-sm font-medium text-white/70">
									Payment Method <span className="text-red-400">*</span>
								</label>
								<CustomSelect
									value={paymentMethod}
									onChange={(val) => setPaymentMethod(val)}
									options={paymentOptions}
									placeholder="Select payment method"
								/>
							</div>

							{/* Actions */}
							<div className="flex gap-3 pt-4">
								<Button
									type="button"
									variant="ghost"
									onClick={() => {
										setCompletingOrder(null)
										setDiscountType(null)
										setDiscountValue('')
										setPaymentMethod('')
										setIsPaymentDropdownOpen(false)
									}}
									className="flex-1"
								>
									Cancel
								</Button>
								<Button
									type="button"
									onClick={handleCompleteOrder}
									disabled={!paymentMethod}
									className="flex-1"
								>
									<CheckCircle2 className="mr-2 h-4 w-4" />
									Complete Order
								</Button>
							</div>
						</div>
					</motion.div>
				</div>
			)}

			{/* Item Customization Modal for Add Item */}
			{customizingItem && (
				<ItemCustomizationModal
					item={customizingItem}
					isOpen={!!customizingItem}
					onClose={() => setCustomizingItem(null)}
					onAdd={handleCustomizedAdd}
					currencySymbol={currencySymbol}
				/>
			)}

		</div>
	)
}
