import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

function corsResponse(data: any, status = 200) {
	return NextResponse.json(data, {
		status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Cache-Control': 'no-store, max-age=0'
		}
	})
}

export async function OPTIONS() {
	return new NextResponse(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	})
}

export async function GET(request: NextRequest) {
	try {
		const origin = request.headers.get('origin') || '';
		const referer = request.headers.get('referer') || '';

		const isAllowed = 
			origin.includes('pizzeriada.cafe') || 
			referer.includes('pizzeriada.cafe') ||
			origin.includes('pizzeriacafe.in') || 
			referer.includes('pizzeriacafe.in') ||
			origin.includes('localhost') || 
			referer.includes('localhost') ||
			origin.includes('127.0.0.1') ||
			referer.includes('127.0.0.1');

		if (!isAllowed) {
			return corsResponse({ error: 'Unauthorized origin.' }, 403)
		}

		const { searchParams } = new URL(request.url)
		const phone = searchParams.get('phone') || ''
		const tenantId = searchParams.get('tenantId') || ''

		if (!tenantId || !phone) {
			return corsResponse({ error: 'Missing tenantId or phone parameter.' }, 400)
		}

		const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
		const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

		if (!supabaseUrl || !supabaseKey) {
			return corsResponse({ error: 'Server configuration error.' }, 500)
		}

		const supabase = createClient(supabaseUrl, supabaseKey)

		let query = supabase
			.from('orders')
			.select('customer_name')
			.eq('tenant_id', tenantId);

		if (phone.startsWith('+')) {
			query = query.eq('customer_phone', phone);
		} else {
			query = query.or(`customer_phone.eq.${phone},customer_phone.eq.+91${phone}`);
		}

		const { data, error } = await query
			.order('created_at', { ascending: false })
			.limit(1);

		if (error) {
			return corsResponse({ error: error.message }, 500)
		}

		const customerName = data && data.length > 0 ? data[0].customer_name : null;
		return corsResponse({ customerName });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Internal Server Error';
		console.error('[Orders GET API error]:', err);
		return corsResponse({ error: msg }, 500);
	}
}

