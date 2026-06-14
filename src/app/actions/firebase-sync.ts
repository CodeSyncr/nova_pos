'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Create admin client that bypasses RLS
function createSupabaseAdminClient() {
	if (!supabaseUrl || !supabaseServiceKey) {
		throw new Error(
			'Missing Supabase admin credentials (SUPABASE_SERVICE_ROLE_KEY)'
		)
	}
	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	})
}

type FirebaseConfig = {
	apiKey: string
	authDomain: string
	projectId: string
	storageBucket?: string
	messagingSenderId?: string
	appId?: string
	ordersCollection: string
	dateFrom?: string
	dateTo?: string
}

type FirebaseOrder = {
	id?: string
	[key: string]: unknown
	// Common Firebase order fields (will be mapped flexibly)
	total?: number
	subtotal?: number
	tax?: number
	items?: Array<{
		menuItemId?: string
		menuItemName?: string
		name?: string
		quantity?: number
		price?: number
		unitPrice?: number
		totalPrice?: number
		selectedToppings?: Array<{
			toppingId?: string
			toppingName?: string
			price?: number
			quantity?: number
			[key: string]: unknown
		}>
		[key: string]: unknown
	}>
	customerName?: string
	customerPhone?: string
	customerEmail?: string
	customer?: {
		name?: string
		phone?: string
		email?: string
	}
	tableNumber?: string
	orderType?: string
	status?: string
	paymentMethod?: string
	paymentStatus?: string
	discount?: {
		amount?: number
		discountAmount?: number
		discountId?: string
		discountName?: string
		type?: string
		value?: number
	}
	completedAt?: { seconds?: number; nanoseconds?: number } | string | Date
	createdAt?: { seconds?: number; nanoseconds?: number } | string | Date
	timestamp?: { seconds?: number; nanoseconds?: number } | string | Date
	date?: string
	notes?: string
}

export async function syncOrdersFromFirebase(
	_tenantId: string,
	_config: FirebaseConfig
): Promise<{ success: boolean; message: string; ordersSynced?: number }> {
	// This function is not implemented - use syncOrdersFromFirebaseClient instead
	void _tenantId
	void _config
	try {
		const supabase = await createSupabaseServerClient()
		const {
			data: { user }
		} = await supabase.auth.getUser()

		if (!user) {
			throw new Error('You must be signed in to sync orders.')
		}

		// Initialize Firebase Admin (using service account or API key)
		// For client-side access, we'll use the Firebase JS SDK instead
		// This is a server action, so we can use Admin SDK if we have service account
		// For now, we'll use a different approach - fetch from client and process here

		// Since we're in a server action, we need to use Firebase Admin SDK
		// But we need service account credentials. For now, let's create a client-side approach
		// that calls this server action with the data

		throw new Error(
			'Firebase sync requires service account credentials. Please use the client-side sync option.'
		)
	} catch (error) {
		console.error('Error syncing from Firebase:', error)
		return {
			success: false,
			message:
				error instanceof Error
					? error.message
					: 'Failed to sync orders from Firebase'
		}
	}
}

