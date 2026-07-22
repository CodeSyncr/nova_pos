'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Layers, ChefHat, Utensils, Sparkles, FileText, Brain, RefreshCw, Zap, Star, TrendingUp, Coins } from 'lucide-react'
import { MenuTabs } from '@/components/menu/menu-tabs'
import { CategoriesTab } from '@/components/menu/categories-tab'
import { MenuItemsTab } from '@/components/menu/menu-items-tab'
import { IngredientsTab } from '@/components/menu/ingredients-tab'
import { ToppingsTab } from '@/components/menu/toppings-tab'
import { SOPTab } from '@/components/menu/sop-tab'
import { Button } from '@/components/ui/button'
import { getAIMenuEngineering, loadMenuAICache, saveMenuAICache, type AIMenuEngineeringReport } from '@/app/actions/menu'

type TenantRecord = {
	id: string
	name: string
	branding: Record<string, unknown> | null
	settings: Record<string, unknown> | null
}

type MenuCategory = {
	id: string
	name: string
	description: string | null
	position: number
	menu_items: MenuItem[]
}

type MenuItem = {
	id: string
	name: string
	description: string | null
	base_price: number
	discount_price: number | null
	image_url: string | null
	is_active: boolean
	is_vegan?: boolean
	category_id: string
	prep_time_minutes: number | null
	allergen_info: string | null
	nutrition: {
		calories: number
		protein: number
		fat: number
		carbs: number
	} | null
	menu_item_variants: Array<{
		id: string
		name: string
		price_modifier: number
	}>
	menu_item_toppings: Array<{ topping_id: string }>
	menu_item_ingredients: Array<{ ingredient_id: string }>
}

type Topping = {
	id: string
	name: string
	price: number
	description: string | null
	category: string | null // stores comma-separated category ids
	image_url: string | null
}

type Ingredient = {
	id: string
	name: string
	unit: string | null
	allergen_info: string | null
}

type SOPStep = {
	title: string
	body: string | null
	step_order: number
	media?: unknown
}

type SOP = {
	id: string
	menu_item_id: string
	steps: SOPStep[]
	menu_item: { id: string; name: string } | null
}

const tabs = [
	{ id: 'categories', label: 'Categories', icon: Layers },
	{ id: 'items', label: 'Menu Items', icon: ChefHat },
	{ id: 'ingredients', label: 'Ingredients', icon: Utensils },
	{ id: 'toppings', label: 'Add Ons', icon: Sparkles },
	{ id: 'sop', label: 'SOP', icon: FileText }
]

