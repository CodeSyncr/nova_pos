'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupplier, updateSupplier } from '@/app/actions/suppliers'

type Supplier = {
	id: string
	name: string
	contact_person: string | null
	email: string | null
	phone: string | null
	address: Record<string, unknown> | null
	notes: string | null
	is_active: boolean
}

type SupplierFormProps = {
	tenantId: string
	supplier?: Supplier | null
	onClose: () => void
	onSuccess: () => void
}

export function SupplierForm({
	tenantId,
	supplier,
	onClose,
	onSuccess
}: SupplierFormProps) {
	const [formData, setFormData] = useState({
		name: supplier?.name || '',
		contactPerson: supplier?.contact_person || '',
		email: supplier?.email || '',
		phone: supplier?.phone || '',
		address: {
			street: (supplier?.address as { street?: string })?.street || '',
			city: (supplier?.address as { city?: string })?.city || '',
			state: (supplier?.address as { state?: string })?.state || '',
			pincode: (supplier?.address as { pincode?: string })?.pincode || '',
			country: (supplier?.address as { country?: string })?.country || ''
		},
		notes: supplier?.notes || '',
		isActive: supplier?.is_active ?? true
	})
	const [saving, setSaving] = useState(false)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setSaving(true)

		try {
			if (supplier) {
				await updateSupplier(supplier.id, formData)
			} else {
				await createSupplier(tenantId, formData)
			}
			onSuccess()
		} catch (error) {
			console.error('Error saving supplier:', error)
			alert(error instanceof Error ? error.message : 'Failed to save supplier')
		} finally {
			setSaving(false)
		}
	}

	const handleAddressChange = (field: string, value: string) => {
		setFormData({
			...formData,
			address: {
				...formData.address,
				[field]: value
			}
		})
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
				className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#121633] via-[#060915] to-[#030308] p-8 shadow-[0_40px_120px_rgba(3,5,18,0.85)]"
			>
				<div className="flex items-center justify-between mb-6">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-white/50">
							Supplier management
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							{supplier ? 'Edit Supplier' : 'New Supplier'}
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
					{/* Basic Info */}
					<div className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-white mb-2">
								Supplier Name *
							</label>
							<input
								type="text"
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="ABC Food Supplies"
								required
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-white mb-2">
								Contact Person
							</label>
							<input
								type="text"
								value={formData.contactPerson}
								onChange={(e) =>
									setFormData({ ...formData, contactPerson: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="John Doe"
							/>
						</div>
					</div>

					{/* Contact Info */}
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="block text-sm font-medium text-white mb-2">
								Email
							</label>
							<input
								type="email"
								value={formData.email}
								onChange={(e) =>
									setFormData({ ...formData, email: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="supplier@example.com"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-white mb-2">
								Phone
							</label>
							<input
								type="tel"
								value={formData.phone}
								onChange={(e) =>
									setFormData({ ...formData, phone: e.target.value })
								}
								className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
								placeholder="+1 234 567 8900"
							/>
						</div>
					</div>

					{/* Address */}
					<div>
						<label className="block text-sm font-medium text-white mb-3">
							Address (optional)
						</label>
						<div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
							<div>
								<input
									type="text"
									value={formData.address.street}
									onChange={(e) =>
										handleAddressChange('street', e.target.value)
									}
									className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="Street address"
								/>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								<input
									type="text"
									value={formData.address.city}
									onChange={(e) => handleAddressChange('city', e.target.value)}
									className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="City"
								/>
								<input
									type="text"
									value={formData.address.state}
									onChange={(e) => handleAddressChange('state', e.target.value)}
									className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="State"
								/>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								<input
									type="text"
									value={formData.address.pincode}
									onChange={(e) =>
										handleAddressChange('pincode', e.target.value)
									}
									className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="Pincode"
								/>
								<input
									type="text"
									value={formData.address.country}
									onChange={(e) =>
										handleAddressChange('country', e.target.value)
									}
									className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
									placeholder="Country"
								/>
							</div>
						</div>
					</div>

					{/* Notes */}
					<div>
						<label className="block text-sm font-medium text-white mb-2">
							Notes (optional)
						</label>
						<textarea
							value={formData.notes}
							onChange={(e) =>
								setFormData({ ...formData, notes: e.target.value })
							}
							className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							rows={3}
							placeholder="Additional notes about this supplier..."
						/>
					</div>

					<div className="flex justify-end gap-3 pt-4">
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving
								? 'Saving...'
								: supplier
									? 'Update Supplier'
									: 'Create Supplier'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)

	return createPortal(modalContent, document.body)
}
