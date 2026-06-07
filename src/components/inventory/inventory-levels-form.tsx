'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateInventoryLevels } from '@/app/actions/inventory'

type InventoryItem = {
	id: string
	current_stock: number
	unit: string
	min_stock_level: number
	max_stock_level: number | null
	location: string | null
	ingredient: {
		id: string
		name: string
		unit: string
	} | null
}

type InventoryLevelsFormProps = {
	inventoryItem: InventoryItem
	onClose: () => void
	onSuccess: () => void
}

export function InventoryLevelsForm({
	inventoryItem,
	onClose,
	onSuccess
}: InventoryLevelsFormProps) {
	const [minStockLevel, setMinStockLevel] = useState(
		inventoryItem.min_stock_level.toString()
	)
	const [maxStockLevel, setMaxStockLevel] = useState(
		inventoryItem.max_stock_level?.toString() || ''
	)
	const [location, setLocation] = useState(inventoryItem.location || '')
	const [saving, setSaving] = useState(false)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		try {
			await updateInventoryLevels(
				inventoryItem.id,
				parseFloat(minStockLevel) || undefined,
				maxStockLevel ? parseFloat(maxStockLevel) : undefined,
				location || undefined
			)

			onSuccess()
		} catch (error) {
			console.error('Error updating inventory levels:', error)
			alert(error instanceof Error ? error.message : 'Failed to update levels')
		} finally {
			setSaving(false)
		}
	}

	if (!mounted) return null

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
				className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 shadow-[0_40px_120px_rgba(3,5,18,0.85)]"
			>
				<div className="flex items-center justify-between mb-6">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-white/50">
							Stock levels
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							{inventoryItem.ingredient?.name || 'Unknown'}
						</h2>
					</div>
					<button
						onClick={onClose}
						className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-6 pb-6">
					{/* Min Stock Level */}
					<div>
						<label className="block text-sm font-medium text-white mb-2">
							Minimum Stock Level ({inventoryItem.unit})
						</label>
						<input
							type="number"
							step="0.001"
							min="0"
							value={minStockLevel}
							onChange={(e) => setMinStockLevel(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="0"
							required
						/>
						<p className="mt-1 text-xs text-white/60">
							Alert will trigger when stock falls below this level
						</p>
					</div>

					{/* Max Stock Level */}
					<div>
						<label className="block text-sm font-medium text-white mb-2">
							Maximum Stock Level ({inventoryItem.unit}) - Optional
						</label>
						<input
							type="number"
							step="0.001"
							min="0"
							value={maxStockLevel}
							onChange={(e) => setMaxStockLevel(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="Leave empty for no limit"
						/>
						<p className="mt-1 text-xs text-white/60">
							Maximum storage capacity (optional)
						</p>
					</div>

					{/* Location */}
					<div>
						<label className="block text-sm font-medium text-white mb-2">
							Storage Location - Optional
						</label>
						<input
							type="text"
							value={location}
							onChange={(e) => setLocation(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="e.g., Freezer A, Shelf 3"
						/>
						<p className="mt-1 text-xs text-white/60">
							Physical location where this item is stored
						</p>
					</div>

					<div className="flex justify-end gap-3 pt-4">
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? 'Saving...' : 'Save Levels'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)

	return createPortal(modalContent, document.body)
}
