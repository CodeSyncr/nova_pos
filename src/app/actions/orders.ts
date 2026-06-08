'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createCustomer } from './customers'
import { deductInventoryForOrder, refundInventoryForOrder } from './inventory'

type CartItem = {
	menuItemId: string
	name: string
	variant: { id: string; name: string; priceModifier: number } | null
	toppings: Array<{ id: string; name: string; price: number }>
	quantity: number
	basePrice: number
}

export async function createOrder(
	tenantId: string,
	data: {
		tableNumber?: string
		orderType?: string
		customerName?: string
		customerPhone?: string
		customerEmail?: string
		items: CartItem[]
		subtotal: number
		tax: number
		total: number
		notes?: string
	}
) {
	const supabase = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) {
		throw new Error('You must be signed in to create an order.')
	}

	// If customer name and phone provided, ensure customer exists
	if (data.customerName && data.customerPhone) {
		// Check if customer exists by phone
		const { data: existingCustomer } = await supabase
			.from('customers')
			.select('id')
			.eq('tenant_id', tenantId)
			.eq('phone', data.customerPhone.trim())
			.single()

		if (!existingCustomer) {
			// Create new customer if doesn't exist
			try {
				await createCustomer(tenantId, {
					fullName: data.customerName,
					phone: data.customerPhone
				})
			} catch (error) {
				console.error('Error creating customer:', error)
				// Continue with order creation even if customer creation fails
			}
		}
	}

	// Create order
	const { data: order, error: orderError } = await supabase
		.from('orders')
		.insert({
			tenant_id: tenantId,
			table_number: data.tableNumber || null,
			order_type: data.orderType || 'dine_in',
			customer_name: data.customerName || null,
			customer_phone: data.customerPhone || null,
			customer_email: data.customerEmail || null,
			subtotal: data.subtotal,
			tax: data.tax,
			discount_amount: 0,
			discount_type: null,
			discount_value: null,
			payment_method: null,
			total: data.total,
			notes: data.notes || null,
			created_by: user.id,
			status: 'pending'
		})
		.select()
		.single()

	if (orderError) {
		throw new Error(orderError.message)
	}

	// Deduct inventory for this order
	try {
		await deductInventoryForOrder(order.id)
	} catch (inventoryError) {
		console.error('Error deducting inventory:', inventoryError)
		// Continue with order creation even if inventory deduction fails
		// In production, you might want to rollback the order or show a warning
	}

	// Create order items
	const orderItems = data.items.flatMap((item) => {
		const variantPrice = item.variant?.priceModifier || 0
		const toppingsPrice = item.toppings.reduce((sum, t) => sum + t.price, 0)
		const unitPrice = item.basePrice + variantPrice + toppingsPrice
		const totalPrice = unitPrice * item.quantity

		return Array.from({ length: item.quantity }, () => ({
			order_id: order.id,
			menu_item_id: item.menuItemId,
			variant_id: item.variant?.id || null,
			name: item.name,
			quantity: 1,
			unit_price: unitPrice,
			total_price: totalPrice,
			notes: item.variant
				? `Variant: ${item.variant.name}${item.toppings.length > 0 ? `, Toppings: ${item.toppings.map((t) => t.name).join(', ')}` : ''}`
				: item.toppings.length > 0
					? `Toppings: ${item.toppings.map((t) => t.name).join(', ')}`
					: null
		}))
	})

	const { error: itemsError } = await supabase
		.from('order_items')
		.insert(orderItems)
		.select()

	if (itemsError) {
		// Rollback order if items fail
		await supabase.from('orders').delete().eq('id', order.id)
		throw new Error(itemsError.message)
	}

	// For now, we'll skip topping inserts as we need the actual order_item IDs
	// This can be enhanced later with a proper transaction or by fetching IDs
	// TODO: Implement order_item_toppings inserts after fetching order_item IDs

	revalidatePath('/orders')
	revalidatePath('/pos')

	// Send push notification to other team members
	try {
		const { sendPushToTenant } = await import('@/lib/send-push')
		await sendPushToTenant({
			tenantId,
			excludeUserId: user.id,
			title: 'New Order!',
			body: data.customerName
				? `Order from ${data.customerName} - ${(data.orderType || 'dine_in').replace('_', ' ')}`
				: `New ${(data.orderType || 'dine_in').replace('_', ' ')} order received`,
			url: '/orders'
		})
	} catch {
		// Non-critical, don't fail order creation
	}

	return { orderId: order.id, success: true }
}

