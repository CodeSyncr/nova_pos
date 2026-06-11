import { cookies, headers } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

function assertSupabaseEnv(variable: string | undefined, key: string) {
	if (!variable) {
		throw new Error(`Missing environment variable: ${key}`)
	}
}

assertSupabaseEnv(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL')
assertSupabaseEnv(supabaseAnonKey, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')

type CookieStore = Awaited<ReturnType<typeof cookies>>

/**
 * Server-side Supabase client.
 *
 * Web requests use the existing `@supabase/ssr` cookie-based session.
 *
 * When the inbound request carries an `Authorization: Bearer <jwt>` header
 * (e.g. the iOS app calling our API routes), we instead build a plain
 * `@supabase/supabase-js` client and inject that bearer token into every
 * outbound HTTP call. RLS policies still scope reads/writes to the user's
 * tenant; we just use the JWT instead of the cookie session for identity.
 *
 * `auth.getUser()` works in both modes because @supabase/supabase-js relays
 * the Authorization header through to GoTrue.
 */
export async function createSupabaseServerClient() {
	// Prefer a Bearer token if the inbound request carries one. Lets the
	// iOS app reuse any existing server action / API route without
	// needing to share cookies.
	try {
		const hdrs = await Promise.resolve(headers())
		const auth = hdrs.get('authorization') || hdrs.get('Authorization')
		if (auth && auth.toLowerCase().startsWith('bearer ')) {
			const token = auth.slice(7).trim()
			if (token) {
				return createClient(supabaseUrl as string, supabaseAnonKey as string, {
					auth: {
						autoRefreshToken: false,
						persistSession: false,
						detectSessionInUrl: false
					},
					global: {
						headers: { Authorization: `Bearer ${token}` }
					}
				})
			}
		}
	} catch {
		// `headers()` isn't available outside a request scope (e.g. during
		// build). Fall through to the cookie-based client.
	}

	const cookieStore = (await Promise.resolve(cookies())) as CookieStore

	return createServerClient(supabaseUrl as string, supabaseAnonKey as string, {
		cookies: {
			get(name: string) {
				return cookieStore.get(name)?.value
			},
			set(name: string, value: string, options?: CookieOptions) {
				cookieStore.set({
					name,
					value,
					...options
				})
			},
			remove(name: string, options?: CookieOptions) {
				cookieStore.set({
					name,
					value: '',
					maxAge: 0,
					...options
				})
			}
		}
	})
}

export async function createSupabaseServerComponentClient() {
	const cookieStore = (await Promise.resolve(cookies())) as CookieStore

	return createServerClient(supabaseUrl as string, supabaseAnonKey as string, {
		cookies: {
			get(name: string) {
				return cookieStore.get(name)?.value
			},
			set() {
				// Server Components cannot modify cookies
			},
			remove() {
				// Server Components cannot modify cookies
			}
		}
	})
}
