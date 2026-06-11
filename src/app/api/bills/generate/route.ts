import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getOrGenerateBillUrl, type BillConfig } from '@/lib/bill-generator'
import { DEFAULT_WHATSAPP_TEMPLATE, type BillTemplate } from '@/lib/bill-template'

/**
 * Generate or refresh the bill PDF for an order on the server, then return
 * the canonical proxy URL.
 *
 * The web "Send WhatsApp" path generates the PDF in the browser; the iOS
 * app can't, so it calls this endpoint instead. Auth is the same as every
 * other route: cookies for web, `Authorization: Bearer <jwt>` for iOS, both
 * resolved by `createSupabaseServerClient()`.
 *
 * Body:
 *   { orderId: string }
 *
 * Returns:
 *   { url: string, regenerated: boolean }
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json().catch(() => null)
		const orderId: string | undefined = body?.orderId

		if (!orderId) {
			return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
		}

		const supabase = await createSupabaseServerClient()
		const { data: authData } = await supabase.auth.getUser()
		const user = authData?.user
		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		// 1. Order + items
		const { data: order, error: orderErr } = await supabase
			.from('orders')
			.select(
				`id, tenant_id, created_at, updated_at, bill_url, bill_generated_at,
				 order_type, table_number, customer_name, customer_phone,
				 subtotal, tax, discount_amount, total, payment_method, status,
				 order_items (id, name, quantity, unit_price, total_price)`
			)
			.eq('id', orderId)
			.single()

		if (orderErr || !order) {
			return NextResponse.json(
				{ error: orderErr?.message || 'Order not found' },
				{ status: 404 }
			)
		}

		// 2. Tenant: name, currency, social.website (for review link in template),
		//    bill template overrides.
		const { data: tenant, error: tenantErr } = await supabase
			.from('tenants')
			.select('id, name, settings, social')
			.eq('id', order.tenant_id)
			.single()

		if (tenantErr || !tenant) {
			return NextResponse.json(
				{ error: tenantErr?.message || 'Tenant not found' },
				{ status: 404 }
			)
		}

		const settings = (tenant.settings as Record<string, unknown> | null) || {}
		const billTemplates =
			(settings.billTemplates as Record<string, unknown> | undefined) || {}
		const whatsappTemplateOverride = billTemplates.whatsapp as
			| Partial<BillTemplate>
			| undefined

		const template: BillTemplate = {
			...DEFAULT_WHATSAPP_TEMPLATE,
			...(whatsappTemplateOverride || {}),
			type: 'whatsapp'
		}

		const currencySymbol =
			(settings.currencySymbol as string | undefined) || '₹'
		const reviewLink = (settings.reviewLink as string | undefined) || ''

		// 3. Build BillConfig using the request origin so server-side image
		// fetches (favicon, QR codes) resolve.
		const origin = new URL(request.url).origin

		const config: BillConfig & {
			order: BillConfig['order'] & {
				updated_at?: string | null
				bill_generated_at?: string | null
			}
		} = {
			order: {
				id: order.id,
				created_at: order.created_at as string,
				updated_at: order.updated_at as string | null,
				bill_generated_at: order.bill_generated_at as string | null,
				order_type: order.order_type as string,
				table_number: order.table_number as string | null,
				customer_name: order.customer_name as string | null,
				customer_phone: order.customer_phone as string | null,
				subtotal: Number(order.subtotal) || 0,
				tax: Number(order.tax) || 0,
				discount_amount: Number(order.discount_amount) || 0,
				total: Number(order.total) || 0,
				payment_method: order.payment_method as string | null,
				status: order.status as string,
				order_items: ((order.order_items as Array<{
					id: string
					name: string
					quantity: number
					unit_price: number
					total_price: number
				}>) || []).map((it) => ({
					id: it.id,
					name: it.name,
					quantity: it.quantity,
					unit_price: Number(it.unit_price) || 0,
					total_price: Number(it.total_price) || 0
				}))
			},
			template,
			tenantName: tenant.name as string,
			currencySymbol,
			reviewLink,
			serverOrigin: origin
		}

		// 4. Reuse the same caching helper the web side uses. Skips re-upload
		// when bill_generated_at >= updated_at.
		const { url, regenerated } = await getOrGenerateBillUrl(
			config,
			supabase,
			tenant.id as string,
			origin
		)

		return NextResponse.json({ url, regenerated })
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to generate bill'
		console.error('[bills/generate]', message)
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
