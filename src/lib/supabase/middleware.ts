import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function getSupabaseProjectRef(): string {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL
	if (!url) return ''
	try {
		return new URL(url).hostname.split('.')[0] ?? ''
	} catch {
		return ''
	}
}

/** Remove auth cookies from other Supabase projects (e.g. after switching .env). */
function pruneStaleSupabaseCookies(
	request: NextRequest,
	response: NextResponse,
	projectRef: string
) {
	if (!projectRef) return

	const prefix = `sb-${projectRef}-`
	for (const { name } of request.cookies.getAll()) {
		if (name.startsWith('sb-') && !name.startsWith(prefix)) {
			response.cookies.delete(name)
		}
	}
}

export async function updateSession(request: NextRequest) {
	let response = NextResponse.next({ request })
	const projectRef = getSupabaseProjectRef()

	pruneStaleSupabaseCookies(request, response, projectRef)

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll()
				},
				setAll(cookiesToSet) {
					cookiesToSet.forEach(({ name, value }) =>
						request.cookies.set(name, value)
					)
					response = NextResponse.next({ request })
					pruneStaleSupabaseCookies(request, response, projectRef)
					cookiesToSet.forEach(({ name, value, options }) =>
						response.cookies.set(name, value, options)
					)
				}
			}
		}
	)

	await supabase.auth.getUser()

	return response
}
