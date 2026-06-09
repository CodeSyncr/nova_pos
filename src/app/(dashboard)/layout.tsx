'use client'

import { type ReactNode, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@/components/brand/logo'
import { cn } from '@/lib/utils'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
	LayoutDashboard,
	TerminalSquare,
	ChefHat,
	Receipt,
	BarChart3,
	Settings,
	Users,
	Package,
	ShoppingCart,
	Menu,
	X,
	LogOut,
	FileBarChart,
	UserCog,
	ClipboardList
} from 'lucide-react'
import { canAccessRoute } from '@/lib/permissions'
import { OrderNotifications } from '@/components/order-notifications'

const navItems = [
	{ href: '/dashboard', label: 'Home', icon: LayoutDashboard },
	{ href: '/pos', label: 'POS', icon: TerminalSquare },
	{ href: '/orders', label: 'Orders', icon: Receipt },
	{ href: '/tasks', label: 'Tasks', icon: ClipboardList },
	{ href: '/menu', label: 'Menu', icon: ChefHat },
	{ href: '/inventory', label: 'Inventory', icon: Package },
	{ href: '/purchases', label: 'Purchases', icon: ShoppingCart },
	{ href: '/customers', label: 'Customers', icon: Users },
	{ href: '/staff', label: 'Staff', icon: UserCog },
	{ href: '/analytics', label: 'Analytics', icon: BarChart3 },
	{ href: '/reports', label: 'Reports', icon: FileBarChart },
	{ href: '/settings', label: 'Settings', icon: Settings }
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
	const pathname = usePathname()
	const router = useRouter()
	const [collapsed, setCollapsed] = useState(true)
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const [userPermissions, setUserPermissions] = useState<Record<string, string[]> | string[] | null>(null)
	const [permissionsLoaded, setPermissionsLoaded] = useState(false)

	// Load user permissions on mount
	useEffect(() => {
		const loadPermissions = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const { data: { user } } = await supabase.auth.getUser()
				if (!user) return

				// Get user's profile_tenant to find their role
				const { data: pt } = await supabase
					.from('profile_tenants')
					.select('role_id')
					.eq('profile_id', user.id)
					.single()

				if (!pt) {
					setUserPermissions({})
					setPermissionsLoaded(true)
					return
				}

				let isFullAccess = !pt.role_id
				let permissions: Record<string, string[]> | string[] | null = null

				if (pt.role_id) {
					// Get the role's permissions and code
					const { data: role } = await supabase
						.from('roles')
						.select('code, permissions')
						.eq('id', pt.role_id)
						.single()

					if (role) {
						const perms = role.permissions
						isFullAccess =
							role.code === 'OWNER' ||
							perms == null ||
							(Array.isArray(perms) &&
								(perms.includes('*') || perms.includes('all')))

						if (!isFullAccess) {
							permissions = perms as Record<string, string[]> | string[]
						}
					} else {
						// Role was assigned but not found. Fail-closed.
						isFullAccess = false
						permissions = {}
					}
				}

				if (isFullAccess) {
					setUserPermissions(null)
				} else {
					setUserPermissions(permissions || {})
				}
			} catch (err) {
				console.error('Error loading permissions:', err)
				setUserPermissions({})
			} finally {
				setPermissionsLoaded(true)
			}
		}

		loadPermissions()
	}, [])

	// Filter nav items based on permissions
	const filteredNavItems = navItems.filter((item) => {
		if (!permissionsLoaded) return false // hide all while loading
		return canAccessRoute(userPermissions, item.href)
	})

	// Redirect if user doesn't have access to current route
	useEffect(() => {
		if (!permissionsLoaded) return
		if (!canAccessRoute(userPermissions, pathname)) {
			// Redirect to the first accessible route
			const firstAccessible = navItems.find((item) => canAccessRoute(userPermissions, item.href))
			const target = firstAccessible?.href || '/dashboard'
			if (pathname !== target) {
				router.push(target)
			}
		}
	}, [permissionsLoaded, userPermissions, pathname, router])

	const handleLogout = async () => {
		const supabase = createSupabaseBrowserClient()
		await supabase.auth.signOut()
		router.push('/login')
	}

	return (
		<div className="min-h-screen bg-black text-white">
			{/* Smoky header backdrop (mobile) — hides content scrolling under the top bar */}
			<div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-20 bg-gradient-to-b from-black via-black/85 to-transparent lg:hidden" />

			{/* Mobile Hamburger Button */}
			<button
				onClick={() => setMobileMenuOpen(true)}
				className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm text-white transition hover:bg-white/10 lg:hidden"
			>
				<Menu className="h-5 w-5" />
			</button>

			{/* Cafe name (mobile, top-right) */}
			<span className="fixed right-5 top-4 z-40 flex h-10 items-center font-[family-name:var(--font-cursive)] text-2xl leading-none text-[#E0342A] lg:hidden">
				pizzeria da cafe
			</span>

			{/* Mobile Menu Overlay */}
			<AnimatePresence>
				{mobileMenuOpen && (
					<>
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => setMobileMenuOpen(false)}
							className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
						/>
						<motion.aside
							initial={{ x: '-100%' }}
							animate={{ x: 0 }}
							exit={{ x: '-100%' }}
							transition={{ type: 'spring', damping: 30, stiffness: 300 }}
							className="fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-white/10 bg-black/40 px-4 py-6 backdrop-blur-2xl shadow-[0_20px_80px_rgba(3,4,12,0.7)] lg:hidden"
						>
							<div className="mb-8 flex items-center justify-between gap-3">
								<div className="flex items-center gap-3">
									<Logo collapsed={false} />
									<div className="flex flex-col">
										{/* <span className="text-xs uppercase tracking-[0.35em] text-white/40">
											FLOW POS
										</span> */}
										{/* <span className="text-xs text-white/60">
											AI-driven restaurant OS
										</span> */}
									</div>
								</div>
								<button
									onClick={() => setMobileMenuOpen(false)}
									className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
								>
									<X className="h-5 w-5" />
								</button>
							</div>
							<nav className="space-y-1 text-sm font-medium text-white/70">
								{filteredNavItems.map((item) => {
									const Icon = item.icon
									const isActive = pathname === item.href
									return (
										<Link
											key={item.href}
											href={item.href}
											onClick={() => setMobileMenuOpen(false)}
											className={cn(
												'group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-xs transition-colors',
												isActive
													? 'border-[#E0342A]/50 bg-[#E0342A]/15 text-white shadow-[0_15px_40px_rgba(224,52,42,0.2)]'
													: 'hover:border-white/20 hover:bg-white/5 hover:text-white'
											)}
										>
											<Icon className="h-4 w-4 shrink-0" />
											<span className="truncate">{item.label}</span>
										</Link>
									)
								})}
							</nav>

							<button
								onClick={handleLogout}
								className="mt-auto flex items-center gap-3 rounded-2xl border border-red-400/40 bg-red-400/5 px-3 py-3 text-sm font-medium text-red-400 transition hover:border-red-400 hover:bg-red-400/10 hover:text-red-300"
							>
								<LogOut className="h-4 w-4 shrink-0" />
								Logout
							</button>
						</motion.aside>
					</>
				)}
			</AnimatePresence>

			<div className="flex min-h-screen">
				{/* Desktop Sidebar */}
				<aside
					onMouseEnter={() => setCollapsed(false)}
					onMouseLeave={() => setCollapsed(true)}
					className={cn(
						'hidden lg:flex fixed left-0 top-0 h-screen flex-col border-r border-white/10 bg-black/20/80 px-4 py-6 backdrop-blur-2xl shadow-[0_20px_80px_rgba(3,4,12,0.7)] transition-[width] duration-200 ease-out z-30',
						collapsed ? 'w-[76px]' : 'w-72'
					)}
				>
					<div
						className={cn(
							'mb-8 flex items-center px-2 transition-all duration-200',
							collapsed ? 'justify-center' : 'justify-start gap-3'
						)}
					>
						<Logo collapsed={collapsed} />
						{!collapsed && (
							<div className="flex flex-col">
								{/* <span className="text-xs uppercase tracking-[0.35em] text-white/40">
									FLOW POS
								</span> */}
								{/* <span className="text-xs text-white/60">
									AI-driven restaurant OS
								</span> */}
							</div>
						)}
					</div>
					<nav className="space-y-1 text-sm font-medium text-white/70">
						{filteredNavItems.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.href
							return (
								<Link
									key={item.href}
									href={item.href}
									className={cn(
										'group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-xs transition-colors',
										isActive
											? 'border-white/40 bg-white/10 text-white shadow-[0_15px_40px_rgba(8,12,32,0.35)]'
											: 'hover:border-white/20 hover:bg-white/5 hover:text-white'
									)}
								>
									<Icon className="h-4 w-4 shrink-0" />
									{!collapsed && <span className="truncate">{item.label}</span>}
								</Link>
							)
						})}
					</nav>

					<div className="mt-auto flex flex-col items-center gap-2 pb-4">
						{/* Logout */}
						{collapsed ? (
							<button
								onClick={handleLogout}
								title="Logout"
								className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-400/40 bg-red-400/5 text-red-400 transition hover:border-red-400 hover:bg-red-400/10 hover:text-red-300"
							>
								<LogOut className="h-5 w-5" />
							</button>
						) : (
							<button
								onClick={handleLogout}
								className="flex w-full items-center gap-3 rounded-xl border border-red-400/40 bg-red-400/5 px-3 py-2.5 text-red-400 transition hover:border-red-400 hover:bg-red-400/10 hover:text-red-300"
							>
								<LogOut className="h-4 w-4 shrink-0" />
								<span className="text-xs">Logout</span>
							</button>
						)}
					</div>
				</aside>

				<main className="flex-1 min-w-0 px-4 py-6 md:px-10 md:py-10 lg:pl-[92px] overflow-y-auto">
					{/* Add top padding on mobile to account for hamburger button */}
					<div className="mx-auto w-full max-w-[1800px] pt-12 lg:pt-0">
						{children}
					</div>
				</main>
				<OrderNotifications />
			</div>
		</div>
	)
}
