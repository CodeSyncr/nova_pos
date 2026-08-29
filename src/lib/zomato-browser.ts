/**
 * Zomato partner login driven through a real browser (Playwright).
 *
 * WHY A BROWSER AND NOT fetch():
 * Zomato sits behind Akamai Bot Manager. A plain HTTP client cannot log in —
 * the OTP send succeeds but the verify is rejected with a generic
 * "Something went wrong", because the `_abck` cookie needs sensor telemetry
 * only a real browser produces.
 *
 * WHY THIS EXACT LAUNCH CONFIG:
 * Akamai blocks Chromium at the HTTP/2 handshake — `ERR_HTTP2_PROTOCOL_ERROR`
 * before any page loads. Three things together get past it, and all three are
 * load-bearing (measured: 3/3 runs pass with them, 0/3 without):
 *
 *   channel: 'chromium'  — the FULL browser binary. Playwright's default for
 *                          headless is `chromium-headless-shell`, a stripped
 *                          build with its own fingerprint, which is blocked.
 *   --disable-http2      — falls back to HTTP/1.1, sidestepping the h2
 *                          fingerprint Akamai matches on. This is the single
 *                          most important flag.
 *   userAgent override   — headless Chrome otherwise advertises
 *                          "HeadlessChrome" in its UA.
 *
 * With those, ordinary `headless: true` works and no virtual display (Xvfb) is
 * needed. Removing any one of them brings the HTTP/2 error back.
 *
 * The OTP still comes to the operator's phone, so this cannot run unattended —
 * it makes reconnecting a form in the app instead of a DevTools copy-paste.
 */

import type { Browser, BrowserContext, Frame, Page } from 'playwright-core'
import type { ZomatoSession } from '@/lib/zomato'
import { ZomatoError } from '@/lib/zomato'

const LOGIN_URL = 'https://www.zomato.com/partners/login'

/** How long a half-finished login (OTP sent, not yet verified) is kept alive. */
const LOGIN_TTL_MS = 5 * 60 * 1000

/**
 * A login in progress.
 *
 * The browser has to stay open between "send OTP" and "verify OTP" because the
 * OTP is bound to the page's own session, so the two server actions share this
 * process-local registry.
 *
 * CAVEAT: process-local. With more than one app replica the verify must land on
 * the same instance as the send. Fine for the single-container deployment this
 * app ships as; a multi-replica setup needs sticky sessions or a dedicated
 * login worker.
 */
type PendingLogin = {
	browser: Browser
	context: BrowserContext
	page: Page
	phone: string
	createdAt: number
	timer: NodeJS.Timeout
}

const pendingLogins = new Map<string, PendingLogin>()

async function discard(tenantId: string) {
	const pending = pendingLogins.get(tenantId)
	if (!pending) return
	pendingLogins.delete(tenantId)
	clearTimeout(pending.timer)
	try {
		await pending.browser.close()
	} catch {
		// Already gone; nothing to clean up.
	}
}

/**
 * The UA the context reports. Must not say "HeadlessChrome" — see the module
 * comment. Kept in step with the Chromium major version Playwright ships.
 */
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'

/**
 * Launches a headless browser Akamai will talk to.
 *
 * Every flag here is load-bearing — see the module comment before changing any
 * of them.
 */