// Client-side sync function that can be called from the component
export async function syncOrdersFromFirebaseClient(
	tenantId: string,
	firebaseOrders: FirebaseOrder[]
): Promise<{ success: boolean; message: string; ordersSynced: number }> {
	// Use regular client for auth check
	const supabaseAuth = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabaseAuth.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to sync orders.')
	}

	// Use admin client for all database operations to bypass RLS
	const supabase = createSupabaseAdminClient()

	// Build mapping of Firebase menu item IDs to Supabase menu item IDs
	const { data: allMenuItems } = await supabase
		.from('menu_items')
		.select('id, metadata')
		.eq('tenant_id', tenantId)

	const firebaseToSupabaseMenuMap = new Map<string, string>()
	allMenuItems?.forEach((item) => {
		const metadata = item.metadata as { firebaseId?: string } | null
		if (metadata?.firebaseId) {
			firebaseToSupabaseMenuMap.set(metadata.firebaseId, item.id)
		}
	})

	// Build mapping of Firebase topping IDs to Supabase topping IDs
	// Since toppings table doesn't have metadata, we'll match by name
	// We'll create a map of topping names to IDs for fallback matching
	const { data: allToppings } = await supabase
		.from('toppings')
		.select('id, name')
		.eq('tenant_id', tenantId)

	const toppingNameToIdMap = new Map<string, string>()
	allToppings?.forEach((topping) => {
		toppingNameToIdMap.set(topping.name.toLowerCase(), topping.id)
	})

	let syncedCount = 0
	const errors: string[] = []
	let skippedCount = 0
	const skippedReasons: string[] = []

	// Log the orders being synced
	console.log('=== SYNC ORDERS START ===')
	console.log(`Total orders to sync: ${firebaseOrders.length}`)
	console.log('Orders JSON:', JSON.stringify(firebaseOrders, null, 2))

	for (const firebaseOrder of firebaseOrders) {
		try {
			console.log(`\n--- Processing Order ${firebaseOrder.id || 'unknown'} ---`)
			console.log('Order JSON:', JSON.stringify(firebaseOrder, null, 2))
			// Check if order already exists (by Firebase ID in metadata)
			if (firebaseOrder.id) {
				const { data: existingOrder, error: checkError } = await supabase
					.from('orders')
					.select('id')
					.eq('tenant_id', tenantId)
					.eq('metadata->>firebaseId', firebaseOrder.id)
					.single()

				if (checkError && checkError.code !== 'PGRST116') {
					// PGRST116 is "not found" which is expected, other errors are real issues
					console.warn('⚠️  Error checking for existing order:', checkError)
				}

				if (existingOrder) {
					// Order already synced, skip it
					const reason = `Order ${firebaseOrder.id} already exists (ID: ${existingOrder.id})`
					console.log(`⏭️  ${reason}, skipping`)
					skippedCount++
					skippedReasons.push(reason)
					continue
				} else {
					console.log(
						`✓ Order ${firebaseOrder.id} not found in database, will create new`
					)
				}
			}

			// Map Firebase order to Supabase order structure
			const total = firebaseOrder.total || firebaseOrder.subtotal || 0
			const subtotal =
				firebaseOrder.subtotal || total - (firebaseOrder.tax || 0)
			const tax = firebaseOrder.tax || 0

			// Parse date
			let createdAt: Date
			if (firebaseOrder.createdAt) {
				if (typeof firebaseOrder.createdAt === 'string') {
					createdAt = new Date(firebaseOrder.createdAt)
				} else if (firebaseOrder.createdAt instanceof Date) {
					createdAt = firebaseOrder.createdAt
				} else if (
					typeof firebaseOrder.createdAt === 'object' &&
					'seconds' in firebaseOrder.createdAt
				) {
					createdAt = new Date((firebaseOrder.createdAt.seconds || 0) * 1000)
				} else {
					createdAt = new Date()
				}
			} else if (firebaseOrder.timestamp) {
				if (typeof firebaseOrder.timestamp === 'string') {
					createdAt = new Date(firebaseOrder.timestamp)
				} else if (
					typeof firebaseOrder.timestamp === 'object' &&
					'seconds' in firebaseOrder.timestamp
				) {
					createdAt = new Date((firebaseOrder.timestamp.seconds || 0) * 1000)
				} else {
					createdAt = new Date()
				}
			} else if (firebaseOrder.date) {
				createdAt = new Date(firebaseOrder.date)
			} else {
				createdAt = new Date()
			}

			// Check if order already exists (by checking similar orders within 1 minute)
			// This is a fallback check - only skip if we're very confident it's a duplicate
			const timeWindowStart = new Date(createdAt.getTime() - 60000) // 1 minute before
			const timeWindowEnd = new Date(createdAt.getTime() + 60000) // 1 minute after
			const { data: existingOrders, error: duplicateCheckError } =
				await supabase
					.from('orders')
					.select('id, created_at, total')
					.eq('tenant_id', tenantId)
					.eq('total', total)
					.gte('created_at', timeWindowStart.toISOString())
					.lte('created_at', timeWindowEnd.toISOString())
					.limit(5)

			if (duplicateCheckError) {
				console.warn('⚠️  Error checking for duplicates:', duplicateCheckError)
			}

			if (existingOrders && existingOrders.length > 0) {
				// Only skip if we have exact match on total AND time is very close (within 10 seconds)
				const exactMatches = existingOrders.filter((existing) => {
					const existingTime = new Date(existing.created_at)
					const timeDiff = Math.abs(
						existingTime.getTime() - createdAt.getTime()
					)
					return timeDiff < 10000 && existing.total === total // Within 10 seconds and same total
				})

				if (exactMatches.length > 0) {
					const reason = `Order ${firebaseOrder.id} appears to be duplicate (found ${exactMatches.length} matches)`
					console.log(`⏭️  ${reason}, skipping`)
					console.log(
						'  Existing orders:',
						JSON.stringify(exactMatches, null, 2)
					)
					skippedCount++
					skippedReasons.push(reason)
					continue
				} else {
					console.log(
						`✓ Order ${firebaseOrder.id} passed duplicate check (found ${existingOrders.length} similar but not exact matches)`
					)
				}
			} else {
				console.log(
					`✓ Order ${firebaseOrder.id} passed duplicate check (no similar orders found)`
				)
			}

			// Map order type
			const orderType =
				(firebaseOrder.orderType as string) ||
				(firebaseOrder.type as string) ||
				'dine_in'

			// Map status - if Firebase order is completed, mark as completed
			const status =
				(firebaseOrder.status as string) === 'completed' ||
				(firebaseOrder.status as string) === 'paid' ||
				(firebaseOrder.status as string) === 'done' ||
				(firebaseOrder.paymentStatus as string) === 'completed'
					? 'completed'
					: 'completed' // Import all as completed for historical data

			// Parse completedAt if available
			let completedAt: Date | null = null
			if (firebaseOrder.completedAt) {
				if (typeof firebaseOrder.completedAt === 'string') {
					completedAt = new Date(firebaseOrder.completedAt)
				} else if (firebaseOrder.completedAt instanceof Date) {
					completedAt = firebaseOrder.completedAt
				} else if (
					typeof firebaseOrder.completedAt === 'object' &&
					'seconds' in firebaseOrder.completedAt
				) {
					completedAt = new Date(
						(firebaseOrder.completedAt.seconds || 0) * 1000
					)
				}
			}

			// Handle discount
			let discountAmount = 0
			let discountType: 'percent' | 'fixed' | null = null
			let discountValue: number | null = null

			if (firebaseOrder.discount) {
				const discount = firebaseOrder.discount as {
					amount?: number
					discountAmount?: number
					type?: string
					value?: number
				}
				discountAmount = discount.discountAmount || discount.amount || 0
				if (discount.type === 'percentage' || discount.type === 'percent') {
					discountType = 'percent'
					discountValue = discount.value || null
				} else if (discount.type === 'fixed' || discount.amount) {
					discountType = 'fixed'
					discountValue = discountAmount
				}
			}

			// Calculate final total with discount
			const finalTotal = total - discountAmount

			// Create order
			const { data: order, error: orderError } = await supabase
				.from('orders')
				.insert({
					tenant_id: tenantId,
					table_number:
						(firebaseOrder.tableNumber as string) ||
						(firebaseOrder.table as string) ||
						null,
					order_type: orderType,
					customer_name:
						(firebaseOrder.customerName as string) ||
						(firebaseOrder.customer as { name?: string })?.name ||
						null,
					customer_phone:
						(firebaseOrder.customerPhone as string) ||
						(firebaseOrder.customer as { phone?: string })?.phone ||
						null,
					customer_email:
						(firebaseOrder.customerEmail as string) ||
						(firebaseOrder.customer as { email?: string })?.email ||
						null,
					subtotal: subtotal,
					tax: tax,
					discount_amount: discountAmount,
					discount_type: discountType,
					discount_value: discountValue,
					payment_method:
						(firebaseOrder.paymentMethod as string) ||
						(firebaseOrder.payment as string) ||
						null,
					total: finalTotal,
					notes: (firebaseOrder.notes as string) || null,
					created_by: user.id,
					status: status,
					created_at: createdAt.toISOString(),
					completed_at: completedAt
						? completedAt.toISOString()
						: status === 'completed'
							? createdAt.toISOString()
							: null,
					metadata: firebaseOrder.id ? { firebaseId: firebaseOrder.id } : null
				})
				.select()
				.single()

			if (orderError) {
				console.error('❌ Order creation error:', {
					orderId: firebaseOrder.id,
					error: orderError,
					orderData: JSON.stringify(firebaseOrder, null, 2)
				})
				errors.push(
					`Order ${firebaseOrder.id || 'unknown'}: ${orderError.message}`
				)
				continue
			}

			console.log('✅ Order created successfully:', order.id)

			// Create order items
			if (firebaseOrder.items && Array.isArray(firebaseOrder.items)) {
				console.log(
					`Processing ${firebaseOrder.items.length} items for order ${order.id}`
				)
				console.log('Items JSON:', JSON.stringify(firebaseOrder.items, null, 2))

				const orderItemToppingsToInsert: Array<{
					order_item_id: string
					topping_id: string
					name: string
					price: number
				}> = []

				for (const item of firebaseOrder.items) {
					console.log(`\n  Processing item:`, JSON.stringify(item, null, 2))
					const quantity = item.quantity || 1
					const unitPrice = item.unitPrice || item.price || 0
					const totalPrice = item.totalPrice || unitPrice * quantity

					// Map Firebase menuItemId to Supabase menu_item_id
					const firebaseMenuItemId = item.menuItemId as string | undefined
					const supabaseMenuItemId = firebaseMenuItemId
						? firebaseToSupabaseMenuMap.get(firebaseMenuItemId) || null
						: null

					// Use menuItemName if available, otherwise try to get from name field
					const itemName =
						(item.menuItemName as string) ||
						(item.name as string) ||
						'Unknown Item'

					// Insert order item
					const orderItemData = {
						order_id: order.id,
						menu_item_id: supabaseMenuItemId,
						name: itemName,
						quantity: quantity,
						unit_price: unitPrice,
						total_price: totalPrice,
						notes: null
					}
					console.log(
						'  Inserting order item with data:',
						JSON.stringify(orderItemData, null, 2)
					)

					const { data: orderItem, error: itemError } = await supabase
						.from('order_items')
						.insert(orderItemData)
						.select()
						.single()

					if (itemError) {
						console.error('  ❌ Order item creation error:', {
							itemName,
							orderId: order.id,
							error: itemError,
							itemData: JSON.stringify(item, null, 2),
							insertData: JSON.stringify(orderItemData, null, 2)
						})
						errors.push(
							`Order item ${itemName} for order ${order.id}: ${itemError.message}`
						)
						continue
					}

					console.log('  ✅ Order item created successfully:', orderItem.id)

					// Handle toppings if present
					if (
						item.selectedToppings &&
						Array.isArray(item.selectedToppings) &&
						orderItem
					) {
						for (const topping of item.selectedToppings) {
							const toppingName =
								(topping.toppingName as string) || 'Unknown Topping'
							// Match topping by name (since toppings table doesn't have metadata for Firebase ID)
							const supabaseToppingId = toppingNameToIdMap.get(
								toppingName.toLowerCase()
							)

							if (supabaseToppingId) {
								orderItemToppingsToInsert.push({
									order_item_id: orderItem.id,
									topping_id: supabaseToppingId,
									name: toppingName,
									price: (topping.price as number) || 0
								})
							} else {
								// Log warning but don't fail - topping might not exist
								console.warn(
									`Topping "${toppingName}" not found for order item ${orderItem.id}`
								)
							}
						}
					}
				}

				// Insert order item toppings
				if (orderItemToppingsToInsert.length > 0) {
					console.log(
						`  Inserting ${orderItemToppingsToInsert.length} toppings`
					)
					const { error: toppingsError } = await supabase
						.from('order_item_toppings')
						.insert(orderItemToppingsToInsert)

					if (toppingsError) {
						console.error('  ❌ Error inserting toppings:', toppingsError)
						errors.push(
							`Order item toppings for ${order.id}: ${toppingsError.message}`
						)
					} else {
						console.log('  ✅ Toppings inserted successfully')
					}
				}
			} else {
				console.warn(`⚠️  Order ${order.id} has no items to sync`)
			}

			syncedCount++
			console.log(
				`✅ Order ${firebaseOrder.id || 'unknown'} fully synced (${syncedCount} total)`
			)
			console.log(
				`✅ Order ${firebaseOrder.id || 'unknown'} synced successfully`
			)
		} catch (error) {
			console.error('❌ Exception while syncing order:', {
				orderId: firebaseOrder.id,
				error: error instanceof Error ? error.message : 'Unknown error',
				errorStack: error instanceof Error ? error.stack : undefined,
				orderData: JSON.stringify(firebaseOrder, null, 2)
			})
			errors.push(
				`Order ${firebaseOrder.id || 'unknown'}: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	console.log('\n=== SYNC ORDERS COMPLETE ===')
	console.log(`Total orders processed: ${firebaseOrders.length}`)
	console.log(`✅ Synced: ${syncedCount} orders`)
	console.log(`⏭️  Skipped: ${skippedCount} orders`)
	console.log(`❌ Errors: ${errors.length}`)

	if (skippedCount > 0) {
		console.log('\n📋 Skipped orders reasons:')
		skippedReasons.forEach((reason, index) => {
			console.log(`  ${index + 1}. ${reason}`)
		})
	}

	if (errors.length > 0) {
		console.log('\n❌ Error details:')
		errors.forEach((error, index) => {
			console.log(`  ${index + 1}. ${error}`)
		})
	}

	if (errors.length > 0 && syncedCount === 0) {
		return {
			success: false,
			message: `Failed to sync orders. Errors: ${errors.slice(0, 3).join(', ')}`,
			ordersSynced: 0
		}
	}

	return {
		success: true,
		message:
			errors.length > 0
				? `Synced ${syncedCount} orders with ${errors.length} errors`
				: `Successfully synced ${syncedCount} orders`,
		ordersSynced: syncedCount
	}
}

type FirebaseCustomer = {
	id?: string
	[key: string]: unknown
	name?: string
	phone?: string
	email?: string
	loyaltyPoints?: number
	totalOrders?: number
	totalSpent?: number
	lastOrderDate?: { seconds?: number; nanoseconds?: number } | string | Date
	loyaltyTierId?: string
	loyaltyTierName?: string
	referralCode?: string
	referredBy?: string
	createdAt?: { seconds?: number; nanoseconds?: number } | string | Date
	updatedAt?: { seconds?: number; nanoseconds?: number } | string | Date
}

export async function syncCustomersFromFirebaseClient(
	tenantId: string,
	firebaseCustomers: FirebaseCustomer[]
): Promise<{ success: boolean; message: string; customersSynced: number }> {
	// Use regular client for auth check
	const supabaseAuth = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabaseAuth.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to sync customers.')
	}

	// Use admin client for database operations to bypass RLS
	const supabase = createSupabaseAdminClient()

	let syncedCount = 0
	const errors: string[] = []
	let skippedCount = 0

	console.log('=== SYNC CUSTOMERS START ===')
	console.log(`Total customers to sync: ${firebaseCustomers.length}`)

	for (const firebaseCustomer of firebaseCustomers) {
		try {
			const customerName = (firebaseCustomer.name as string) || 'Unknown'
			const customerPhone = (firebaseCustomer.phone as string) || null

			// Check if customer already exists by metadata firebaseId
			if (firebaseCustomer.id) {
				try {
					const { data: existingByMetadata } = await supabase
						.from('customers')
						.select('id')
						.eq('tenant_id', tenantId)
						.eq('metadata->>firebaseId', firebaseCustomer.id)
						.single()

					if (existingByMetadata) {
						skippedCount++
						continue
					}
				} catch {
					// metadata column might not exist, continue with phone check
				}
			}

			// Also check by phone number to avoid duplicates
			if (customerPhone) {
				const { data: existingByPhone } = await supabase
					.from('customers')
					.select('id')
					.eq('tenant_id', tenantId)
					.eq('phone', customerPhone)
					.single()

				if (existingByPhone) {
					skippedCount++
					continue
				}
			}

			// Parse dates
			const parseDate = (
				dateValue: { seconds?: number; nanoseconds?: number } | string | Date | undefined
			): string | null => {
				if (!dateValue) return null
				if (typeof dateValue === 'string') return new Date(dateValue).toISOString()
				if (dateValue instanceof Date) return dateValue.toISOString()
				if (typeof dateValue === 'object' && 'seconds' in dateValue) {
					return new Date((dateValue.seconds || 0) * 1000).toISOString()
				}
				return null
			}

			const createdAt = parseDate(firebaseCustomer.createdAt) || new Date().toISOString()

			// Insert customer
			const insertData: Record<string, unknown> = {
				tenant_id: tenantId,
				full_name: customerName,
				phone: customerPhone,
				email: (firebaseCustomer.email as string) || null,
				tags: [],
				notes: null,
				birthday: null,
				created_at: createdAt
			}

			// Try to include metadata if the column exists
			if (firebaseCustomer.id) {
				insertData.metadata = { firebaseId: firebaseCustomer.id }
			}

			let customer: { id: string } | null = null

			const { data: insertedCustomer, error: customerError } = await supabase
				.from('customers')
				.insert(insertData)
				.select('id')
				.single()

			if (customerError) {
				// If metadata column doesn't exist, retry without it
				if (customerError.message.includes('metadata') || customerError.code === '42703') {
					const { metadata: _, ...insertDataWithoutMetadata } = insertData
					const { data: retryCustomer, error: retryError } = await supabase
						.from('customers')
						.insert(insertDataWithoutMetadata)
						.select('id')
						.single()

					if (retryError) {
						errors.push(`Customer ${customerName}: ${retryError.message}`)
						continue
					}
					customer = retryCustomer
				} else {
					errors.push(`Customer ${customerName}: ${customerError.message}`)
					continue
				}
			} else {
				customer = insertedCustomer
			}

			if (!customer) {
				errors.push(`Customer ${customerName}: Insert returned no data`)
				continue
			}

			// Create loyalty profile with imported points
			const loyaltyPoints = (firebaseCustomer.loyaltyPoints as number) || 0

			const { error: loyaltyError } = await supabase
				.from('loyalty_profiles')
				.insert({
					tenant_id: tenantId,
					customer_id: customer.id,
					points_balance: loyaltyPoints
				})

			if (loyaltyError) {
				console.warn(`Loyalty profile for ${customerName}: ${loyaltyError.message}`)
			}

			syncedCount++
			console.log(`✅ Customer "${customerName}" synced (${syncedCount} total)`)
		} catch (error) {
			errors.push(
				`Customer ${firebaseCustomer.id || 'unknown'}: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	console.log('\n=== SYNC CUSTOMERS COMPLETE ===')
	console.log(`✅ Synced: ${syncedCount} customers`)
	console.log(`⏭️  Skipped: ${skippedCount} customers (already exist)`)
	console.log(`❌ Errors: ${errors.length}`)

	if (errors.length > 0 && syncedCount === 0) {
		return {
			success: false,
			message: `Failed to sync customers. Errors: ${errors.slice(0, 3).join(', ')}`,
			customersSynced: 0
		}
	}

	return {
		success: true,
		message:
			errors.length > 0
				? `Synced ${syncedCount} customers with ${errors.length} errors. ${skippedCount} skipped (already exist).`
				: `Successfully synced ${syncedCount} customers${skippedCount > 0 ? `. ${skippedCount} skipped (already exist).` : ''}`,
		customersSynced: syncedCount
	}
}

export async function checkSyncedCustomers(
	tenantId: string,
	firebaseCustomerIds: string[]
): Promise<Set<string>> {
	const supabaseAuth = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabaseAuth.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to check synced customers.')
	}

	const supabase = createSupabaseAdminClient()

	if (firebaseCustomerIds.length === 0) {
		return new Set<string>()
	}

	const validIds = firebaseCustomerIds.filter((id): id is string => !!id)
	if (validIds.length === 0) {
		return new Set<string>()
	}

	// Try to query with metadata column
	const { data: allCustomers, error } = await supabase
		.from('customers')
		.select('metadata')
		.eq('tenant_id', tenantId)

	if (error) {
		// If metadata column doesn't exist, return empty set (no customers tracked yet)
		console.error('Error checking synced customers:', error)
		return new Set<string>()
	}

	const syncedIds = new Set<string>()

	allCustomers?.forEach((customer) => {
		if (!customer.metadata) return
		try {
			const metadata = customer.metadata as { firebaseId?: string } | null
			if (metadata?.firebaseId && validIds.includes(metadata.firebaseId)) {
				syncedIds.add(metadata.firebaseId)
			}
		} catch (e) {
			console.warn('Invalid metadata format:', e)
		}
	})

	return syncedIds
}

type FirebaseMenuItem = {
	id?: string
	[key: string]: unknown
	// Common Firebase menu item fields
	name?: string
	description?: string
	price?: number
	basePrice?: number
	category?: string
	categoryId?: string
	categoryName?: string
	image?: string
	imageUrl?: string
	isActive?: boolean
	variants?: Array<{
		name?: string
		price?: number
		priceModifier?: number
		[key: string]: unknown
	}>
	toppings?: Array<{
		name?: string
		price?: number
		[key: string]: unknown
	}>
	ingredients?: Array<{
		name?: string
		quantity?: number
		unit?: string
		[key: string]: unknown
	}>
	nutrition?: {
		calories?: number
		protein?: number
		fat?: number
		carbs?: number
	}
	prepTime?: number
	prepTimeMinutes?: number
	allergenInfo?: string
}

// Check which Firebase orders are already synced
export async function checkSyncedOrders(
	tenantId: string,
	firebaseOrderIds: string[]
): Promise<Set<string>> {
	// Use regular client for auth check
	const supabaseAuth = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabaseAuth.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to check synced orders.')
	}

	// Use admin client for database operations
	const supabase = createSupabaseAdminClient()

	if (firebaseOrderIds.length === 0) {
		return new Set<string>()
	}

	// Filter out undefined/null IDs
	const validIds = firebaseOrderIds.filter((id): id is string => !!id)
	if (validIds.length === 0) {
		return new Set<string>()
	}

	const syncedIds = new Set<string>()

	// Query in batches to avoid Supabase's default row limit (1000)
	// Only fetch orders that have metadata (not null)
	const PAGE_SIZE = 1000
	let offset = 0
	let hasMore = true

	while (hasMore) {
		const { data: orders, error } = await supabase
			.from('orders')
			.select('metadata')
			.eq('tenant_id', tenantId)
			.not('metadata', 'is', null)
			.range(offset, offset + PAGE_SIZE - 1)

		if (error) {
			console.error('Error checking synced orders:', error)
			// If metadata column doesn't exist or query fails, return what we have so far
			return syncedIds
		}

		if (!orders || orders.length === 0) {
			hasMore = false
			break
		}

		// Check each order's metadata for matching Firebase IDs
		orders.forEach((order) => {
			if (!order.metadata) return
			try {
				const metadata = order.metadata as { firebaseId?: string } | null
				if (metadata?.firebaseId && validIds.includes(metadata.firebaseId)) {
					syncedIds.add(metadata.firebaseId)
				}
			} catch (e) {
				// Skip invalid metadata
			}
		})

		// If we found all IDs already, no need to continue
		if (syncedIds.size === validIds.length) {
			break
		}

		offset += PAGE_SIZE
		hasMore = orders.length === PAGE_SIZE
	}

	return syncedIds
}

