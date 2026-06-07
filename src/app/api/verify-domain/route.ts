import { NextRequest, NextResponse } from 'next/server'
import dns from 'dns/promises'

export const runtime = 'nodejs'

const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'novapos.in'

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url)
	const domain = searchParams.get('domain')

	if (!domain) {
		return NextResponse.json({ error: 'domain param required' }, { status: 400 })
	}

	// Sanitize: only alphanumeric + dots + hyphens
	const sanitized = domain.toLowerCase().trim()
	if (!/^[a-z0-9][a-z0-9.\-]*\.[a-z]{2,}$/.test(sanitized)) {
		return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 })
	}

	try {
		const records = await dns.resolveCname(sanitized)
		const cname = records[0] ?? null
		// Check if it resolves to our platform root domain
		const verified =
			cname !== null &&
			(cname === ROOT_DOMAIN ||
				cname === `${ROOT_DOMAIN}.` ||
				cname.endsWith(`.${ROOT_DOMAIN}`))

		return NextResponse.json({
			domain: sanitized,
			cname,
			verified,
			expectedCname: ROOT_DOMAIN,
			message: verified
				? `✓ CNAME verified — points to ${ROOT_DOMAIN}`
				: cname
					? `✗ CNAME points to ${cname}, expected ${ROOT_DOMAIN}`
					: `✗ No CNAME record found for ${sanitized}`
		})
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException).code
		const isNotFound = code === 'ENOTFOUND' || code === 'ENODATA'

		return NextResponse.json({
			domain: sanitized,
			cname: null,
			verified: false,
			expectedCname: ROOT_DOMAIN,
			message: isNotFound
				? `✗ No CNAME record found for ${sanitized}`
				: `✗ DNS lookup failed — please try again shortly`
		})
	}
}
