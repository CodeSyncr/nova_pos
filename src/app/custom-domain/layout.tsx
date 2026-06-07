import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export type TenantDomainData = {
	id: string
	name: string
	slug: string | null
	logo_url: string | null
	branding: Record<string, unknown> | null
	landing_page: Record<string, unknown> | null
	custom_domain: string | null
}

async function getTenantFromHeaders(): Promise<TenantDomainData | null> {
	const headersList = await headers()
	const tenantId = headersList.get('x-tenant-id')

	if (!tenantId) return null

	const supabase = createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
	)

	const { data } = await supabase
		.from('tenants')
		.select('id, name, slug, logo_url, branding, landing_page, custom_domain')
		.eq('id', tenantId)
		.maybeSingle()

	return data as TenantDomainData | null
}

export default async function CustomDomainLayout({
	children
}: {
	children: ReactNode
}) {
	const tenant = await getTenantFromHeaders()

	if (!tenant) {
		notFound()
	}

	return <>{children}</>
}
