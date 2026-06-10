import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'novapos.in'

/**
 * Checks whether the given hostname is a custom domain (not our platform domain)
 */
function isCustomDomain(hostname: string): boolean {
	// Strip port if present
	const host = hostname.split(':')[0]!
	// It's NOT a custom domain if it's our root domain or a subdomain of it
	return (
		host !== ROOT_DOMAIN &&
		!host.endsWith(`.${ROOT_DOMAIN}`) &&
		host !== 'localhost' &&
		!host.startsWith('127.') &&
		!host.startsWith('192.168.') &&
		host !== '0.0.0.0'
	)
}

/**
 * Middleware: Supabase session refresh + subdomain routing + custom domain routing.
 */
export async function middleware(request: NextRequest) {
	const url = request.nextUrl.clone()
	const hostname = request.headers.get('host') || ''
	const host = hostname.split(':')[0]!

	// Skip routing for static assets, Next.js internal files, APIs, etc.
	const skipRouting =
		host.split('.')[0] === 'www' ||
		host === 'localhost' ||
		host === '127.0.0.1' ||
		hostname.includes('localhost') ||
		url.pathname.startsWith('/api') ||
		url.pathname.startsWith('/_next') ||
		url.pathname.startsWith('/static') ||
		url.pathname.includes('.')

	if (skipRouting) {
		return updateSession(request)
	}

	// ── Custom Domain Routing ──────────────────────────────────────────────────
	// If the incoming host is not our platform domain, resolve it as a custom domain
	if (isCustomDomain(host)) {
		// Determine if it's "pos.customdomain.com" or "customdomain.com"
		const isPosSubdomain = host.startsWith('pos.')
		const rootDomain = isPosSubdomain ? host.slice(4) : host

		// Call our internal resolve-domain API to look up the tenant
		// We use an absolute URL pointing to ourselves
		const internalBase =
			process.env.NEXT_PUBLIC_APP_URL ||
			`${request.nextUrl.protocol}//${request.headers.get('host')}`

		let tenantId: string | null = null
		try {
			const resolveUrl = `${internalBase}/api/resolve-domain?domain=${encodeURIComponent(host)}`
			const res = await fetch(resolveUrl, {
				headers: { 'x-internal-request': '1' }
			})
			if (res.ok) {
				const data = await res.json()
				tenantId = data.tenantId ?? null
			}
		} catch {
			// Fail open — let the request continue to show a 404
		}

		if (tenantId) {
			// Rewrite to our custom-domain handler route group
			const targetPath = isPosSubdomain
				? `/custom-domain/pos${url.pathname}`
				: `/custom-domain${url.pathname}`

			url.pathname = targetPath

			const requestHeaders = new Headers(request.headers)
			requestHeaders.set('x-custom-domain', rootDomain)
			requestHeaders.set('x-tenant-id', tenantId)
			requestHeaders.set('x-domain-type', isPosSubdomain ? 'pos' : 'landing')

			const rewrittenRequest = new NextRequest(url, {
				headers: requestHeaders
			})
			// Still run auth session refresh
			return updateSession(rewrittenRequest)
		}

		// Domain not found — let Next.js handle it (will 404)
		return NextResponse.next()
	}

	// ── Platform Subdomain Routing ─────────────────────────────────────────────
	const subdomain = host.split('.')[0]!

	const parts = host.split('.')
	if (parts.length < 3) {
		return updateSession(request)
	}

	// Inject the platform subdomain as a header for tenant resolution
	const requestHeaders = new Headers(request.headers)
	requestHeaders.set('x-subdomain', subdomain)

	const requestWithSubdomain = new NextRequest(request.url, {
		headers: requestHeaders
	})

	return updateSession(requestWithSubdomain)
}

export const config = {
	matcher: [
		'/((?!api|_next/static|_next/image|favicon.ico).*)'
	]
}
