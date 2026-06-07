import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

// Cache-Control: resolved domains are cached for 60 seconds at CDN level
const CACHE_SECONDS = 60

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url)
	const domain = searchParams.get('domain')

	if (!domain) {
		return NextResponse.json({ error: 'domain param required' }, { status: 400 })
	}

	// Strip "pos." prefix if present — we look up the root custom domain
	const rootDomain = domain.startsWith('pos.') ? domain.slice(4) : domain

	const supabase = createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
	)

	const { data, error } = await supabase
		.from('tenants')
		.select('id, name, slug, logo_url, branding, landing_page, is_active')
		.eq('custom_domain', rootDomain)
		.maybeSingle()

	if (error || !data) {
		return NextResponse.json(
			{ error: 'Domain not found' },
			{
				status: 404,
				headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` }
			}
		)
	}

	if (!data.is_active) {
		return NextResponse.json(
			{ error: 'Tenant not active' },
			{ status: 403 }
		)
	}

	return NextResponse.json(
		{
			tenantId: data.id,
			tenantName: data.name,
			slug: data.slug,
			logoUrl: data.logo_url,
			branding: data.branding,
			landingPage: data.landing_page,
			isPosSubdomain: domain.startsWith('pos.')
		},
		{
			headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` }
		}
	)
}