async function launchBrowser(): Promise<Browser> {
	// Imported lazily so the (large) Playwright module is only pulled in when a
	// login is actually attempted, not on every server start.
	const { chromium } = await import('playwright-core')

	try {
		return await chromium.launch({
			headless: true,
			// The full Chromium build, NOT chromium-headless-shell.
			channel: 'chromium',
			args: [
				'--no-sandbox',
				'--disable-dev-shm-usage',
				// Forces HTTP/1.1; without this Akamai kills the connection.
				'--disable-http2',
				'--disable-quic',
				'--disable-blink-features=AutomationControlled'
			]
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (/Executable doesn't exist|Failed to launch|channel/i.test(message)) {
			throw new ZomatoError(
				'Browser login is unavailable on this server (Chromium is not installed — run ' +
					'`npx playwright install chromium`). Use the browser session paste instead.',
				'launch'
			)
		}
		throw error
	}
}

/**
 * Opens the login modal and returns the frame the form lives in.
 *
 * The partner page hosts the real form in an iframe served from
 * accounts.zomato.com (the same /zoauth/login URL as the OAuth flow), so
 * page-level selectors find nothing — the top-level document has only a decoy
 * `placeholder="Phone number"` input that stays hidden. The form inside the
 * frame uses `placeholder="Phone"`.
 */
async function openLoginFrame(page: Page): Promise<Frame> {
	// `force` because the button sits under an overlay until hydration settles.
	const loginTab = page.getByRole('button', { name: /^login$/i }).first()
	if (await loginTab.isVisible().catch(() => false)) {
		await loginTab.click({ force: true }).catch(() => undefined)
	}

	const deadline = Date.now() + 20_000
	while (Date.now() < deadline) {
		const frame = page.frames().find((f) => f.url().includes('/zoauth/login'))
		if (frame) {
			// The frame can exist before the form is rendered in it.
			const input = frame.locator('input[placeholder="Phone"]').first()
			if (await input.isVisible().catch(() => false)) return frame
		}
		await page.waitForTimeout(500)
	}

	throw new ZomatoError(
		'The Zomato login form did not open — the page layout may have changed.',
		'login-form'
	)
}

/**
 * Opens the login page, enters `phone`, and asks Zomato to send an OTP.
 *
 * The browser stays open, keyed by tenant, for {@link completeBrowserLogin}.
 */
export async function startBrowserLogin(tenantId: string, phone: string): Promise<void> {
	const digits = phone.replace(/\D/g, '').slice(-10)
	if (digits.length !== 10) {
		throw new ZomatoError('Enter a 10-digit mobile number.', 'phone')
	}

	// A previous half-finished attempt would hold a stale challenge.
	await discard(tenantId)

	const browser = await launchBrowser()
	let context: BrowserContext | undefined

	try {
		context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			locale: 'en-IN',
			timezoneId: 'Asia/Kolkata',
			userAgent: USER_AGENT
		})
		const page = await context.newPage()

		await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
		// Let Akamai's sensor script run before interacting.
		await page.waitForTimeout(4000)

		const frame = await openLoginFrame(page)

		const input = frame.locator('input[placeholder="Phone"]').first()
		// Typing with a delay produces the keystroke timing the sensor looks for.
		await input.click()
		await input.type(digits, { delay: 90 })

		const sendButton = frame
			.getByRole('button', { name: /send one time password|send otp/i })
			.first()
		await sendButton.waitFor({ state: 'visible', timeout: 10_000 })

		// Read Zomato's own answer rather than guessing from the rendered page.
		const result = await captureLoginResponse(page, async () => {
			await sendButton.click()
		})

		assertOtpSent(result, await readVisibleError(frame))

		// Let the OTP field render before handing control back.
		await page.waitForTimeout(1500)

		const timer = setTimeout(() => {
			void discard(tenantId)
		}, LOGIN_TTL_MS)
		// Do not keep the process alive just for an abandoned login.
		if (typeof timer.unref === 'function') timer.unref()

		pendingLogins.set(tenantId, {
			browser,
			context,
			page,
			phone: digits,
			createdAt: Date.now(),
			timer
		})
	} catch (error) {
		try {
			await browser.close()
		} catch {
			// Ignore; the launch failure is the interesting error.
		}
		if (error instanceof ZomatoError) throw error
		const message = error instanceof Error ? error.message : String(error)
		throw new ZomatoError(`Could not start the Zomato login: ${message}`, 'send-otp')
	}
}

/**
 * The JSON Zomato's login endpoint returns. Reading this is far more reliable
 * than scraping the rendered error text, and it distinguishes cases the UI
 * collapses into one generic message — notably "OTP attempts exhausted", which
 * otherwise looks identical to a wrong code.
 */
type LoginPhoneResponse = {
	status?: boolean
	message?: string
	message_uuid?: string
	redirect_to?: string
	are_message_attempts_left?: boolean
	are_call_attempts_left?: boolean
}

