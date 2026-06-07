'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createCategory, updateCategory } from '@/app/actions/menu'

type CategoryFormProps = {
	tenantId: string
	category?: {
		id: string
		name: string
		description: string | null
		position: number
	} | null
	onClose: () => void
	onSuccess: () => void
}

export function CategoryForm({
	tenantId,
	category,
	onClose,
	onSuccess
}: CategoryFormProps) {
	const [name, setName] = useState(category?.name || '')
	const [description, setDescription] = useState(category?.description || '')
	const [position, setPosition] = useState(category?.position ?? 0)
	const [isSubmitting, setIsSubmitting] = useState(false)

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSubmitting(true)

		try {
			if (category) {
				await updateCategory(category.id, { name, description, position })
			} else {
				await createCategory(tenantId, { name, description, position })
			}
			onSuccess()
			onClose()
		} catch (error) {
			console.error('Error saving category:', error)
			alert(error instanceof Error ? error.message : 'Failed to save category')
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<div className="fixed inset-0 z-50">
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
							Menu taxonomy
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							{category ? 'Edit category' : 'New category'}
						</h2>
					</div>
					<Button size="icon" variant="ghost" onClick={onClose}>
						<X className="h-5 w-5" />
					</Button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4 pb-6">
					<div>
						<label className="block text-sm font-medium text-white/70 mb-2">
							Name *
						</label>
						<input
							type="text"
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="e.g., Pasta, Appetizers"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/70 mb-2">
							Description
						</label>
						<textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={3}
							className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none resize-none"
							placeholder="Brief description of this category"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/70 mb-2">
							Position
						</label>
						<input
							type="number"
							min="0"
							value={position}
							onChange={(e) => setPosition(parseInt(e.target.value) || 0)}
							className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
						/>
					</div>

					<div className="flex gap-3 pt-4">
						<Button
							type="button"
							variant="ghost"
							onClick={onClose}
							className="flex-1"
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting} className="flex-1">
							<Save className="mr-2 h-4 w-4" />
							{isSubmitting ? 'Saving...' : 'Save'}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	)
}
