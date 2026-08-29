/**
 * Ezetap merchant-portal client (Razorpay POS / DigiPOS).
 *
 * Razorpay POS has no public server-to-server API for pulling a merchant's
 * terminal transactions — the SDK's transaction APIs are device-local, and
 * cloud API access is not self-serve. So we drive the merchant portal at
 * www.ezetap.com/portal the same way a browser does:
 *
 *   1. GET  /portal/login/            -> jsessionid cookie + _csrf token
 *   2. POST /portal/login             -> 302 to /login/landing on success
 *   3. GET  /portal/transactions/     -> a fresh _csrf for the search form
 *   4. POST /portal/transactions/csv  -> the CSV the portal's Download button emits
 *
 * Because this rides the HTML portal rather than a contracted API, it is
 * inherently brittle: a markup change on their side breaks it. Every step
 * therefore fails loudly with a specific error rather than returning empty
 * data, so a broken sync can never be mistaken for "no transactions today".
 */

const PORTAL_ORIGIN = 'https://www.ezetap.com'
const LOGIN_PAGE = `${PORTAL_ORIGIN}/portal/login/`
const LOGIN_POST = `${PORTAL_ORIGIN}/portal/login`
const TXN_PAGE = `${PORTAL_ORIGIN}/portal/transactions/`
const TXN_CSV = `${PORTAL_ORIGIN}/portal/transactions/csv`

// The portal renders timestamps in IST with no offset attached. India has no
// DST, so a fixed offset is correct year-round.
const IST_OFFSET = '+05:30'

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export class EzetapError extends Error {
	/** Which stage of the portal chain failed, for actionable error messages. */
	readonly step: string

	constructor(message: string, step: string) {
		super(message)
		this.name = 'EzetapError'
		this.step = step
	}
}

/** A single terminal transaction, normalised out of the portal CSV. */
export type EzetapTransaction = {
	externalId: string
	txnAt: string // ISO 8601, UTC
	amount: number
	tip: number
	cashAtPos: number
	mode: string | null // UPI | CARD | ...
	txnType: string | null // Charge | Refund | ...
	status: string | null // SETTLED | SETTLEMENT_PENDING | EXPIRED | ...
	cardLast4: string | null
	cardType: string | null
	cardBrand: string | null
	authCode: string | null
	rrn: string | null
	deviceSerial: string | null
	mid: string | null
	tid: string | null
	acquiringBank: string | null
	portalUsername: string | null
	settledOn: string | null
	raw: Record<string, string>
}

/* -------------------------------------------------------------------------- */
/* Cookie jar                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * fetch() has no cookie jar, and the portal's session rides a `jsessionid`
 * cookie across all four requests, so we keep a tiny one here.
 */
class CookieJar {
	private jar = new Map<string, string>()

	absorb(response: Response) {
		// getSetCookie() is the only way to read multiple Set-Cookie headers;
		// headers.get() would collapse them into one comma-joined string.
		const cookies =
			typeof response.headers.getSetCookie === 'function'
				? response.headers.getSetCookie()
				: [response.headers.get('set-cookie')].filter(Boolean as unknown as (v: string | null) => v is string)

		for (const cookie of cookies) {
			const pair = cookie.split(';')[0]
			if (!pair) continue
			const eq = pair.indexOf('=')
			if (eq === -1) continue
			this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
		}
	}

	header(): string {
		return Array.from(this.jar.entries())
			.map(([k, v]) => `${k}=${v}`)
			.join('; ')
	}
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The login form hashes the password client-side before POSTing it:
 *   b64_sha256(password) + "="
 * Their sha256.js emits unpadded base64 and the page appends the single "="
 * pad character, which is exactly standard base64 of a 32-byte digest.
 */
async function hashPassword(password: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
	const bytes = new Uint8Array(digest)
	let binary = ''
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary)
}

function extractCsrf(html: string, step: string): string {
	const match = html.match(/name="_csrf"\s+value="([^"]+)"/)
	if (!match?.[1]) {
		throw new EzetapError('Could not find the _csrf token — the portal markup likely changed.', step)
	}
	return match[1]
}

