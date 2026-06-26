'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import {
	Sparkles,
	Percent,
	ShieldCheck,
	MapPin,
	Phone,
	Mail,
	Globe,
	Instagram,
	Facebook,
	Award,
	ArrowUpRight,
	ArrowDownRight,
	RotateCw,
	Calendar,
	Gift,
	Coins,
	AlertCircle
} from 'lucide-react'
import { Barcode } from './barcode'

// Types matching Supabase tables
export interface CustomerData {
	id: string
	full_name: string
	phone: string | null
	email: string | null
	created_at: string
}

export interface LoyaltyProfile {
	points_balance: number
	joined_at: string
	loyalty_tiers: {
		id: string
		name: string
		min_points: number
		benefits: Record<string, any>
	} | null
}

export interface LoyaltyTransaction {
	id: string
	type: 'earn' | 'redeem' | 'adjust'
	points: number
	reason: string | null
	created_at: string
}

export interface TenantBranding {
	fontFamily?: string
	primaryColor?: string
	secondaryColor?: string
}

export interface TenantData {
	id: string
	name: string
	slug: string | null
	logo_url: string | null
	branding: TenantBranding | null
	contact: {
		phone?: string
		email?: string
		address?: {
			street?: string
			city?: string
			state?: string
			pincode?: string
			country?: string
		}
	} | null
	social: {
		website?: string
		instagram?: string
		facebook?: string
	} | null
}

interface MembershipCardPortalProps {
	customer: CustomerData
	loyalty: LoyaltyProfile
	transactions: LoyaltyTransaction[]
	tenant: TenantData
	allTiers: Array<{ name: string; min_points: number }>
}

