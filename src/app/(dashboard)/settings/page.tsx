'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
	Sparkles,
	Gift,
	Ticket,
	Settings,
	Building2,
	User,
	Users,
	Shield,
	LayoutGrid,
	FileText,
	Flame
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { LoyaltySettingsTab } from '@/components/settings/loyalty-settings-tab'
import { CouponsTab } from '@/components/settings/coupons-tab'
import { GeneralSettingsTab } from '@/components/settings/general-settings-tab'
import { BillDesignerTab } from '@/components/settings/bill-designer-tab'
import { OrganizationSettingsTab } from '@/components/settings/organization-settings-tab'
import { ProfileSettingsTab } from '@/components/settings/profile-settings-tab'
import { RolesPermissionsTab } from '@/components/settings/roles-permissions-tab'
import { SuppliersTab } from '@/components/settings/suppliers-tab'
import { UsersTab } from '@/components/settings/users-tab'
import { TablesSettingsTab } from '@/components/settings/tables-settings-tab'
import { FirebaseSyncTab } from '@/components/settings/firebase-sync-tab'

type Tenant = {
	id: string
	name: string
	slug: string | null
	settings: Record<string, unknown> | null
	branding: Record<string, unknown> | null
	contact: Record<string, unknown> | null
	social: Record<string, unknown> | null
	custom_domain: string | null
	landing_page: Record<string, unknown> | null
	logo_url: string | null
	migrationRequired?: boolean
}

const tabs = [
	{
		id: 'organization',
		label: 'Organization',
		icon: Building2,
		color: 'from-[#E0342A]/20 to-[#E0342A]/5',
		description: 'Branding, contact & business details'
	},
	{
		id: 'profile',
		label: 'Profile',
		icon: User,
		color: 'from-[#E0342A]/20 to-[#E0342A]/5',
		description: 'Your personal information'
	},
	{
		id: 'users',
		label: 'Users',
		icon: Users,
		color: 'from-[#E0342A]/20 to-[#E0342A]/5',
		description: 'Manage team members & admins'
	},
	{
		id: 'roles',
		label: 'Roles & Permissions',
		icon: Shield,
		color: 'from-[#E0342A]/20 to-[#E0342A]/5',
		description: 'Manage team access & permissions'
	},
	{
		id: 'loyalty',
		label: 'Loyalty',
		icon: Gift,
		color: 'from-[#E0342A]/20 to-[#E0342A]/5',
		description: 'Reward programs & points'
	},
	{
		id: 'coupons',
		label: 'Coupons',
		icon: Ticket,
		color: 'from-[#E0342A]/20 to-[#E0342A]/5',
		description: 'Discount codes & promotions'
	},
	{
		id: 'general',
		label: 'General',
		icon: Settings,
		color: 'from-[#E0342A]/20 to-[#E0342A]/5',
		description: 'Currency, locale & tax settings'
	},
	{
		id: 'bill-design',
		label: 'Bill Design',
		icon: FileText,
		color: 'from-[#E0342A]/20 to-[#E0342A]/5',
		description: 'Design WhatsApp & thermal bills'
	},
	{
		id: 'tables',
		label: 'Tables',
		icon: LayoutGrid,
		color: 'from-[#E0342A]/20 to-[#E0342A]/5',
		description: 'Dining area & seating layout'
	},
	{
		id: 'suppliers',
		label: 'Suppliers',
		icon: Building2,
		color: 'from-[#E0342A]/20 to-[#E0342A]/5',
		description: 'Manage suppliers & vendors'
	},
	{
		id: 'firebase-sync',
		label: 'Firebase Sync',
		icon: Flame,
		color: 'from-orange-500/20 to-orange-500/5',
		description: 'Real-time Firebase integration'
	}
]

const tabVariants = {
	initial: { opacity: 0, y: 20 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -20 }
}

