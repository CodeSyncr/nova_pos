import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Streams the order's bill PDF from Supabase Storage. Bills are written to a
 * stable per-order path by `lib/bill-generator.ts → generateAndUploadBill`,
 * so we can `download()` directly instead of listing the bucket.
 *
 * The legacy timestamped layout (e.g. `1700000000_Bill_ORD-abc.pdf`) is still
 * supported via a fallback `list + name match` so old orders generated before
 * the rename keep working.
 *
 * Caching: short revalidation window so a fresh PDF (after an order edit)
 * shows up promptly. The previous `immutable` cache let stale bills linger.
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params
		if (!id) return new NextResponse('Order ID required', { status: 400 })

		const supabase = createClient(supabaseUrl, supabaseServiceKey)

		let fileBlob: Blob | null = null
		let orderTenantId: string | undefined = undefined
		let orderBillGeneratedAt: string | undefined = undefined
		const oid = id.slice(0, 8)


		const { data: order, error: orderError } = await supabase
			.from('orders')
			.select('tenant_id, id, bill_generated_at')
			.eq('id', id)
			.single()

		if (!orderError && order) {
			orderTenantId = order.tenant_id
			orderBillGeneratedAt = order.bill_generated_at
			const stablePath = `${orderTenantId}/Bill_ORD-${oid}.pdf`

			// 1. Try the stable filename first.
			const direct = await supabase.storage.from('bills').download(stablePath)
			if (!direct.error && direct.data) {
				fileBlob = direct.data
			} else {
				// 2. Legacy fallback: list and match by ORD-<id> substring.
				const { data: files } = await supabase.storage.from('bills').list(orderTenantId)
				const targetPrefix = `ord-${oid}`.toLowerCase()
				const billFile = files?.find((f) => f.name.toLowerCase().includes(targetPrefix))
				if (billFile) {
					const { data: legacyData, error: legacyErr } = await supabase.storage
						.from('bills')
						.download(`${orderTenantId}/${billFile.name}`)
					if (!legacyErr && legacyData) fileBlob = legacyData
				}
			}
		} else {
			// Order deleted or not found in DB. Fallback to scanning storage.
			console.log(`[Bill Proxy] Order ${oid} not found in DB. Scanning storage bucket for cached bill...`)
			const { data: rootFolders, error: rootError } = await supabase.storage
				.from('bills')
				.list('', { limit: 100 })

			if (!rootError && rootFolders) {
				for (const item of rootFolders) {
					if (!item.id) { // Folder
						const { data: files, error: filesError } = await supabase.storage
							.from('bills')
							.list(item.name, { limit: 100 })

						if (!filesError && files) {
							const targetPrefix = `ord-${oid}`.toLowerCase()
							const billFile = files.find((f) => f.name.toLowerCase().includes(targetPrefix))
							if (billFile) {
								const downloadRes = await supabase.storage
									.from('bills')
									.download(`${item.name}/${billFile.name}`)
								if (!downloadRes.error && downloadRes.data) {
									fileBlob = downloadRes.data
									orderTenantId = item.name
									orderBillGeneratedAt = billFile.updated_at || billFile.created_at || new Date().toISOString()
									break
								}
							}
						}
					}
				}
			}
		}

		if (!fileBlob) {
			console.error('[Bill Proxy] Bill file not found for', oid)
			return new NextResponse('Bill not yet generated for this order', { status: 404 })
		}

		const buffer = await fileBlob.arrayBuffer()
		// Tie the cache key to bill_generated_at so a freshly regenerated
		// bill replaces the cached copy quickly. Browsers and CDNs will
		// re-fetch on every order edit.
		const etag = `"${orderBillGeneratedAt || 'unknown'}"`
		const ifNoneMatch = request.headers.get('if-none-match')
		if (ifNoneMatch === etag) {
			return new NextResponse(null, { status: 304, headers: { ETag: etag } })
		}

		return new NextResponse(buffer, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="Bill_${oid.toUpperCase()}.pdf"`,
				'Cache-Control': 'private, max-age=0, must-revalidate',
				ETag: etag
			}
		})
	} catch (err: any) {
		console.error('[Bill Proxy] Internal error:', err)
		return new NextResponse(err.message || 'Internal Server Error', { status: 500 })
	}
}