export function MembershipCardPortal({
	customer,
	loyalty,
	transactions,
	tenant,
	allTiers
}: MembershipCardPortalProps) {
	const [isFlipped, setIsFlipped] = useState(false)
	const cardRef = useRef<HTMLDivElement>(null)

	// Motion values for 3D tilt effect on desktop hover
	const x = useMotionValue(0)
	const y = useMotionValue(0)

	// Smooth out mouse movements
	const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [15, -15]), {
		damping: 20,
		stiffness: 150
	})
	const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-15, 15]), {
		damping: 20,
		stiffness: 150
	})

	const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
		if (!cardRef.current || isFlipped) return
		const rect = cardRef.current.getBoundingClientRect()
		const width = rect.width
		const height = rect.height
		const mouseX = event.clientX - rect.left - width / 2
		const mouseY = event.clientY - rect.top - height / 2
		x.set(mouseX / width)
		y.set(mouseY / height)
	}

	const handleMouseLeave = () => {
		x.set(0)
		y.set(0)
	}

	// Dynamic tier naming theme definitions
	const tierName = loyalty.loyalty_tiers?.name || 'Classic'
	const normalizedTier = tierName.toLowerCase()

	// Tier configuration logic
	const isDiamond = normalizedTier.includes('diamond') || normalizedTier.includes('platinum') || normalizedTier.includes('elite')
	const isGold = normalizedTier.includes('gold') || normalizedTier.includes('vip')
	const isSilver = normalizedTier.includes('silver')
	const isBronze = normalizedTier.includes('bronze') || normalizedTier.includes('copper')

	// Select styling based on tier
	let cardBg = 'bg-gradient-to-br from-indigo-950 via-slate-900 to-zinc-900 border-indigo-500/20'
	let glowColor = 'rgba(99, 102, 241, 0.15)'
	let badgeBg = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
	let textTheme = 'text-indigo-400'

	if (isDiamond) {
		cardBg = 'bg-gradient-to-br from-cyan-950 via-purple-950 to-slate-950 border-cyan-400/40'
		glowColor = 'rgba(34, 211, 238, 0.3)'
		badgeBg = 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 border-cyan-400/40 shadow-[0_0_15px_rgba(34,211,238,0.25)] animate-pulse'
		textTheme = 'text-cyan-400 font-extrabold'
	} else if (isGold) {
		cardBg = 'bg-gradient-to-br from-amber-950 via-[#2e1d05] to-[#120b02] border-amber-500/40'
		glowColor = 'rgba(245, 158, 11, 0.25)'
		badgeBg = 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
		textTheme = 'text-amber-400'
	} else if (isSilver) {
		cardBg = 'bg-gradient-to-br from-slate-800 via-zinc-800 to-neutral-900 border-slate-400/30'
		glowColor = 'rgba(148, 163, 184, 0.15)'
		badgeBg = 'bg-slate-400/10 text-slate-300 border-slate-400/30'
		textTheme = 'text-slate-300'
	} else if (isBronze) {
		cardBg = 'bg-gradient-to-br from-amber-900/60 via-zinc-900 to-stone-900 border-orange-700/20'
		glowColor = 'rgba(194, 65, 12, 0.15)'
		badgeBg = 'bg-orange-700/10 text-orange-400 border-orange-700/20'
		textTheme = 'text-orange-400'
	}

	// Calculate progression to next tier
	const currentPoints = loyalty.points_balance
	const nextTiers = allTiers
		.filter((t) => t.min_points > currentPoints)
		.sort((a, b) => a.min_points - b.min_points)

	const nextTier = nextTiers[0] || null
	let progressPercentage = 100
	let pointsNeeded = 0

	if (nextTier) {
		const currentTierMin = loyalty.loyalty_tiers?.min_points || 0
		const totalRange = nextTier.min_points - currentTierMin
		const currentOffset = currentPoints - currentTierMin
		progressPercentage = totalRange > 0 ? Math.min(100, Math.max(0, (currentOffset / totalRange) * 100)) : 100
		pointsNeeded = nextTier.min_points - currentPoints
	}

	// Custom format for joined date
	const formatJoinedDate = (dateStr: string) => {
		try {
			const d = new Date(dateStr)
			return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
		} catch {
			return 'N/A'
		}
	}

	// Apply branding colors dynamically if customized by the restaurant owner
	useEffect(() => {
		if (tenant.branding?.primaryColor) {
			document.documentElement.style.setProperty('--brand-primary', tenant.branding.primaryColor)
		}
		if (tenant.branding?.secondaryColor) {
			document.documentElement.style.setProperty('--brand-secondary', tenant.branding.secondaryColor)
		}
	}, [tenant.branding])

	// Public absolute URL for QR Code pointing to this public page
	const pageUrl = typeof window !== 'undefined' ? window.location.href : `/membership/${customer.id}`

	return (
		<div className="min-h-screen bg-[#070913] text-white flex flex-col font-sans selection:bg-indigo-500/30">
			{/* Brand Glow Background Effects */}
			<div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
				<div 
					className="absolute top-[-10%] left-[50%] -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-[150px] opacity-25 transition-all duration-700" 
					style={{ backgroundColor: tenant.branding?.primaryColor || '#6366f1' }}
				/>
				<div className="absolute bottom-[-10%] right-[10%] w-[350px] h-[350px] rounded-full bg-indigo-500/10 blur-[100px]" />
			</div>

			<div className="relative z-10 w-full max-w-lg mx-auto px-4 py-8 flex flex-col flex-grow">
				{/* Top Branding Header */}
				<header className="flex items-center justify-between mb-8">
					<div className="flex items-center gap-3">
						{tenant.logo_url ? (
							<img
								src={tenant.logo_url}
								alt={tenant.name}
								className="w-10 h-10 rounded-xl object-cover border border-white/10 shadow-md"
							/>
						) : (
							<div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-bold text-lg text-indigo-400">
								{tenant.name.charAt(0)}
							</div>
						)}
						<div>
							<h1 className="text-lg font-bold leading-tight tracking-wide">{tenant.name}</h1>
							<span className="text-[10px] text-slate-400 uppercase tracking-widest">Digital Card Portal</span>
						</div>
					</div>
					<div className={`px-3 py-1 rounded-full border text-xs font-semibold tracking-wider ${badgeBg}`}>
						{tierName}
					</div>
				</header>

				{/* 3D Flippable Banking-Style Membership Card Container */}
				<div className="w-full aspect-[1.586/1] perspective-1000 mb-6 cursor-pointer select-none">
					<motion.div
						ref={cardRef}
						onMouseMove={handleMouseMove}
						onMouseLeave={handleMouseLeave}
						onClick={() => setIsFlipped(!isFlipped)}
						className="relative w-full h-full transform-style-3d duration-700 rounded-3xl"
						animate={{ rotateY: isFlipped ? 180 : 0 }}
						style={{
							rotateX: isFlipped ? 0 : rotateX,
							rotateY: rotateY,
							boxShadow: `0 25px 60px -15px ${glowColor}, 0 0 40px -10px ${glowColor}`
						}}
					>
						{/* FRONT OF THE CARD */}
						<div className={`absolute inset-0 backface-hidden ${cardBg} p-6 flex flex-col justify-between rounded-3xl border overflow-hidden`}>
							{/* Background Geometric Accents */}
							<div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
							<div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(45deg,_#fff_25%,_transparent_25%,_transparent_75%,_#fff_75%,_#fff),_linear-gradient(45deg,_#fff_25%,_transparent_25%,_transparent_75%,_#fff_75%,_#fff)] bg-[size:30px_30px] bg-[position:0_0,_15px_15px]" />
							
							{/* Holographic glowing orb on Front */}
							<div 
								className="absolute right-[-15%] top-[-15%] w-1/2 aspect-square rounded-full blur-[60px] opacity-40 transition-colors"
								style={{ backgroundColor: tenant.branding?.primaryColor || '#6366f1' }}
							/>

							{/* Front Header */}
							<div className="flex justify-between items-start z-10">
								<div className="flex items-center gap-2">
									<Award className="h-5 w-5 text-white/80" />
									<span className="font-semibold text-sm text-white/90 tracking-wider">MEMBERSHIP</span>
								</div>
								
								{/* Contactless pay icon */}
								<div className="flex flex-col gap-0.5 opacity-60">
									<div className="flex gap-0.5">
										<div className="w-1.5 h-3.5 border-r-2 border-white rounded-r-md transform rotate-12" />
										<div className="w-1.5 h-3.5 border-r-2 border-white rounded-r-md transform rotate-12 scale-110" />
										<div className="w-1.5 h-3.5 border-r-2 border-white rounded-r-md transform rotate-12 scale-125" />
									</div>
								</div>
							</div>

							{/* Card Chip & Wallet Balance */}
							<div className="flex items-end justify-between z-10 my-2">
								{/* Gold/Silver smart EMV chip */}
								<div className="w-11 h-9 rounded-lg bg-gradient-to-br from-amber-300 via-amber-200 to-amber-500 border border-amber-600/30 p-1.5 shadow-inner flex flex-col justify-between overflow-hidden">
									<div className="h-[1px] bg-amber-800/20 w-full" />
									<div className="grid grid-cols-3 gap-0.5 h-full pt-1">
										<div className="border-r border-b border-amber-800/20" />
										<div className="border-r border-b border-amber-800/20" />
										<div className="border-b border-amber-800/20" />
									</div>
								</div>

								{/* Points Counter */}
								<div className="text-right">
									<span className="text-[10px] text-white/50 uppercase tracking-widest block mb-0.5">Points Balance</span>
									<span className="text-2xl font-mono font-bold tracking-wider text-white shadow-sm flex items-center justify-end gap-1">
										<Coins className="h-5 w-5 text-amber-400" />
										{currentPoints.toLocaleString()}
									</span>
								</div>
							</div>

							{/* Front Footer */}
							<div className="flex justify-between items-end z-10">
								<div className="space-y-0.5">
									<span className="text-[9px] text-white/40 uppercase tracking-widest block">Cardholder</span>
									<span className="font-semibold text-sm tracking-wide text-white block uppercase">
										{customer.full_name}
									</span>
								</div>
								<div className="flex gap-6">
									<div>
										<span className="text-[9px] text-white/40 uppercase tracking-widest block">Member Since</span>
										<span className="font-mono text-xs text-white/80 block">
											{formatJoinedDate(loyalty.joined_at)}
										</span>
									</div>
									<div className="text-right">
										<span className="text-[9px] text-white/40 uppercase tracking-widest block">Tier Level</span>
										<span className={`text-xs font-bold uppercase tracking-wider block ${textTheme}`}>
											{tierName}
										</span>
									</div>
								</div>
							</div>
						</div>

						{/* BACK OF THE CARD */}
						<div className={`absolute inset-0 backface-hidden ${cardBg} flex flex-col justify-between rounded-3xl border border-white/10 rotate-y-180 overflow-hidden`}>
							{/* Magnetic stripe */}
							<div className="w-full h-11 bg-slate-950 mt-4 shadow-sm" />

							{/* Card Signature Block */}
							<div className="px-6 flex justify-between items-center my-1.5">
								<div className="w-2/3 h-8 bg-white/10 rounded-md border border-white/5 px-3 flex items-center">
									<span className="font-serif italic text-xs tracking-wider text-white/60 select-none">
										{customer.full_name}
									</span>
								</div>
								<span className="font-mono text-[9px] text-white/30 uppercase tracking-wider">
									CVV: ***
								</span>
							</div>

							{/* Barcode & Scan Info */}
							<div className="px-6 pb-6 flex flex-col items-center justify-center gap-2">
								<Barcode value={customer.phone || customer.id.slice(0, 13)} />
								<p className="text-[9px] text-white/40 text-center tracking-wider mt-1">
									Present barcode to cashier for quick POS scanning
								</p>
							</div>
						</div>
					</motion.div>
				</div>

				{/* Flip Instructions Card */}
				<button
					onClick={() => setIsFlipped(!isFlipped)}
					className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all text-xs font-semibold text-slate-300 mb-6 shadow-sm cursor-pointer"
				>
					<RotateCw className="h-4 w-4 animate-spin-slow text-indigo-400" />
					<span>Flip to reveal {isFlipped ? 'Membership Details' : 'Scanner Barcode'}</span>
				</button>

				{/* Points Progression Module */}
				<section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md mb-6 shadow-md">
					<h3 className="text-sm font-bold tracking-wider text-slate-200 mb-3.5 flex items-center gap-2">
						<Coins className="h-4 w-4 text-indigo-400" /> Points Progress
					</h3>

					{nextTier ? (
						<div className="space-y-3.5">
							<div className="flex justify-between items-end text-xs">
								<span className="text-slate-400">
									Next Tier: <strong className="text-slate-200">{nextTier.name}</strong>
								</span>
								<span className="font-semibold text-indigo-400">
									{currentPoints} / {nextTier.min_points} Pts
								</span>
							</div>
							<div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden p-0.5 border border-white/5">
								<div 
									className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000"
									style={{ width: `${progressPercentage}%` }}
								/>
							</div>
							<p className="text-[11px] text-slate-400 leading-relaxed">
								You need <strong className="text-slate-200 font-semibold">{pointsNeeded} more points</strong> to reach the <strong className="text-indigo-400 font-semibold">{nextTier.name}</strong> tier and unlock more premium benefits!
							</p>
						</div>
					) : (
						<div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-2xl">
							<Sparkles className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
							<div>
								<h4 className="text-xs font-bold text-amber-300 tracking-wider">MAX TIER REACHED</h4>
								<p className="text-[11px] text-slate-300 leading-relaxed mt-1">
									Congratulations! You have reached the highest loyalty level ({tierName}). You are enjoying all VIP privileges.
								</p>
							</div>
						</div>
					)}
				</section>

				{/* Benefits Module */}
				<section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md mb-6 shadow-md">
					<h3 className="text-sm font-bold tracking-wider text-slate-200 mb-4.5 flex items-center gap-2">
						<Sparkles className="h-4 w-4 text-indigo-400" /> Tier Benefits
					</h3>

					{loyalty.loyalty_tiers?.benefits && Object.keys(loyalty.loyalty_tiers.benefits).length > 0 ? (
						<div className="grid gap-3 sm:grid-cols-2">
							{Object.entries(loyalty.loyalty_tiers.benefits).map(([key, val]) => {
								let title = key
								let desc = String(val)
								let icon = <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />

								// Custom rendering helpers for benefits
								if (key.toLowerCase().includes('discount')) {
									icon = <Percent className="h-5 w-5 text-indigo-400 shrink-0" />
									title = 'Order Discount'
									desc = `${parseFloat(val) * 100}% off all items`
								} else if (key.toLowerCase().includes('multiplier') || key.toLowerCase().includes('rate')) {
									icon = <Coins className="h-5 w-5 text-amber-400 shrink-0" />
									title = 'Points Accelerator'
									desc = `${val}x points on purchases`
								} else if (key.toLowerCase().includes('birthday')) {
									icon = <Gift className="h-5 w-5 text-pink-400 shrink-0" />
									title = 'Birthday Offer'
									desc = val
								}

								return (
									<div key={key} className="flex gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
										{icon}
										<div>
											<h4 className="text-xs font-semibold text-slate-200 capitalize">{title}</h4>
											<p className="text-[10px] text-slate-400 mt-1 leading-normal">{desc}</p>
										</div>
									</div>
								)
							})}
						</div>
					) : (
						<div className="text-center py-6 text-slate-400 flex flex-col items-center justify-center gap-2">
							<AlertCircle className="h-6 w-6 text-slate-500" />
							<p className="text-xs">No specific benefits listed for this tier yet.</p>
						</div>
					)}
				</section>

				{/* Recent Activity Module */}
				<section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md mb-8 shadow-md">
					<h3 className="text-sm font-bold tracking-wider text-slate-200 mb-4 flex items-center justify-between">
						<span className="flex items-center gap-2">
							<Calendar className="h-4 w-4 text-indigo-400" /> Recent Activity
						</span>
						<span className="text-[10px] text-slate-400 font-mono">Last {transactions.length} orders</span>
					</h3>

					{transactions.length > 0 ? (
						<div className="divide-y divide-white/5">
							{transactions.map((tx) => {
								const isEarn = tx.type === 'earn'
								const isRedeem = tx.type === 'redeem'
								
								let pointsColor = 'text-indigo-400'
								let pointsPrefix = ''
								let txIcon = <Award className="h-4 w-4 text-indigo-400" />

								if (isEarn) {
									pointsColor = 'text-emerald-400'
									pointsPrefix = '+'
									txIcon = <ArrowUpRight className="h-4 w-4 text-emerald-400" />
								} else if (isRedeem) {
									pointsColor = 'text-red-400'
									pointsPrefix = '-'
									txIcon = <ArrowDownRight className="h-4 w-4 text-red-400" />
								}

								return (
									<div key={tx.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
										<div className="flex items-center gap-3">
											<div className="w-8 h-8 rounded-full bg-slate-900/80 flex items-center justify-center border border-white/5">
												{txIcon}
											</div>
											<div>
												<h4 className="text-xs font-semibold text-slate-200 capitalize">
													{tx.reason || (isEarn ? 'Points Earned' : isRedeem ? 'Points Redeemed' : 'Balance Adjust')}
												</h4>
												<span className="text-[10px] text-slate-400 block mt-0.5">
													{new Date(tx.created_at).toLocaleDateString('en-US', {
														day: 'numeric',
														month: 'short',
														hour: '2-digit',
														minute: '2-digit'
													})}
												</span>
											</div>
										</div>
										<span className={`font-mono text-sm font-bold ${pointsColor}`}>
											{pointsPrefix}{tx.points.toLocaleString()}
										</span>
									</div>
								)
							})}
						</div>
					) : (
						<div className="text-center py-8 text-slate-400 flex flex-col items-center justify-center gap-2">
							<Coins className="h-7 w-7 text-slate-600" />
							<p className="text-xs">No points transactions recorded yet.</p>
						</div>
					)}
				</section>

				{/* Restaurant Contact & Social Details */}
				<footer className="mt-auto border-t border-white/10 pt-6 text-center text-xs text-slate-400">
					<p className="uppercase tracking-widest text-[10px] text-slate-500 font-bold mb-4">Contact & Support</p>
					
					{/* Contact Details */}
					<div className="flex flex-col gap-2.5 mb-6 max-w-sm mx-auto text-slate-300">
						{tenant.contact?.phone && (
							<a href={`tel:${tenant.contact.phone}`} className="flex items-center justify-center gap-2 hover:text-white transition-colors">
								<Phone className="h-3.5 w-3.5 text-indigo-400" />
								<span>{tenant.contact.phone}</span>
							</a>
						)}
						{tenant.contact?.email && (
							<a href={`mailto:${tenant.contact.email}`} className="flex items-center justify-center gap-2 hover:text-white transition-colors">
								<Mail className="h-3.5 w-3.5 text-indigo-400" />
								<span>{tenant.contact.email}</span>
							</a>
						)}
						{tenant.contact?.address?.street && (
							<div className="flex items-center justify-center gap-2">
								<MapPin className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
								<span className="text-center">
									{tenant.contact.address.street}, {tenant.contact.address.city}, {tenant.contact.address.country}
								</span>
							</div>
						)}
					</div>

					{/* Social and Website Channels */}
					<div className="flex justify-center gap-4.5 mb-6">
						{tenant.social?.website && (
							<a 
								href={tenant.social.website} 
								target="_blank" 
								rel="noreferrer" 
								className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all active:scale-95"
							>
								<Globe className="h-4 w-4" />
							</a>
						)}
						{tenant.social?.instagram && (
							<a 
								href={`https://instagram.com/${tenant.social.instagram.replace('@', '')}`}
								target="_blank" 
								rel="noreferrer" 
								className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all active:scale-95"
							>
								<Instagram className="h-4 w-4" />
							</a>
						)}
						{tenant.social?.facebook && (
							<a 
								href={`https://facebook.com/${tenant.social.facebook}`}
								target="_blank" 
								rel="noreferrer" 
								className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all active:scale-95"
							>
								<Facebook className="h-4 w-4" />
							</a>
						)}
					</div>

					<p className="text-[10px] text-slate-500 font-mono tracking-wider">
						Powered by NovaPos Engine · Secure Digital Wallet
					</p>
				</footer>
			</div>
		</div>
	)
}
