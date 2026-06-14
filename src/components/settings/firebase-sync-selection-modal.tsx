'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type SyncItem = {
	id: string
	name: string
	[key: string]: unknown
}

type SyncStatus = {
	[id: string]: 'pending' | 'syncing' | 'success' | 'error'
}

type FirebaseSyncSelectionModalProps = {
	isOpen: boolean
	onClose: () => void
	items: SyncItem[]
	type: 'orders' | 'menuItems' | 'customers'
	onSync: (selectedItems: SyncItem[]) => Promise<{
		success: boolean
		message: string
		ordersSynced?: number
		itemsSynced?: number
		categoriesSynced?: number
		customersSynced?: number
	}>
	onSuccess: () => void
}

export function FirebaseSyncSelectionModal({
	isOpen,
	onClose,
	items,
	type,
	onSync,
	onSuccess
}: FirebaseSyncSelectionModalProps) {
	const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
	const [syncing, setSyncing] = useState(false)
	const [syncStatus, setSyncStatus] = useState<SyncStatus>({})
	const [mounted, setMounted] = useState(false)
	const [showOnlyUnsynced, setShowOnlyUnsynced] = useState(false)

	useEffect(() => {
		setMounted(true)
		// Select all items by default when modal first opens
		if (isOpen && items.length > 0) {
			// If we have existing sync status, only select unsynced items
			// Otherwise select all
			const hasSyncStatus = Object.keys(syncStatus).length > 0
			const syncedCount = items.filter(
				(item) => syncStatus[item.id] === 'success'
			).length

			if (hasSyncStatus && syncedCount > 0) {
				const unsyncedIds = items
					.filter((item) => syncStatus[item.id] !== 'success')
					.map((item) => item.id)
				setSelectedItems(new Set(unsyncedIds))
				// Automatically show only unsynced if there are synced items
				setShowOnlyUnsynced(true)
			} else {
				setSelectedItems(new Set(items.map((item) => item.id)))
				setShowOnlyUnsynced(false)
			}
			// Don't reset syncStatus - preserve it across modal opens
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, items])

	// Filter items based on sync status - automatically hide synced items if any exist
	const hasSyncedItems = items.some((item) => syncStatus[item.id] === 'success')
	const shouldFilter = showOnlyUnsynced || hasSyncedItems

	const filteredItems = shouldFilter
		? items.filter((item) => {
				const status = syncStatus[item.id]
				return status !== 'success'
			})
		: items

	// Get counts
	const syncedCount = items.filter(
		(item) => syncStatus[item.id] === 'success'
	).length
	const unsyncedCount = items.length - syncedCount

	// Update selected items when filter changes - remove synced items from selection
	useEffect(() => {
		if (showOnlyUnsynced) {
			setSelectedItems((prev) => {
				const newSet = new Set<string>()
				prev.forEach((id) => {
					const status = syncStatus[id]
					if (status !== 'success') {
						newSet.add(id)
					}
				})
				return newSet
			})
		}
	}, [showOnlyUnsynced, syncStatus])

	if (!mounted || !isOpen) return null

	const toggleItem = (itemId: string) => {
		setSelectedItems((prev) => {
			const newSet = new Set(prev)
			if (newSet.has(itemId)) {
				newSet.delete(itemId)
			} else {
				newSet.add(itemId)
			}
			return newSet
		})
	}

	const selectAll = () => {
		setSelectedItems(new Set(filteredItems.map((item) => item.id)))
	}

	const deselectAll = () => {
		setSelectedItems(new Set())
	}

	const selectUnsynced = () => {
		const unsyncedIds = filteredItems
			.filter((item) => {
				const status = syncStatus[item.id]
				return status !== 'success'
			})
			.map((item) => item.id)
		setSelectedItems(new Set(unsyncedIds))
	}

	const handleSync = async () => {
		if (selectedItems.size === 0) {
			alert('Please select at least one item to sync')
			return
		}

		setSyncing(true)
		const itemsToSync = items.filter((item) => selectedItems.has(item.id))

		// Initialize selected items as pending, but preserve existing status for other items
		setSyncStatus((prev) => {
			const newStatus = { ...prev }
			itemsToSync.forEach((item) => {
				// Only set to pending if not already synced
				if (newStatus[item.id] !== 'success') {
					newStatus[item.id] = 'pending'
				}
			})
			return newStatus
		})

		let successCount = 0
		let errorCount = 0

		// Sync items one by one
		for (let i = 0; i < itemsToSync.length; i++) {
			const item = itemsToSync[i]

			// Mark current item as syncing
			setSyncStatus((prev) => ({
				...prev,
				[item.id]: 'syncing'
			}))

			try {
				// Sync single item
				const result = await onSync([item])

				// Update status for this item
				if (result.success) {
					setSyncStatus((prev) => ({
						...prev,
						[item.id]: 'success'
					}))
					successCount++
					// Automatically enable filter to hide synced items
					setShowOnlyUnsynced(true)
					// Remove from selection since it's now synced
					setSelectedItems((prev) => {
						const newSet = new Set(prev)
						newSet.delete(item.id)
						return newSet
					})
				} else {
					setSyncStatus((prev) => ({
						...prev,
						[item.id]: 'error'
					}))
					errorCount++
				}

				// Small delay to show progress
				await new Promise((resolve) => setTimeout(resolve, 100))
			} catch {
				// Mark as error
				setSyncStatus((prev) => ({
					...prev,
					[item.id]: 'error'
				}))
				errorCount++
			}
		}

		// Show completion message
		if (successCount > 0 && errorCount === 0) {
			setTimeout(() => {
				onSuccess()
				onClose()
			}, 1500)
		} else if (successCount > 0) {
			// Some succeeded, some failed
			alert(`${successCount} items synced successfully, ${errorCount} failed`)
		} else {
			// All failed
			alert(`Failed to sync ${errorCount} items`)
		}

		setSyncing(false)
	}

	const formatDate = (dateValue: unknown): string => {
		if (!dateValue) return 'N/A'
		if (typeof dateValue === 'string') {
			return new Date(dateValue).toLocaleDateString()
		}
		if (typeof dateValue === 'object' && 'seconds' in dateValue) {
			return new Date((dateValue.seconds as number) * 1000).toLocaleDateString()
		}
		return 'N/A'
	}

	const formatCurrency = (amount: number | undefined): string => {
		if (amount === undefined) return '₹0'
		return new Intl.NumberFormat('en-IN', {
			style: 'currency',
			currency: 'INR',
			minimumFractionDigits: 0
		}).format(amount)
	}

	const getItemDisplay = (item: SyncItem) => {
		if (type === 'orders') {
			const subtotal = (item.subtotal as number) || 0
			const total = (item.total as number) || subtotal
			const discountAmount = subtotal - total
			const hasDiscount = discountAmount > 0

			return {
				title: `Order ${item.orderNumber || item.id?.slice(0, 8) || 'N/A'}`,
				subtitle: formatDate(item.createdAt || item.timestamp || item.date),
				subtotal: formatCurrency(subtotal),
				total: formatCurrency(total),
				discountAmount: formatCurrency(discountAmount),
				hasDiscount,
				items:
					(item.items as Array<{
						menuItemName?: string
						name?: string
						price?: number
						quantity?: number
						selectedToppings?: Array<{
							toppingName?: string
							price?: number
							quantity?: number
						}>
					}>) || []
			}
		} else if (type === 'customers') {
			return {
				title: (item.name as string) || 'Unknown Customer',
				subtitle: (item.phone as string) || (item.email as string) || 'No contact info',
				amount: `${(item.loyaltyPoints as number) || 0} pts`
			}
		} else {
			return {
				title: (item.name as string) || 'Unknown Item',
				subtitle:
					(item.categoryName as string) ||
					(item.category as string) ||
					'Uncategorized',
				amount: formatCurrency(
					(item.basePrice as number) || (item.price as number) || 0
				)
			}
		}
	}

	const modalContent = (
		<div className="fixed inset-0 z-[9999]">
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>
			<motion.div
				initial={{ opacity: 0, x: 80 }}
				animate={{ opacity: 1, x: 0 }}
				exit={{ opacity: 0, x: 80 }}
				className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 shadow-[0_40px_120px_rgba(3,5,18,0.85)]"
			>
				<div className="flex items-center justify-between mb-6">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-white/50">
							Firebase Sync
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							Select {type === 'orders' ? 'Orders' : type === 'customers' ? 'Customers' : 'Menu Items'} to Sync
						</h2>
						<p className="mt-2 text-sm text-white/60">
							{items.length} {type === 'orders' ? 'orders' : type === 'customers' ? 'customers' : 'items'} found
						</p>
					</div>
					<button
						onClick={onClose}
						className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				{/* Selection Controls */}
				<div className="mb-6 space-y-3">
					<div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-4">
						<div className="flex items-center gap-4">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={selectAll}
								disabled={syncing}
							>
								Select All
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={deselectAll}
								disabled={syncing}
							>
								Deselect All
							</Button>
							{syncedCount > 0 && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={selectUnsynced}
									disabled={syncing}
									className="text-amber-400 hover:text-amber-300"
								>
									Select Unsynced
								</Button>
							)}
						</div>
						<div className="text-sm text-white/70">
							{selectedItems.size} of {filteredItems.length} selected
						</div>
					</div>
					{syncedCount > 0 && (
						<div className="flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
							<div className="flex items-center gap-3 flex-1">
								<CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
								<div>
									<p className="text-sm font-medium text-white">
										{syncedCount} items synced successfully
									</p>
									<p className="text-xs text-white/70 mt-0.5">
										Showing only {unsyncedCount} unsynced items (synced items
										are hidden)
									</p>
								</div>
							</div>
							{shouldFilter && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => {
										setShowOnlyUnsynced(false)
										// Select all items when showing all
										setSelectedItems(new Set(items.map((item) => item.id)))
									}}
									className="text-white/70 hover:text-white"
								>
									Show All ({items.length})
								</Button>
							)}
						</div>
					)}
				</div>

				{/* Items List */}
				<div className="space-y-2 mb-6 max-h-[60vh] overflow-y-auto">
					<AnimatePresence>
						{filteredItems.length === 0 ? (
							<div className="text-center py-8 text-white/60">
								<CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-400" />
								<p className="text-lg font-medium">All items synced!</p>
								<p className="text-sm mt-1">
									All {type === 'orders' ? 'orders' : type === 'customers' ? 'customers' : 'items'} have been
									successfully synced.
								</p>
							</div>
						) : (
							filteredItems.map((item) => {
								const isSelected = selectedItems.has(item.id)
								const status = syncStatus[item.id] || 'pending'
								const display = getItemDisplay(item)

								return (
									<motion.div
										key={item.id}
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: -10 }}
										className={`rounded-xl border p-4 transition-all ${
											isSelected
												? 'border-white/30 bg-white/10'
												: 'border-white/10 bg-black/20'
										} ${
											status === 'success'
												? 'border-emerald-500/50 bg-emerald-500/10'
												: status === 'error'
													? 'border-red-500/50 bg-red-500/10'
													: ''
										}`}
									>
										<div className="flex items-start gap-4">
											<button
												type="button"
												onClick={() => !syncing && toggleItem(item.id)}
												disabled={syncing}
												className="mt-1 shrink-0"
											>
												{status === 'success' ? (
													<CheckCircle2 className="h-5 w-5 text-emerald-400" />
												) : status === 'syncing' ? (
													<Loader2 className="h-5 w-5 animate-spin text-blue-400" />
												) : status === 'error' ? (
													<AlertCircle className="h-5 w-5 text-red-400" />
												) : isSelected ? (
													<CheckCircle2 className="h-5 w-5 text-white" />
												) : (
													<Circle className="h-5 w-5 text-white/40" />
												)}
											</button>
											<div className="flex-1 min-w-0">
												<h3 className="font-semibold text-white truncate">
													{display.title}
												</h3>
												<p className="text-sm text-white/60 mt-1">
													{display.subtitle}
												</p>
												{type === 'orders' && (
													<>
														<p className="text-xs text-white/50 mt-1">
															Status: {(item.status as string) || 'N/A'} •
															Payment: {(item.paymentMethod as string) || 'N/A'}
														</p>
														{/* Menu Items List */}
														{display.items && display.items.length > 0 && (
															<div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-black/30 p-3">
																<p className="text-xs font-medium text-white/70 mb-2">
																	Menu Items ({display.items.length}):
																</p>
																{display.items.map((orderItem, idx) => {
																	const itemName =
																		orderItem.menuItemName ||
																		orderItem.name ||
																		'Unknown Item'
																	const itemPrice = orderItem.price || 0
																	const quantity = orderItem.quantity || 1
																	const itemTotal = itemPrice * quantity
																	const toppings =
																		orderItem.selectedToppings || []
																	const toppingsTotal = toppings.reduce(
																		(sum, t) =>
																			sum + (t.price || 0) * (t.quantity || 1),
																		0
																	)

																	return (
																		<div
																			key={idx}
																			className="text-xs text-white/60 space-y-1"
																		>
																			<div className="flex items-start justify-between">
																				<div className="flex-1">
																					<p className="text-white/80 font-medium">
																						{itemName} × {quantity}
																					</p>
																					{toppings.length > 0 && (
																						<div className="ml-3 mt-1 space-y-0.5">
																							{toppings.map((topping, tIdx) => (
																								<p
																									key={tIdx}
																									className="text-white/50"
																								>
																									+{' '}
																									{topping.toppingName ||
																										'Topping'}{' '}
																									× {topping.quantity || 1}
																								</p>
																							))}
																						</div>
																					)}
																				</div>
																				<div className="text-right ml-4">
																					<p className="text-white/80">
																						{formatCurrency(
																							itemTotal + toppingsTotal
																						)}
																					</p>
																				</div>
																			</div>
																		</div>
																	)
																})}
															</div>
														)}
													</>
												)}
											</div>
											<div className="text-right shrink-0">
												{type === 'orders' && display.hasDiscount ? (
													<div>
														<p className="text-xs text-white/50 line-through">
															{display.subtotal}
														</p>
														<p className="font-semibold text-white">
															{display.total}
														</p>
														<p className="text-xs text-emerald-400 mt-1">
															-{display.discountAmount} discount
														</p>
													</div>
												) : (
													<p className="font-semibold text-white">
														{type === 'orders' ? display.total : display.amount}
													</p>
												)}
												{type === 'orders' && (
													<p className="text-xs text-white/50 mt-1">
														{display.items?.length || 0} items
													</p>
												)}
											</div>
										</div>
										{status === 'error' && (
											<p className="mt-2 text-xs text-red-400">
												Failed to sync
											</p>
										)}
										{status === 'success' && (
											<p className="mt-2 text-xs text-emerald-400">
												Synced successfully
											</p>
										)}
									</motion.div>
								)
							})
						)}
					</AnimatePresence>
				</div>

				{/* Actions */}
				<div className="flex justify-end gap-3 pt-4 border-t border-white/10">
					<Button
						type="button"
						variant="ghost"
						onClick={onClose}
						disabled={syncing}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleSync}
						disabled={
							syncing || selectedItems.size === 0 || filteredItems.length === 0
						}
					>
						{syncing ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Syncing...
							</>
						) : (
							`Sync ${selectedItems.size} ${type === 'orders' ? 'Orders' : type === 'customers' ? 'Customers' : 'Items'}`
						)}
					</Button>
				</div>
			</motion.div>
		</div>
	)

	return createPortal(modalContent, document.body)
}
