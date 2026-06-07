import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

function assertSupabaseEnv(variable: string | undefined, key: string) {
	if (!variable) {
		throw new Error(`Missing environment variable: ${key}`)
	}
}

assertSupabaseEnv(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL')
assertSupabaseEnv(supabaseAnonKey, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')

export function createSupabaseBrowserClient() {
	return createBrowserClient(supabaseUrl as string, supabaseAnonKey as string)
}