export async function syncMenuItemsFromFirebaseClient(
	tenantId: string,
	firebaseMenuItems: FirebaseMenuItem[]
): Promise<{
	success: boolean
	message: string
	itemsSynced: number
	categoriesSynced: number
}> {
	// Use regular client for auth check
	const supabaseAuth = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabaseAuth.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to sync menu items.')
	}

	// Use admin client for database operations to bypass RLS
	const supabase = createSupabaseAdminClient()

	if (!user) {
		throw new Error('You must be signed in to sync menu items.')
	}

	let itemsSynced = 0
	let categoriesSynced = 0
	const errors: string[] = []
	const categoryMap = new Map<string, string>() // Firebase category name -> Supabase category ID

	// First pass: Create categories
	for (const item of firebaseMenuItems) {
		const categoryName =
			(item.categoryName as string) ||
			(item.category as string) ||
			'Uncategorized'

		if (!categoryMap.has(categoryName)) {
			try {
				// Check if category already exists
				const { data: existingCategory } = await supabase
					.from('menu_categories')
					.select('id')
					.eq('tenant_id', tenantId)
					.eq('name', categoryName)
					.single()

				if (existingCategory) {
					categoryMap.set(categoryName, existingCategory.id)
				} else {
					// Create new category
					const { data: newCategory, error: categoryError } = await supabase
						.from('menu_categories')
						.insert({
							tenant_id: tenantId,
							name: categoryName,
							description: null,
							position: categoryMap.size
						})
						.select()
						.single()

					if (categoryError) {
						errors.push(`Category ${categoryName}: ${categoryError.message}`)
					} else if (newCategory) {
						categoryMap.set(categoryName, newCategory.id)
						categoriesSynced++
					}
				}
			} catch (error) {
				errors.push(
					`Category ${categoryName}: ${
						error instanceof Error ? error.message : 'Unknown error'
					}`
				)
			}
		}
	}

	// Second pass: Create menu items
	for (const firebaseItem of firebaseMenuItems) {
		try {
			const itemName = firebaseItem.name as string
			if (!itemName) {
				errors.push(`Menu item ${firebaseItem.id || 'unknown'}: Missing name`)
				continue
			}

			// Check if item already exists (by name and category)
			const categoryName =
				(firebaseItem.categoryName as string) ||
				(firebaseItem.category as string) ||
				'Uncategorized'
			const categoryId = categoryMap.get(categoryName)

			if (!categoryId) {
				errors.push(`Menu item ${itemName}: Category not found`)
				continue
			}

			const { data: existingItem } = await supabase
				.from('menu_items')
				.select('id')
				.eq('tenant_id', tenantId)
				.eq('name', itemName)
				.eq('category_id', categoryId)
				.single()

			if (existingItem) {
				// Skip duplicate
				continue
			}

			// Map price
			const basePrice =
				(firebaseItem.basePrice as number) ||
				(firebaseItem.price as number) ||
				0

			// Generate slug
			const slug = itemName
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/(^-|-$)/g, '')

			// Create menu item with Firebase ID in metadata for mapping
			const { data: menuItem, error: itemError } = await supabase
				.from('menu_items')
				.insert({
					tenant_id: tenantId,
					category_id: categoryId,
					name: itemName,
					description: (firebaseItem.description as string) || null,
					base_price: basePrice,
					discount_price: null,
					image_url:
						(firebaseItem.imageUrl as string) ||
						(firebaseItem.image as string) ||
						null,
					is_active: firebaseItem.isActive !== false,
					prep_time_minutes:
						(firebaseItem.prepTimeMinutes as number) ||
						(firebaseItem.prepTime as number) ||
						null,
					allergen_info: (firebaseItem.allergenInfo as string) || null,
					nutrition: firebaseItem.nutrition || {
						calories: 0,
						protein: 0,
						fat: 0,
						carbs: 0
					},
					slug,
					metadata: firebaseItem.id ? { firebaseId: firebaseItem.id } : null
				})
				.select()
				.single()

			if (itemError) {
				errors.push(`Menu item ${itemName}: ${itemError.message}`)
				continue
			}

			// Create variants if any
			if (firebaseItem.variants && Array.isArray(firebaseItem.variants)) {
				const variants = firebaseItem.variants.map((variant, index) => ({
					menu_item_id: menuItem.id,
					name: (variant.name as string) || `Variant ${index + 1}`,
					price_modifier:
						(variant.priceModifier as number) || (variant.price as number) || 0,
					is_default: index === 0
				}))

				if (variants.length > 0) {
					const { error: variantsError } = await supabase
						.from('menu_item_variants')
						.insert(variants)

					if (variantsError) {
						errors.push(`Variants for ${itemName}: ${variantsError.message}`)
					}
				}
			}

			// Create/sync toppings if any
			if (firebaseItem.toppings && Array.isArray(firebaseItem.toppings)) {
				for (const topping of firebaseItem.toppings) {
					const toppingName = (topping.name as string) || 'Unknown Topping'
					const toppingPrice = (topping.price as number) || 0

					// Check if topping exists
					let { data: existingTopping } = await supabase
						.from('toppings')
						.select('id')
						.eq('tenant_id', tenantId)
						.eq('name', toppingName)
						.single()

					if (!existingTopping) {
						// Create topping (toppings table doesn't have metadata field)
						const { data: newTopping, error: toppingError } = await supabase
							.from('toppings')
							.insert({
								tenant_id: tenantId,
								name: toppingName,
								price: toppingPrice,
								description: null,
								category: null
							})
							.select()
							.single()

						if (toppingError) {
							errors.push(`Topping ${toppingName}: ${toppingError.message}`)
							continue
						}
						existingTopping = newTopping
					}

					// Link topping to menu item
					if (existingTopping) {
						const { error: linkError } = await supabase
							.from('menu_item_toppings')
							.insert({
								menu_item_id: menuItem.id,
								topping_id: existingTopping.id,
								is_optional: true,
								max_quantity: 1,
								sort_order: 0
							})

						if (linkError && !linkError.message.includes('duplicate')) {
							errors.push(
								`Link topping ${toppingName} to ${itemName}: ${linkError.message}`
							)
						}
					}
				}
			}

			// Create/sync ingredients if any
			if (firebaseItem.ingredients && Array.isArray(firebaseItem.ingredients)) {
				for (const ingredient of firebaseItem.ingredients) {
					const ingredientName =
						(ingredient.name as string) || 'Unknown Ingredient'

					// Check if ingredient exists
					let { data: existingIngredient } = await supabase
						.from('ingredients')
						.select('id')
						.eq('tenant_id', tenantId)
						.eq('name', ingredientName)
						.single()

					if (!existingIngredient) {
						// Create ingredient
						const { data: newIngredient, error: ingredientError } =
							await supabase
								.from('ingredients')
								.insert({
									tenant_id: tenantId,
									name: ingredientName,
									unit: (ingredient.unit as string) || null,
									allergen_info: null
								})
								.select()
								.single()

						if (ingredientError) {
							errors.push(
								`Ingredient ${ingredientName}: ${ingredientError.message}`
							)
							continue
						}
						existingIngredient = newIngredient
					}

					if (existingIngredient) {
						// Link ingredient to menu item
						const { error: linkError } = await supabase
							.from('menu_item_ingredients')
							.insert({
								menu_item_id: menuItem.id,
								ingredient_id: existingIngredient.id,
								is_required: true,
								quantity: (ingredient.quantity as number) || null,
								sort_order: 0
							})

						if (linkError && !linkError.message.includes('duplicate')) {
							errors.push(
								`Link ingredient ${ingredientName} to ${itemName}: ${linkError.message}`
							)
						}
					}
				}
			}

			itemsSynced++
		} catch (error) {
			errors.push(
				`Menu item ${firebaseItem.id || 'unknown'}: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	if (errors.length > 0 && itemsSynced === 0) {
		return {
			success: false,
			message: `Failed to sync menu items. Errors: ${errors.slice(0, 3).join(', ')}`,
			itemsSynced: 0,
			categoriesSynced
		}
	}

	return {
		success: true,
		message:
			errors.length > 0
				? `Synced ${itemsSynced} menu items and ${categoriesSynced} categories with ${errors.length} errors`
				: `Successfully synced ${itemsSynced} menu items and ${categoriesSynced} categories`,
		itemsSynced,
		categoriesSynced
	}
}