/** dd-MM-yyyy, the format the portal's search form expects. */
function toPortalDate(date: Date): string {
	const dd = String(date.getUTCDate()).padStart(2, '0')
	const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
	return `${dd}-${mm}-${date.getUTCFullYear()}`
}

/**
 * The CSV prefixes several fields with an apostrophe to stop Excel from
 * mangling long digit strings into scientific notation. Strip it.
 */
function clean(value: string | undefined): string | null {
	if (value == null) return null
	const trimmed = value.trim().replace(/^'/, '').trim()
	return trimmed === '' ? null : trimmed
}

function toNumber(value: string | undefined): number {
	const cleaned = clean(value)
	if (cleaned == null) return 0
	const parsed = Number(cleaned.replace(/,/g, ''))
	return Number.isFinite(parsed) ? parsed : 0
}

/** "2026-08-29 16:16:27" (IST) -> ISO 8601 UTC. */
function toIso(value: string | undefined): string | null {
	const cleaned = clean(value)
	if (!cleaned) return null
	const normalised = cleaned.replace(' ', 'T')
	const date = new Date(`${normalised}${IST_OFFSET}`)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Minimal RFC-4180 CSV reader — fields may be quoted and contain commas,
 * newlines, and doubled quotes. Written out rather than pulled in as a
 * dependency since this is the only CSV the app parses.
 */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = []
	let row: string[] = []
	let field = ''
	let inQuotes = false

	for (let i = 0; i < text.length; i++) {
		const char = text[i]

		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"'
					i++
				} else {
					inQuotes = false
				}
			} else {
				field += char
			}
			continue
		}

		if (char === '"') {
			inQuotes = true
		} else if (char === ',') {
			row.push(field)
			field = ''
		} else if (char === '\n') {
			row.push(field)
			rows.push(row)
			row = []
			field = ''
		} else if (char !== '\r') {
			field += char
		}
	}

	// Trailing field/row with no terminating newline.
	if (field !== '' || row.length > 0) {
		row.push(field)
		rows.push(row)
	}

	return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

/* -------------------------------------------------------------------------- */
/* Portal session                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Logs into the portal and returns a cookie jar carrying the authenticated
 * session, plus a CSRF token valid for the transaction search form.
 */
async function openSession(username: string, password: string) {
	const jar = new CookieJar()

	// 1. Login page — seeds jsessionid and the login form's CSRF token.
	const pageRes = await fetch(LOGIN_PAGE, {
		headers: { 'User-Agent': USER_AGENT },
		cache: 'no-store'
	})
	if (!pageRes.ok) {
		throw new EzetapError(`Login page returned HTTP ${pageRes.status}.`, 'login-page')
	}
	jar.absorb(pageRes)
	const loginCsrf = extractCsrf(await pageRes.text(), 'login-page')

	// 2. Submit credentials. A successful login 302s to /portal/login/landing;
	//    a failed one comes back to the login page instead, so `redirect:
	//    'manual'` lets us tell them apart by the Location header.
	const body = new URLSearchParams({
		username,
		password: await hashPassword(password),
		_csrf: loginCsrf,
		Submit: 'Sign In'
	})

	const loginRes = await fetch(LOGIN_POST, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'User-Agent': USER_AGENT,
			'Content-Type': 'application/x-www-form-urlencoded',
			Cookie: jar.header(),
			Referer: LOGIN_PAGE,
			Origin: PORTAL_ORIGIN
		},
		body,
		cache: 'no-store'
	})
	jar.absorb(loginRes)

	const location = loginRes.headers.get('location') || ''
	if (!location.includes('/portal/login/landing')) {
		throw new EzetapError(
			'Login was rejected — check the portal username and password.',
			'login'
		)
	}

	// 3. Transaction page — the search form carries its own CSRF token, which
	//    is not the same as the login one.
	const txnRes = await fetch(TXN_PAGE, {
		headers: { 'User-Agent': USER_AGENT, Cookie: jar.header() },
		cache: 'no-store'
	})
	if (!txnRes.ok) {
		throw new EzetapError(`Transactions page returned HTTP ${txnRes.status}.`, 'txn-page')
	}
	jar.absorb(txnRes)
	const searchCsrf = extractCsrf(await txnRes.text(), 'txn-page')

	return { jar, searchCsrf }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

