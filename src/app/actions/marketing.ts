'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

// ────────────────────────────────────────────────────────────────────────────
// MARKETING CONFIG: Facebook, Instagram, Review Links
// ────────────────────────────────────────────────────────────────────────────

export type MarketingConfig = {
	facebookPageUrl: string
	facebookPageName: string
	instagramHandle: string
	instagramProfileUrl: string
	googleReviewUrl: string
	zomatoReviewUrl: string
	swiggyUrl: string
	upiId: string
}

export async function saveMarketingConfig(tenantId: string, config: MarketingConfig): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {}

	const { error } = await supabase
		.from('tenants')
		.update({ settings: { ...currentSettings, marketing_config: config } })
		.eq('id', tenantId)

	if (error) throw new Error(error.message)
}

export async function loadMarketingConfig(tenantId: string): Promise<MarketingConfig | null> {
	const supabase = await createSupabaseServerClient()

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	if (!tenant?.settings) return null
	const settings = tenant.settings as Record<string, unknown>
	return (settings.marketing_config as MarketingConfig) ?? null
}

// ────────────────────────────────────────────────────────────────────────────
// META CONNECTION: FB Pages, IG Business Accounts, Tokens (via FB Login SDK)
// ────────────────────────────────────────────────────────────────────────────

export type MetaPage = {
	id: string
	name: string
	accessToken: string
	category: string
	instagramBusinessAccount: {
		id: string
		username: string
		profilePictureUrl: string
	} | null
}

export type MetaConnection = {
	connected: boolean
	connectedAt: string
	userId: string
	userName: string
	userToken: string
	pages: MetaPage[]
	selectedPageId: string | null
	selectedPageName: string | null
	selectedPageToken: string | null
	instagramAccount: MetaPage['instagramBusinessAccount']
}

export async function saveMetaConnection(tenantId: string, connection: MetaConnection): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {}

	const { error } = await supabase
		.from('tenants')
		.update({ settings: { ...currentSettings, meta_connection: connection } })
		.eq('id', tenantId)

	if (error) throw new Error(error.message)
}

export async function loadMetaConnection(tenantId: string): Promise<MetaConnection | null> {
	const supabase = await createSupabaseServerClient()

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	if (!tenant?.settings) return null
	const settings = tenant.settings as Record<string, unknown>
	return (settings.meta_connection as MetaConnection) ?? null
}

export async function disconnectMeta(tenantId: string): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {}
	delete currentSettings.meta_connection

	const { error } = await supabase
		.from('tenants')
		.update({ settings: currentSettings })
		.eq('id', tenantId)

	if (error) throw new Error(error.message)
}

// ────────────────────────────────────────────────────────────────────────────
// GOOGLE MY BUSINESS CONNECTION: OAuth & Business Profile Sync
// ────────────────────────────────────────────────────────────────────────────

export type GmbConnection = {
	connected: boolean
	connectedAt: string
	accountName: string
	locationName: string
	placeId: string
	rating?: number
	reviewCount?: number
	userEmail?: string
}

export async function saveGmbConnection(tenantId: string, connection: GmbConnection): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {}

	const { error } = await supabase
		.from('tenants')
		.update({ settings: { ...currentSettings, gmb_connection: connection } })
		.eq('id', tenantId)

	if (error) throw new Error(error.message)
}

export async function loadGmbConnection(tenantId: string): Promise<GmbConnection | null> {
	const supabase = await createSupabaseServerClient()

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	if (!tenant?.settings) return null
	const settings = tenant.settings as Record<string, unknown>
	return (settings.gmb_connection as GmbConnection) ?? null
}

export async function disconnectGmb(tenantId: string): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {}
	delete currentSettings.gmb_connection

	const { error } = await supabase
		.from('tenants')
		.update({ settings: currentSettings })
		.eq('id', tenantId)

	if (error) throw new Error(error.message)
}

export type GmbPost = {
	id: string
	summary: string
	topicType: 'STANDARD' | 'OFFER' | 'EVENT'
	callToActionType?: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'CALL'
	actionUrl?: string
	imageUrl?: string
	createdAt: string
}

export async function saveGmbPost(tenantId: string, post: GmbPost): Promise<GmbPost[]> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {}
	const existingPosts = (currentSettings.gmb_posts as GmbPost[]) || []
	const updatedPosts = [post, ...existingPosts]

	const { error } = await supabase
		.from('tenants')
		.update({ settings: { ...currentSettings, gmb_posts: updatedPosts } })
		.eq('id', tenantId)

	if (error) throw new Error(error.message)
	return updatedPosts
}

export async function loadGmbPosts(tenantId: string): Promise<GmbPost[]> {
	const supabase = await createSupabaseServerClient()

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	if (!tenant?.settings) return []
	const settings = tenant.settings as Record<string, unknown>
	return (settings.gmb_posts as GmbPost[]) ?? []
}

// ────────────────────────────────────────────────────────────────────────────
// MARKETING ANALYTICS: Order channel breakdown
// ────────────────────────────────────────────────────────────────────────────

export type ChannelStats = {
	orderType: string
	count: number
	revenue: number
}

export type MarketingAnalytics = {
	channelBreakdown: ChannelStats[]
	totalOrders: number
	totalRevenue: number
	topChannel: string
	period: string
}

export async function getMarketingAnalytics(tenantId: string): Promise<MarketingAnalytics> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	// Get orders from the last 30 days
	const thirtyDaysAgo = new Date()
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

	const { data: orders } = await supabase
		.from('orders')
		.select('order_type, total, status')
		.eq('tenant_id', tenantId)
		.gte('created_at', thirtyDaysAgo.toISOString())
		.in('status', ['completed', 'ready', 'preparing', 'confirmed'])

	const channelMap: Record<string, { count: number; revenue: number }> = {}

	for (const order of orders || []) {
		const type = order.order_type || 'dine_in'
		if (!channelMap[type]) channelMap[type] = { count: 0, revenue: 0 }
		channelMap[type].count++
		channelMap[type].revenue += (order.total || 0)
	}

	const channelBreakdown: ChannelStats[] = Object.entries(channelMap).map(([orderType, stats]) => ({
		orderType,
		count: stats.count,
		revenue: stats.revenue
	})).sort((a, b) => b.revenue - a.revenue)

	const totalOrders = channelBreakdown.reduce((sum, c) => sum + c.count, 0)
	const totalRevenue = channelBreakdown.reduce((sum, c) => sum + c.revenue, 0)
	const topChannel = channelBreakdown[0]?.orderType || 'dine_in'

	return {
		channelBreakdown,
		totalOrders,
		totalRevenue,
		topChannel,
		period: 'Last 30 Days'
	}
}