export default function MenuPage() {
	const router = useRouter()
	const [tenant, setTenant] = useState<TenantRecord | null>(null)
	const [categories, setCategories] = useState<MenuCategory[]>([])
	const [menuItems, setMenuItems] = useState<MenuItem[]>([])
	const [toppings, setToppings] = useState<Topping[]>([])
	const [ingredients, setIngredients] = useState<Ingredient[]>([])
	const [sops, setSops] = useState<SOP[]>([])
	const [loading, setLoading] = useState(true)
	const [activeTab, setActiveTab] = useState('categories')
	const [readOnly, setReadOnly] = useState(false)

	// AI Menu Engineering State
	const [aiMenuReport, setAiMenuReport] = useState<AIMenuEngineeringReport | null>(null)
	const [aiMenuLoading, setAiMenuLoading] = useState(false)

	useEffect(() => {
		loadData()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const loadData = async () => {
		const supabase = createSupabaseBrowserClient()
		const {
			data: { user }
		} = await supabase.auth.getUser()

		if (!user) {
			router.push('/login')
			return
		}

		const { data: tenantRow } = await supabase
			.from('profile_tenants')
			.select(
				`
        tenant_id,
        tenant:tenant_id (
          id,
          name,
          branding,
          settings
        )
      `
			)
			.eq('profile_id', user.id)
			.single()

		const tenantRaw = tenantRow?.tenant
		const tenantData: TenantRecord | null =
			Array.isArray(tenantRaw) && tenantRaw.length > 0
				? (tenantRaw[0] as unknown as TenantRecord)
				: tenantRaw
					? (tenantRaw as unknown as TenantRecord)
					: null
		if (!tenantData) {
			router.push('/tenant')
			return
		}

		setTenant(tenantData)

		// Load cached AI Menu audit report
		loadMenuAICache(tenantData.id).then((cached) => {
			if (cached) setAiMenuReport(cached)
		}).catch(() => {})

		// Check user's menu permissions — only restrict if user has a role with limited perms
		const { data: ptRole } = await supabase
			.from('profile_tenants')
			.select('role_id')
			.eq('profile_id', user.id)
			.eq('tenant_id', tenantData.id)
			.single()

		console.log('[Menu] User role check:', { userId: user.id, roleId: ptRole?.role_id })

		if (ptRole && ptRole.role_id) {
			const { data: roleData } = await supabase
				.from('roles')
				.select('permissions')
				.eq('id', ptRole.role_id)
				.single()

			console.log('[Menu] Role permissions:', roleData?.permissions)

			if (roleData?.permissions) {
				const perms = roleData.permissions
				// If permissions is ["*"] or includes "*" — full access (owner role)
				if (Array.isArray(perms)) {
					if (!perms.includes('*') && !perms.includes('all')) {
						setReadOnly(true)
					}
				} else if (typeof perms === 'object' && perms !== null) {
					const menuPerms = (perms as Record<string, string[]>).menu || []
					if (menuPerms.length === 0) {
						setReadOnly(true)
					} else {
						const canEdit = menuPerms.includes('all') || menuPerms.includes('*') || menuPerms.includes('write') || menuPerms.includes('delete')
						setReadOnly(!canEdit)
					}
				}
			}
		}
		// If no role_id (owner) → readOnly stays false (full access)
		console.log('[Menu] Final readOnly:', readOnly)

		// Load categories
		const { data: categoriesData } = await supabase
			.from('menu_categories')
			.select(
				`
        id,
        name,
        description,
        position
      `
			)
			.eq('tenant_id', tenantData.id)
			.order('position', { ascending: true })

		// Load menu items
		const { data: itemsData } = await supabase
			.from('menu_items')
			.select(
				`
        id,
        name,
        description,
        base_price,
        discount_price,
        image_url,
        is_active,
        is_vegan,
        prep_time_minutes,
        allergen_info,
        nutrition,
        category_id,
        menu_item_variants ( id, name, price_modifier ),
        menu_item_toppings ( topping_id ),
        menu_item_ingredients ( ingredient_id )
      `
			)
			.eq('tenant_id', tenantData.id)

		// Load toppings
		const { data: toppingsData } = await supabase
			.from('toppings')
			.select('id, name, price, description, category, image_url')
			.eq('tenant_id', tenantData.id)

		// Load ingredients
		const { data: ingredientsData } = await supabase
			.from('ingredients')
			.select('id, name, unit, allergen_info')
			.eq('tenant_id', tenantData.id)

		// Load SOPs
		const { data: sopData } = await supabase
			.from('sop')
			.select(
				`
        id,
        menu_item_id,
        steps,
        menu_item:menu_item_id ( id, name )
      `
			)
			.eq('tenant_id', tenantData.id)

		setCategories((categoriesData as MenuCategory[]) || [])
		setMenuItems((itemsData as MenuItem[]) || [])
		setToppings((toppingsData as Topping[]) || [])
		setIngredients((ingredientsData as Ingredient[]) || [])
		const normalizedSops: SOP[] =
			(
				sopData as Array<{
					id: string
					menu_item_id: string
					steps: SOPStep[]
					menu_item:
						| Array<{ id: string; name: string }>
						| { id: string; name: string }
						| null
				}>
			)?.map((sop) => ({
				...sop,
				menu_item: Array.isArray(sop.menu_item)
					? sop.menu_item[0] || null
					: sop.menu_item
			})) || []
		setSops(normalizedSops)
		setLoading(false)
	}

	const currencySymbol =
		((tenant?.settings?.currencySymbol as string) ?? '₹') || '₹'

	if (loading || !tenant) {
		return (
			<div className="flex h-[calc(100vh-120px)] items-center justify-center">
				<div className="text-center">
					<div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white/60 mx-auto" />
					<p className="text-white/60">Loading...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-8 py-6">
			<header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<Badge className="border-white/20 bg-white/10 text-white/80">
						<Brain className="mr-1.5 h-3.5 w-3.5 text-[#E0342A]" /> AI Menu Engineering
					</Badge>
					<h1 className="mt-3 text-3xl font-semibold text-white">
						Menu Management
					</h1>
					<p className="text-white/60 text-sm mt-1">
						Manage categories, items, ingredients, add-ons, SOPs, and AI menu pricing optimization
					</p>
				</div>
				<Button
					disabled={aiMenuLoading || !tenant}
					onClick={async () => {
						if (!tenant) return
						setAiMenuLoading(true)
						try {
							const report = await getAIMenuEngineering(tenant.id)
							setAiMenuReport(report)
						} catch (err) {
							console.error('AI Menu Audit error:', err)
						} finally {
							setAiMenuLoading(false)
						}
					}}
					className="bg-[#E0342A] hover:bg-[#c02a22] text-white font-semibold text-xs px-5 flex-shrink-0"
				>
					<Brain className={`mr-2 h-4 w-4 ${aiMenuLoading ? 'animate-spin' : ''}`} />
					{aiMenuLoading ? 'Analyzing Menu...' : 'Run AI Menu Audit'}
				</Button>
			</header>

			{/* AI Menu Engineering Intelligence Report Card */}
			{aiMenuReport && (
				<div className="rounded-2xl border border-[#E0342A]/30 bg-[#E0342A]/10 p-6 space-y-6">
					<div className="flex items-center justify-between border-b border-white/10 pb-4">
						<div className="flex items-center gap-3">
							<Brain className="h-6 w-6 text-[#E0342A]" />
							<div>
								<h3 className="font-bold text-white text-base">Cloudflare AI Menu Engineering Audit</h3>
								<p className="text-xs text-white/60 mt-0.5">{aiMenuReport.overallSummary}</p>
							</div>
						</div>
						<Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">BCG Menu Matrix</Badge>
					</div>

					{/* BCG Matrix & Toppings Cards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 text-xs">
						{/* Plowhorses - Price Increases */}
						<div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
							<div className="flex items-center justify-between border-b border-white/5 pb-2">
								<span className="font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
									<TrendingUp className="h-4 w-4" /> Plowhorses (Popular)
								</span>
								<Badge className="bg-amber-500/20 text-amber-300 text-[10px]">Reprice</Badge>
							</div>
							<p className="text-white/50 text-[11px]">High volume favorites where small price bumps significantly boost profit.</p>
							<div className="space-y-2">
								{aiMenuReport.plowhorses?.map((item, i) => (
									<div key={i} className="bg-black/30 p-3 rounded-lg space-y-1">
										<div className="flex justify-between font-semibold">
											<span className="text-white">{item.name}</span>
											<span className="text-amber-400">₹{item.currentPrice} → ₹{item.suggestedPrice}</span>
										</div>
										<p className="text-[10px] text-white/50">{item.rationale}</p>
									</div>
								))}
							</div>
						</div>

						{/* Stars */}
						<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
							<div className="flex items-center justify-between border-b border-white/5 pb-2">
								<span className="font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
									<Star className="h-4 w-4" /> Stars (High Profit)
								</span>
								<Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">Top Winners</Badge>
							</div>
							<p className="text-white/50 text-[11px]">Your most profitable drivers. Keep quality high and feature prominently.</p>
							<div className="space-y-2">
								{aiMenuReport.stars?.map((item, i) => (
									<div key={i} className="bg-black/30 p-3 rounded-lg space-y-1">
										<div className="flex justify-between font-semibold">
											<span className="text-white">{item.name}</span>
											<span className="text-emerald-400">₹{item.price}</span>
										</div>
										<p className="text-[10px] text-white/50">{item.reason}</p>
									</div>
								))}
							</div>
						</div>

						{/* Toppings Pricing Optimization */}
						<div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
							<div className="flex items-center justify-between border-b border-white/5 pb-2">
								<span className="font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
									<Coins className="h-4 w-4" /> Topping Prices
								</span>
								<Badge className="bg-blue-500/20 text-blue-300 text-[10px]">Add-on Margin</Badge>
							</div>
							<p className="text-white/50 text-[11px]">Add-ons carry zero additional labor cost — small price tweaks yield pure profit.</p>
							<div className="space-y-2">
								{aiMenuReport.toppingsAnalysis?.slice(0, 3).map((top, i) => (
									<div key={i} className="bg-black/30 p-3 rounded-lg space-y-1">
										<div className="flex justify-between font-semibold">
											<span className="text-white">{top.toppingName}</span>
											<span className="text-blue-400">₹{top.currentPrice} → ₹{top.suggestedPrice}</span>
										</div>
										<p className="text-[10px] text-white/50">{top.rationale}</p>
									</div>
								))}
							</div>
						</div>

						{/* Recommended Combos */}
						<div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
							<div className="flex items-center justify-between border-b border-white/5 pb-2">
								<span className="font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
									<Sparkles className="h-4 w-4" /> Combo Bundles
								</span>
								<Badge className="bg-purple-500/20 text-purple-300 text-[10px]">AOV Boost</Badge>
							</div>
							<p className="text-white/50 text-[11px]">High-margin combo packages designed to increase Average Order Value (AOV).</p>
							<div className="space-y-2">
								{aiMenuReport.recommendedCombos?.map((combo, i) => (
									<div key={i} className="bg-black/30 p-3 rounded-lg space-y-1">
										<div className="flex justify-between font-semibold">
											<span className="text-white">{combo.comboName}</span>
											<span className="text-purple-300">₹{combo.comboPrice}</span>
										</div>
										<p className="text-[10px] text-white/50">{combo.items.join(' + ')}</p>
										<p className="text-[10px] text-emerald-400 font-semibold">Est. Uplift: {combo.expectedUplift}</p>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			)}

			<MenuTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
				{activeTab === 'categories' && (
					<CategoriesTab
						tenantId={tenant.id}
						categories={categories}
						onRefresh={loadData}
						readOnly={readOnly}
					/>
				)}

				{activeTab === 'items' && (
					<MenuItemsTab
						tenantId={tenant.id}
						categories={categories}
						menuItems={menuItems}
						availableToppings={toppings}
						ingredients={ingredients}
						sops={sops}
						onRefresh={loadData}
						currencySymbol={currencySymbol}
						readOnly={readOnly}
					/>
				)}

				{activeTab === 'ingredients' && (
					<IngredientsTab
						tenantId={tenant.id}
						ingredients={ingredients}
						menuItems={menuItems}
						onRefresh={loadData}
						readOnly={readOnly}
					/>
				)}

				{activeTab === 'toppings' && (
					<ToppingsTab
						tenantId={tenant.id}
						toppings={toppings}
						categories={categories}
						onRefresh={loadData}
						currencySymbol={currencySymbol}
						readOnly={readOnly}
					/>
				)}

				{activeTab === 'sop' && (
					<SOPTab
						tenantId={tenant.id}
						sops={sops}
						menuItems={menuItems}
						onRefresh={loadData}
						readOnly={readOnly}
					/>
				)}
			</MenuTabs>
		</div>
	)
}