export type FetchTransactionsOptions = {
	username: string
	password: string
	startDate: Date
	endDate: Date
	/** Portal-side cap on rows returned. */
	max?: number
}

/**
 * Logs in and returns every terminal transaction in [startDate, endDate].
 *
 * The date range is inclusive on both ends and interpreted in IST by the
 * portal — pass day boundaries, not instants.
 */
export async function fetchTransactions(
	options: FetchTransactionsOptions
): Promise<EzetapTransaction[]> {
	const { username, password, startDate, endDate, max = 5000 } = options

	const { jar, searchCsrf } = await openSession(username, password)

	// 4. The CSV export behind the portal's Download button. Every field the
	//    search form posts must be present, even when blank, or the server-side
	//    binding rejects the request.
	const body = new URLSearchParams({
		startDate: toPortalDate(startDate),
		endDate: toPortalDate(endDate),
		dateFormat: 'dd-MM-yyyy',
		max: String(max),
		refNumber: '',
		username: '',
		authCode: '',
		labelNames: '',
		deviceSerial: '',
		quickQuery: '',
		_csrf: searchCsrf
	})

	const csvRes = await fetch(TXN_CSV, {
		method: 'POST',
		headers: {
			'User-Agent': USER_AGENT,
			'Content-Type': 'application/x-www-form-urlencoded',
			Cookie: jar.header(),
			Referer: TXN_PAGE,
			Origin: PORTAL_ORIGIN
		},
		body,
		cache: 'no-store'
	})

	if (!csvRes.ok) {
		throw new EzetapError(`CSV export returned HTTP ${csvRes.status}.`, 'csv')
	}

	const text = await csvRes.text()

	// A session that silently expired hands back the login page instead of a
	// CSV. Catch that rather than parsing HTML into zero transactions.
	if (text.trimStart().toLowerCase().startsWith('<!doctype') || text.includes('<html')) {
		throw new EzetapError('Expected CSV but received an HTML page — the session was rejected.', 'csv')
	}

	return parseTransactionCsv(text)
}

/** Turns the portal's 51-column CSV into normalised transactions. */
export function parseTransactionCsv(text: string): EzetapTransaction[] {
	const rows = parseCsv(text)
	if (rows.length === 0) return []

	const header = rows[0]!.map((h) => h.trim())
	if (!header.includes('ID')) {
		throw new EzetapError(
			`Unexpected CSV columns — the export format likely changed. Saw: ${header.slice(0, 6).join(', ')}`,
			'csv-parse'
		)
	}

	const transactions: EzetapTransaction[] = []

	for (const row of rows.slice(1)) {
		const raw: Record<string, string> = {}
		header.forEach((key, i) => {
			const value = (row[i] ?? '').trim()
			if (value !== '') raw[key] = value
		})

		const externalId = clean(raw['ID'])
		const txnAt = toIso(raw['Date'])
		// Without an ID we cannot dedupe, and without a timestamp we cannot
		// match to an order — such a row is unusable, so skip it.
		if (!externalId || !txnAt) continue

		transactions.push({
			externalId,
			txnAt,
			amount: toNumber(raw['Amount']),
			tip: toNumber(raw['Tip']),
			cashAtPos: toNumber(raw['Cash at POS']),
			mode: clean(raw['Mode']),
			txnType: clean(raw['Txn Type']),
			status: clean(raw['Status']),
			cardLast4: clean(raw['Card']),
			cardType: clean(raw['Card Type']),
			cardBrand: clean(raw['Brand Type']),
			authCode: clean(raw['Auth Code']),
			rrn: clean(raw['RRN']),
			deviceSerial: clean(raw['Device Serial']),
			mid: clean(raw['MID']),
			tid: clean(raw['TID']),
			acquiringBank: clean(raw['Acquiring Bank']),
			portalUsername: clean(raw['Username']),
			settledOn: toIso(raw['Settled On']),
			raw
		})
	}

	return transactions
}
