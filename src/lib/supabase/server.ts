import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

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

export async function createSupabaseServerClient() {
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
