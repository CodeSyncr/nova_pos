'use client'

import { useEffect, useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import {
	Package,
	AlertTriangle,
	Edit,
	TrendingDown,
	RefreshCw
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getInventory, getLowStockItems } from '@/app/actions/inventory'
import { StockAdjustmentForm } from '@/components/inventory/stock-adjustment-form'
import { InventoryLevelsForm } from '@/components/inventory/inventory-levels-form'

type InventoryItem = {
	id: string
	current_stock: number
	unit: string
	min_stock_level: number
	max_stock_level: number | null
	location: string | null
	last_updated_at: string
	ingredient: {
		id: string
		name: string
		unit: string
	} | null
}

export default function InventoryPage() {
	const [inventory, setInventory] = useState<InventoryItem[]>([])
	const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([])
	const [loading, setLoading] = useState(true)
	const [isRefreshing, startTransition] = useTransition()
	const [showAdjustmentForm, setShowAdjustmentForm] = useState(false)
	const [showLevelsForm, setShowLevelsForm] = useState(false)
	const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
	const [tenantId, setTenantId] = useState<string | null>(null)

	useEffect(() => {
		const loadData = async () => {
			try {
				const supabase = createSupabaseBrowserClient()
				const {
					data: { user }
				} = await supabase.auth.getUser()

				if (!user) return

				const { data: profileTenant } = await supabase
					.from('profile_tenants')
					.select('tenant_id')
					.eq('profile_id', user.id)
					.single()

				if (!profileTenant) return

				const tid = profileTenant.tenant_id
				setTenantId(tid)

				const [inventoryData, lowStockData] = await Promise.all([
					getInventory(tid),
					getLowStockItems(tid)
				])

				// Normalize ingredient data (Supabase returns array for foreign keys)
				const normalizedInventory = ((inventoryData as unknown[]) || []).map(
					(item) => {
						const record = item as Record<string, unknown>
						return {
							...record,
							ingredient: Array.isArray(record.ingredient)
								? record.ingredient[0] || null
								: record.ingredient || null
						}
					}
				)

				const normalizedLowStock = ((lowStockData as unknown[]) || []).map(
					(item) => {
						const record = item as Record<string, unknown>
						return {
							...record,
							ingredient: Array.isArray(record.ingredient)
								? record.ingredient[0] || null
								: record.ingredient || null,
							max_stock_level: record.max_stock_level || null,
							location: record.location || null,
							last_updated_at:
								record.last_updated_at || new Date().toISOString()
						}
					}
				)

				setInventory(normalizedInventory as InventoryItem[])
				setLowStockItems(normalizedLowStock as InventoryItem[])
			} catch (error) {
				console.error('Error loading inventory:', error)
			} finally {
				setLoading(false)
			}
		}

		loadData()
	}, [])

	const handleRefresh = () => {
		if (!tenantId) return
		startTransition(async () => {
			try {
				const [inventoryData, lowStockData] = await Promise.all([
					getInventory(tenantId),
					getLowStockItems(tenantId)
				])

				// Normalize ingredient data (Supabase returns array for foreign keys)
				const normalizedInventory = ((inventoryData as unknown[]) || []).map(
					(item) => {
						const record = item as Record<string, unknown>
						return {
							...record,
							ingredient: Array.isArray(record.ingredient)
								? record.ingredient[0] || null
								: record.ingredient || null
						}
					}
				)

				const normalizedLowStock = ((lowStockData as unknown[]) || []).map(
					(item) => {
						const record = item as Record<string, unknown>
						return {
							...record,
							ingredient: Array.isArray(record.ingredient)
								? record.ingredient[0] || null
								: record.ingredient || null,
							max_stock_level: record.max_stock_level || null,
							location: record.location || null,
							last_updated_at:
								record.last_updated_at || new Date().toISOString()
						}
					}
				)

				setInventory(normalizedInventory as InventoryItem[])
				setLowStockItems(normalizedLowStock as InventoryItem[])
			} catch (error) {
				console.error('Error refreshing inventory:', error)
			}
		})
	}

	const handleAdjustStock = (item: InventoryItem) => {
		setSelectedItem(item)
		setShowAdjustmentForm(true)
	}

	const handleUpdateLevels = (item: InventoryItem) => {
		setSelectedItem(item)
		setShowLevelsForm(true)
	}

	if (loading) {
		return (
			<div className="flex h-[calc(100vh-120px)] items-center justify-center">
				<div className="text-center">
					<div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white/60 mx-auto" />
					<p className="text-white/60">Loading inventory...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-8 py-6">
			{/* Hero Header */}
			<motion.header
				initial={{ opacity: 0, y: -20 }}
				animate={{ opacity: 1, y: 0 }}
				className="space-y-4"
			>
				<Badge className="border-white/20 bg-white/10 text-white/80">
					<Package className="mr-2 h-4 w-4" /> Inventory Command Center
				</Badge>
				<h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
					Your ingredient universe
				</h1>
				<p className="max-w-2xl text-lg text-white/70">
					Real-time stock tracking, automated deductions, and intelligent
					alerts. Never run out of what matters.
				</p>
				<div className="flex gap-3">
					<Button
						onClick={handleRefresh}
						disabled={isRefreshing}
						variant="ghost"
						className="border border-white/20"
					>
						<RefreshCw
							className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
						/>
						Refresh
					</Button>
				</div>
			</motion.header>

			{/* Low Stock Alerts - Story-like Card */}
			{lowStockItems.length > 0 && (
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="relative overflow-hidden rounded-[32px] border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-red-500/10 p-8 backdrop-blur-2xl shadow-[0_30px_80px_rgba(251,146,60,0.15)]"
				>
					<div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent" />
					<div className="relative z-10">
						<div className="mb-6 flex items-center gap-4">
							<div className="rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 p-4">
								<AlertTriangle className="h-6 w-6 text-amber-300" />
							</div>
							<div>
								<h2 className="text-2xl font-semibold text-white">
									Low Stock Alert
								</h2>
								<p className="text-sm text-white/60">
									{lowStockItems.length} ingredient
									{lowStockItems.length > 1 ? 's' : ''} need restocking
								</p>
							</div>
						</div>
						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{lowStockItems.map((item) => (
								<motion.div
									key={item.id}
									whileHover={{ scale: 1.02 }}
									className="rounded-xl border border-amber-400/20 bg-black/40 p-4 backdrop-blur-sm"
								>
									<div className="flex items-center justify-between">
										<div className="flex-1">
											<p className="font-semibold text-white">
												{item.ingredient?.name || 'Unknown'}
											</p>
											<div className="mt-2 flex items-baseline gap-2">
												<span className="text-2xl font-bold text-amber-400">
													{item.current_stock}
												</span>
												<span className="text-sm text-white/60">
													{item.unit}
												</span>
											</div>
											<p className="text-xs text-white/50 mt-1">
												Min required: {item.min_stock_level} {item.unit}
											</p>
										</div>
										<TrendingDown className="h-5 w-5 text-amber-400" />
									</div>
								</motion.div>
							))}
						</div>
					</div>
				</motion.div>
			)}

			{/* Inventory Table - Story-like Card */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 backdrop-blur-2xl shadow-[0_30px_80px_rgba(4,5,16,0.65)]"
			>
				<div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent" />
				<div className="relative z-10">
					<div className="mb-6 flex items-center justify-between">
						<div className="flex items-center gap-4">
							<div className="rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 p-4">
								<Package className="h-6 w-6 text-cyan-300" />
							</div>
							<div>
								<h2 className="text-2xl font-semibold text-white">
									Complete Inventory
								</h2>
								<p className="text-sm text-white/60">
									All ingredients and their current stock levels
								</p>
							</div>
						</div>
						<Badge className="border-white/20 text-white/70">
							{inventory.length} items
						</Badge>
					</div>

					{inventory.length === 0 ? (
						<div className="text-center py-16">
							<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
								<Package className="h-10 w-10 text-white/40" />
							</div>
							<h3 className="text-xl font-semibold text-white mb-2">
								No inventory items yet
							</h3>
							<p className="text-white/60 max-w-md mx-auto">
								Create ingredients in Menu management to start tracking
								inventory. Once ingredients are added, they'll appear here
								automatically.
							</p>
						</div>
					) : (
						<div className="grid gap-4">
							{inventory.map((item) => {
								const isLowStock = item.current_stock <= item.min_stock_level
								const stockPercentage = item.max_stock_level
									? (item.current_stock / item.max_stock_level) * 100
									: null

								return (
									<motion.div
										key={item.id}
										whileHover={{ scale: 1.01 }}
										className={`rounded-xl border p-6 transition ${
											isLowStock
												? 'border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-orange-500/10'
												: 'border-white/10 bg-black/20 hover:bg-black/30'
										}`}
									>
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<div className="flex items-center gap-3 mb-3">
													<div
														className={`rounded-xl p-3 ${
															isLowStock
																? 'bg-amber-400/20'
																: 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20'
														}`}
													>
														<Package
															className={`h-5 w-5 ${
																isLowStock ? 'text-amber-300' : 'text-cyan-300'
															}`}
														/>
													</div>
													<div className="flex-1">
														<div className="flex items-center gap-2">
															<h3 className="text-lg font-semibold text-white">
																{item.ingredient?.name || 'Unknown'}
															</h3>
															{isLowStock && (
																<Badge className="border-amber-400/50 text-amber-400 text-xs bg-amber-400/10">
																	Low Stock
																</Badge>
															)}
														</div>
														<div className="mt-2 flex items-baseline gap-2">
															<span
																className={`text-3xl font-bold ${
																	isLowStock ? 'text-amber-400' : 'text-white'
																}`}
															>
																{item.current_stock}
															</span>
															<span className="text-sm text-white/60">
																{item.unit}
															</span>
														</div>
														{stockPercentage !== null && (
															<div className="mt-3">
																<div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
																	<div
																		className={`h-full transition-all ${
																			stockPercentage < 20
																				? 'bg-amber-400'
																				: stockPercentage < 50
																					? 'bg-yellow-400'
																					: 'bg-emerald-400'
																		}`}
																		style={{
																			width: `${Math.min(100, stockPercentage)}%`
																		}}
																	/>
																</div>
																<p className="text-xs text-white/50 mt-1">
																	{stockPercentage.toFixed(0)}% of max capacity
																</p>
															</div>
														)}
													</div>
												</div>
												<div className="grid grid-cols-3 gap-4 mt-4 text-sm">
													<div>
														<p className="text-white/50">Min Level</p>
														<p className="text-white font-medium">
															{item.min_stock_level} {item.unit}
														</p>
													</div>
													<div>
														<p className="text-white/50">Max Level</p>
														<p className="text-white font-medium">
															{item.max_stock_level ? (
																<>
																	{item.max_stock_level} {item.unit}
																</>
															) : (
																<span className="text-white/40">No limit</span>
															)}
														</p>
													</div>
													<div>
														<p className="text-white/50">Location</p>
														<p className="text-white font-medium">
															{item.location || (
																<span className="text-white/40">Not set</span>
															)}
														</p>
													</div>
												</div>
											</div>
											<div className="flex flex-col gap-2 ml-4">
												<Button
													size="sm"
													variant="ghost"
													onClick={() => handleAdjustStock(item)}
													className="border border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
												>
													<Edit className="h-3 w-3 mr-1" />
													Adjust
												</Button>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => handleUpdateLevels(item)}
													className="border border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
												>
													Settings
												</Button>
											</div>
										</div>
									</motion.div>
								)
							})}
						</div>
					)}
				</div>
			</motion.div>

			{/* Forms */}
			{showAdjustmentForm && selectedItem && tenantId && (
				<StockAdjustmentForm
					tenantId={tenantId}
					inventoryItem={selectedItem}
					onClose={() => {
						setShowAdjustmentForm(false)
						setSelectedItem(null)
					}}
					onSuccess={() => {
						setShowAdjustmentForm(false)
						setSelectedItem(null)
						handleRefresh()
					}}
				/>
			)}

			{showLevelsForm && selectedItem && (
				<InventoryLevelsForm
					inventoryItem={selectedItem}
					onClose={() => {
						setShowLevelsForm(false)
						setSelectedItem(null)
					}}
					onSuccess={() => {
						setShowLevelsForm(false)
						setSelectedItem(null)
						handleRefresh()
					}}
				/>
			)}
		</div>
	)
}