/**
 * Waits for the POST to /login/phone that the given action triggers, and
 * returns its parsed body.
 *
 * Returns null if no such response arrives — the caller then falls back to
 * reading the page, since a missing response is itself ambiguous (blocked
 * request, or a UI that never fired one).
 */
async function captureLoginResponse(
	page: Page,
	action: () => Promise<void>,
	timeoutMs = 30_000
): Promise<LoginPhoneResponse | null> {
	const waiter = page
		.waitForResponse(
			(r) => r.url().includes('/login/phone') && r.request().method() === 'POST',
			{ timeout: timeoutMs }
		)
		.catch(() => null)

	await action()

	const response = await waiter
	if (!response) return null

	try {
		return (await response.json()) as LoginPhoneResponse
	} catch {
		return null
	}
}

/**
 * Decides whether the OTP actually went out, and throws a specific error when
 * it did not.
 *
 * `status: true` alone is not enough: Zomato reports exhausted quotas in
 * separate `are_*_attempts_left` flags while still returning status true, so
 * a naive check would tell the user an OTP is coming that never arrives.
 */
function assertOtpSent(result: LoginPhoneResponse | null, visibleError: string | null): void {
	if (!result) {
		// No JSON — fall back to whatever the page says, then to a generic error.
		throw new ZomatoError(
			visibleError
				? `Zomato did not send the OTP: ${visibleError}`
				: 'Zomato did not respond to the OTP request. Try again in a moment.',
			'send-otp'
		)
	}

	if (result.are_message_attempts_left === false) {
		throw new ZomatoError(
			result.are_call_attempts_left
				? 'You have used all your SMS OTP attempts for now. Wait a while before trying again.'
				: 'You have used all your OTP attempts for now. Wait a while before trying again.',
			'otp-exhausted'
		)
	}

	if (result.status !== true) {
		const detail = result.message || visibleError
		throw new ZomatoError(
			detail
				? `Zomato refused to send the OTP: ${detail}`
				: 'Zomato refused to send the OTP. Check the mobile number is the one registered on the partner account.',
			'send-otp'
		)
	}
}

/**
 * Classifies the verify response.
 *
 * The distinction that matters: a wrong code is worth retrying, whereas a
 * bot-protection block is not — leaving someone to retype a correct OTP over
 * and over is the worst outcome, so blocks are flagged `needsReconnect` and the
 * UI steers to the browser-session paste.
 *
 * How they are told apart: Zomato names a specific reason when it has one
 * ("Please enter a valid phone number.", "Invalid OTP"), and falls back to the
 * generic "Something went wrong" when the request was blocked.
 *
 * Note `redirect_to` is NOT a success signal — it is returned with a
 * login_verifier even on a plain validation failure, so it is ignored here.
 */
function assertOtpAccepted(result: LoginPhoneResponse | null, visibleError: string | null): void {
	// No JSON: let the cookie check downstream decide rather than guessing.
	if (!result) return

	if (result.status === true) return

	const detail = (result.message || visibleError || '').trim()

	if (/attempts|exhaust|too many|limit/i.test(detail)) {
		throw new ZomatoError(
			`Too many OTP attempts — wait a while before trying again. (${detail})`,
			'otp-exhausted'
		)
	}

	// A generic message means Zomato would not say why: treat as a block.
	const isGeneric = !detail || /something went wrong|try again later/i.test(detail)
	if (isGeneric) {
		throw new ZomatoError(
			'Zomato rejected the login without giving a reason, which usually means it was ' +
				'blocked rather than a wrong OTP — use the browser session paste instead.',
			'verify-otp',
			true
		)
	}

	// Anything specific is a real, actionable problem the user can fix.
	throw new ZomatoError(`Zomato did not accept the login: ${detail}`, 'verify-otp')
}

/** Reads any error banner Zomato rendered — the fallback when no JSON arrives. */
async function readVisibleError(scope: Page | Frame): Promise<string | null> {
	const text = await scope
		.locator('text=/invalid|incorrect|expired|try again|something went wrong|too many|attempts/i')
		.first()
		.innerText()
		.catch(() => '')
	const trimmed = (text || '').trim()
	return trimmed ? trimmed.slice(0, 200) : null
}

