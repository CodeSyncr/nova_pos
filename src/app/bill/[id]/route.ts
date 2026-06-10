import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params
		if (!id) {
			return new NextResponse('Order ID required', { status: 400 })
		}

		// Initialize Supabase Client with Service Role Key to bypass RLS policies
		const supabase = createClient(supabaseUrl, supabaseServiceKey)

		// 1. Fetch order to get tenant_id
		const { data: order, error: orderError } = await supabase
			.from('orders')
			.select('tenant_id, id')
			.eq('id', id)
			.single()

		if (orderError || !order) {
			console.error('[Bill Proxy] Order not found:', orderError)
			return new NextResponse('Order not found', { status: 404 })
		}

		const tenantId = order.tenant_id
		const oid = order.id.slice(0, 8)

		// 2. List files in the bills bucket under tenantId folder to find the file containing ORD-<id>
		const { data: files, error: listError } = await supabase.storage
			.from('bills')
			.list(tenantId)

		if (listError || !files) {
			console.error('[Bill Proxy] Storage list failed:', listError)
			return new NextResponse('Bill file not found', { status: 404 })
		}

		// Find the file name containing our order ID prefix (case-insensitive)
		const targetPrefix = `ORD-${oid}`.toLowerCase()
		const billFile = files.find((f) => f.name.toLowerCase().includes(targetPrefix))
		if (!billFile) {
			console.error('[Bill Proxy] No matching bill file found in storage for:', targetPrefix)
			return new NextResponse('Bill file not found', { status: 404 })
		}

		// 3. Download the PDF file from storage
		const filePath = `${tenantId}/${billFile.name}`
		const { data: fileData, error: downloadError } = await supabase.storage
			.from('bills')
			.download(filePath)

		if (downloadError || !fileData) {
			console.error('[Bill Proxy] Download failed:', downloadError)
			return new NextResponse('Error downloading bill', { status: 500 })
		}

		// 4. Return the PDF bytes as an inline response
		const buffer = await fileData.arrayBuffer()
		return new NextResponse(buffer, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="Bill_${oid.toUpperCase()}.pdf"`,
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		})
	} catch (err: any) {
		console.error('[Bill Proxy] Internal error:', err)
		return new NextResponse(err.message || 'Internal Server Error', { status: 500 })
	}
}