export async function updateOrderStatus(
	orderId: string,
	status:
		| 'pending'
		| 'confirmed'
		| 'preparing'
		| 'ready'
		| 'completed'
		| 'cancelled'
) {
	const supabase = await createSupabaseServerClient()

	// If status is being changed to cancelled, refund inventory
	if (status === 'cancelled') {
		try {
			await refundInventoryForOrder(orderId)
		} catch (inventoryError) {
			console.error('Error refunding inventory:', inventoryError)
			// Continue with status update even if refund fails
		}
	}

	const updateData: {
		status: string
		completed_at?: string
		updated_at: string
	} = {
		status,
		updated_at: new Date().toISOString()
	}

	if (status === 'completed') {
		updateData.completed_at = new Date().toISOString()
	}

	const { error } = await supabase
		.from('orders')
		.update(updateData)
		.eq('id', orderId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/orders')
	return { success: true }
}

export async function deleteOrder(orderId: string) {
	const supabase = await createSupabaseServerClient()

	// Refund inventory before deleting order
	try {
		await refundInventoryForOrder(orderId)
	} catch (inventoryError) {
		console.error('Error refunding inventory:', inventoryError)
		// Continue with deletion even if refund fails
	}

	const { error } = await supabase.from('orders').delete().eq('id', orderId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/orders')
	return { success: true }
}

export async function completeOrderWithPayment(
	orderId: string,
	paymentMethod: string,
	discountType?: 'percent' | 'fixed',
	discountValue?: number
) {
	const supabase = await createSupabaseServerClient()

	// Get current order to calculate new total
	const { data: order, error: fetchError } = await supabase
		.from('orders')
		.select('subtotal, tax, discount_amount, total')
		.eq('id', orderId)
		.single()

	if (fetchError || !order) {
		throw new Error('Order not found')
	}

	// Calculate discount
	let discountAmount = 0
	if (discountType && discountValue !== undefined) {
		const currentSubtotal = order.subtotal
		const currentTax = order.tax
		const currentTotal = currentSubtotal + currentTax

		if (discountType === 'percent') {
			discountAmount = currentTotal * (discountValue / 100)
		} else {
			discountAmount = Math.min(discountValue, currentTotal)
		}
	}

	const newTotal = order.subtotal + order.tax - discountAmount

	const updateData: {
		status: string
		discount_amount?: number
		discount_type?: string | null
		discount_value?: number | null
		payment_method: string
		total: number
		completed_at: string
		updated_at: string
	} = {
		status: 'completed',
		payment_method: paymentMethod,
		total: newTotal,
		completed_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	}

	if (discountType && discountValue !== undefined) {
		updateData.discount_amount = discountAmount
		updateData.discount_type = discountType
		updateData.discount_value = discountValue
	}

	const { error } = await supabase
		.from('orders')
		.update(updateData)
		.eq('id', orderId)

	if (error) {
		throw new Error(error.message)
	}

	revalidatePath('/orders')
	return { success: true }
}

export async function updateOrder(
	orderId: string,
	data: {
		customerName?: string | null
		customerPhone?: string | null
		customerEmail?: string | null
		tableNumber?: string | null
		orderType?: string
		items?: Array<{
			id?: string // existing item id
			menuItemId: string
			name: string
			quantity: number
			unitPrice: number
			totalPrice: number
			notes?: string | null
		}>
		subtotal?: number
		tax?: number
		total?: number
		discountAmount?: number
		discountType?: string | null
		discountValue?: number | null
	}
): Promise<{ success: boolean }> {
	const supabase = await createSupabaseServerClient()

	// Update order basic info
	const orderUpdateData: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	}

	if (data.customerName !== undefined)
		orderUpdateData.customer_name = data.customerName
	if (data.customerPhone !== undefined)
		orderUpdateData.customer_phone = data.customerPhone
	if (data.customerEmail !== undefined)
		orderUpdateData.customer_email = data.customerEmail
	if (data.tableNumber !== undefined)
		orderUpdateData.table_number = data.tableNumber
	if (data.orderType !== undefined) orderUpdateData.order_type = data.orderType
	if (data.subtotal !== undefined) orderUpdateData.subtotal = data.subtotal
	if (data.tax !== undefined) orderUpdateData.tax = data.tax
	if (data.total !== undefined) orderUpdateData.total = data.total
	if (data.discountAmount !== undefined)
		orderUpdateData.discount_amount = data.discountAmount
	if (data.discountType !== undefined)
		orderUpdateData.discount_type = data.discountType
	if (data.discountValue !== undefined)
		orderUpdateData.discount_value = data.discountValue

	const { error: orderError } = await supabase
		.from('orders')
		.update(orderUpdateData)
		.eq('id', orderId)

	if (orderError) {
		throw new Error(orderError.message)
	}

	// Update order items if provided
	if (data.items) {
		// Get existing items
		const { data: existingItems } = await supabase
			.from('order_items')
			.select('id')
			.eq('order_id', orderId)

		const existingItemIds = new Set(existingItems?.map((item) => item.id) || [])

		// Delete items that are no longer in the list
		const itemsToKeep = data.items
			.filter((item) => item.id && existingItemIds.has(item.id))
			.map((item) => item.id!)
		const itemsToDelete = Array.from(existingItemIds).filter(
			(id) => !itemsToKeep.includes(id)
		)

		if (itemsToDelete.length > 0) {
			await supabase.from('order_items').delete().in('id', itemsToDelete)
		}

		// Update or insert items
		for (const item of data.items) {
			if (item.id && existingItemIds.has(item.id)) {
				// Update existing item
				await supabase
					.from('order_items')
					.update({
						name: item.name,
						quantity: item.quantity,
						unit_price: item.unitPrice,
						total_price: item.totalPrice,
						notes: item.notes || null
					})
					.eq('id', item.id)
			} else {
				// Insert new item
				await supabase.from('order_items').insert({
					order_id: orderId,
					menu_item_id: item.menuItemId || null,
					name: item.name,
					quantity: item.quantity,
					unit_price: item.unitPrice,
					total_price: item.totalPrice,
					notes: item.notes || null
				})
			}
		}
	}

	revalidatePath('/orders')
	return { success: true }
}