export async function POST(request: NextRequest) {
	try {
		const origin = request.headers.get('origin') || '';
		const referer = request.headers.get('referer') || '';

		const isAllowed = 
			origin.includes('pizzeriada.cafe') || 
			referer.includes('pizzeriada.cafe') ||
			origin.includes('pizzeriacafe.in') || 
			referer.includes('pizzeriacafe.in') ||
			origin.includes('localhost') || 
			referer.includes('localhost') ||
			origin.includes('127.0.0.1') ||
			referer.includes('127.0.0.1');

		if (!isAllowed) {
			return corsResponse({ error: 'Unauthorized origin.' }, 403)
		}

		const body = await request.json()
		const { tenantId, tableId, customerName, customerPhone, items, notes } = body

		if (!tenantId || !tableId || !customerName || !customerPhone || !items || !Array.isArray(items) || items.length === 0) {
			return corsResponse({ error: 'Missing required order fields: tenantId, tableId, customerName, customerPhone, items' }, 400)
		}

		const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
		const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

		if (!supabaseUrl || !supabaseKey) {
			return corsResponse({ error: 'Server configuration error.' }, 500)
		}

		const supabase = createClient(supabaseUrl, supabaseKey)

		// 1. Fetch menu items and toppings for validation
		const { data: menuItems } = await supabase
			.from('menu_items')
			.select('id, name, base_price')
			.eq('tenant_id', tenantId)
			.eq('is_active', true);

		const { data: dbToppings } = await supabase
			.from('toppings')
			.select('id, name, price')
			.eq('tenant_id', tenantId);

		if (!menuItems) {
			return corsResponse({ error: 'Failed to retrieve menu items.' }, 500);
		}

		const toppingsMap = new Map((dbToppings || []).map((t) => [t.id, t]));

		let computedSubtotal = 0;
		const orderItemsToInsert: any[] = [];
		const customToppingsToInsert: Array<{ itemIndex: number; toppingId: string; name: string; price: number }> = [];

		items.forEach((item: any, itemIndex: number) => {
			const qty = parseInt(item.quantity) || 1;

			if (item.isCustom || item.id === 'custom' || item.name.toLowerCase().includes('custom pizza')) {
				// Handle Custom Pizza Base Pizza (Tomato Base - 450, Alfredo Base - 500)
				const isAlfredo = item.baseType === 'alfredo';
				const saucePremium = isAlfredo ? 50 : 0;

				let toppingsCount = 0;
				const itemToppingsDetail: string[] = [];

				if (item.toppings && Array.isArray(item.toppings)) {
					item.toppings.forEach((t: any) => {
						const matchedTopping = toppingsMap.get(t.id);
						if (matchedTopping) {
							toppingsCount++;
							const halfLabel = t.half === 'whole' ? 'Whole' : (t.half === 'left' ? 'Left Half' : 'Right Half');
							itemToppingsDetail.push(`${matchedTopping.name} (${halfLabel})`);

							customToppingsToInsert.push({
								itemIndex,
								toppingId: matchedTopping.id,
								name: matchedTopping.name,
								price: 0 // toppings are included in package price
							});
						}
					});
				}

				let basePrice = 450;
				let tierName = 'Up to 2 Toppings';
				if (toppingsCount >= 3 && toppingsCount <= 4) {
					basePrice = 650;
					tierName = 'Up to 4 Toppings';
				} else if (toppingsCount >= 5) {
					basePrice = 800;
					tierName = 'Unlimited Toppings';
				}

				const unitPrice = basePrice + saucePremium;
				const name = isAlfredo 
					? `Custom Pizza (${tierName}, Alfredo Base)`
					: `Custom Pizza (${tierName}, Tomato Base)`;

				const total_item_price = unitPrice * qty;
				computedSubtotal += total_item_price;

				const notes = itemToppingsDetail.length > 0
					? `Toppings: ${itemToppingsDetail.join(', ')}`
					: 'No extra toppings';

				orderItemsToInsert.push({
					menu_item_id: null,
					name,
					quantity: qty,
					unit_price: unitPrice,
					total_price: total_item_price,
					notes
				});
			} else {
				// Handle Standard Menu Item
				const matchedItem = menuItems.find(
					(mi) => mi.id === item.id || mi.name.toLowerCase() === item.name.toLowerCase()
				);
				if (matchedItem) {
					const price = parseFloat(item.price || matchedItem.base_price);
					const total_item_price = price * qty;
					computedSubtotal += total_item_price;

					orderItemsToInsert.push({
						menu_item_id: matchedItem.id,
						name: matchedItem.name,
						quantity: qty,
						unit_price: price,
						total_price: total_item_price,
						notes: item.notes || null
					});
				}
			}
		});

		if (orderItemsToInsert.length === 0) {
			return corsResponse({ error: 'No valid menu items found in the order request.' }, 400);
		}

		// 2. Insert order
		const { data: order, error: orderErr } = await supabase
			.from('orders')
			.insert({
				tenant_id: tenantId,
				table_number: String(tableId),
				status: 'pending',
				order_type: 'dine_in',
				customer_name: customerName,
				customer_phone: customerPhone,
				subtotal: computedSubtotal,
				total: computedSubtotal,
				tax: 0,
				notes: notes || null
			})
			.select()
			.single();

		if (orderErr || !order) {
			return corsResponse({ error: orderErr?.message || 'Failed to insert order.' }, 500);
		}

		// 3. Insert order items
		const itemsWithOrderId = orderItemsToInsert.map((oi) => ({
			...oi,
			order_id: order.id
		}));

		const { data: insertedItems, error: itemsErr } = await supabase
			.from('order_items')
			.insert(itemsWithOrderId)
			.select('id, name');

		if (itemsErr || !insertedItems) {
			// Clean up order on fail
			await supabase.from('orders').delete().eq('id', order.id);
			return corsResponse({ error: itemsErr?.message || 'Failed to insert order items.' }, 500);
		}

		// 4. Insert custom toppings links if any
		if (customToppingsToInsert.length > 0) {
			const toppingsToInsert = customToppingsToInsert.map((t) => {
				const insertedItem = insertedItems[t.itemIndex];
				return {
					order_item_id: insertedItem.id,
					topping_id: t.toppingId,
					name: t.name,
					price: t.price
				};
			});

			const { error: toppingsInsertErr } = await supabase
				.from('order_item_toppings')
				.insert(toppingsToInsert);

			if (toppingsInsertErr) {
				console.error('Error inserting order item toppings:', toppingsInsertErr);
			}
		}

		// Send push notification to POS dashboard
		try {
			const { sendPushToTenant } = await import('@/lib/send-push')
			await sendPushToTenant({
				tenantId,
				excludeUserId: '00000000-0000-0000-0000-000000000000',
				title: 'New Table Order!',
				body: `New Dine-in Order from ${customerName} at Table ${tableId}`,
				url: '/orders'
			})
		} catch (e) {
			console.error('[Notification failed]:', e)
		}

		return corsResponse({ success: true, orderId: order.id });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Internal Server Error';
		console.error('[Orders API handler error]:', err);
		return corsResponse({ error: msg }, 500);
	}
}
