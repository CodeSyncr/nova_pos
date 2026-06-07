'use client'

import { type ReactNode, useState, useEffect, useRef } from 'react'
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
	ChevronLeft,
	ChevronRight,
	Menu,
	X,
	User,
	LogOut,
	CreditCard,
	FileBarChart
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const navItems = [
	{ href: '/dashboard', label: 'Home', icon: LayoutDashboard },
	{ href: '/pos', label: 'POS', icon: TerminalSquare },
	{ href: '/menu', label: 'Menu', icon: ChefHat },
	{ href: '/orders', label: 'Orders', icon: Receipt },
	{ href: '/inventory', label: 'Inventory', icon: Package },
	{ href: '/purchases', label: 'Purchases', icon: ShoppingCart },
	{ href: '/customers', label: 'Customers', icon: Users },
	{ href: '/analytics', label: 'Analytics', icon: BarChart3 },
	{ href: '/reports', label: 'Reports', icon: FileBarChart },
	{ href: '/subscription', label: 'Subscription', icon: CreditCard },
	{ href: '/settings', label: 'Settings', icon: Settings }
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
	const pathname = usePathname()
	const router = useRouter()
	const [collapsed, setCollapsed] = useState(true)
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const [showProfileMenu, setShowProfileMenu] = useState(false)
	const profileMenuRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				profileMenuRef.current &&
				!profileMenuRef.current.contains(event.target as Node)
			) {
				setShowProfileMenu(false)
			}
		}

		if (showProfileMenu) {
			document.addEventListener('mousedown', handleClickOutside)
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [showProfileMenu])

	const handleLogout = async () => {
		const supabase = createSupabaseBrowserClient()
		await supabase.auth.signOut()
		router.push('/login')
	}

	return (
		<div className="min-h-screen bg-gradient-to-b from-[#020109] via-[#040516] to-[#020309] text-white">
			{/* Mobile Hamburger Button */}
			<button
				onClick={() => setMobileMenuOpen(true)}
				className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm text-white transition hover:bg-white/10 lg:hidden"
			>
				<Menu className="h-5 w-5" />
			</button>

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
								{navItems.map((item) => {
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
													? 'border-white/40 bg-white/10 text-white shadow-[0_15px_40px_rgba(8,12,32,0.35)]'
													: 'hover:border-white/20 hover:bg-white/5 hover:text-white'
											)}
										>
											<Icon className="h-4 w-4 shrink-0" />
											<span className="truncate">{item.label}</span>
										</Link>
									)
								})}
							</nav>

							<div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-br from-[#5C5CFF]/20 to-[#2DE1FF]/10 p-4 text-xs text-white/70">
								<p className="uppercase tracking-[0.3em] text-white/50">
									Service pulse
								</p>
								<p className="mt-2 text-white">
									Keep menus, POS, and orders in sync. Changes here ripple
									across your floor in real time.
								</p>
							</div>
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
						{navItems.map((item) => {
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

					{!collapsed && (
						<div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-br from-[#5C5CFF]/20 to-[#2DE1FF]/10 p-4 text-xs text-white/70">
							<p className="uppercase tracking-[0.3em] text-white/50">
								Service pulse
							</p>
							<p className="mt-2 text-white">
								Keep menus, POS, and orders in sync. Changes here ripple across
								your floor in real time.
							</p>
						</div>
					)}

					<div className="mt-auto flex flex-col items-center gap-2 pb-4">
						{/* Profile Menu */}
						<div className="relative w-full" ref={profileMenuRef}>
							{collapsed ? (
								<button
									onClick={() => setShowProfileMenu(!showProfileMenu)}
									className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
								>
									<User className="h-5 w-5" />
								</button>
							) : (
								<div className="flex w-full flex-col gap-2">
									<button
										onClick={() => setShowProfileMenu(!showProfileMenu)}
										className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
									>
										<User className="h-4 w-4" />
										<span className="text-xs">Profile</span>
									</button>
									{showProfileMenu && (
										<motion.div
											initial={{ opacity: 0, y: 10 }}
											animate={{ opacity: 1, y: 0 }}
											className="absolute bottom-full left-0 mb-2 w-full"
										>
											<Button
												variant="ghost"
												onClick={handleLogout}
												className="w-full border border-red-400/50 text-red-400 hover:bg-red-400/10 hover:border-red-400 hover:text-red-300"
											>
												<LogOut className="mr-2 h-4 w-4" />
												Logout
											</Button>
										</motion.div>
									)}
								</div>
							)}
							{/* Tooltip for collapsed state */}
							{collapsed && showProfileMenu && (
								<motion.div
									initial={{ opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									className="absolute right-full top-1/2 mb-2 mr-2 -translate-y-1/2"
								>
									<div className="rounded-lg border border-white/10 bg-black/90 px-3 py-2 shadow-lg backdrop-blur-sm">
										<Button
											variant="ghost"
											size="sm"
											onClick={handleLogout}
											className="whitespace-nowrap border border-red-400/50 text-red-400 hover:bg-red-400/10 hover:border-red-400 hover:text-red-300"
										>
											<LogOut className="mr-2 h-3 w-3" />
											Logout
										</Button>
									</div>
									{/* Tooltip arrow */}
									<div className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-full border-l-4 border-t-4 border-b-4 border-transparent border-l-white/10" />
								</motion.div>
							)}
						</div>
						{/* Collapse indicator */}
						<div className="flex items-center justify-center">
							{collapsed ? (
								<ChevronRight className="h-4 w-4 text-white/50" />
							) : (
								<ChevronLeft className="h-4 w-4 text-white/40" />
							)}
						</div>
					</div>
				</aside>

				<main className="flex-1 min-w-0 px-4 py-6 md:px-10 md:py-10 lg:pl-[92px] overflow-y-auto">
					{/* Add top padding on mobile to account for hamburger button */}
					<div className="mx-auto w-full max-w-[1800px] pt-12 lg:pt-0">
						{children}
					</div>
				</main>
			</div>
		</div>
	)
}