export default function SettingsPage() {
	const router = useRouter()
	const [tenant, setTenant] = useState<Tenant | null>(null)
	const [activeTab, setActiveTab] = useState('organization')
	const [loading, setLoading] = useState(true)

	const loadTenant = useCallback(async () => {
		try {
			const supabase = createSupabaseBrowserClient()
			const {
				data: { user }
			} = await supabase.auth.getUser()

			if (!user) {
				router.push('/login')
				return
			}

			// Try querying with new custom domain columns
			let { data: profileTenant, error } = await supabase
				.from('profile_tenants')
				.select(
					'tenant:tenants(id, name, slug, settings, branding, contact, social, custom_domain, landing_page, logo_url)'
				)
				.eq('profile_id', user.id)
				.single()

			let migrationRequired = false

			if (error) {
				console.warn('Primary query failed, attempting fallback query without custom domain columns:', error)
				// If query failed (e.g. column not found), attempt fallback
				const fallback = await supabase
					.from('profile_tenants')
					.select(
						'tenant:tenants(id, name, slug, settings, branding, contact, social, logo_url)'
					)
					.eq('profile_id', user.id)
					.single()

				if (fallback.error || !fallback.data) {
					router.push('/onboarding')
					return
				}

				// Map fallback to look like the main type
				const fbTenant = (fallback.data as any).tenant
				const mappedTenant = Array.isArray(fbTenant) ? fbTenant[0] : fbTenant

				profileTenant = {
					tenant: {
						...mappedTenant,
						custom_domain: null,
						landing_page: null
					}
				} as any
				migrationRequired = true
			}

			if (!profileTenant?.tenant) {
				router.push('/onboarding')
				return
			}

			const tenantData = Array.isArray(profileTenant.tenant)
				? profileTenant.tenant[0]
				: profileTenant.tenant

			setTenant({
				...(tenantData as Tenant),
				migrationRequired
			})
		} catch (error) {
			console.error('Error loading tenant:', error)
		} finally {
			setLoading(false)
		}
	}, [router])

	useEffect(() => {
		loadTenant()
	}, [loadTenant])

	if (loading) {
		return (
			<div className="flex h-[calc(100vh-120px)] items-center justify-center">
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					className="text-center"
				>
					<div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white/60 mx-auto" />
					<p className="text-white/60">Loading your settings...</p>
				</motion.div>
			</div>
		)
	}

	if (!tenant) {
		return null
	}

	const activeTabData = tabs.find((t) => t.id === activeTab) || tabs[0]!
	const Icon = activeTabData.icon

	return (
		<div className="flex flex-col gap-8 py-6">
			{/* Hero Header */}
			<motion.header
				initial={{ opacity: 0, y: -20 }}
				animate={{ opacity: 1, y: 0 }}
				className="space-y-4"
			>
				<Badge className="border-white/20 bg-white/10 text-white/80">
					<Sparkles className="mr-2 h-4 w-4" /> Command Center
				</Badge>
				<h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
					Shape your restaurant universe
				</h1>
				<p className="max-w-2xl text-lg text-white/70">
					Every setting here shapes how your team operates, how customers
					experience your brand, and how your business scales. Make it yours.
				</p>
			</motion.header>

			{/* Tab Navigation - Beautiful Cards */}
			<div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
				{tabs.map((tab) => {
					const TabIcon = tab.icon
					const isActive = activeTab === tab.id
					return (
						<motion.button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							whileHover={{ scale: 1.02 }}
							whileTap={{ scale: 0.98 }}
							className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all ${
								isActive
									? 'border-white/40 bg-gradient-to-br ' +
										tab.color +
										' shadow-[0_20px_60px_rgba(8,12,32,0.5)]'
									: 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
							}`}
						>
							<div className="relative z-10">
								<div className="mb-3 flex items-center gap-3">
									<div
										className={`rounded-xl p-2.5 transition-colors ${
											isActive
												? 'bg-white/20 text-white'
												: 'bg-white/10 text-white/60 group-hover:text-white'
										}`}
									>
										<TabIcon className="h-5 w-5" />
									</div>
									{isActive && (
										<motion.div
											initial={{ scale: 0 }}
											animate={{ scale: 1 }}
											className="h-2 w-2 rounded-full bg-[#E0342A]"
										/>
									)}
								</div>
								<h3
									className={`font-semibold transition-colors ${
										isActive
											? 'text-white'
											: 'text-white/70 group-hover:text-white'
									}`}
								>
									{tab.label}
								</h3>
								<p className="mt-1 text-xs text-white/50">{tab.description}</p>
							</div>
							{isActive && (
								<motion.div
									layoutId="activeTab"
									className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent"
									transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
								/>
							)}
						</motion.button>
					)
				})}
			</div>

			{/* Active Tab Content */}
			<motion.div
				key={activeTab}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				className="relative"
			>
				<div className="mb-6 flex items-center gap-4">
					<div
						className={`rounded-2xl bg-gradient-to-br ${activeTabData.color} p-4`}
					>
						<Icon className="h-6 w-6 text-white" />
					</div>
					<div>
						<h2 className="text-2xl font-semibold text-white">
							{activeTabData.label}
						</h2>
						<p className="text-sm text-white/60">{activeTabData.description}</p>
					</div>
				</div>

				<AnimatePresence mode="wait">
					<motion.div
						key={activeTab}
						variants={tabVariants}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={{ duration: 0.3 }}
						className="rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur-2xl shadow-[0_30px_80px_rgba(4,5,16,0.65)]"
					>
						{activeTab === 'organization' && (
							<OrganizationSettingsTab tenant={tenant} onRefresh={loadTenant} />
						)}

						{activeTab === 'profile' && (
							<ProfileSettingsTab tenantId={tenant.id} onRefresh={loadTenant} />
						)}

						{activeTab === 'users' && (
							<UsersTab tenantId={tenant.id} onRefresh={loadTenant} />
						)}

						{activeTab === 'roles' && (
							<RolesPermissionsTab tenantId={tenant.id} onRefresh={loadTenant} />
						)}

						{activeTab === 'loyalty' && (
							<LoyaltySettingsTab tenantId={tenant.id} onRefresh={loadTenant} />
						)}

						{activeTab === 'coupons' && (
							<CouponsTab tenantId={tenant.id} onRefresh={loadTenant} />
						)}

						{activeTab === 'general' && (
							<GeneralSettingsTab tenant={tenant} onRefresh={loadTenant} />
						)}

						{activeTab === 'bill-design' && (
							<BillDesignerTab tenant={tenant} onRefresh={loadTenant} />
						)}

						{activeTab === 'tables' && (
							<TablesSettingsTab tenant={tenant} onRefresh={loadTenant} />
						)}

						{activeTab === 'suppliers' && (
							<SuppliersTab tenantId={tenant.id} onRefresh={loadTenant} />
						)}

						{activeTab === 'firebase-sync' && (
							<FirebaseSyncTab tenant={tenant} onRefresh={loadTenant} />
						)}
					</motion.div>
				</AnimatePresence>
			</motion.div>
		</div>
	)
}
