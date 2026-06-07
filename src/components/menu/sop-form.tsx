'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Save, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createOrUpdateSOP } from '@/app/actions/menu'

import { CustomSelect } from '@/components/ui/select'

type SOPStep = {
	title: string
	body: string | null
	step_order: number
	media?: unknown
}

type SOP = {
	id: string
	menu_item_id: string
	steps: SOPStep[]
}

type MenuItem = {
	id: string
	name: string
}

type SOPFormProps = {
	tenantId: string
	menuItems: MenuItem[]
	sop?: SOP | null
	selectedMenuItemId?: string | null
	onClose: () => void
	onSuccess: () => void
}

export function SOPForm({
	tenantId,
	menuItems,
	sop,
	selectedMenuItemId,
	onClose,
	onSuccess
}: SOPFormProps) {
	const [menuItemId, setMenuItemId] = useState(
		sop?.menu_item_id || selectedMenuItemId || menuItems[0]?.id || ''
	)
	const [steps, setSteps] = useState<SOPStep[]>(
		sop?.steps || [{ title: '', body: '', step_order: 1 }]
	)
	const [isSubmitting, setIsSubmitting] = useState(false)

	useEffect(() => {
		if (sop) {
			setSteps(sop.steps)
		}
	}, [sop])

	const addStep = () => {
		const maxOrder =
			steps.length > 0 ? Math.max(...steps.map((s) => s.step_order)) : 0
		setSteps([...steps, { title: '', body: '', step_order: maxOrder + 1 }])
	}

	const removeStep = (index: number) => {
		setSteps(steps.filter((_, i) => i !== index))
	}

	const updateStep = (index: number, updates: Partial<SOPStep>) => {
		setSteps(
			steps.map((step, i) => (i === index ? { ...step, ...updates } : step))
		)
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSubmitting(true)

		try {
			// Filter out empty steps and ensure step_order is set
			const validSteps = steps
				.filter((step) => step.title.trim() !== '')
				.map((step, index) => ({
					...step,
					step_order: step.step_order || index + 1,
					body: step.body || null
				}))

			if (validSteps.length === 0) {
				alert('Please add at least one step with a title')
				setIsSubmitting(false)
				return
			}

			await createOrUpdateSOP(tenantId, menuItemId, validSteps)
			onSuccess()
			onClose()
		} catch (error) {
			console.error('Error saving SOP:', error)
			alert(error instanceof Error ? error.message : 'Failed to save SOP')
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
				className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-gradient-to-br from-[#0B0E24] via-[#05060F] to-[#020205] p-8 shadow-[0_50px_140px_rgba(3,5,18,0.85)]"
			>
				<div className="flex items-center justify-between mb-6">
					<div>
						<p className="text-xs uppercase tracking-[0.4em] text-white/60">
							SOP Designer
						</p>
						<h2 className="mt-2 text-3xl font-semibold text-white">
							{sop ? 'Edit SOP' : 'Create SOP'}
						</h2>
					</div>
					<Button size="icon" variant="ghost" onClick={onClose}>
						<X className="h-5 w-5" />
					</Button>
				</div>

				<form onSubmit={handleSubmit} className="mt-4 space-y-8 pb-10">
					<div>
						<label className="block text-sm font-medium text-white/70 mb-2">
							Menu Item *
						</label>
						<CustomSelect
							value={menuItemId}
							onChange={setMenuItemId}
							options={menuItems.map((item) => ({
								value: item.id,
								label: item.name
							}))}
							disabled={!!sop}
							placeholder="Select menu item"
						/>
					</div>

					<section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-white/50">
									Steps
								</p>
								<p className="text-sm text-white/60">
									Break down the exact moves your team should follow.
								</p>
							</div>
							<Button type="button" variant="ghost" size="sm" onClick={addStep}>
								<Plus className="mr-2 h-4 w-4" />
								Add step
							</Button>
						</div>
						<div className="space-y-4">
							{steps.map((step, index) => (
								<div
									key={index}
									className="rounded-2xl border border-white/10 bg-[#070A1C]/60 p-4"
								>
									<div className="flex items-center justify-between">
										<Badge className="text-[10px] uppercase tracking-[0.3em] text-white/60">
											Step {index + 1}
										</Badge>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeStep(index)}
											className="text-white/60 hover:text-white"
											disabled={steps.length === 1}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
									<div className="mt-3 space-y-3">
										<div>
											<label className="block text-xs font-medium text-white/70 mb-1">
												Title *
											</label>
											<input
												type="text"
												required
												value={step.title}
												onChange={(e) =>
													updateStep(index, { title: e.target.value })
												}
												placeholder="e.g., Sear chicken on high heat"
												className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-white/70 mb-1">
												Details
											</label>
											<textarea
												value={step.body || ''}
												onChange={(e) =>
													updateStep(index, {
														body: e.target.value
													})
												}
												rows={3}
												placeholder="What should the chef do here? Temps, timing, plating, etc."
												className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none resize-none"
											/>
										</div>
										<div className="flex items-center gap-3">
											<label className="block text-xs font-medium text-white/70">
												Order
											</label>
											<input
												type="number"
												min="1"
												value={step.step_order || index + 1}
												onChange={(e) =>
													updateStep(index, {
														step_order: parseInt(e.target.value) || index + 1
													})
												}
												className="w-20 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white text-xs placeholder:text-white/40 focus:border-white/30 focus:outline-none"
											/>
										</div>
									</div>
								</div>
							))}
						</div>
					</section>

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
