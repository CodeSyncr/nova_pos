'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createIngredient } from '@/app/actions/menu'

type Ingredient = {
	id: string
	name: string
	unit: string | null
	allergen_info: string | null
}

type IngredientFormProps = {
	tenantId: string
	ingredient?: Ingredient | null
	onClose: () => void
	onSuccess: () => void
}

export function IngredientForm({
	tenantId,
	ingredient,
	onClose,
	onSuccess
}: IngredientFormProps) {
	const [name, setName] = useState(ingredient?.name || '')
	const [unit, setUnit] = useState(ingredient?.unit || '')
	const [allergenInfo, setAllergenInfo] = useState(
		ingredient?.allergen_info || ''
	)
	const [isSubmitting, setIsSubmitting] = useState(false)

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSubmitting(true)

		try {
			await createIngredient(tenantId, {
				name,
				unit: unit || undefined,
				allergenInfo: allergenInfo || undefined
			})
			onSuccess()
			onClose()
		} catch (error) {
			console.error('Error saving ingredient:', error)
			alert(
				error instanceof Error ? error.message : 'Failed to save ingredient'
			)
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
							Pantry item
						</p>
						<h2 className="mt-1 text-2xl font-semibold text-white">
							{ingredient ? 'Edit ingredient' : 'New ingredient'}
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
							placeholder="e.g., San Marzano Sauce"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/70 mb-2">
							Unit
						</label>
						<input
							type="text"
							value={unit}
							onChange={(e) => setUnit(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="e.g., ml, g, oz"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-white/70 mb-2">
							Allergen info
						</label>
						<input
							type="text"
							value={allergenInfo}
							onChange={(e) => setAllergenInfo(e.target.value)}
							className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
							placeholder="e.g., Contains dairy, gluten-free"
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
