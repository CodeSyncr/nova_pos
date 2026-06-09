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
	MoreHorizontal,
	Table,
	Loader2,
	Printer,
	Bluetooth
} from 'lucide-react'
import {
	updateOrderStatus,
	deleteOrder,
	completeOrderWithPayment,
	updateOrder
} from '@/app/actions/orders'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { generateAndUploadBill, openWhatsApp, printBluetoothBill } from '@/lib/bill-generator'
import { DEFAULT_WHATSAPP_TEMPLATE, DEFAULT_THERMAL_TEMPLATE } from '@/lib/bill-template'
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
		colorClass: 'text-white/70 bg-white/5 border-white/10'
	},
	{
		value: 'takeaway',
		label: 'Takeaway',
		icon: Package,
		description: 'Self-pickup takeaway order',
		colorClass: 'text-white/70 bg-white/5 border-white/10'
	},
	{
		value: 'delivery',
		label: 'Delivery',
		icon: Clock,
		description: 'Home delivery courier',
		colorClass: 'text-white/70 bg-white/5 border-white/10'
	}
]

const paymentOptions: SelectOption[] = [
	{
		value: 'cash',
		label: 'Cash',
		icon: Coins,
		description: 'Accept cash in hand',
		colorClass: 'text-white/70 bg-white/5 border-white/10'
	},
	{
		value: 'card',
		label: 'Card',
		icon: CreditCard,
		description: 'Credit/Debit card reader terminal',
		colorClass: 'text-white/70 bg-white/5 border-white/10'
	},
	{
		value: 'upi',
		label: 'UPI',
		icon: QrCode,
		description: 'Direct UPI mobile bank transfer',
		colorClass: 'text-white/70 bg-white/5 border-white/10'
	},
	{
		value: 'wallet',
		label: 'Wallet',
		icon: Wallet,
		description: 'Paytm, PhonePe, GPay, etc.',
		colorClass: 'text-white/70 bg-white/5 border-white/10'
	},
	{
		value: 'other',
		label: 'Other',
		icon: MoreHorizontal,
		description: 'Alternative payment channel',
		colorClass: 'text-white/70 bg-white/5 border-white/10'
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
		color: 'bg-[#E0342A]/20 text-[#E0342A]',
		icon: Clock
	},
	confirmed: {
		label: 'Confirmed',
		color: 'bg-white/10 text-white/70',
		icon: CheckCircle2
	},
	preparing: {
		label: 'Preparing',
		color: 'bg-white/10 text-white/70',
		icon: ChefHat
	},
	ready: {
		label: 'Ready',
		color: 'bg-white/10 text-white/70',
		icon: Package
	},
	completed: {
		label: 'Completed',
		color: 'bg-white/15 text-white',
		icon: CheckCircle2
	},
	cancelled: {
		label: 'Cancelled',
		color: 'bg-[#E0342A]/20 text-[#E0342A]',
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
	const [editCustomerPhone, setEditCustomerPhone] = useState('')
	const [customers, setCustomers] = useState<any[]>([])

	const customerExists = useMemo(() => {
		const phone = editCustomerPhone.trim()
		if (!phone) return false
		return customers.some((c) => c.phone && c.phone.trim() === phone)
	}, [editCustomerPhone, customers])

	useEffect(() => {
		if (!editCustomerPhone.trim()) {
			return
		}

		const matchingCustomer = customers.find(
			(c) => c.phone && c.phone.trim() === editCustomerPhone.trim()
		)

		if (matchingCustomer && editCustomerName !== matchingCustomer.full_name) {
			setEditCustomerName(matchingCustomer.full_name)
		}
	}, [editCustomerPhone, customers, editCustomerName])


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

	const tablesWithStatus = useMemo(() => {
		const activeTableNumbers = orders
			.filter((o) => o.status !== 'completed' && o.status !== 'cancelled' && o.id !== editingOrder?.id)
			.map((o) => o.table_number)
			.filter(Boolean)

		return tables.map((t) => ({
			...t,
			status: activeTableNumbers.includes(t.number) ? 'occupied' : 'available'
		}))
	}, [tables, orders, editingOrder])

	const [showAddItem, setShowAddItem] = useState(false)
	const [itemSearchQuery, setItemSearchQuery] = useState('')

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
	const [bluetoothPrintingId, setBluetoothPrintingId] = useState<string | null>(null)
	const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
	const [savingEdit, setSavingEdit] = useState(false)
	const [tenantName, setTenantName] = useState('')
	const [tenantId, setTenantId] = useState('')
	const [whatsappTemplate, setWhatsappTemplate] = useState<any>(null)
	const [thermalTemplate, setThermalTemplate] = useState<any>(null)
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
			colorClass: 'text-white/70 bg-white/5 border-white/10'
		}))
		return [
			{ value: '', label: 'Select table', description: 'Clear table assignment', icon: X, colorClass: 'text-[#E0342A] bg-[#E0342A]/10 border-[#E0342A]/20' },
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
			if (templates?.thermal) {
				setThermalTemplate(templates.thermal)
			} else {
				setThermalTemplate(null)
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

		// Load tables from settings instead of querying database table

		if (menuItemsData) {
			// Ensure description field exists for all items and handle null/undefined variants/toppings
			const itemsWithDescription = menuItemsData.map((item) => {
				const linkedToppings = ((item as { menu_item_toppings?: any[] }).menu_item_toppings || []).filter((entry) => {
					// Keep only entries that resolve to a real topping
					const t = entry.topping as unknown
					if (!t) return false
					if (Array.isArray(t)) return t.length > 0 && !!t[0]
					return true
				})
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
		const configuredTables = (settings.tables as Array<{ id: string; name: string; capacity: number; section: string }> | undefined) || []
		let initialTables = configuredTables.map((t) => ({
			id: t.id,
			number: t.name
		}))

		if (initialTables.length === 0) {
			initialTables = [
				{ id: '1', number: 'T-01' },
				{ id: '2', number: 'T-02' },
				{ id: '3', number: 'T-03' },
				{ id: '4', number: 'T-04' },
				{ id: '5', number: 'T-05' },
				{ id: '6', number: 'T-06' },
				{ id: '7', number: 'T-07' },
				{ id: '8', number: 'T-08' }
			]
		}
		setTables(initialTables)

		// Load customers
		const { data: customersData } = await supabase
			.from('customers')
			.select('id, full_name, phone')
			.eq('tenant_id', tenantRow.tenant_id)
			.order('full_name', { ascending: true })

		if (customersData) setCustomers(customersData)

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
		setUpdatingOrderId(orderId)
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
		} finally {
			setUpdatingOrderId(null)
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



	const handleBluetoothPrint = async (order: Order) => {
		if (bluetoothPrintingId) return
		setBluetoothPrintingId(order.id)

		try {
			const finalTemplate = thermalTemplate || {
				...DEFAULT_THERMAL_TEMPLATE,
				type: 'thermal'
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

			await printBluetoothBill(config)
			toast.success('Thermal bill sent to Bluetooth printer successfully!')
		} catch (err: any) {
			console.error('Error printing Bluetooth bill:', err)
			toast.error(`Error printing: ${err.message || err}`)
		} finally {
			setBluetoothPrintingId(null)
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
		setEditCustomerPhone(order.customer_phone || '')
		setEditTableNumber(order.table_number)
		setEditOrderType(order.order_type as 'dine_in' | 'takeaway' | 'delivery')
		setEditDiscountType(order.discount_type as 'percent' | 'fixed' | null)
		setEditDiscountValue(order.discount_value?.toString() || '')
		setShowAddItem(false)
		setItemSearchQuery('')
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
		// Check if item has variants or add-ons (more than 1 variant or at least 1 topping)
		const hasVariants = (menuItem.menu_item_variants?.length ?? 0) > 1
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
	}

	const filteredMenuItemsForAdd = menuItems.filter((item) => {
		return item.name
			.toLowerCase()
			.includes(itemSearchQuery.toLowerCase())
	})

	const handleSaveOrder = async () => {
		if (!editingOrder) return
		setSavingEdit(true)

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
				customerPhone: editCustomerPhone || null,
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
			setEditCustomerPhone('')
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
		} finally {
			setSavingEdit(false)
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
								initial={{ opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								className="group relative flex flex-col justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-md transition-all duration-300 hover:border-white/15 hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
							>
								{/* Top accent border line based on status */}
								<div
									className={cn(
										'absolute top-0 left-0 right-0 h-[3px]',
										status.color
									)}
								/>

								{/* Header */}
								<div className="mb-4 border-b border-white/[0.06] pb-3">
									<div className="flex items-center justify-between">
										<h3 className="text-base font-bold text-white tracking-tight">
											Order #{order.id.slice(0, 8).toUpperCase()}
										</h3>
										<div
											className={cn(
												'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
												status.color
											)}
										>
											<StatusIcon className="h-3 w-3" />
											{status.label}
										</div>
									</div>

									<div className="mt-2 flex flex-wrap gap-2 items-center">
										{/* Order Type + Table Badge */}
										<div className="flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-white/65">
											{(() => {
												const typeData = {
													dine_in: { label: 'Dine In', icon: ChefHat },
													takeaway: { label: 'Takeaway', icon: Package },
													delivery: { label: 'Delivery', icon: Clock }
												}[order.order_type as 'dine_in' | 'takeaway' | 'delivery'] || { label: order.order_type, icon: ChefHat }
												const TypeIcon = typeData.icon
												return (
													<>
														<TypeIcon className="h-3 w-3 text-[#E0342A]" />
														<span>{typeData.label}</span>
														{order.table_number && <span className="text-white/30 ml-0.5">· Table {order.table_number}</span>}
													</>
												)
											})()}
										</div>

										{/* Time elapsed badge */}
										<div className="flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/50">
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

									{order.customer_name && (
										<div className="mt-2 flex items-center gap-1.5 text-xs text-white/65 bg-white/[0.01] border border-white/[0.04] rounded-lg px-2.5 py-1">
											<User className="h-3.5 w-3.5 text-white/40" />
											<span className="font-medium truncate">{order.customer_name}</span>
											{order.customer_phone && (
												<span className="text-[10px] text-white/30 ml-auto">({order.customer_phone})</span>
											)}
										</div>
									)}
								</div>

								{/* Order Items */}
								<div className="mb-4 flex-1 space-y-2.5 overflow-y-auto">
									{order.order_items.slice(0, 5).map((item) => (
										<div
											key={item.id}
											className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0"
										>
											<div className="flex items-baseline gap-2 min-w-0">
												<span className="text-[#E0342A] font-semibold text-xs shrink-0">
													{item.quantity}x
												</span>
												<span className="font-medium text-white text-sm truncate">
													{item.name}
												</span>
												{item.notes && (
													<span className="text-[10px] text-white/40 truncate">
														({item.notes})
													</span>
												)}
											</div>
											<div className="ml-3 shrink-0 text-xs text-white/70 font-medium tabular-nums">
												{currencySymbol}
												{item.total_price.toFixed(0)}
											</div>
										</div>
									))}
									{order.order_items.length > 5 && (
										<div className="text-[11px] text-center text-white/40 pt-1">
											+{order.order_items.length - 5} more item
											{order.order_items.length - 5 !== 1 ? 's' : ''}
										</div>
									)}
								</div>

								{/* Summary Totals */}
								<div className="pt-3 border-t border-white/[0.06] space-y-1.5">
									{order.tax > 0 && (
										<div className="flex items-center justify-between text-xs text-white/40">
											<span>Tax</span>
											<span className="tabular-nums">{currencySymbol}{order.tax.toFixed(0)}</span>
										</div>
									)}
									{(order.discount_amount ?? 0) > 0 && (
										<div className="flex items-center justify-between text-xs text-[#E0342A]/85">
											<span>Discount</span>
											<span className="tabular-nums">-{currencySymbol}{order.discount_amount?.toFixed(0)}</span>
										</div>
									)}
									<div className="flex items-baseline justify-between pt-1 text-white">
										<span className="text-sm font-semibold">Total</span>
										<span className="text-xl font-bold text-[#E0342A] tabular-nums">
											{currencySymbol}{(order.subtotal + order.tax - (order.discount_amount || 0)).toFixed(0)}
										</span>
									</div>
								</div>

								{/* Footer Actions */}
								<div className="mt-auto space-y-2.5 pt-3">
									<div className="flex items-center justify-between gap-1.5">
										{order.status === 'pending' && (
											<button
												onClick={() => handleStatusUpdate(order.id, 'confirmed')}
												disabled={updatingOrderId === order.id}
												className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#E0342A] hover:bg-[#C42A21] py-2 text-xs font-semibold text-white transition-all shadow-[0_4px_12px_rgba(224,52,42,0.3)] disabled:opacity-50 cursor-pointer h-9"
											>
												{updatingOrderId === order.id ? (
													<Loader2 className="h-3.5 w-3.5 animate-spin" />
												) : (
													<CheckCircle2 className="h-3.5 w-3.5" />
												)}
												Confirm Order
											</button>
										)}
										{order.status === 'confirmed' && (
											<button
												onClick={() => handleStatusUpdate(order.id, 'preparing')}
												disabled={updatingOrderId === order.id}
												className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 py-2 text-xs font-semibold text-white transition-all border border-white/5 disabled:opacity-50 cursor-pointer h-9"
											>
												{updatingOrderId === order.id ? (
													<Loader2 className="h-3.5 w-3.5 animate-spin" />
												) : (
													<ChefHat className="h-3.5 w-3.5" />
												)}
												Start Cooking
											</button>
										)}
										{order.status === 'preparing' && (
											<button
												onClick={() => handleStatusUpdate(order.id, 'ready')}
												disabled={updatingOrderId === order.id}
												className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 py-2 text-xs font-semibold text-white transition-all border border-white/5 disabled:opacity-50 cursor-pointer h-9"
											>
												{updatingOrderId === order.id ? (
													<Loader2 className="h-3.5 w-3.5 animate-spin" />
												) : (
													<Package className="h-3.5 w-3.5" />
												)}
												Mark Ready
											</button>
										)}
										{order.status === 'ready' && (
											<button
												onClick={() => handleCompleteClick(order)}
												className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#E0342A] hover:bg-[#C42A21] py-2 text-xs font-semibold text-white transition-all shadow-[0_4px_12px_rgba(224,52,42,0.3)] cursor-pointer h-9"
											>
												<CheckCircle2 className="h-3.5 w-3.5" />
												Complete Order
											</button>
										)}
										{order.status !== 'completed' && order.status !== 'cancelled' && (
											<button
												onClick={() => handleStatusUpdate(order.id, 'cancelled')}
												disabled={updatingOrderId === order.id}
												className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] text-white/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all cursor-pointer"
												title="Cancel Order"
											>
												<XCircle className="h-4 w-4" />
											</button>
										)}
									</div>

									{/* Bill Actions */}
									<div className="flex flex-col gap-2">
										<button
											onClick={() => handleSendBill(order)}
											disabled={sendingBillId !== null}
											className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.01] hover:bg-white/5 hover:border-white/15 py-2 text-xs font-medium text-white/80 transition-all cursor-pointer h-9"
										>
											{sendingBillId === order.id ? (
												<div className="flex items-center gap-1.5 justify-center">
													<div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
													<span>Sending Bill...</span>
												</div>
											) : (
												<>
													<Receipt className="h-3.5 w-3.5 text-[#E0342A]" />
													<span>Send WhatsApp Bill</span>
												</>
											)}
										</button>
										<button
											onClick={() => handleBluetoothPrint(order)}
											disabled={bluetoothPrintingId !== null}
											className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.01] hover:bg-white/5 hover:border-white/15 py-2 text-xs font-medium text-white/80 transition-all cursor-pointer h-9"
										>
											{bluetoothPrintingId === order.id ? (
												<div className="flex items-center gap-1.5 justify-center">
													<div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
													<span>Printing Bill...</span>
												</div>
											) : (
												<>
													<Printer className="h-3.5 w-3.5 text-[#E0342A]" />
													<span>Print Bill</span>
												</>
											)}
										</button>
									</div>

									{/* Edit and Delete Buttons */}
									<div className="flex items-center gap-2 border-t border-white/[0.06] pt-2.5">
										<button
											onClick={() => handleEditClick(order)}
											className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.01] hover:bg-white/5 hover:border-white/15 py-2 text-xs font-medium text-white/80 transition-all cursor-pointer h-9"
										>
											<Edit className="h-3.5 w-3.5 text-white/40" />
											<span>Edit</span>
										</button>
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<button
													className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-red-500/10 bg-red-500/[0.01] hover:bg-red-500/10 hover:border-red-500/20 py-2 text-xs font-medium text-red-400 transition-all cursor-pointer h-9"
												>
													<Trash2 className="h-3.5 w-3.5" />
													<span>Delete</span>
												</button>
											</AlertDialogTrigger>
											<AlertDialogContent className="bg-[#0d0d0f]/98 border border-white/10 rounded-2xl">
												<AlertDialogHeader>
													<AlertDialogTitle className="text-white">
														Delete Order #{order.id.slice(0, 8).toUpperCase()}?
													</AlertDialogTitle>
													<AlertDialogDescription className="text-white/60">
														This order will be permanently deleted. This action
														cannot be undone.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl">
														Keep Order
													</AlertDialogCancel>
													<AlertDialogAction
														onClick={() => handleDelete(order.id)}
														className="bg-red-500 hover:bg-red-600 text-white rounded-xl"
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
						className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#1c0808] via-[#080202] to-[#000000] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.9)]"
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
									setEditCustomerPhone('')
									setEditTableNumber(null)
									setEditOrderType('dine_in')
									setEditDiscountType(null)
									setEditDiscountValue('')
									setShowAddItem(false)
									setItemSearchQuery('')
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
												value={editCustomerPhone}
												onChange={(e) => setEditCustomerPhone(e.target.value)}
												placeholder="Phone"
												type="tel"
												className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
											/>
											<input
												value={editCustomerName}
												onChange={(e) => setEditCustomerName(e.target.value)}
												placeholder="Name"
												className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
											/>
										</div>
									</div>
									<div className="grid grid-cols-2 gap-3">
										<div className="col-span-2">
											<label className="mb-1.5 block text-xs text-white/60">
												Order Type
											</label>
											<CustomSelect
												value={editOrderType}
												onChange={(val) => {
													setEditOrderType(val as any)
													if (val !== 'dine_in') setEditTableNumber(null)
												}}
												options={orderTypeOptions}
												placeholder="Select type"
											/>
										</div>
									</div>
									{editOrderType === 'dine_in' && (
										<div>
											<p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
												<Table className="h-3 w-3" /> Table
												{!editTableNumber && <span className="text-[#E0342A]">*</span>}
											</p>
											<div className="flex gap-1.5 overflow-x-auto pb-1.5 [&::-webkit-scrollbar]:hidden">
												{tablesWithStatus.map((t) => {
													const isSel = editTableNumber === t.number
													return (
														<button
															key={t.id}
															type="button"
															onClick={() => setEditTableNumber(isSel ? null : t.number)}
															className={cn(
																'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition cursor-pointer',
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
											<div className="relative">
												<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
												<input
													type="text"
													placeholder="Search menu items..."
													value={itemSearchQuery}
													onChange={(e) => setItemSearchQuery(e.target.value)}
													className="w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
												/>
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

								{editedItems.map((item, index) => {
									const itemPrice = item.totalPrice
									const hasTrash = item.quantity <= 1
									return (
										<div
											key={index}
											className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
										>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium text-white">{item.name}</p>
												<p className="truncate text-[11px] text-white/40">
													{currencySymbol}{item.unitPrice.toFixed(0)} each
													{item.notes ? ` · ${item.notes}` : ''}
												</p>
											</div>
											<div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-0.5">
												<button
													type="button"
													onClick={() =>
														hasTrash
															? handleRemoveItem(index)
															: handleUpdateItemQuantity(index, -1)
													}
													className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
												>
													{hasTrash ? (
														<Trash2 className="h-3 w-3 text-red-400" />
													) : (
														<Minus className="h-3 w-3" />
													)}
												</button>
												<span className="w-5 text-center text-xs font-semibold tabular-nums text-white">
													{item.quantity}
												</span>
												<button
													type="button"
													onClick={() => handleUpdateItemQuantity(index, 1)}
													className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
												>
													<Plus className="h-3 w-3" />
												</button>
											</div>
											<p className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-white">
												{currencySymbol}{itemPrice.toFixed(0)}
											</p>
										</div>
									)
								})}
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
												<span className="text-white/70">Discount</span>
												<span className="font-medium text-white/70">
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
									disabled={savingEdit}
									className="flex-1"
								>
									Cancel
								</Button>
								<Button onClick={handleSaveOrder} disabled={savingEdit} className="flex-1">
									{savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
									{savingEdit ? 'Saving...' : 'Save Changes'}
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
						className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#1c0808] via-[#080202] to-[#000000] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.9)]"
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
									<span>Tax</span>
									<span>
										{currencySymbol}
										{completingOrder.tax.toFixed(2)}
									</span>
								</div>
								{(calculatedDiscount > 0 ||
									(completingOrder.discount_amount ?? 0) > 0) && (
									<div className="flex items-center justify-between text-sm text-white/70 mb-2">
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
