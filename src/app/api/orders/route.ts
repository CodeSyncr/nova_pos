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

		// 1. Resolve menu item IDs and compute total
		const { data: menuItems } = await supabase
			.from('menu_items')
			.select('id, name, base_price')
			.eq('tenant_id', tenantId)
			.eq('is_active', true);

		if (!menuItems) {
			return corsResponse({ error: 'Failed to retrieve menu items.' }, 500);
		}

		let computedSubtotal = 0;
		const orderItemsToInsert: any[] = [];

		items.forEach((item: any) => {
			const matchedItem = menuItems.find(
				(mi) => mi.id === item.id || mi.name.toLowerCase() === item.name.toLowerCase()
			);
			if (matchedItem) {
				const qty = parseInt(item.quantity) || 1;
				const price = parseFloat(item.price || matchedItem.base_price);
				const total_item_price = price * qty;
				computedSubtotal += total_item_price;

				orderItemsToInsert.push({
					menu_item_id: matchedItem.id,
					name: matchedItem.name,
					quantity: qty,
					unit_price: price,
					total_price: total_item_price
				});
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

		const { error: itemsErr } = await supabase
			.from('order_items')
			.insert(itemsWithOrderId);

		if (itemsErr) {
			// Clean up order on fail
			await supabase.from('orders').delete().eq('id', order.id);
			return corsResponse({ error: itemsErr.message }, 500);
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
