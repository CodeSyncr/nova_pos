'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CustomSelect } from '@/components/ui/select'
import { createPurchase } from '@/app/actions/purchases'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type Purchase = {
	id: string
	supplier_id: string | null
	purchase_date: string
	invoice_number: string | null
	notes: string | null
}

type Supplier = {
	id: string
	name: string
}

type Ingredient = {
	id: string
	name: string
	unit: string | null
}

type PurchaseItem = {
	ingredientId: string
	quantity: string
	unit: string
	unitPrice: string
	totalPrice: string
	expiryDate: string
	batchNumber: string
}

type PurchaseFormProps = {
	tenantId: string
	purchase?: Purchase | null
	onClose: () => void
	onSuccess: () => void
}

export function PurchaseForm({
	tenantId,
	purchase,
	onClose,
	onSuccess
}: PurchaseFormProps) {
	const [suppliers, setSuppliers] = useState<Supplier[]>([])
	const [ingredients, setIngredients] = useState<Ingredient[]>([])
	const [selectedSupplierId, setSelectedSupplierId] = useState<string>('')
	const [purchaseDate, setPurchaseDate] = useState(
		new Date().toISOString().split('T')[0]
	)
	const [invoiceNumber, setInvoiceNumber] = useState('')
	const [notes, setNotes] = useState('')
	const [purchaseType, setPurchaseType] = useState<'items' | 'amount'>('amount')
	const [directAmount, setDirectAmount] = useState('')
	const [items, setItems] = useState<PurchaseItem[]>([
		{
			ingredientId: '',
			quantity: '',
			unit: '',
			unitPrice: '',
			totalPrice: '',
			expiryDate: '',
			batchNumber: ''
		}
	])
	const [saving, setSaving] = useState(false)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
		const loadData = async () => {
			try {
				const supabase = createSupabaseBrowserClient()

				// Load suppliers
				const { data: suppliersData } = await supabase
					.from('suppliers')
					.select('id, name')
					.eq('tenant_id', tenantId)
					.eq('is_active', true)
					.order('name')

				setSuppliers((suppliersData as Supplier[]) || [])

				// Load ingredients
				const { data: ingredientsData } = await supabase
					.from('ingredients')
					.select('id, name, unit')
					.eq('tenant_id', tenantId)
					.order('name')

				setIngredients((ingredientsData as Ingredient[]) || [])
			} catch (error) {
				console.error('Error loading data:', error)
			}
		}

		loadData()
	}, [tenantId])

	const addItem = () => {
		setItems([
			...items,
			{
				ingredientId: '',
				quantity: '',
				unit: '',
				unitPrice: '',
				totalPrice: '',
				expiryDate: '',
				batchNumber: ''
			}
		])
	}

	const removeItem = (index: number) => {
		setItems(items.filter((_, i) => i !== index))
	}

	const updateItem = (
		index: number,
		field: keyof PurchaseItem,
		value: string
	) => {
		const newItems = [...items]
		newItems[index] = { ...newItems[index], [field]: value }

		// Auto-set unit from ingredient
		if (field === 'ingredientId') {
			const ingredient = ingredients.find((i) => i.id === value)
			if (ingredient) {
				newItems[index].unit = ingredient.unit || 'pieces'
			}
		}

		// Calculate total price
		if (field === 'quantity' || field === 'unitPrice') {
			const qty = parseFloat(newItems[index].quantity) || 0
			const price = parseFloat(newItems[index].unitPrice) || 0
			newItems[index].totalPrice = (qty * price).toFixed(2)
		}

		setItems(newItems)
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		try {
			if (purchaseType === 'amount') {
				// Amount-only purchase
				const amount = parseFloat(directAmount)
				if (!amount || amount <= 0) {
					alert('Please enter a valid amount')
					setSaving(false)
					return
				}

				await createPurchase(tenantId, {
					supplierId: selectedSupplierId || null,
					purchaseDate,
					invoiceNumber: invoiceNumber || undefined,
					notes: notes || undefined,
					items: [],
					totalAmount: amount
				})
			} else {
				// Item-based purchase
				const purchaseItems = items
					.filter((item) => item.ingredientId && item.quantity)
					.map((item) => ({
						ingredientId: item.ingredientId,
						quantity: parseFloat(item.quantity),
						unit: item.unit,
						unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : undefined,
						totalPrice: item.totalPrice
							? parseFloat(item.totalPrice)
							: undefined,
						expiryDate: item.expiryDate || undefined,
						batchNumber: item.batchNumber || undefined
					}))

				if (purchaseItems.length === 0) {
					alert('Please add at least one item to the purchase')
					setSaving(false)
					return
				}

				await createPurchase(tenantId, {
					supplierId: selectedSupplierId || null,
					purchaseDate,
					invoiceNumber: invoiceNumber || undefined,
					notes: notes || undefined,
					items: purchaseItems
				})
			}

			onSuccess()
		} catch (error) {
			console.error('Error creating purchase:', error)
			alert(
				error instanceof Error ? error.message : 'Failed to create purchase'
			)
		} finally {
			setSaving(false)
		}
	}

	if (!mounted) return null

	const totalAmount =
		purchaseType === 'amount'
			? parseFloat(directAmount) || 0
			: items.reduce((sum, item) => {
					return sum + (parseFloat(item.totalPrice) || 0)
				}, 0)

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
							Stock purchase
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							{purchase ? 'Edit Purchase' : 'New Purchase'}
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
					{/* Purchase Details */}
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="block text-sm font-medium text-white mb-2">
								Purchase Date
							</label>
							<input
								type="date"
								value={purchaseDate}
								onChange={(e) => setPurchaseDate(e.target.value)}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								required
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-white mb-2">
								Invoice Number (optional)
							</label>
							<input
								type="text"
								value={invoiceNumber}
								onChange={(e) => setInvoiceNumber(e.target.value)}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="INV-001"
							/>
						</div>
					</div>

					{/* Purchase Type Toggle */}
					<div>
						<label className="block text-sm font-medium text-white mb-2">
							Purchase Type
						</label>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => setPurchaseType('amount')}
								className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition ${
									purchaseType === 'amount'
										? 'border-white/30 bg-white/10 text-white'
										: 'border-white/10 bg-black/30 text-white/60 hover:bg-black/40'
								}`}
							>
								Amount Only
							</button>
							<button
								type="button"
								onClick={() => setPurchaseType('items')}
								className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition ${
									purchaseType === 'items'
										? 'border-white/30 bg-white/10 text-white'
										: 'border-white/10 bg-black/30 text-white/60 hover:bg-black/40'
								}`}
							>
								With Items
							</button>
						</div>
					</div>

					{/* Supplier */}
					<div>
						<label className="block text-sm font-medium text-white mb-2">
							Supplier (optional - leave empty for local purchase)
						</label>
						<CustomSelect
							value={selectedSupplierId}
							onChange={setSelectedSupplierId}
							options={[
								{ value: '', label: 'Local Purchase', description: 'No supplier / local purchase' },
								...suppliers.map((supplier) => ({
									value: supplier.id,
									label: supplier.name,
									description: 'Supplier'
								}))
							]}
							placeholder="Select supplier"
						/>
						<p className="mt-1 text-xs text-white/60">
							Select a supplier or leave empty for local purchases
						</p>
					</div>

					{/* Direct Amount Input (for amount-only purchases) */}
					{purchaseType === 'amount' && (
						<div>
							<label className="block text-sm font-medium text-white mb-2">
								Amount (₹) *
							</label>
							<input
								type="number"
								step="0.01"
								min="0"
								value={directAmount}
								onChange={(e) => setDirectAmount(e.target.value)}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="0.00"
								required
							/>
						</div>
					)}

					{/* Purchase Items */}
					{purchaseType === 'items' && (
						<div>
							<div className="flex items-center justify-between mb-4">
								<label className="block text-sm font-medium text-white">
									Purchase Items
								</label>
								<Button
									type="button"
									onClick={addItem}
									size="sm"
									variant="ghost"
								>
									<Plus className="h-4 w-4 mr-1" />
									Add Item
								</Button>
							</div>
							<div className="space-y-4">
								{items.map((item, index) => (
									<div
										key={index}
										className="rounded-xl border border-white/10 bg-black/20 p-4"
									>
										<div className="flex items-start justify-between mb-3">
											<span className="text-sm font-medium text-white/70">
												Item {index + 1}
											</span>
											{items.length > 1 && (
												<Button
													type="button"
													onClick={() => removeItem(index)}
													size="sm"
													variant="ghost"
													className="text-red-400 hover:text-red-300"
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											)}
										</div>
										<div className="grid gap-3 md:grid-cols-2">
											<div>
												<label className="block text-xs text-white/60 mb-1">
													Ingredient *
												</label>
												<CustomSelect
													value={item.ingredientId}
													onChange={(val) =>
														updateItem(index, 'ingredientId', val)
													}
													options={[
														{ value: '', label: 'Select ingredient', description: 'Choose raw material' },
														...ingredients.map((ing) => ({
															value: ing.id,
															label: ing.name,
															description: `Unit: ${ing.unit || 'units'}`
														}))
													]}
													placeholder="Select ingredient"
												/>
											</div>
											<div>
												<label className="block text-xs text-white/60 mb-1">
													Quantity *
												</label>
												<input
													type="number"
													step="0.001"
													min="0"
													value={item.quantity}
													onChange={(e) =>
														updateItem(index, 'quantity', e.target.value)
													}
													className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
													placeholder="0"
													required
												/>
											</div>
											<div>
												<label className="block text-xs text-white/60 mb-1">
													Unit *
												</label>
												<input
													type="text"
													value={item.unit}
													onChange={(e) =>
														updateItem(index, 'unit', e.target.value)
													}
													className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
													placeholder="kg, g, ml, pieces"
													required
												/>
											</div>
											<div>
												<label className="block text-xs text-white/60 mb-1">
													Unit Price (₹)
												</label>
												<input
													type="number"
													step="0.01"
													min="0"
													value={item.unitPrice}
													onChange={(e) =>
														updateItem(index, 'unitPrice', e.target.value)
													}
													className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
													placeholder="0.00"
												/>
											</div>
											<div>
												<label className="block text-xs text-white/60 mb-1">
													Expiry Date
												</label>
												<input
													type="date"
													value={item.expiryDate}
													onChange={(e) =>
														updateItem(index, 'expiryDate', e.target.value)
													}
													className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
												/>
											</div>
											<div>
												<label className="block text-xs text-white/60 mb-1">
													Batch Number
												</label>
												<input
													type="text"
													value={item.batchNumber}
													onChange={(e) =>
														updateItem(index, 'batchNumber', e.target.value)
													}
													className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
													placeholder="BATCH-001"
												/>
											</div>
										</div>
										{item.totalPrice && parseFloat(item.totalPrice) > 0 && (
											<div className="mt-2 text-sm text-white/60">
												Total: ₹{parseFloat(item.totalPrice).toFixed(2)}
											</div>
										)}
									</div>
								))}
							</div>
						</div>
					)}

					{/* Notes */}
					<div>
						<label className="block text-sm font-medium text-white mb-2">
							{purchaseType === 'amount'
								? 'Purpose of Spending *'
								: 'Notes (optional)'}
						</label>
						<textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							rows={3}
							placeholder={
								purchaseType === 'amount'
									? 'Describe the purpose of this expense...'
									: 'Additional notes about this purchase...'
							}
							required={purchaseType === 'amount'}
						/>
						{purchaseType === 'amount' && (
							<p className="mt-1 text-xs text-white/60">
								Please describe what this purchase is for
							</p>
						)}
					</div>

					{/* Total */}
					<div className="rounded-xl border border-white/10 bg-white/5 p-4">
						<div className="flex items-center justify-between">
							<span className="text-lg font-semibold text-white">
								Total Amount
							</span>
							<span className="text-2xl font-bold text-white">
								₹{totalAmount.toFixed(2)}
							</span>
						</div>
					</div>

					<div className="flex justify-end gap-3 pt-4">
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? 'Saving...' : 'Create Purchase'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)

	return createPortal(modalContent, document.body)
}
