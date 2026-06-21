import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

function corsResponse(data: any, status = 200) {
	return NextResponse.json(data, {
		status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	})
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
		const { message, tenantId, history, tableId } = body

		if (!message || !tenantId) {
			return corsResponse({ error: 'Both message and tenantId are required in the request body.' }, 400)
		}

		const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
		const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

		if (!supabaseUrl || !supabaseKey) {
			return corsResponse({ error: 'Server configuration error: Service role key missing.' }, 500)
		}

		const supabase = createClient(supabaseUrl, supabaseKey)

		// 1. Fetch Tenant settings
		const { data: tenantData, error: tenantErr } = await supabase
			.from('tenants')
			.select('id, name')
			.eq('id', tenantId)
			.maybeSingle()

		if (tenantErr || !tenantData) {
			return corsResponse({ error: 'Tenant not found.' }, 404)
		}

		// 2. Fetch Menu Categories and Items
		const { data: rawCategories, error: menuErr } = await supabase
			.from('menu_categories')
			.select('id, name, description, position, menu_items(*)')
			.eq('tenant_id', tenantId)

		if (menuErr) {
			return corsResponse({ error: menuErr.message }, 500)
		}

		// 3. Fetch Sales Data (last 30 days) to identify popular items
		const thirtyDaysAgo = new Date()
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

		const { data: orderItems, error: salesErr } = await supabase
			.from('order_items')
			.select('menu_item_id, quantity, orders!inner(tenant_id, created_at)')
			.eq('orders.tenant_id', tenantId)
			.gte('orders.created_at', thirtyDaysAgo.toISOString())

		const salesMap: Record<string, number> = {}
		if (!salesErr && orderItems) {
			orderItems.forEach((item: any) => {
				const itemId = item.menu_item_id
				const qty = parseInt(item.quantity) || 0
				if (itemId) {
					salesMap[itemId] = (salesMap[itemId] || 0) + qty
				}
			})
		}

		// Find all active items to match specific top sellers and premium items
		const activeItemsList: any[] = []
		rawCategories.forEach((cat: any) => {
			const activeItems = (cat.menu_items || []).filter((item: any) => item.is_active)
			activeItemsList.push(...activeItems)
		})

		// Explicitly prioritize Napoli, Margherita, and Paneer Tikka based on user instructions
		const napoliItem = activeItemsList.find(
			(item: any) => item.name.toLowerCase().includes('napoli') || item.name.toLowerCase().includes('naepoli')
		)
		const margheritaItem = activeItemsList.find(
			(item: any) => item.name.toLowerCase().includes('margherita')
		)
		const paneerTikkaItem = activeItemsList.find(
			(item: any) => item.name.toLowerCase().includes('paneer tikka')
		)

		// Set up popularity ID tracking sets
		const topThreeIds = new Set<string>()
		const popularIds = new Set<string>()

		if (napoliItem) topThreeIds.add(napoliItem.id)
		if (margheritaItem) topThreeIds.add(margheritaItem.id)
		if (paneerTikkaItem) topThreeIds.add(paneerTikkaItem.id)

		// Rank remaining items from database sales
		const sortedSales = Object.entries(salesMap).sort((a, b) => b[1] - a[1])
		sortedSales.forEach(([id]) => {
			if (topThreeIds.has(id) || popularIds.has(id)) return
			if (topThreeIds.size < 3) {
				topThreeIds.add(id)
			} else if (popularIds.size < 5) {
				popularIds.add(id)
			}
		})

		// Rank premium items by price (top 3 highest priced)
		const sortedByPrice = [...activeItemsList].sort((a: any, b: any) => b.base_price - a.base_price)
		const premiumItemIds = new Set(sortedByPrice.slice(0, 3).map((item: any) => item.id))

		// Process menu items into a clean text-based catalog for LLM context
		let menuCatalog = `Restaurant Name: ${tenantData.name}\n\n`;
		rawCategories.sort((a: any, b: any) => (a.position || 0) - (b.position || 0));

		rawCategories.forEach((cat: any) => {
			const activeItems = (cat.menu_items || []).filter((item: any) => item.is_active);
			if (activeItems.length > 0) {
				menuCatalog += `Category: ${cat.name}\n`;
				activeItems.forEach((item: any) => {
					let popularity = '';
					if (napoliItem && item.id === napoliItem.id) {
						popularity = ' [Rank #1 Top Seller / Absolute Best Seller / Customer Favorite]';
					} else if (margheritaItem && item.id === margheritaItem.id) {
						popularity = ' [Rank #2 Best Seller / Highly Popular]';
					} else if (topThreeIds.has(item.id)) {
						popularity = ' [Best Seller / Customer Favorite]';
					} else if (popularIds.has(item.id)) {
						popularity = ' [Highly Popular]';
					}

					let premiumTag = '';
					if (premiumItemIds.has(item.id)) {
						premiumTag = ' [Chef\'s Special Signature / Premium]';
					}

					menuCatalog += `- **${item.name}** | Price: ₹${Math.round(item.base_price)} | Vegan: ${item.is_vegan ? 'Yes' : 'No'}${popularity}${premiumTag}${item.prep_time_minutes ? ` | Prep Time: ${item.prep_time_minutes}m` : ''}${item.allergen_info ? ` | Allergens: ${item.allergen_info}` : ''}\n`;
					if (item.description) {
						menuCatalog += `  Description: ${item.description}\n`;
					}
				});
				menuCatalog += `\n`;
			}
		});

		// 4. Construct System Instructions with Strict Scope Guard
		let orderRule = '';
		if (tableId) {
			orderRule = `9. ORDER PLACEMENT CAPABILITY:
Since the customer is seated at a physical table (Table number/name: "${tableId}"), you ARE allowed to take their order.
However, before confirming or placing the order, you MUST verify that you have collected their (a) Name and (b) Phone Number. If they have not provided them yet in this conversation, you MUST ask them: "Before I place your order for Table ${tableId}, could I please get your Name and Phone Number?"
Once you have (1) the dishes they want to order, (2) their Name, and (3) their Phone Number, you must confirm the order and append this exact tag at the very end of your response:
ORDER_TRIGGER: {"customerName": "NAME_HERE", "customerPhone": "PHONE_HERE", "items": [{"name": "EXACT_DISH_NAME_1", "quantity": 1}, {"name": "EXACT_DISH_NAME_2", "quantity": 2}]}

Example response format:
"Perfect! I've placed the order for your Margherita. It will be served to Table ${tableId} shortly.
ORDER_TRIGGER: {\"customerName\": \"John Doe\", \"customerPhone\": \"+1234567890\", \"items\": [{\"name\": \"Margherita\", \"quantity\": 1}]}"`;
		} else {
			orderRule = `9. IMPORTANT: You are ONLY an informational assistant for suggestions, advice, and recommendations. You CANNOT take orders, record orders, modify their cart, or process payments. If a customer says they want to order or add something, politely guide them to add the items to their cart directly on the page, or ask a human waiter. NEVER say "I will place your order", "Your order is complete", or "I will bring it out to you".`;
		}

		const systemInstruction = `You are the AI Waiter for the restaurant "${tenantData.name}".
Your task is to assist customers with questions about our menu, recommend dishes, suggest pairings (e.g. drinks or sides to match a pizza), and help them make a dining selection.

Live Menu Context:
${menuCatalog}

SCOPE GUARD RULES:
1. ONLY answer questions directly related to this restaurant, the menu, its ingredients, ordering, or the dining experience.
2. If the customer asks questions outside this scope (e.g., general knowledge, coding, writing scripts, math, history, translating languages, personal advice, unrelated chat, or other topics not about the restaurant and menu), you must politely refuse to answer. You must reply with exactly: "I can only assist with questions regarding our menu and dining experience. Grazie!" and nothing else. Do not engage with the out-of-scope question.
3. Be warm, helpful, and structured. When listing recommendations or options, always use bullet points (e.g. using - or •) and line breaks to present them clearly instead of a single long paragraph. Keep responses concise (max 4-5 sentences/lines).
4. Always refer to dishes by their exact names as listed in the menu. Use bold markdown for dish names (e.g., **Margherita Pizza**).
5. Recommend dishes tagged as "[Best Seller / Customer Favorite]" or "[Highly Popular]" when customers ask for popular items or recommendations.
6. IMPORTANT: Do not expose raw numbers, sales counts, statistics, or exact rankings to the customer. For example, say "Our Margherita Pizza is a best seller and highly recommended!" instead of "We sold 50 Margherita Pizzas" or "Margherita Pizza is ranked number 1". Keep sales figures and stats completely private.
7. Be slightly biased toward recommending higher-value/premium menu items (e.g., dishes tagged as "[Chef's Special Signature / Premium]" or higher-priced pizzas and pastas). Recommend them as our premium, chef-crafted signature options.
8. NEVER suggest, recommend, or mention "Temph Pizza" or any dish containing "Temph" under any circumstances.
${orderRule}`;

		// 4. Call Cloudflare Workers AI API
		const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
		const cfApiToken = process.env.CLOUDFLARE_API_TOKEN;

		if (!cfAccountId || !cfApiToken) {
			return corsResponse({ error: 'Server configuration error: Cloudflare Account ID or API Token not configured.' }, 500)
		}

		// Prepare conversation messages format for Llama-3 / Workers AI
		const messages: any[] = [];
		messages.push({
			role: 'system',
			content: systemInstruction
		});

		// Map history to Llama roles ('user' or 'assistant')
		if (Array.isArray(history)) {
			history.forEach((h: any) => {
				if (h.role === 'user' || h.role === 'model') {
					messages.push({
						role: h.role === 'model' ? 'assistant' : 'user',
						content: h.text
					});
				}
			});
		}

		// Add current user message
		messages.push({
			role: 'user',
			content: message
		});

		const cfModel = '@cf/meta/llama-3.1-8b-instruct-fast';
		const cfResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${cfModel}`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${cfApiToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				messages
			})
		});

		if (!cfResponse.ok) {
			const errText = await cfResponse.text();
			console.error('[Cloudflare Workers AI API error]:', errText);
			return corsResponse({ error: 'Failed to communicate with Cloudflare Workers AI.' }, 500);
		}

		const resData = await cfResponse.json();
		const aiText = resData.result?.response || "I apologize, I am unable to answer that right now. Please try again. Grazie!";

		let finalAiText = aiText;
		const triggerMatch = aiText.match(/ORDER_TRIGGER:\s*(\{[\s\S]*\})/);
		if (triggerMatch && tableId) {
			try {
				const orderPayload = JSON.parse(triggerMatch[1]);
				const { customerName, customerPhone, items } = orderPayload;

				if (customerName && customerPhone && Array.isArray(items) && items.length > 0) {
					// 1. Resolve menu item IDs from names
					const { data: menuItems } = await supabase
						.from('menu_items')
						.select('id, name, base_price')
						.eq('tenant_id', tenantId)
						.eq('is_active', true);

					if (menuItems) {
						let subtotal = 0;
						const orderItemsToInsert: any[] = [];

						items.forEach((item: any) => {
							const matchedItem = menuItems.find(
								(mi) =>
									mi.name.toLowerCase() === item.name.toLowerCase() ||
									mi.name.toLowerCase().includes(item.name.toLowerCase())
							);
							if (matchedItem) {
								const qty = parseInt(item.quantity) || 1;
								const price = matchedItem.base_price;
								const total = price * qty;
								subtotal += total;

								orderItemsToInsert.push({
									menu_item_id: matchedItem.id,
									name: matchedItem.name,
									quantity: qty,
									unit_price: price,
									total_price: total
								});
							}
						});

						if (orderItemsToInsert.length > 0) {
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
									subtotal: subtotal,
									total: subtotal,
									tax: 0
								})
								.select()
								.single();

							if (order && !orderErr) {
								// 3. Insert order items
								const itemsWithOrderId = orderItemsToInsert.map((oi) => ({
									...oi,
									order_id: order.id
								}));
								await supabase.from('order_items').insert(itemsWithOrderId);

								// Clean up response text (strip out trigger tag)
								finalAiText = aiText.replace(/ORDER_TRIGGER:\s*(\{[\s\S]*\})/g, '').trim();
								finalAiText += "\n\nGrazie! I have successfully placed your order for Table " + tableId + ". Your food is being prepared!";
							} else {
								console.error('[Order creation error]:', orderErr);
							}
						}
					}
				}
			} catch (e) {
				console.error('[Failed to parse ORDER_TRIGGER]:', e);
			}
		}

		return corsResponse({ reply: finalAiText.trim() });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Internal Server Error';
		console.error('[Chat API handler error]:', err);
		return corsResponse({ error: msg }, 500);
	}
}
