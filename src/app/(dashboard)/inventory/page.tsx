'use client'

import { useEffect, useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import {
	Package,
	AlertTriangle,
	Edit,
	TrendingDown,
	RefreshCw,
	Plus,
	Loader2,
	X
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getInventory, getLowStockItems } from '@/app/actions/inventory'
import { createIngredient } from '@/app/actions/menu'
import { useToast } from '@/components/ui/toast'
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
	const [showAddForm, setShowAddForm] = useState(false)
	const [savingIngredient, setSavingIngredient] = useState(false)
	const [newIngredient, setNewIngredient] = useState({
		name: '',
		unit: 'pieces'
	})
	const { success, error: showError } = useToast()

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
	
	const handleCreateIngredient = async () => {
		if (!tenantId) return
		const name = newIngredient.name.trim()
		if (!name) {
			showError('Ingredient name is required.')
			return
		}
		setSavingIngredient(true)
		try {
			// `createIngredient` also seeds an `inventory` row at zero stock
			// using the unit we pass in. The user can set min/max stock
			// levels right after via the row's "Edit levels" button.
			await createIngredient(tenantId, {
				name,
				unit: newIngredient.unit.trim() || 'pieces'
			})
			
			success('Ingredient added.')
			setShowAddForm(false)
			setNewIngredient({ name: '', unit: 'pieces' })
			handleRefresh()
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to add ingredient.'
			showError(msg)
		} finally {
			setSavingIngredient(false)
		}
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
						onClick={() => setShowAddForm(true)}
					>
						<Plus className="mr-2 h-4 w-4" />
						Add Ingredient
					</Button>
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
					className="relative overflow-hidden rounded-[32px] border border-[#E0342A]/30 bg-gradient-to-br from-[#E0342A]/20 to-[#E0342A]/5 p-8 backdrop-blur-2xl shadow-[0_30px_80px_rgba(224,52,42,0.15)]"
				>
					<div className="absolute inset-0 bg-gradient-to-br from-[#E0342A]/5 to-transparent" />
					<div className="relative z-10">
						<div className="mb-6 flex items-center gap-4">
							<div className="rounded-2xl bg-[#E0342A]/15 p-4">
								<AlertTriangle className="h-6 w-6 text-[#E0342A]" />
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
									className="rounded-xl border border-[#E0342A]/20 bg-black/40 p-4 backdrop-blur-sm"
								>
									<div className="flex items-center justify-between">
										<div className="flex-1">
											<p className="font-semibold text-white">
												{item.ingredient?.name || 'Unknown'}
											</p>
											<div className="mt-2 flex items-baseline gap-2">
												<span className="text-2xl font-bold text-[#E0342A]">
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
										<TrendingDown className="h-5 w-5 text-[#E0342A]" />
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
				<div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
				<div className="relative z-10">
					<div className="mb-6 flex items-center justify-between">
						<div className="flex items-center gap-4">
							<div className="rounded-2xl bg-white/10 p-4">
								<Package className="h-6 w-6 text-white/70" />
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
							<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
								<Package className="h-10 w-10 text-white/40" />
							</div>
							<h3 className="text-xl font-semibold text-white mb-2">
								No inventory items yet
							</h3>
							<p className="text-white/60 max-w-md mx-auto mb-6">
								Add your first ingredient to start tracking inventory. You can
								also create ingredients from the Menu page when defining
								recipes.
							</p>
							<Button onClick={() => setShowAddForm(true)}>
								<Plus className="mr-2 h-4 w-4" />
								Add Ingredient
							</Button>
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
												? 'border-[#E0342A]/30 bg-[#E0342A]/10'
												: 'border-white/10 bg-black/20 hover:bg-black/30'
										}`}
									>
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<div className="flex items-center gap-3 mb-3">
													<div
														className={`rounded-xl p-3 ${
															isLowStock
																? 'bg-[#E0342A]/15'
																: 'bg-white/10'
														}`}
													>
														<Package
															className={`h-5 w-5 ${
																isLowStock ? 'text-[#E0342A]' : 'text-white/70'
															}`}
														/>
													</div>
													<div className="flex-1">
														<div className="flex items-center gap-2">
															<h3 className="text-lg font-semibold text-white">
																{item.ingredient?.name || 'Unknown'}
															</h3>
															{isLowStock && (
																<Badge className="border-[#E0342A]/50 text-[#E0342A] text-xs bg-[#E0342A]/10">
																	Low Stock
																</Badge>
															)}
														</div>
														<div className="mt-2 flex items-baseline gap-2">
															<span
																className={`text-3xl font-bold ${
																	isLowStock ? 'text-[#E0342A]' : 'text-white'
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
																				? 'bg-[#E0342A]'
																				: stockPercentage < 50
																					? 'bg-white/50'
																					: 'bg-white'
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
			
			{showAddForm && (
				<div className="fixed inset-0 z-[9999]">
					<div
						className="absolute inset-0 bg-black/60 backdrop-blur-sm"
						onClick={() => !savingIngredient && setShowAddForm(false)}
					/>
					<motion.div
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						className="absolute left-1/2 top-1/2 w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-6 shadow-[0_30px_80px_rgba(4,5,16,0.65)]"
					>
						<div className="mb-5 flex items-start justify-between">
							<div className="flex items-center gap-3">
								<div className="rounded-xl bg-[#E0342A]/15 p-2.5">
									<Plus className="h-5 w-5 text-[#E0342A]" />
								</div>
								<div>
									<h3 className="text-lg font-semibold text-white">
										Add Ingredient
									</h3>
									<p className="text-xs text-white/55">
										New ingredients seed an inventory row at zero stock.
									</p>
								</div>
							</div>
							<button
								onClick={() => !savingIngredient && setShowAddForm(false)}
								className="rounded-full border border-white/10 bg-white/5 p-1.5 text-white/60 hover:bg-white/10"
								aria-label="Close"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
						
						<div className="space-y-4">
							<div>
								<label className="mb-1.5 block text-xs font-medium text-white/70">
									Name <span className="text-[#E0342A]">*</span>
								</label>
								<input
									type="text"
									autoFocus
									value={newIngredient.name}
									onChange={(e) =>
										setNewIngredient({ ...newIngredient, name: e.target.value })
									}
									placeholder="e.g. Mozzarella, Tomato, Flour"
									className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
								/>
							</div>
							<div className="grid grid-cols-3 gap-3">
								<div>
									<label className="mb-1.5 block text-xs font-medium text-white/70">
										Unit
									</label>
									<input
										type="text"
										value={newIngredient.unit}
										onChange={(e) =>
											setNewIngredient({ ...newIngredient, unit: e.target.value })
										}
										placeholder="kg, g, L, pcs"
										className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
									/>
								</div>
								<div>
									<label className="mb-1.5 block text-xs font-medium text-white/70">
										Min level
									</label>
									<input
										type="number"
										min="0"
										step="any"
										value={newIngredient.minStockLevel}
										onChange={(e) =>
											setNewIngredient({
												...newIngredient,
												minStockLevel: e.target.value
											})
										}
										placeholder="0"
										className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
									/>
								</div>
								<div>
									<label className="mb-1.5 block text-xs font-medium text-white/70">
										Max level
									</label>
									<input
										type="number"
										min="0"
										step="any"
										value={newIngredient.maxStockLevel}
										onChange={(e) =>
											setNewIngredient({
												...newIngredient,
												maxStockLevel: e.target.value
											})
										}
										placeholder="—"
										className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
									/>
								</div>
							</div>
						</div>
						
						<div className="mt-6 flex justify-end gap-2">
							<Button
								variant="ghost"
								onClick={() => setShowAddForm(false)}
								disabled={savingIngredient}
								className="border border-white/15"
							>
								Cancel
							</Button>
							<Button
								onClick={handleCreateIngredient}
								disabled={savingIngredient || !newIngredient.name.trim()}
							>
								{savingIngredient ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Saving…
									</>
								) : (
									<>
										<Plus className="mr-2 h-4 w-4" />
										Add Ingredient
									</>
								)}
							</Button>
						</div>
					</motion.div>
				</div>
			)}
		</div>
	)
}
