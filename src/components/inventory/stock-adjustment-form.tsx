'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { adjustInventory } from '@/app/actions/inventory'

type InventoryItem = {
	id: string
	current_stock: number
	unit: string
	ingredient: {
		id: string
		name: string
		unit: string
	} | null
}

type StockAdjustmentFormProps = {
	tenantId: string
	inventoryItem: InventoryItem
	onClose: () => void
	onSuccess: () => void
}

export function StockAdjustmentForm({
	tenantId,
	inventoryItem,
	onClose,
	onSuccess
}: StockAdjustmentFormProps) {
	const [adjustmentType, setAdjustmentType] = useState<'add' | 'remove'>('add')
	const [quantity, setQuantity] = useState('')
	const [notes, setNotes] = useState('')
	const [saving, setSaving] = useState(false)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		try {
			const qty = parseFloat(quantity)
			if (isNaN(qty) || qty <= 0) {
				alert('Please enter a valid quantity')
				return
			}

			const adjustmentQuantity = adjustmentType === 'add' ? qty : -qty

			await adjustInventory(
				tenantId,
				inventoryItem.ingredient?.id || '',
				adjustmentQuantity,
				inventoryItem.unit,
				adjustmentType === 'add' ? 'adjustment' : 'waste',
				notes || undefined
			)

			onSuccess()
		} catch (error) {
			console.error('Error adjusting inventory:', error)
			alert(
				error instanceof Error ? error.message : 'Failed to adjust inventory'
			)
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
							Stock adjustment
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							{inventoryItem.ingredient?.name || 'Unknown'}
						</h2>
						<p className="text-sm text-white/60 mt-1">
							Current: {inventoryItem.current_stock} {inventoryItem.unit}
						</p>
					</div>
					<button
						onClick={onClose}
						className="rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-6 pb-6">
					{/* Adjustment Type */}
					<div>
						<label className="block text-sm font-medium text-white mb-3">
							Adjustment Type
						</label>
						<div className="grid grid-cols-2 gap-3">
							<button
								type="button"
								onClick={() => setAdjustmentType('add')}
								className={`flex items-center justify-center gap-2 rounded-xl border p-4 transition ${
									adjustmentType === 'add'
										? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300'
										: 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
								}`}
							>
								<TrendingUp className="h-5 w-5" />
								<span>Add Stock</span>
							</button>
							<button
								type="button"
								onClick={() => setAdjustmentType('remove')}
								className={`flex items-center justify-center gap-2 rounded-xl border p-4 transition ${
									adjustmentType === 'remove'
										? 'border-red-400/50 bg-red-500/10 text-red-300'
										: 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
								}`}
							>
								<TrendingDown className="h-5 w-5" />
								<span>Remove Stock</span>
							</button>
						</div>
					</div>

					{/* Quantity */}
					<div>
						<label className="block text-sm font-medium text-white mb-2">
							Quantity ({inventoryItem.unit})
						</label>
						<input
							type="number"
							step="0.001"
							min="0"
							value={quantity}
							onChange={(e) => setQuantity(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="0.00"
							required
						/>
						{adjustmentType === 'remove' && quantity && (
							<p className="mt-2 text-sm text-white/60">
								New stock will be:{' '}
								<span
									className={
										inventoryItem.current_stock - parseFloat(quantity) < 0
											? 'text-red-400'
											: 'text-white'
									}
								>
									{Math.max(
										0,
										inventoryItem.current_stock - parseFloat(quantity)
									)}{' '}
									{inventoryItem.unit}
								</span>
							</p>
						)}
						{adjustmentType === 'add' && quantity && (
							<p className="mt-2 text-sm text-white/60">
								New stock will be:{' '}
								<span className="text-emerald-400">
									{inventoryItem.current_stock + parseFloat(quantity)}{' '}
									{inventoryItem.unit}
								</span>
							</p>
						)}
					</div>

					{/* Notes */}
					<div>
						<label className="block text-sm font-medium text-white mb-2">
							Notes (optional)
						</label>
						<textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							rows={3}
							placeholder="Reason for adjustment..."
						/>
					</div>

					<div className="flex justify-end gap-3 pt-4">
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? 'Saving...' : 'Apply Adjustment'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)

	return createPortal(modalContent, document.body)
}
