/**
 * Zomato merchant dashboard client.
 *
 * Zomato's official POS Integration API requires vendor onboarding (NDA, IP
 * whitelisting, uptime SLA), so this instead calls the same private endpoint
 * the merchant dashboard's own frontend uses:
 *
 *   POST https://api.zomato.com/merchant-gw/web/order/history/get-all-v2
 *
 * AUTH: partner login is OTP-only behind Akamai bot protection, so it cannot
 * be automated — an automated login is rejected even with a correct OTP. We
 * therefore carry a session captured from a real browser (DevTools ->
 * "Copy as cURL") and use it until Zomato expires it.
 *
 * The JWT in `X-Zomato-Mx-Auth-Token` carries two expiries:
 *   exp  — ~5 minutes, and NOT strictly enforced (verified: a request 11s past
 *          exp still returned 200)
 *   bExp — ~24 hours, the real outer bound
 * So a captured session is good for roughly a day, then needs reconnecting.
 */

const ORDERS_URL = 'https://api.zomato.com/merchant-gw/web/order/history/get-all-v2'
const CHECK_AUTH_URL = 'https://www.zomato.com/restaurant-onboard-diy/check-auth'

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'

/** Zomato refuses ranges wider than this ("select a date range of up to 10 days"). */
export const MAX_RANGE_DAYS = 10

export class ZomatoError extends Error {
	readonly step: string
	/** True when the stored session is no longer valid and a human must reconnect. */
	readonly needsReconnect: boolean

	constructor(message: string, step: string, needsReconnect = false) {
		super(message)
		this.name = 'ZomatoError'
		this.step = step
		this.needsReconnect = needsReconnect
	}
}

/** A browser-captured Zomato session. */
export type ZomatoSession = {
	/** Raw Cookie header value copied from the browser request. */
	cookies: string
	/** CSRF token, mirrored in both a cookie and the x-zomato-csrft header. */
	csrfToken: string
	/** Merchant CSRF token (the __Host-zmxcsrft cookie). */
	mxCsrfToken: string
	/** Zomato outlet id (res_Id), as an 8-digit numeric string. */
	resId: string
}

export type ZomatoOrder = {
	externalId: string
	resId: string
	status: string | null
	customerName: string | null
	itemsSummary: string | null
	amount: number | null
	orderedAt: string // ISO 8601
	raw: unknown
}

/* -------------------------------------------------------------------------- */
/* Snippet markup                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The dashboard returns display markup rather than plain values, e.g.
 *   "<semibold-200|{white-500|DELIVERED}>"
 *   "<regular-200|{grey-700|₹1947.00}>"
 * Strip the style/colour wrappers down to the text.
 */
export function stripMarkup(value: string | undefined | null): string {
	if (!value) return ''
	let text = value
	// Unwrap {colour|text} then <style|text>, innermost first.
	for (let i = 0; i < 5; i++) {
		const next = text
			.replace(/\{[a-z0-9-]+\|([^{}]*)\}/gi, '$1')
			.replace(/<[a-z0-9-]+\|([^<>]*)>/gi, '$1')
		if (next === text) break
		text = next
	}
	return text.trim()
}

function snippetText(node: unknown): string {
	if (!node || typeof node !== 'object') return ''
	return stripMarkup((node as { text?: string }).text)
}

/**
 * Parses "10:55 PM | 29 August" into an ISO timestamp.
 *
 * Zomato omits the year, so it is taken from `referenceYear` (the year of the
 * range being queried). Times are IST, which has no DST.
 */
export function parseOrderedAt(display: string, referenceYear: number): string | null {
	const match = display.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*\|\s*(\d{1,2})\s+([A-Za-z]+)/i)
	if (!match) return null

	const [, hh, mm, meridiem, day, monthName] = match
	const months = [
		'january', 'february', 'march', 'april', 'may', 'june',
		'july', 'august', 'september', 'october', 'november', 'december'
	]
	const monthIndex = months.findIndex((m) => m.startsWith(monthName!.toLowerCase().slice(0, 3)))
	if (monthIndex === -1) return null

	let hour = Number(hh) % 12
	if (meridiem!.toUpperCase() === 'PM') hour += 12

	const iso =
		`${referenceYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}` +
		`T${String(hour).padStart(2, '0')}:${mm}:00+05:30`

	const date = new Date(iso)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function parseAmount(display: string): number | null {
	// "₹1947.00" -> 1947
	const cleaned = display.replace(/[^\d.]/g, '')
	if (!cleaned) return null
	const value = Number(cleaned)
	return Number.isFinite(value) ? value : null
}

