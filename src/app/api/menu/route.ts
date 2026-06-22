import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

// CORS helper to wrap responses
function corsResponse(data: any, status = 200) {
	return NextResponse.json(data, {
		status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	})
}

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url)
	const tenantId = searchParams.get('tenantId')
	const tableParam = searchParams.get('table')

	if (!tenantId) {
		return corsResponse({ error: 'tenantId query parameter is required' }, 400)
	}

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
	const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

	if (!supabaseUrl || !supabaseKey) {
		return corsResponse({ error: 'Server configuration error: Service role key missing' }, 500)
	}

	const supabase = createClient(supabaseUrl, supabaseKey)

	try {
		// 1. Fetch Tenant settings (which has the tables list)
		const { data: tenantData, error: tenantErr } = await supabase
			.from('tenants')
			.select('id, name, settings')
			.eq('id', tenantId)
			.maybeSingle()

		if (tenantErr || !tenantData) {
			return corsResponse({ error: 'Tenant not found' }, 404)
		}

		// Validate tableParam against tables in tenant settings
		const tables = tenantData.settings?.tables || []
		let activeTable = null
		if (tableParam) {
			const normParam = tableParam.trim().toLowerCase()
			activeTable = tables.find((t: any) => 
				t.id.toLowerCase() === normParam || 
				t.name.toLowerCase() === normParam || 
				t.name.toLowerCase() === `t${normParam}`
			)
		}

		// 2. Fetch Menu Categories and Items
		const { data: rawCategories, error: menuErr } = await supabase
			.from('menu_categories')
			.select('id, name, description, position, menu_items(*)')
			.eq('tenant_id', tenantId)

		if (menuErr) {
			return corsResponse({ error: menuErr.message }, 500)
		}

		// Sort categories by position
		rawCategories.sort((a: any, b: any) => (a.position || 0) - (b.position || 0))

		// Process categories and filter active items
		const processedCategories = rawCategories.map((cat: any) => {
			const items = (cat.menu_items || [])
				.filter((item: any) => item.is_active)
				.map((item: any) => {
					return {
						id: item.id,
						name: item.name,
						description: item.description,
						base_price: parseFloat(item.base_price || item.price || 0),
						image_url: item.image_url,
						is_vegan: item.is_vegan ?? false
					}
				})
			return {
				id: cat.id,
				name: cat.name,
				items: items
			}
		}).filter((cat: any) => cat.items.length > 0)

		// 3. Fetch Toppings for the Visual Builder
		const { data: toppingsData, error: toppingsErr } = await supabase
			.from('toppings')
			.select('id, name, price, category, image_url')
			.eq('tenant_id', tenantId)

		if (toppingsErr) {
			console.error('Error fetching toppings for menu API:', toppingsErr)
		}

		return corsResponse({
			tenant: {
				id: tenantData.id,
				name: tenantData.name
			},
			table: activeTable ? {
				id: activeTable.id,
				name: activeTable.name,
				section: activeTable.section || 'Main',
				isValid: true
			} : null,
			categories: processedCategories,
			toppings: toppingsData || []
		})
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Internal Server Error'
		return corsResponse({ error: message }, 500)
	}
}