/**
 * Enters the OTP and, on success, returns the resulting merchant session.
 *
 * The browser is closed either way — the session lives in the cookies we take
 * from it, so there is nothing to keep open.
 */
export async function completeBrowserLogin(
	tenantId: string,
	otp: string
): Promise<ZomatoSession> {
	const pending = pendingLogins.get(tenantId)
	if (!pending) {
		throw new ZomatoError('No login in progress — request a new OTP.', 'otp')
	}
	if (Date.now() - pending.createdAt > LOGIN_TTL_MS) {
		await discard(tenantId)
		throw new ZomatoError('That OTP request has expired — request a new one.', 'otp')
	}

	const code = otp.replace(/\D/g, '')
	if (code.length < 4) {
		throw new ZomatoError('Enter the OTP you received.', 'otp')
	}

	const { page, context } = pending

	try {
		// The OTP field is in the same accounts.zomato.com frame as the phone
		// field; fall back to the page if the frame has already navigated away.
		const frame = page.frames().find((f) => f.url().includes('/zoauth/login')) ?? page

		// Capture the verify response so a wrong code, an exhausted quota and a
		// bot-protection block can be told apart.
		const result = await captureLoginResponse(page, async () => {
			await fillOtp(frame, code)
		})

		assertOtpAccepted(result, await readVisibleError(frame))

		// A successful login leaves the partner login screen for the dashboard.
		await page
			.waitForURL((url) => !url.pathname.includes('/partners/login'), { timeout: 45_000 })
			.catch(() => undefined)
		await page.waitForTimeout(3000)

		const cookies = await context.cookies()
		const byName = (name: string) => cookies.find((c) => c.name === name)?.value ?? null

		const authToken = byName('X-Zomato-Mx-Auth-Token')
		if (!authToken) {
			const failure = await readVisibleError(frame)
			throw new ZomatoError(
				failure
					? `Zomato rejected the login: ${failure}`
					: 'Login did not complete — Zomato issued no merchant token. ' +
						'Use the browser session paste instead.',
				'verify-otp',
				true
			)
		}

		const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

		return {
			cookies: cookieHeader,
			csrfToken: byName('csrf') ?? '',
			mxCsrfToken: byName('__Host-zmxcsrft') ?? '',
			resId: resIdFromToken(authToken) ?? ''
		}
	} finally {
		await discard(tenantId)
	}
}

/**
 * Types the OTP.
 *
 * Zomato may render one field or a box per digit, so handle both rather than
 * assuming a layout that can change.
 */
async function fillOtp(scope: Page | Frame, code: string) {
	const boxes = scope.locator('input[maxlength="1"]')
	const boxCount = await boxes.count().catch(() => 0)

	if (boxCount >= code.length) {
		for (let i = 0; i < code.length; i++) {
			await boxes.nth(i).fill(code[i]!)
			await scope.waitForTimeout?.(90)
		}
	} else {
		const single = scope
			.locator('input[type="number"], input[type="tel"], input[type="text"]')
			.last()
		await single.waitFor({ state: 'visible', timeout: 10_000 })
		await single.click()
		await single.type(code, { delay: 110 })
	}

	// Some layouts submit on the last digit; click a submit control if present.
	const submit = scope.getByRole('button', { name: /verify|continue|submit|login/i }).first()
	if (await submit.isVisible().catch(() => false)) {
		await submit.click().catch(() => undefined)
	}
}

/** Reads the first outlet id from the merchant JWT's `rrm` claim. */
function resIdFromToken(token: string): string | null {
	try {
		const claims = token.split('.')[1]
		if (!claims) return null
		const json = JSON.parse(
			Buffer.from(claims.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
		) as { rrm?: Record<string, unknown> }
		return Object.keys(json.rrm ?? {})[0] ?? null
	} catch {
		return null
	}
}

/** True when a login is mid-flight for this tenant. */
export function hasPendingBrowserLogin(tenantId: string): boolean {
	return pendingLogins.has(tenantId)
}