/** Turns the dashboard's snippet list into orders. */
export function parseSnippets(snippets: unknown[], referenceYear: number): ZomatoOrder[] {
	const orders: ZomatoOrder[] = []

	for (const snippet of snippets) {
		if (!snippet || typeof snippet !== 'object') continue
		const s = snippet as Record<string, unknown>

		const externalId = s.id != null ? String(s.id) : null
		if (!externalId) continue

		const status = snippetText((s.primaryTag as Record<string, unknown> | undefined)?.label) || null
		const when = snippetText(s.topRightText)
		const orderedAt = parseOrderedAt(when, referenceYear)
		// Without a timestamp the row cannot be placed on a timeline; skip it
		// rather than inventing a date.
		if (!orderedAt) continue

		const infoList = Array.isArray(s.infoList) ? (s.infoList as Record<string, unknown>[]) : []

		// Row 0 carries "ID: …" on the left and "By <customer>" on the right.
		// Row 1 carries the item summary and the order total.
		const customerRaw = snippetText(infoList[0]?.rightText)
		const customerName = customerRaw.replace(/^By\s+/i, '').trim() || null

		const itemsSummary = snippetText(infoList[1]?.leftText) || null
		const amount = parseAmount(snippetText(infoList[1]?.rightText))

		orders.push({
			externalId,
			resId: '',
			status,
			customerName,
			itemsSummary,
			amount,
			orderedAt,
			raw: snippet
		})
	}

	return orders
}

/* -------------------------------------------------------------------------- */
/* API                                                                         */
/* -------------------------------------------------------------------------- */

function buildHeaders(session: ZomatoSession) {
	return {
		accept: 'application/json, text/plain, */*',
		'content-type': 'application/json',
		cookie: session.cookies,
		origin: 'https://www.zomato.com',
		referer: 'https://www.zomato.com/',
		'user-agent': USER_AGENT,
		'x-client-id': 'zomato_web_merchant',
		'x-zomato-app-version': '2',
		'x-zomato-csrft': session.csrfToken,
		'x-zomato-mx-csrf-token': session.mxCsrfToken,
		'x-zomato-source-identifier': 'merchant-dashboard',
		// The dashboard sends a fresh trace id per request; mirror that so
		// requests are not deduplicated server-side.
		'x-zomato-trace-id': `web${crypto.randomUUID()}`
	}
}

/** YYYY-MM-DD, the format the orders endpoint expects. */
function toApiDate(date: Date): string {
	return date.toISOString().slice(0, 10)
}

/**
 * True if the stored session still authenticates.
 *
 * Used to show an accurate "reconnect needed" state rather than reporting an
 * expired session as "no orders today".
 */
export async function checkSession(session: ZomatoSession): Promise<boolean> {
	try {
		const response = await fetch(CHECK_AUTH_URL, {
			headers: {
				accept: 'application/json, text/plain, */*',
				cookie: session.cookies,
				referer: 'https://www.zomato.com/partners/onlineordering/orderHistory/',
				'user-agent': USER_AGENT,
				'x-client-id': 'zomato_web_merchant',
				'x-zomato-app-version': '2',
				'x-zomato-csrft': session.csrfToken
			},
			cache: 'no-store'
		})
		return response.ok
	} catch {
		return false
	}
}

/**
 * Fetches orders for a single window of at most {@link MAX_RANGE_DAYS} days.
 */
async function fetchOrderPage(
	session: ZomatoSession,
	startDate: Date,
	endDate: Date,
	limit: number
): Promise<ZomatoOrder[]> {
	const response = await fetch(ORDERS_URL, {
		method: 'POST',
		headers: buildHeaders(session),
		body: JSON.stringify({
			res_Id: session.resId,
			limit,
			order_type: '',
			created_at: `${toApiDate(startDate)},${toApiDate(endDate)}`,
			postback_params: '',
			state: '',
			rating: '',
			get_filters: false
		}),
		cache: 'no-store'
	})

	if (response.status === 401 || response.status === 403) {
		throw new ZomatoError(
			'Zomato session has expired — reconnect from the browser.',
			'orders',
			true
		)
	}
	if (!response.ok) {
		throw new ZomatoError(`Orders request returned HTTP ${response.status}.`, 'orders')
	}

	const text = await response.text()

	// Akamai serves an HTML challenge instead of JSON when it flags the client.
	if (text.trimStart().startsWith('<')) {
		throw new ZomatoError(
			'Zomato returned an HTML challenge instead of JSON — the session was rejected.',
			'orders',
			true
		)
	}

	let payload: Record<string, unknown>
	try {
		payload = JSON.parse(text) as Record<string, unknown>
	} catch {
		throw new ZomatoError('Could not parse the orders response as JSON.', 'orders')
	}

	const snippets = Array.isArray(payload.snippets) ? payload.snippets : []
	const orders = parseSnippets(snippets, startDate.getUTCFullYear())
	return orders.map((o) => ({ ...o, resId: session.resId }))
}

