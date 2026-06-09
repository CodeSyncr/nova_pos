import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
	const host = request.headers.get('host') || ''
	const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
	const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`

	const { searchParams } = new URL(request.url)
	const code = searchParams.get('code')
	// if "next" is in param, use it as the redirect path, else default to /dashboard
	const next = searchParams.get('next') ?? '/dashboard'

	if (code) {
		try {
			const supabase = await createSupabaseServerClient()
			const { error } = await supabase.auth.exchangeCodeForSession(code)
			if (!error) {
				return NextResponse.redirect(`${baseUrl}${next}`)
			}
		} catch (err) {
			console.error('Error in auth callback:', err)
		}
	}

	// return the user to login page with error
	return NextResponse.redirect(`${baseUrl}/login?error=Could not authenticate user with Google`)
}
