'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
	Building2,
	Plus,
	Edit,
	Trash2,
	Mail,
	Phone,
	MapPin,
	CheckCircle2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSuppliers, deleteSupplier } from '@/app/actions/suppliers'
import { SupplierForm } from '@/components/settings/supplier-form'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle
} from '@/components/ui/alert-dialog'

type Supplier = {
	id: string
	name: string
	contact_person: string | null
	email: string | null
	phone: string | null
	address: Record<string, unknown> | null
	notes: string | null
	is_active: boolean
	created_at: string
}

type SuppliersTabProps = {
	tenantId: string
	onRefresh: () => void
}

export function SuppliersTab({ tenantId, onRefresh }: SuppliersTabProps) {
	const [suppliers, setSuppliers] = useState<Supplier[]>([])
	const [loading, setLoading] = useState(true)
	const [showForm, setShowForm] = useState(false)
	const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
	const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(
		null
	)

	useEffect(() => {
		loadSuppliers()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tenantId])

	const loadSuppliers = async () => {
		try {
			const data = await getSuppliers(tenantId)
			setSuppliers((data as Supplier[]) || [])
		} catch (error) {
			console.error('Error loading suppliers:', error)
		} finally {
			setLoading(false)
		}
	}

	const handleDelete = async () => {
		if (!deletingSupplier) return

		try {
			await deleteSupplier(deletingSupplier.id)
			setDeletingSupplier(null)
			loadSuppliers()
			onRefresh()
		} catch (error) {
			console.error('Error deleting supplier:', error)
			alert(
				error instanceof Error ? error.message : 'Failed to delete supplier'
			)
		}
	}

	if (loading) {
		return <p className="text-white/60">Loading suppliers...</p>
	}

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-xl font-semibold text-white">
						Suppliers & Vendors
					</h3>
					<p className="text-sm text-white/60 mt-1">
						Manage your suppliers and vendors for purchase tracking
					</p>
				</div>
				<Button onClick={() => setShowForm(true)}>
					<Plus className="mr-2 h-4 w-4" />
					New Supplier
				</Button>
			</div>

			{suppliers.length === 0 ? (
				<div className="text-center py-16 rounded-xl border border-white/10 bg-black/20">
					<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20">
						<Building2 className="h-10 w-10 text-white/40" />
					</div>
					<h3 className="text-xl font-semibold text-white mb-2">
						No suppliers yet
					</h3>
					<p className="text-white/60 max-w-md mx-auto mb-6">
						Add suppliers to track purchases and manage vendor relationships.
						You can still create purchases without suppliers for local
						purchases.
					</p>
					<Button
						onClick={() => setShowForm(true)}
						variant="ghost"
						className="border border-white/20"
					>
						<Plus className="mr-2 h-4 w-4" />
						Add First Supplier
					</Button>
				</div>
			) : (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					<AnimatePresence>
						{suppliers.map((supplier) => (
							<motion.div
								key={supplier.id}
								initial={{ opacity: 0, scale: 0.95 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.95 }}
								whileHover={{ scale: 1.02 }}
								className="rounded-xl border border-white/10 bg-gradient-to-br from-black/40 to-black/20 p-6 backdrop-blur-sm hover:border-white/20 transition"
							>
								<div className="flex items-start justify-between mb-4">
									<div className="flex items-center gap-3">
										<div className="rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 p-3">
											<Building2 className="h-5 w-5 text-violet-300" />
										</div>
										<div>
											<h4 className="text-lg font-semibold text-white">
												{supplier.name}
											</h4>
											{supplier.is_active ? (
												<div className="flex items-center gap-1 text-xs text-emerald-400 mt-1">
													<CheckCircle2 className="h-3 w-3" />
													<span>Active</span>
												</div>
											) : (
												<div className="text-xs text-white/50 mt-1">
													Inactive
												</div>
											)}
										</div>
									</div>
								</div>

								<div className="space-y-2 mb-4">
									{supplier.contact_person && (
										<div className="flex items-center gap-2 text-sm text-white/70">
											<span className="text-white/50">Contact:</span>
											<span>{supplier.contact_person}</span>
										</div>
									)}
									{supplier.email && (
										<div className="flex items-center gap-2 text-sm text-white/70">
											<Mail className="h-3 w-3 text-white/50" />
											<span>{supplier.email}</span>
										</div>
									)}
									{supplier.phone && (
										<div className="flex items-center gap-2 text-sm text-white/70">
											<Phone className="h-3 w-3 text-white/50" />
											<span>{supplier.phone}</span>
										</div>
									)}
									{supplier.address && (
										<div className="flex items-start gap-2 text-sm text-white/70">
											<MapPin className="h-3 w-3 text-white/50 mt-0.5" />
											<div>
												{Object.values(supplier.address)
													.filter((v) => v)
													.join(', ')}
											</div>
										</div>
									)}
								</div>

								{supplier.notes && (
									<p className="text-xs text-white/50 mb-4 pl-2 border-l-2 border-white/10">
										{supplier.notes}
									</p>
								)}

								<div className="flex gap-2 pt-4 border-t border-white/10">
									<Button
										size="sm"
										variant="ghost"
										onClick={() => {
											setEditingSupplier(supplier)
											setShowForm(true)
										}}
										className="flex-1 border border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
									>
										<Edit className="h-3 w-3 mr-1" />
										Edit
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => setDeletingSupplier(supplier)}
										className="border border-red-400/20 bg-red-400/10 text-red-300 hover:bg-red-400/20"
									>
										<Trash2 className="h-3 w-3" />
									</Button>
								</div>
							</motion.div>
						))}
					</AnimatePresence>
				</div>
			)}

			{/* Forms */}
			{showForm && (
				<SupplierForm
					tenantId={tenantId}
					supplier={editingSupplier}
					onClose={() => {
						setShowForm(false)
						setEditingSupplier(null)
					}}
					onSuccess={() => {
						setShowForm(false)
						setEditingSupplier(null)
						loadSuppliers()
						onRefresh()
					}}
				/>
			)}

			{/* Delete Confirmation */}
			{deletingSupplier && (
				<AlertDialog open={!!deletingSupplier}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete Supplier</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to delete "{deletingSupplier.name}"? This
								action cannot be undone. Existing purchases linked to this
								supplier will remain, but the supplier will be removed.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel onClick={() => setDeletingSupplier(null)}>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction onClick={handleDelete}>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	)
}