/**
 * Fetches orders across an arbitrary range, splitting it into windows Zomato
 * will accept.
 */
export async function fetchOrders(
	session: ZomatoSession,
	startDate: Date,
	endDate: Date,
	limit = 50
): Promise<ZomatoOrder[]> {
	if (!session.resId) {
		throw new ZomatoError('No Zomato outlet id (res_Id) stored for this tenant.', 'config')
	}

	const collected = new Map<string, ZomatoOrder>()
	const windowMs = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000

	let cursor = new Date(startDate)
	while (cursor <= endDate) {
		const windowEnd = new Date(Math.min(cursor.getTime() + windowMs - 1, endDate.getTime()))
		const page = await fetchOrderPage(session, cursor, windowEnd, limit)
		// Dedupe: overlapping windows and pagination can repeat an order.
		for (const order of page) collected.set(order.externalId, order)
		cursor = new Date(windowEnd.getTime() + 1)
	}

	return Array.from(collected.values()).sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
}

/* -------------------------------------------------------------------------- */
/* Session capture                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Extracts a session from a "Copy as cURL" command pasted out of DevTools.
 *
 * This is how a session gets into the system: the operator logs into Zomato in
 * their browser, copies any authenticated request, and pastes it in. Parsing
 * the command is friendlier — and less error-prone — than asking someone to
 * pick individual cookies out of the developer tools.
 */
export function parseCurlSession(curl: string): ZomatoSession {
	const cookieMatch = curl.match(/-b\s+'([^']*)'/) || curl.match(/--cookie\s+'([^']*)'/)
	if (!cookieMatch?.[1]) {
		throw new ZomatoError('Could not find a cookie header (-b) in the pasted command.', 'parse')
	}
	const cookies = cookieMatch[1]

	const cookieValue = (name: string): string | null => {
		const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
		return match?.[1]?.trim() ?? null
	}

	const headerValue = (name: string): string | null => {
		const match = curl.match(new RegExp(`-H\\s+'${name}:\\s*([^']*)'`, 'i'))
		return match?.[1]?.trim() ?? null
	}

	const csrfToken = headerValue('x-zomato-csrft') || cookieValue('csrf')
	const mxCsrfToken = headerValue('x-zomato-mx-csrf-token') || cookieValue('__Host-zmxcsrft')

	if (!csrfToken) {
		throw new ZomatoError('Could not find a CSRF token in the pasted command.', 'parse')
	}
	if (!cookieValue('X-Zomato-Mx-Auth-Token')) {
		throw new ZomatoError(
			'The pasted command has no X-Zomato-Mx-Auth-Token cookie — copy a request made while signed in to the merchant dashboard.',
			'parse'
		)
	}

	// res_Id appears in the request body of an orders call; otherwise the JWT's
	// `rrm` claim maps the outlets this session can see.
	let resId = curl.match(/"res_?Id"\s*:\s*"?(\d+)"?/i)?.[1] ?? ''
	if (!resId) resId = resIdFromToken(cookieValue('X-Zomato-Mx-Auth-Token')!) ?? ''

	return {
		cookies,
		csrfToken,
		mxCsrfToken: mxCsrfToken ?? '',
		resId
	}
}

/** Reads the first outlet id out of the JWT's `rrm` claim. */
function resIdFromToken(token: string): string | null {
	try {
		const payload = token.split('.')[1]
		if (!payload) return null
		const json = JSON.parse(
			atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='))
		) as { rrm?: Record<string, unknown> }
		return Object.keys(json.rrm ?? {})[0] ?? null
	} catch {
		return null
	}
}

/**
 * The session's hard expiry, from the JWT's `bExp` claim (~24h after issue).
 * `exp` is deliberately ignored: it is ~5 minutes and not enforced.
 */
export function sessionExpiryFromToken(cookies: string): string | null {
	const match = cookies.match(/(?:^|;\s*)X-Zomato-Mx-Auth-Token=([^;]*)/)
	if (!match?.[1]) return null
	try {
		const payload = match[1].split('.')[1]
		if (!payload) return null
		const json = JSON.parse(
			atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='))
		) as { bExp?: number }
		if (!json.bExp) return null
		return new Date(json.bExp * 1000).toISOString()
	} catch {
		return null
	}
}
